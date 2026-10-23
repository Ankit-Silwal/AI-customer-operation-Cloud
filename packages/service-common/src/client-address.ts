import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import ipaddr from "ipaddr.js";

export const addressHeaders = ["x-rate-client-ip", "x-rate-timestamp", "x-rate-signature"] as const;

// Group IPv6 clients by /64, including canonicalization of IPv4-mapped IPv6.
export function normalizeAddress(address: string): string {
  try {
    const parsed = ipaddr.process(address);
    if (parsed.kind() === "ipv4") return parsed.toString();
    const bytes = parsed.toByteArray();
    return ipaddr.fromByteArray([...bytes.slice(0, 8), ...Array<number>(8).fill(0)]).toString();
  } catch { return "unknown"; }
}

function signature(secret: string, ip: string, time: string, requestId: string): string {
  return createHmac("sha256", secret).update(`rate-forward-v1\n${ip}\n${time}\n${requestId}`).digest("hex");
}

export function signedAddressHeaders(req: Request, requestId: string, secret: string): Record<string, string> {
  const ip = normalizeAddress(req.socket.remoteAddress ?? "unknown");
  const time = String(Math.floor(Date.now() / 1000));
  return { "x-rate-client-ip": ip, "x-rate-timestamp": time, "x-rate-signature": signature(secret, ip, time, requestId) };
}

export function clientAddress(req: Request, secret: string, allowGateway = true): string {
  const ip = req.get("x-rate-client-ip");
  const time = req.get("x-rate-timestamp");
  const supplied = req.get("x-rate-signature");
  const requestId = req.get("x-request-id") ?? "";
  if (allowGateway && ip && ip.length <= 64 && time && /^\d{10}$/.test(time) && supplied && /^[a-f0-9]{64}$/.test(supplied)
    && Math.abs(Date.now() / 1000 - Number(time)) <= 30) {
    const expected = signature(secret, ip, time, requestId);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return normalizeAddress(ip);
  }
  // Forwarded / X-Forwarded-For are deliberately never used for admission.
  return normalizeAddress(req.socket.remoteAddress ?? "unknown");
}

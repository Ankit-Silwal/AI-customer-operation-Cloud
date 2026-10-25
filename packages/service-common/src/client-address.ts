import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import ipaddr from "ipaddr.js";

export const addressHeaders = ["x-rate-client-ip", "x-rate-timestamp", "x-rate-signature"] as const;
export const edgeHeaders = ["x-edge-client-ip", "x-edge-secret"] as const;

const sha256 = (value: string) => createHash("sha256").update(value).digest();

// Behind the nginx load balancer every TCP peer is nginx. It overwrites x-edge-client-ip with
// its own $remote_addr and proves itself with EDGE_PROXY_SECRET; anything else uses the socket.
export function peerAddress(req: Request): string {
  const secret = process.env.EDGE_PROXY_SECRET;
  const supplied = req.headers?.["x-edge-secret"];
  const ip = req.headers?.["x-edge-client-ip"];
  if (secret && secret.length >= 32 && typeof supplied === "string" && typeof ip === "string" && ip && ip.length <= 64
    && timingSafeEqual(sha256(secret), sha256(supplied))) return ip;
  return req.socket.remoteAddress ?? "unknown";
}

// Group IPv6 clients by /64, including canonicalization of IPv4-mapped IPv6.
export function normalizeAddress(address: string): string {
  try {
    const parsed = ipaddr.process(address);
    if (parsed.kind() === "ipv4") return parsed.toString();
    const bytes = parsed.toByteArray();
    return ipaddr.fromByteArray([...bytes.slice(0, 8), ...Array<number>(8).fill(0)]).toString();
  } catch { return "unknown"; }
}

function signature(secret: string, ip: string, time: string, requestId: string, purpose: string): string {
  return createHmac("sha256", secret).update(`${purpose}\n${ip}\n${time}\n${requestId}`).digest("hex");
}

export function signedAddressHeaders(req: Request, requestId: string, secret: string, purpose = "rate-forward-v1", address?: string): Record<string, string> {
  const ip = normalizeAddress(address ?? peerAddress(req));
  const time = String(Math.floor(Date.now() / 1000));
  return { "x-rate-client-ip": ip, "x-rate-timestamp": time, "x-rate-signature": signature(secret, ip, time, requestId, purpose) };
}

export function clientAddress(req: Request, secret: string, allowGateway = true, purpose = "rate-forward-v1"): string {
  const ip = req.get("x-rate-client-ip");
  const time = req.get("x-rate-timestamp");
  const supplied = req.get("x-rate-signature");
  const requestId = req.get("x-request-id") ?? "";
  if (allowGateway && ip && ip.length <= 64 && time && /^\d{10}$/.test(time) && supplied && /^[a-f0-9]{64}$/.test(supplied)
    && Math.abs(Date.now() / 1000 - Number(time)) <= 30) {
    const expected = signature(secret, ip, time, requestId, purpose);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return normalizeAddress(ip);
  }
  // Forwarded / X-Forwarded-For are deliberately never used for admission.
  return normalizeAddress(peerAddress(req));
}

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Request, RequestHandler } from "express";
import { createClient } from "redis";
import { clientAddress } from "./client-address.js";

export interface Policy { limit: number; seconds: number }
export interface Bucket { policy: string; identity: string }
export interface Admission { allowed: boolean; headers: Record<string, string> }
const script = readFileSync(new URL("./rate-limit.lua", import.meta.url), "utf8");
const defaults = JSON.parse(readFileSync(new URL("./rate-policies.json", import.meta.url), "utf8")) as Record<string, Policy>;

export function loadPolicies(overrides = process.env.RATE_LIMIT_POLICY_OVERRIDES || "{}"): Record<string, Policy> {
  const changes: unknown = JSON.parse(overrides);
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) throw new Error("Invalid rate limit overrides");
  const policies = { ...defaults };
  for (const [name, value] of Object.entries(changes)) {
    const item = value as Partial<Policy> | null;
    if (!Object.hasOwn(defaults, name) || !item || Object.keys(item).some(key => key !== "limit" && key !== "seconds")
      || !Number.isInteger(item.limit) || Number(item.limit) < 1 || Number(item.limit) > 1000000
      || !Number.isInteger(item.seconds) || Number(item.seconds) < 1 || Number(item.seconds) > 86400) throw new Error(`Invalid rate limit policy: ${name}`);
    policies[name] = item as Policy;
  }
  return policies;
}

export class RateLimiter {
  private closed = false;
  private readonly client;
  readonly policies: Record<string, Policy>;
  constructor(readonly service: string, readonly secret: string, url: string,
    overrides?: string, readonly namespace = "customer-ops") {
    if (secret.length < 32 || !/^[a-z0-9_-]{1,40}$/.test(namespace) || !/^[a-z0-9_-]{1,40}$/.test(service)) throw new Error("Invalid rate limiter configuration");
    this.policies = loadPolicies(overrides || "{}");
    this.client = createClient({ url, disableOfflineQueue: true, commandsQueueMaxLength: 1024, socket: { connectTimeout: 500, reconnectStrategy: retries => Math.min(100 * (retries + 1), 1000) } });
    // No raw connection errors or credential-bearing URLs in application logs.
    this.client.on("error", () => undefined);
    this.client.on("connect", () => { if (this.closed) this.client.destroy(); });
    void this.client.connect().catch(() => undefined);
  }
  async ready(): Promise<void> {
    if (!this.client.isReady) throw new Error("Rate limiter unavailable");
    await this.client.withCommandOptions({ timeout: 500 }).ping();
  }
  close(): void { this.closed = true; this.client.destroy(); }
  address(req: Request): string {
    if (this.service === "gateway") return clientAddress(req, this.secret, process.env.RATE_LIMIT_TRUST_FRONTEND === "true", "rate-frontend-v1");
    return clientAddress(req, this.secret);
  }
  async consume(buckets: Bucket[]): Promise<Admission> {
    if (!this.client.isReady) throw new Error("Rate limiter unavailable");
    const keys: string[] = [];
    const args: string[] = [];
    for (const bucket of buckets) {
      const policy = this.policies[bucket.policy];
      if (!policy) throw new Error("Unknown rate limit policy");
      const digest = createHmac("sha256", this.secret).update(`rate-key-v1\n${bucket.identity}`).digest("hex");
      keys.push(`${this.namespace}:{${this.service}}:${bucket.policy}:${digest}`);
      args.push(String(policy.limit), String(policy.seconds));
    }
    const result = await this.client.withCommandOptions({ timeout: 500 }).eval(script, { keys, arguments: args }) as number[];
    const index = Number(result[1]) - 1;
    const policy = this.policies[buckets[index]!.policy]!;
    const allowed = result[0] === 1;
    const headers: Record<string, string> = {
      "RateLimit-Limit": String(policy.limit), "RateLimit-Remaining": String(result[2]),
      "RateLimit-Reset": String(result[3]), "RateLimit-Policy": `${policy.limit};w=${policy.seconds}`,
    };
    if (!allowed) headers["Retry-After"] = String(Math.max(1, Number(result[4])));
    return { allowed, headers };
  }
  middleware(buckets: (req: Request) => Bucket[]): RequestHandler {
    return async (req, res, next) => {
      try {
        const result = await this.consume(buckets(req));
        res.set(result.headers);
        if (!result.allowed) {
          res.set("Cache-Control", "no-store").status(429).json({ error: "Too many requests", requestId: res.locals.requestId });
          return;
        }
        next();
      } catch {
        res.set({ "Retry-After": "1", "Cache-Control": "no-store" }).status(503).json({ error: "Request protection temporarily unavailable", requestId: res.locals.requestId });
      }
    };
  }
  global(): RequestHandler {
    return this.middleware(req => [
      { policy: this.service === "gateway" ? "gateway_global" : "service_global", identity: "global" },
      ...(this.service === "gateway" ? [{ policy: "gateway_burst", identity: this.address(req) }] : []),
      { policy: this.service === "gateway" ? "gateway_ip" : "service_ip", identity: this.address(req) },
    ]);
  }
}

const instances = new Map<string, RateLimiter>();
export function environmentLimiter(service: string): RateLimiter | undefined {
  if (process.env.NODE_ENV === "test") return undefined;
  let limiter = instances.get(service);
  if (!limiter) {
    limiter = new RateLimiter(service, process.env.JWT_SECRET ?? "", process.env.RATE_LIMIT_REDIS_URL ?? "redis://127.0.0.1:6379",
      process.env.RATE_LIMIT_POLICY_OVERRIDES, process.env.RATE_LIMIT_NAMESPACE ?? "customer-ops");
    instances.set(service, limiter);
  }
  return limiter;
}
export function closeRateLimiters(): void { for (const limiter of instances.values()) limiter.close(); instances.clear(); }

// Runs after JWT verification and before any controller, upload parser or DB work.
export function authenticatedLimit(): RequestHandler {
  return (req, res, next) => {
    const limiter = req.app.locals.rateLimiter as RateLimiter | undefined;
    if (!limiter) { next(); return; }
    const user = String(res.locals.userId);
    const buckets: Bucket[] = [{ policy: ["GET", "HEAD"].includes(req.method) ? "user_read" : "user_write", identity: user }];
    void limiter.middleware(() => buckets)(req, res, next);
  };
}

export function credentialLimit(kind: "register" | "login"): RequestHandler {
  return (req, res, next) => {
    const limiter = req.app.locals.rateLimiter as RateLimiter | undefined;
    if (!limiter) { next(); return; }
    const ip = limiter.address(req);
    const buckets = [{ policy: `${kind}_ip`, identity: ip }];
    const body = req.body as { email?: unknown } | undefined;
    if (kind === "login" && typeof body?.email === "string") buckets.push({ policy: "login_account_ip", identity: `${ip}\n${body.email.trim().toLowerCase().slice(0, 320)}` });
    void limiter.middleware(() => buckets)(req, res, next);
  };
}

export function routeLimit(policy: string): RequestHandler {
  return (req, res, next) => {
    const limiter = req.app.locals.rateLimiter as RateLimiter | undefined;
    if (!limiter) { next(); return; }
    void limiter.middleware(() => [{ policy, identity: String(res.locals.userId) }])(req, res, next);
  };
}

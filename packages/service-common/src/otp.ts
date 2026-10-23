import { createHmac, randomInt, randomUUID } from "node:crypto";
import { createClient } from "redis";
import { HttpError } from "./http.js";
import { RateLimiter } from "./rate-limit.js";
import { smtpMailer } from "./mail.js";

const issueScript = `
local previous = redis.call('GET', KEYS[1])
if previous then redis.call('DEL', previous) end
redis.call('HSET', KEYS[2], 'binding', ARGV[1], 'digest', ARGV[2], 'attempts', '5')
redis.call('EXPIRE', KEYS[2], 300)
redis.call('SET', KEYS[1], KEYS[2], 'EX', 300)
return 1`;
const verifyScript = `
if redis.call('HGET', KEYS[2], 'binding') ~= ARGV[1] then return 0 end
if redis.call('HGET', KEYS[2], 'digest') ~= ARGV[2] then
  if redis.call('HINCRBY', KEYS[2], 'attempts', -1) <= 0 then redis.call('DEL', KEYS[2]) end
  return 0
end
redis.call('DEL', KEYS[2])
if redis.call('GET', KEYS[1]) == KEYS[2] then redis.call('DEL', KEYS[1]) end
return 1`;
const cancelScript = `redis.call('DEL', KEYS[2]); if redis.call('GET', KEYS[1]) == KEYS[2] then redis.call('DEL', KEYS[1]) end; return 1`;

export function otpPurpose(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(value)) throw new HttpError(400, "purpose must contain 1-64 letters, digits, underscores or dashes");
  return value;
}

export class OtpService {
  private closed = false;
  private readonly client;
  private readonly limiter: RateLimiter;
  constructor(private readonly secret: string, url: string, private readonly send = smtpMailer(), private readonly namespace = "customer-ops") {
    if (secret.length < 32 || !/^[a-z0-9_-]{1,40}$/.test(namespace)) throw new Error("Invalid OTP configuration");
    this.client = createClient({ url, disableOfflineQueue: true, commandsQueueMaxLength: 1024, socket: { connectTimeout: 500, reconnectStrategy: retries => Math.min(100 * (retries + 1), 1000) } });
    this.client.on("error", () => undefined);
    this.client.on("connect", () => { if (this.closed) this.client.destroy(); });
    void this.client.connect().catch(() => undefined);
    this.limiter = new RateLimiter("otp", secret, url, process.env.RATE_LIMIT_POLICY_OVERRIDES, namespace);
  }
  async ready() { if (!this.client.isReady) throw new HttpError(503, "Verification temporarily unavailable", "1"); await this.client.withCommandOptions({ timeout: 500 }).ping(); await this.limiter.ready(); }
  close() { this.closed = true; this.client.destroy(); this.limiter.close(); }
  configured() { return Boolean(this.send); }
  requireDelivery() { if (!this.send) throw new HttpError(503, "Email delivery is not configured yet", "5"); }
  private digest(value: string) { return createHmac("sha256", this.secret).update(`otp-v1\n${value}`).digest("hex"); }
  private keys(scope: string, email: string, purpose: string, challengeId: string) {
    const binding = this.digest(JSON.stringify([scope, email, purpose]));
    const prefix = `${this.namespace}:{otp}:`;
    return { binding, keys: [`${prefix}latest:${binding}`, `${prefix}challenge:${challengeId}`] };
  }
  private async eval(script: string, keys: string[], args: string[]) {
    try { return await this.client.withCommandOptions({ timeout: 500 }).eval(script, { keys, arguments: args }); }
    catch { throw new HttpError(503, "Verification temporarily unavailable", "1"); }
  }
  async issue(scope: string, email: string, purpose: string, delivery: "email" | "demo" | "silent" = "email") {
    if (delivery === "email") this.requireDelivery();
    let admission;
    try { admission = await this.limiter.consume([{ policy: "otp_global", identity: "global" }, { policy: "otp_scope", identity: scope }, { policy: "otp_recipient", identity: `${scope}\n${email}` }]); }
    catch { throw new HttpError(503, "Verification temporarily unavailable", "1"); }
    if (!admission.allowed) throw new HttpError(429, "Too many verification requests. Try again later", admission.headers["Retry-After"]);
    const challengeId = randomUUID();
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const { binding, keys } = this.keys(scope, email, purpose, challengeId);
    await this.eval(issueScript, keys, [binding, this.digest(`${challengeId}\n${code}`)]);
    if (delivery === "email") {
      try { await this.send!(email, code); }
      catch (error) { await this.eval(cancelScript, keys, []); throw error; }
    }
    return { challengeId, expiresIn: 300, expiresAt: new Date(Date.now() + 300_000).toISOString(), delivery: delivery === "email" ? "email" : "sandbox", ...(delivery === "demo" ? { demoCode: code } : {}) };
  }
  async verify(scope: string, email: string, purpose: string, challengeId: string, code: unknown) {
    if (typeof code !== "string" || !/^\d{6}$/.test(code)) throw new HttpError(400, "Enter the six-digit verification code");
    const { binding, keys } = this.keys(scope, email, purpose, challengeId);
    if (await this.eval(verifyScript, keys, [binding, this.digest(`${challengeId}\n${code}`)]) !== 1) throw new HttpError(400, "Invalid, expired or already used verification code");
    return { verified: true };
  }
}

let singleton: OtpService | undefined;
export function environmentOtp(): OtpService | undefined {
  if (process.env.NODE_ENV === "test") return undefined;
  return singleton ??= new OtpService(process.env.JWT_SECRET ?? "", process.env.RATE_LIMIT_REDIS_URL ?? "redis://127.0.0.1:6379", smtpMailer(), process.env.RATE_LIMIT_NAMESPACE ?? "customer-ops");
}
export function closeOtpServices() { singleton?.close(); singleton = undefined; }

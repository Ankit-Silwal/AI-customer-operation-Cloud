import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { loadPolicies } from "@repo/service-common/rate-limit";

// Exercises configured defaults against the real Docker stack without invoking
// Gemini or adding document/vector records. Only one smoke account is created.
const base = process.env.API_URL ?? "http://localhost:3001";
const policies = loadPolicies();
const root = fileURLToPath(new URL("../../../", import.meta.url));
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let checks = 0;
function checked(name: string) { console.log(`PASS ${name}`); checks++; }

async function call(path: string, body?: unknown, token?: string, headers: Record<string, string> = {}) {
  return fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(5000),
  });
}

async function rateRejected(response: Response, limit: number) {
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("ratelimit-limit"), String(limit));
  assert.ok(Number(response.headers.get("retry-after")) >= 1);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json() as { requestId: string };
  assert.equal(body.requestId, response.headers.get("x-request-id"));
}

async function ready(path: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { const response = await call(path); await response.arrayBuffer(); if (response.ok) return; } catch { /* retry recovery */ }
    await pause(200);
  }
  throw new Error(`Readiness did not recover: ${path}`);
}

await ready("/health/ready");
await ready("/rag/health/ready");
const suffix = randomUUID();
const unknown = `rate-unknown-${suffix}@example.test`;
for (let i = 0; i < policies.login_account_ip!.limit; i++) {
  const response = await call("/login", { email: unknown, password: "wrong-password" });
  assert.equal(response.status, 401);
  await response.arrayBuffer();
  await pause(40);
}
await rateRejected(await call("/login", { email: unknown.toUpperCase(), password: "wrong-password" }, undefined, { "X-Forwarded-For": "198.51.100.8", "X-Rate-Client-IP": "198.51.100.8" }), policies.login_account_ip!.limit);
checked("login account/IP quota and normalized email resist forged forwarded IP");

const registered = await call("/register", { name: "Rate smoke", email: `rate-owner-${suffix}@example.test`, password: "rate-smoke-password" });
assert.equal(registered.status, 201);
const { token } = await registered.json() as { token: string };

for (let i = 0; i < policies.document_upload!.limit; i++) {
  const response = await fetch(`${base}/documents/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data; boundary=bad" }, body: "invalid multipart", signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 400);
  await response.arrayBuffer();
  await pause(40);
}
await rateRejected(await fetch(`${base}/documents/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data; boundary=bad" }, body: "invalid multipart", signal: AbortSignal.timeout(5000) }), policies.document_upload!.limit);
checked("document quota rejects before malformed multipart processing");

for (const [path, policy, body] of [
  ["/rag/query", "rag_query", { organizationId: randomUUID(), question: " " }],
  ["/rag/documents/not-a-uuid/index", "rag_index", {}],
] as const) {
  for (let i = 0; i < policies[policy]!.limit; i++) {
    const response = await call(path, body, token);
    assert.equal(response.status, 422);
    await response.arrayBuffer();
    await pause(40);
  }
  await rateRejected(await call(path, body, token), policies[policy]!.limit);
  checked(`${policy} verified-user quota before retrieval/model calls`);
}

if (process.argv.includes("--redis-restart")) {
  assert.equal(base, "http://localhost:3001", "Redis fault checks require the local default Docker stack");
  function docker(action: string) { execFileSync("docker", ["compose", action, "redis"], { cwd: root, stdio: "ignore", timeout: 30000 }); }
  try {
    docker("stop");
    const live = await call("/health/live");
    assert.equal(live.status, 200); await live.arrayBuffer();
    const unavailable = await call("/health/ready");
    assert.equal(unavailable.status, 503); await unavailable.arrayBuffer();
    const response = await call("/rate-limit-outage-probe");
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("retry-after"), "1");
    await response.arrayBuffer();
    checked("real Redis outage fails closed while liveness remains available");
  } finally { docker("start"); }
  await ready("/health/ready");
  await ready("/rag/health/ready");
  await rateRejected(await call("/login", { email: unknown, password: "wrong-password" }), policies.login_account_ip!.limit);
  checked("Redis AOF reload preserves exhausted counters and all servers recover");
}

console.log(`${checks} rate-limit smoke checks passed`);

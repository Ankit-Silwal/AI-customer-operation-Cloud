import assert from "node:assert/strict";
import { createIndexRemoval } from "@repo/document-server";
import { once } from "node:events";
import type { Server } from "node:http";
import { createApp } from "../apps/web/server/app.js";
import { DemoService } from "../apps/company-demo/server/service.js";
import { TokenService } from "@repo/service-common/token";
import { ApiFailure, type WebConfig } from "@repo/web-runtime/http";

// Run the real BFF/client over HTTP against the committed Postman simulation.
// Redis admission has its own integration suite and is disabled only here.
process.env.NODE_ENV = "test";
const config: WebConfig = {
  apiUrl: process.env.WEB_SIMULATION_URL ?? "http://127.0.0.1:4901/gateway",
  secret: "local-web-failure-check-secret-at-least-32-characters",
  origin: "http://localhost:3030",
  secure: false,
  port: 0,
};
let checks = 0;

async function withWeb(apiUrl: string, check: (base: string) => Promise<void>) {
  const server: Server = createApp({ ...config, apiUrl }).listen(
    0,
    "127.0.0.1",
  );
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await check(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeIdleConnections();
    });
  }
}
const login = {
  method: "POST",
  headers: { Origin: config.origin, "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "failure-check@example.test",
    password: "diagnostic-only",
  }),
};

await withWeb(config.apiUrl, async (base) => {
  let response = await fetch(`${base}/api/auth/login`, {
    ...login,
    headers: { ...login.headers, Origin: "https://untrusted.example" },
  });
  assert.equal(response.status, 403);
  checks++;

  response = await fetch(`${base}/api/auth/login`, login);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "17");
  assert.equal(response.headers.get("ratelimit-remaining"), "0");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal((await response.json()).error, "Too many requests");
  checks++;

  response = await fetch(`${base}/api/auth/register`, login);
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.match(body.error, /invalid response/);
  assert.ok(body.requestId);
  assert.doesNotMatch(JSON.stringify(body), /Internal proxy diagnostic/);
  checks++;

  const token = new TokenService(config.secret).create("diagnostic-user");
  const headers = { Cookie: `hearth_session=${token}` };
  response = await fetch(`${base}/api/session`, { headers });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "Account is unavailable");
  checks++;

  response = await fetch(`${base}/api/organizations`, { headers });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "1");
  assert.equal(
    (await response.json()).error,
    "Service temporarily unavailable",
  );
  checks++;

  const started = performance.now();
  response = await fetch(`${base}/health/ready`);
  assert.equal(response.status, 503);
  assert.ok(
    performance.now() - started < 1800,
    "Readiness must not wait for hanging gateway",
  );
  response = await fetch(`${base}/health/live`);
  assert.equal(response.status, 200);
  checks++;
});

process.env.HEARTH_API_KEY = `hrt_live_${"A".repeat(43)}`;
process.env.HEARTH_API_BASE_URL = `${config.apiUrl}/v1`;
const demo = new DemoService(config);
await assert.rejects(demo.prepare(), (error: unknown) => {
  assert.ok(error instanceof ApiFailure);
  assert.equal(error.status, 429);
  assert.equal(error.retryAfter, "17");
  return true;
});
assert.equal(demo.state, "unavailable");
checks++;

// Reserve and close an ephemeral port to exercise a genuinely refused connection.
const { createServer } = await import("node:net");
const unused = createServer().listen(0, "127.0.0.1");
await once(unused, "listening");
const address = unused.address();
assert.ok(address && typeof address !== "string");
await new Promise<void>((resolve) => unused.close(() => resolve()));
await withWeb(`http://127.0.0.1:${address.port}`, async (base) => {
  const response = await fetch(`${base}/api/auth/login`, login);
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /temporarily unavailable/);
  checks++;
});
const removeIndex = createIndexRemoval(config.apiUrl);
for (const [id, expected] of [
  ["00000000-0000-4000-8000-000000000001", 429],
  ["00000000-0000-4000-8000-000000000002", 503],
] as const) {
  await assert.rejects(
    removeIndex(id, "diagnostic-token"),
    (error: unknown) => {
      assert.ok(error instanceof Error && "status" in error);
      assert.equal(error.status, expected);
      assert.match(error.message, /document was kept/);
      return true;
    },
  );
  checks++;
}
console.log(`Web dependency failure checks passed: ${checks}`);

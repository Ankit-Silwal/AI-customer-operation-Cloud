import assert from "node:assert/strict";
import { once } from "node:events";
import { createHttpApp } from "@repo/service-common/app";
import { createErrorHandler } from "@repo/service-common/error-handler";
import { setupExternalRoutes } from "../apps/developer-portal/server/external.js";
process.env.NODE_ENV = "test";
const dependency =
  process.env.WEB_SIMULATION_URL ?? "http://127.0.0.1:4901/gateway";
const config = {
  apiUrl: dependency,
  secret: "developer-simulation-secret-at-least-32-characters",
  origin: "http://localhost:3040",
  secure: false,
  port: 0,
};
let checks = 0;
const app = createHttpApp(async () => [], {
  rateLimiter: false,
  logger: () => {},
});
setupExternalRoutes(app, config, undefined);
app.use(createErrorHandler(() => {}));
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert.ok(address && typeof address !== "string");
const base = `http://127.0.0.1:${address.port}`;
try {
  let response = await fetch(`${base}/v1/documents`);
  assert.equal(response.status, 401);
  checks++;
  for (const [key, status, retry] of [
    ["A", 503, "19"],
    ["B", 503, null],
    ["C", 503, "23"],
    ["D", 403, null],
  ] as const) {
    response = await fetch(`${base}/v1/documents`, {
      headers: { Authorization: `Bearer hrt_live_${key.repeat(43)}` },
    });
    assert.equal(response.status, status);
    assert.equal(response.headers.get("retry-after"), retry);
    const body = await response.json();
    assert.ok(body.error);
    assert.ok(body.requestId);
    assert.doesNotMatch(
      JSON.stringify(body),
      /private proxy|diagnostic-delegation|hrt_live_/,
    );
    checks++;
  }
  // The same real authorization client fails closed on a refused connection.
  process.env.CORE_URL = "http://127.0.0.1:1";
  response = await fetch(`${base}/v1/documents`, {
    headers: { Authorization: `Bearer hrt_live_${"C".repeat(43)}` },
  });
  assert.equal(response.status, 503);
  checks++;
} finally {
  delete process.env.CORE_URL;
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
    server.closeIdleConnections();
  });
}
console.log(`Developer API dependency checks passed: ${checks}`);

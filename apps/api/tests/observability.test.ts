import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PrismaClient } from "../src/database/prisma.js";
import request from "supertest";
import { createApp } from "../src/app.js";
import type { LogRecord } from "../src/common/logger.js";
import { readEnvironment } from "../src/config/env.js";
import { createDatabase } from "../src/database/database.js";
import { TokenService } from "../src/modules/auth/token.service.js";

const secret = "observability-test-key-at-least-32-characters";
const database = (query: () => Promise<unknown>): PrismaClient =>
  ({
    $queryRaw: query,
    organization: { findFirst: query },
    user: { findUnique: async () => ({ authVersion: 0 }) },
  }) as unknown as PrismaClient;

test("liveness stays healthy when database readiness fails, including draining", async () => {
  const db = database(async () => {
    throw new Error("PRIVATE_DATABASE_ERROR");
  });
  const app = createApp(db, secret, { logger: () => {} });
  const live = await request(app).get("/health/live").expect(200);
  const metadata = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal(live.body.version, metadata.version);
  const ready = await request(app).get("/health/ready").expect(503);
  assert.equal(ready.body.status, "not_ready");
  assert.equal(ready.body.requestId, ready.headers["x-request-id"]);
  assert.equal(
    JSON.stringify(ready.body).includes("PRIVATE_DATABASE_ERROR"),
    false,
  );
  const healthy = createApp(
    database(async () => ({ rows: [{ value: 1 }] })),
    secret,
    { logger: () => {} },
  );
  await request(healthy).get("/health/ready").expect(200);
  const draining = createApp(db, secret, {
    logger: () => {},
    isDraining: () => true,
  });
  await request(draining).get("/health/live").expect(200);
  await request(draining).get("/health/ready").expect(503);
});

test("request IDs and security headers accompany successes and errors without logging secrets", async () => {
  const logs: LogRecord[] = [];
  const app = createApp(
    database(async () => {
      throw new Error("PRIVATE_SQL_DETAIL");
    }),
    secret,
    { logger: (entry) => logs.push(entry) },
  );
  const live = await request(app)
    .get("/health/live?password=PRIVATE_QUERY")
    .set("X-Request-ID", "test-request_01")
    .expect(200);
  assert.equal(live.headers["x-request-id"], "test-request_01");
  assert.equal(live.headers["x-content-type-options"], "nosniff");
  assert.equal(live.headers["x-powered-by"], undefined);
  const invalid = await request(app)
    .get("/missing")
    .set("X-Request-ID", "bad.id")
    .expect(404);
  assert.match(invalid.headers["x-request-id"], /^[0-9a-f-]{36}$/);
  assert.equal(invalid.body.requestId, invalid.headers["x-request-id"]);
  const token = new TokenService(secret).create(randomUUID());
  const failure = await request(app)
    .get(`/organizations/${randomUUID()}?secret=PRIVATE_QUERY`)
    .auth(token, { type: "bearer" })
    .expect(500);
  assert.equal(failure.body.error, "Internal server error");
  assert.equal(failure.body.requestId, failure.headers["x-request-id"]);
  const logged = JSON.stringify(logs);
  for (const privateValue of [
    token,
    "PRIVATE_SQL_DETAIL",
    "PRIVATE_QUERY",
    secret,
  ])
    assert.equal(logged.includes(privateValue), false);
  const records = logs.filter((entry) => entry.event === "http_request");
  assert.equal(records.length, 3);
  assert.ok(
    records.every(
      (entry) => typeof entry.durationMs === "number" && entry.durationMs >= 0,
    ),
  );
  assert.ok(logs.some((entry) => entry.event === "request_error"));
  assert.ok(
    records.some(
      (entry) => entry.route === "/organizations/:id" && entry.status === 500,
    ),
  );
});

test("readiness returns 503 within a bounded time when the database stalls", async () => {
  const app = createApp(
    database(() => new Promise(() => {})),
    secret,
    { logger: () => {} },
  );
  const started = Date.now();
  await request(app).get("/health/ready").expect(503);
  assert.ok(Date.now() - started < 2500);
});

test("pool defaults are bounded and environment rejects invalid pool settings", async () => {
  const base = {
    DATABASE_URL: "postgresql://test:test@localhost/test",
    JWT_SECRET: secret,
  };
  const config = readEnvironment(base);
  assert.equal(config.poolMax, 10);
  assert.equal(config.poolConnectionTimeoutMs, 3000);
  for (const value of ["0", "-1", "NaN", "1.5", "101"]) {
    assert.throws(
      () => readEnvironment({ ...base, DB_POOL_MAX: value }),
      /DB_POOL_MAX/,
    );
  }
  assert.throws(
    () => readEnvironment({ ...base, DATABASE_URL: "https://invalid" }),
    /PostgreSQL/,
  );
  const pool = createDatabase(base.DATABASE_URL, config, () => {});
  assert.equal(pool.options.max, 10);
  assert.equal(pool.options.query_timeout, 5000);
  assert.equal(pool.options.statement_timeout, 5000);
  await pool.end();
});

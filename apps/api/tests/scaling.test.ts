import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import express from "express";
import type { Request } from "express";
import type { Pool } from "pg";
import request from "supertest";

import { peerAddress } from "@repo/service-common/client-address";
import { createErrorHandler } from "@repo/service-common/error-handler";
import { ReadReplicas } from "@repo/service-common/read-replicas";
import { fetchWithRetry, retryTransaction } from "@repo/service-common/retry";

const silent = () => undefined;

function fakePool(query: () => Promise<{ rows: unknown[] }> | { rows: unknown[] }): Pool {
  return { query: async () => query(), end: async () => undefined } as unknown as Pool;
}

function client(name: string) {
  return { name, $disconnect: async () => undefined };
}

function replicas(primaryLsn: () => string, replicaRows: (() => { recovery: boolean; lsn: string | null })[]) {
  const primary = client("primary");
  const list = replicaRows.map((row, index) => ({
    index, pool: fakePool(() => ({ rows: [row()] })), client: client(`replica-${index}`), healthy: false,
  }));
  return { primary, router: new ReadReplicas(fakePool(() => ({ rows: [{ lsn: primaryLsn() }] })), primary, list, silent, 60_000) };
}

test("read replicas start on the primary and rotate only through caught-up standbys", async (t) => {
  const { router } = replicas(() => "0/100", [
    () => ({ recovery: true, lsn: "0/100" }),
    () => ({ recovery: true, lsn: "0/200" }),
  ]);
  t.after(() => router.close());
  // Replicas begin unhealthy, so the first synchronous read always uses the primary.
  assert.equal(await router.read(async (db) => db.name), "primary");
  await router.check();
  const names = new Set<string>();
  for (let i = 0; i < 4; i++) names.add(await router.read(async (db) => db.name));
  assert.deepEqual([...names].sort(), ["replica-0", "replica-1"]);
});

test("lagging, promoted or unreachable replicas are skipped", async (t) => {
  let primary = "0/100";
  const { router } = replicas(() => primary, [
    () => ({ recovery: true, lsn: "0/100" }),
    () => ({ recovery: false, lsn: null }),
    () => { throw new Error("connection refused"); },
  ]);
  t.after(() => router.close());
  await router.check();
  assert.equal(router.healthyCount(), 1);
  primary = "0/900";
  await router.check(); // required position is the previous sample (0/100): still current
  assert.equal(router.healthyCount(), 1);
  await router.check(); // required position is now 0/900, which replica-0 has not replayed
  assert.equal(router.healthyCount(), 0);
  assert.equal(await router.read(async (db) => db.name), "primary");
});

test("a failed replica read is retried on the primary and the replica leaves rotation", async (t) => {
  const { router } = replicas(() => "1/0", [() => ({ recovery: true, lsn: "1/0" })]);
  t.after(() => router.close());
  await router.check();
  const result = await router.read(async (db) => {
    if (db.name !== "primary") throw Object.assign(new Error("conflict with recovery"), { code: "40001" });
    return db.name;
  });
  assert.equal(result, "primary");
  assert.equal(router.healthyCount(), 0);
});

test("WAL positions compare numerically across the high/low boundary", async (t) => {
  const { router } = replicas(() => "1/0", [() => ({ recovery: true, lsn: "0/FFFFFFFF" })]);
  t.after(() => router.close());
  await router.check();
  assert.equal(router.healthyCount(), 0);
});

test("fetchWithRetry retries 503 for idempotent calls but never 4xx", async (t) => {
  let calls = 0;
  const server = createServer((req, res) => {
    calls++;
    if (req.url === "/flaky" && calls < 3) { res.writeHead(503).end(); return; }
    res.writeHead(req.url === "/missing" ? 404 : 200).end("ok");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  assert.equal((await fetchWithRetry(`${base}/flaky`, {}, { attempts: 3, baseDelayMs: 1 })).status, 200);
  assert.equal(calls, 3);
  calls = 10;
  assert.equal((await fetchWithRetry(`${base}/missing`, {}, { attempts: 3, baseDelayMs: 1 })).status, 404);
  assert.equal(calls, 11);
  calls = -10;
  // Exhausted retries return the last upstream response instead of throwing.
  assert.equal((await fetchWithRetry(`${base}/flaky`, {}, { attempts: 2, baseDelayMs: 1 })).status, 503);
});

test("retryTransaction reruns deadlocks/serialization failures only", async () => {
  let attempts = 0;
  assert.equal(await retryTransaction(async () => {
    if (++attempts < 3) throw Object.assign(new Error("deadlock"), { code: "P2034" });
    return "committed";
  }), "committed");
  attempts = 0;
  await assert.rejects(retryTransaction(async () => {
    attempts++;
    throw Object.assign(new Error("unique"), { code: "P2002" });
  }));
  assert.equal(attempts, 1);
});

test("the client address from nginx is trusted only with the edge secret", (t) => {
  const previous = process.env.EDGE_PROXY_SECRET;
  process.env.EDGE_PROXY_SECRET = "edge-secret-for-tests-0123456789abcdef";
  t.after(() => { if (previous === undefined) delete process.env.EDGE_PROXY_SECRET; else process.env.EDGE_PROXY_SECRET = previous; });
  const req = (headers: Record<string, string>) => ({ headers, socket: { remoteAddress: "172.18.0.9" } }) as unknown as Request;
  assert.equal(peerAddress(req({ "x-edge-client-ip": "203.0.113.7", "x-edge-secret": process.env.EDGE_PROXY_SECRET })), "203.0.113.7");
  assert.equal(peerAddress(req({ "x-edge-client-ip": "203.0.113.7", "x-edge-secret": "forged" })), "172.18.0.9");
  assert.equal(peerAddress(req({ "x-edge-client-ip": "203.0.113.7" })), "172.18.0.9");
});

test("unique violations only claim a duplicate email for the email key", async () => {
  const app = express();
  app.get("/email", () => { throw Object.assign(new Error("dup"), { code: "23505", constraint: "users_email_key" }); });
  app.get("/other", () => { throw Object.assign(new Error("dup"), { code: "23505", constraint: "document_uploads_pkey" }); });
  app.use(createErrorHandler(silent));
  assert.equal((await request(app).get("/email").expect(409)).body.error, "Email is already registered");
  assert.equal((await request(app).get("/other").expect(409)).body.error, "Resource already exists");
});

test("unreachable replicas are probed with backoff and checks never overlap", async (t) => {
  let probes = 0;
  const primary = client("primary");
  const dead = { index: 0, pool: fakePool(() => { probes++; throw new Error("ENOTFOUND"); }), client: client("replica-0"), healthy: false };
  const router = new ReadReplicas(fakePool(() => ({ rows: [{ lsn: "0/1" }] })), primary, [dead], silent, 60_000);
  t.after(() => router.close());
  await Promise.all([router.check(), router.check(), router.check()]);
  assert.equal(probes, 1);
  await router.check(); // still inside the backoff window
  assert.equal(probes, 1);
  assert.equal(await router.read(async (db) => db.name), "primary");
});

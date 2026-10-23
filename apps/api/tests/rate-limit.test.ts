import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Request } from "express";
import test, { type TestContext } from "node:test";
import request from "supertest";
import { createHttpApp, finishHttpApp } from "@repo/service-common/app";
import { authenticate } from "@repo/service-common/authenticate";
import { clientAddress, normalizeAddress, signedAddressHeaders } from "@repo/service-common/client-address";
import { credentialLimit, loadPolicies, RateLimiter } from "@repo/service-common/rate-limit";
import { TokenService } from "@repo/service-common/token";
import { createApp as createDocumentApp, type PrismaClient } from "@repo/document-server";
import { createGateway } from "../src/gateway/app.js";

const secret = "rate-limiting-test-secret-at-least-32-characters";
const redis = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:55479";
type Overrides = Record<string, { limit: number; seconds: number }>;

async function limiter(t: TestContext, overrides: Overrides = {}, service = "core", namespace = `test-${randomUUID().replaceAll("-", "")}`) {
  const instance = new RateLimiter(service, secret, redis, JSON.stringify(overrides), namespace);
  t.after(() => instance.close());
  for (let attempt = 0; ; attempt++) {
    try { await instance.ready(); break; }
    catch (error) { if (attempt >= 100) throw error; await new Promise(resolve => setTimeout(resolve, 50)); }
  }
  return instance;
}

test("Redis admission is atomic across replicas, isolates identities, and survives application restart", async t => {
  const namespace = `test-${randomUUID().replaceAll("-", "")}`;
  const overrides = { user_read: { limit: 5, seconds: 60 } };
  const first = await limiter(t, overrides, "core", namespace);
  const second = await limiter(t, overrides, "core", namespace);
  const outcomes = await Promise.all(Array.from({ length: 40 }, (_, i) => (i % 2 ? first : second).consume([{ policy: "user_read", identity: "one-user" }])));
  assert.equal(outcomes.filter(result => result.allowed).length, 5);
  const rejected = outcomes.find(result => !result.allowed)!;
  assert.equal(rejected.headers["Retry-After"], "12");
  assert.equal(rejected.headers["RateLimit-Remaining"], "0");
  first.close(); second.close();
  const restarted = await limiter(t, overrides, "core", namespace);
  assert.equal((await restarted.consume([{ policy: "user_read", identity: "one-user" }])).allowed, false);
  assert.equal((await restarted.consume([{ policy: "user_read", identity: "another-user" }])).allowed, true);
  const otherService = await limiter(t, overrides, "documents", namespace);
  assert.equal((await otherService.consume([{ policy: "user_read", identity: "one-user" }])).allowed, true);
});

test("denied multi-bucket admission does not drain another user's shared capacity; tokens refill", async t => {
  const instance = await limiter(t, { user_read: { limit: 1, seconds: 1 }, user_write: { limit: 1, seconds: 60 } });
  await instance.consume([{ policy: "user_read", identity: "busy" }]);
  assert.equal((await instance.consume([{ policy: "user_read", identity: "busy" }, { policy: "user_write", identity: "shared" }])).allowed, false);
  assert.equal((await instance.consume([{ policy: "user_read", identity: "new" }, { policy: "user_write", identity: "shared" }])).allowed, true);
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal((await instance.consume([{ policy: "user_read", identity: "busy" }])).allowed, true);
});

test("verified-user quotas isolate users and run before controller work", async t => {
  const instance = await limiter(t, { user_read: { limit: 2, seconds: 60 } });
  const tokens = new TokenService(secret);
  const app = createHttpApp(async () => [], { logger: () => {}, rateLimiter: instance });
  let calls = 0;
  app.get("/private", authenticate(tokens), (_req, res) => { calls++; res.json({ ok: true }); });
  finishHttpApp(app);
  const token = tokens.create(randomUUID());
  await request(app).get("/private").auth(token, { type: "bearer" }).expect(200);
  await request(app).get("/private").auth(token, { type: "bearer" }).expect(200);
  const response = await request(app).get("/private").auth(token, { type: "bearer" }).expect(429);
  assert.ok(Number(response.headers["retry-after"]) >= 1);
  assert.equal(response.body.requestId, response.headers["x-request-id"]);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(calls, 2);
  await request(app).get("/private").auth(tokens.create(randomUUID()), { type: "bearer" }).expect(200);
  await request(app).get("/private").auth("invalid", { type: "bearer" }).expect(401);
});

test("login limits normalize email and IP spoofing cannot change the client budget", async t => {
  const instance = await limiter(t, { login_account_ip: { limit: 2, seconds: 900 }, login_ip: { limit: 3, seconds: 900 } });
  const app = createHttpApp(async () => [], { logger: () => {}, rateLimiter: instance });
  app.post("/login", credentialLimit("login"), (_req, res) => res.sendStatus(204));
  await request(app).post("/login").send({ email: "Owner@example.com" }).expect(204);
  await request(app).post("/login").send({ email: " owner@EXAMPLE.com " }).expect(204);
  await request(app).post("/login").set("X-Forwarded-For", "198.51.100.4").set("X-Rate-Client-IP", "198.51.100.4").send({ email: "owner@example.com" }).expect(429);
  await request(app).post("/login").send({ email: "someone-else@example.com" }).expect(204);
  await request(app).post("/login").set("Forwarded", "for=203.0.113.1").send({ email: "third@example.com" }).expect(429);
});

test("document upload quota rejects before multipart parsing", async t => {
  const instance = await limiter(t, { document_upload: { limit: 1, seconds: 60 } }, "documents");
  const owner = randomUUID();
  await instance.consume([{ policy: "document_upload", identity: owner }]);
  const db = { $queryRaw: async () => [] } as unknown as PrismaClient;
  const app = createDocumentApp(db, secret, async () => { throw new Error("Must not reach organization service"); }, { logger: () => {}, rateLimiter: instance });
  await request(app).post("/documents/upload").auth(new TokenService(secret).create(owner), { type: "bearer" })
    .set("Content-Type", "multipart/form-data; boundary=bad").send("invalid multipart body").expect(429);
});

test("gateway replaces spoofed proxy headers with a signed socket address", async t => {
  const domainLimiter = await limiter(t);
  const edgeLimiter = await limiter(t, { gateway_ip: { limit: 2, seconds: 60 } }, "gateway");
  const domain = createHttpApp(async () => [], { logger: () => {}, rateLimiter: domainLimiter });
  domain.get("/organizations/address", (req, res) => res.json({ address: clientAddress(req, secret), signature: req.get("x-rate-signature"), forwarded: req.get("x-forwarded-for") }));
  const server = domain.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const gateway = createGateway({ core: url, conversations: url, documents: url, rag: url }, () => {}, () => false, edgeLimiter);
  const first = await request(gateway).get("/organizations/address").set("X-Forwarded-For", "203.0.113.4").set("X-Rate-Client-IP", "203.0.113.4").set("X-Rate-Signature", "a".repeat(64)).expect(200);
  assert.equal(first.body.address, "127.0.0.1");
  assert.match(first.body.signature, /^[a-f0-9]{64}$/);
  assert.equal(first.body.forwarded, undefined);
  await request(gateway).get("/organizations/address").set("X-Forwarded-For", "203.0.113.5").expect(200);
  await request(gateway).get("/organizations/address").set("X-Forwarded-For", "203.0.113.6").expect(429);
});

test("gateway trusts only enabled frontend-purpose signatures and re-signs downstream identity", async t => {
  const previous = process.env.RATE_LIMIT_TRUST_FRONTEND;
  t.after(() => {
    if (previous === undefined) delete process.env.RATE_LIMIT_TRUST_FRONTEND;
    else process.env.RATE_LIMIT_TRUST_FRONTEND = previous;
  });
  const edge = await limiter(t, {}, "gateway");
  const domain = createHttpApp(async () => [], { logger: () => {}, rateLimiter: false });
  domain.get("/organizations/address", (req, res) => res.json({ address: clientAddress(req, secret), forwarded: req.get("x-forwarded-for") }));
  const server = domain.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const gateway = createGateway({ core: url, conversations: url, documents: url, rag: url }, () => {}, () => false, edge);
  const id = randomUUID();
  const source = { socket: { remoteAddress: "203.0.113.9" } } as Request;
  const signed = signedAddressHeaders(source, id, secret, "rate-frontend-v1");
  const send = (headers: Record<string, string>, requestId = id) => request(gateway).get("/organizations/address")
    .set(headers).set("X-Request-ID", requestId).set("X-Forwarded-For", "198.51.100.99");
  delete process.env.RATE_LIMIT_TRUST_FRONTEND;
  assert.equal((await send(signed).expect(200)).body.address, "127.0.0.1");
  process.env.RATE_LIMIT_TRUST_FRONTEND = "true";
  const accepted = await send(signed).expect(200);
  assert.equal(accepted.body.address, "203.0.113.9");
  assert.equal(accepted.body.forwarded, undefined);
  assert.equal((await send(signedAddressHeaders(source, id, secret)).expect(200)).body.address, "127.0.0.1");
  assert.equal((await send(signed, randomUUID()).expect(200)).body.address, "127.0.0.1");
  assert.equal((await send({ ...signed, "x-rate-client-ip": "203.0.113.10" }).expect(200)).body.address, "127.0.0.1");
});

test("global limits precede body parsing and Redis outage closes traffic while preserving liveness", async t => {
  const instance = await limiter(t, { service_global: { limit: 1, seconds: 60 } });
  const app = createHttpApp(async () => [], { logger: () => {}, rateLimiter: instance });
  app.post("/anything", (_req, res) => res.sendStatus(204));
  await request(app).post("/anything").send({}).expect(204);
  await request(app).post("/anything").set("Content-Type", "application/json").send("broken json").expect(429);
  instance.close();
  await request(app).get("/health/live").expect(200);
  await request(app).get("/health/ready").expect(503);
  const started = Date.now();
  const response = await request(app).post("/anything").send({}).expect(503);
  assert.equal(response.headers["retry-after"], "1");
  assert.ok(Date.now() - started < 1500);
});

test("policy validation rejects unsafe settings and IPv6 addresses share a /64 budget", () => {
  for (const input of ['null', '[]', '{"typo":{"limit":1,"seconds":1}}', '{"__proto__":{"limit":1,"seconds":60}}', '{"login_ip":{"limit":0,"seconds":60}}', '{"login_ip":{"limit":1,"seconds":0}}', '{"login_ip":{"limit":1.1,"seconds":60}}']) assert.throws(() => loadPolicies(input));
  assert.equal(normalizeAddress("::ffff:192.0.2.1"), "192.0.2.1");
  assert.equal(normalizeAddress("2001:db8:abcd:1234::1"), normalizeAddress("2001:db8:abcd:1234:ffff::5"));
  assert.notEqual(normalizeAddress("2001:db8:abcd:1234::1"), normalizeAddress("2001:db8:abcd:1235::1"));
});

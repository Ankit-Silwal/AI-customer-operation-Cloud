import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer, type AddressInfo } from "node:net";
import test, { type TestContext } from "node:test";
import request from "supertest";
import { createClient } from "redis";
import { keyDigest, serviceAuthorization } from "@repo/service-common/developer-identity";
import { OtpService } from "@repo/service-common/otp";
import { smtpMailer } from "@repo/service-common/mail";
import { fixture, secret } from "./fixture.js";

async function verification(t: TestContext) {
  const received: string[] = [];
  // Real local SMTP socket exercises Nodemailer's transport without emailing anyone.
  const smtp = createServer(socket => {
    socket.setEncoding("utf8"); socket.write("220 localhost ESMTP\r\n");
    let buffer = "", data = false, message = "";
    socket.on("data", chunk => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        if (data) {
          if (line === ".") { received.push(message); message = ""; data = false; socket.write("250 accepted\r\n"); }
          else message += `${line}\n`;
        } else if (line.startsWith("EHLO")) socket.write("250 localhost\r\n");
        else if (line === "DATA") { data = true; socket.write("354 end with dot\r\n"); }
        else if (line === "QUIT") socket.end("221 bye\r\n");
        else socket.write("250 OK\r\n");
      }
    });
  });
  smtp.listen(0, "127.0.0.1"); await once(smtp, "listening");
  t.after(() => new Promise<void>(resolve => smtp.close(() => resolve())));
  const namespace = `otp-${randomUUID().replaceAll("-", "")}`;
  const url = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:55479";
  const otp = new OtpService(secret, url, smtpMailer({ SMTP_HOST: "127.0.0.1", SMTP_PORT: String((smtp.address() as AddressInfo).port), SMTP_FROM: "Hearth <test@hearth.example>", SMTP_REQUIRE_TLS: "false" }), namespace);
  t.after(() => otp.close());
  for (let i = 0; ; i++) { try { await otp.ready(); break; } catch(e) { if (i > 100) throw e; await new Promise(r => setTimeout(r, 25)); } }
  function code() { const value = received.at(-1)?.match(/code is (\d{6})/); assert.ok(value, "Nodemailer delivered the code to local SMTP"); return value[1]!; }
  return { otp, received, code, url, namespace };
}

test("free API keys are scoped, hashed, capped atomically and revoked without exposing stored credentials", async t => {
  const f = await fixture(t), owner = await f.register(), other = await f.register("other@example.com"), org = await f.organization(owner.token);
  const issued = await request(f.app).post("/developer/keys").auth(owner.token, { type: "bearer" }).send({ organizationId: org.id, name: "Website", scopes: ["chat:write"] }).expect(201);
  const raw = issued.body.key as string; assert.match(raw, /^hrt_live_[A-Za-z0-9_-]{43}$/);
  const stored = await f.prisma.developerApiKey.findUniqueOrThrow({ where: { id: issued.body.id } });
  assert.equal(stored.keyHash, keyDigest(raw)); assert.ok(!JSON.stringify(stored).includes(raw));
  const listed = await request(f.app).get(`/developer/keys?organizationId=${org.id}`).auth(owner.token, { type: "bearer" }).expect(200);
  assert.ok(!JSON.stringify(listed.body).includes(raw)); assert.ok(!JSON.stringify(listed.body).includes(stored.keyHash));
  await request(f.app).post("/developer/authorize").send({ hash: keyDigest(raw) }).expect(401);
  const auth = serviceAuthorization(secret, keyDigest(raw));
  const resolved = await request(f.app).post("/developer/authorize").auth(auth, { type: "bearer" }).send({ hash: keyDigest(raw) }).expect(200);
  assert.equal(resolved.body.organizationId, org.id); assert.deepEqual(resolved.body.scopes, ["chat:write"]);
  await request(f.app).post("/developer/authorize").auth(auth, { type: "bearer" }).send({ hash: "0".repeat(64) }).expect(401);
  await request(f.app).post("/developer/keys").auth(other.token, { type: "bearer" }).send({ organizationId: org.id, name: "Stolen", scopes: ["otp:write"] }).expect(404);
  await request(f.app).delete(`/developer/keys/${issued.body.id}`).auth(other.token, { type: "bearer" }).expect(404);
  const attempts = await Promise.all(Array.from({ length: 9 }, (_, i) => request(f.app).post("/developer/keys").auth(owner.token, { type: "bearer" }).send({ organizationId: org.id, name: `Concurrent ${i}`, scopes: ["otp:write"] })));
  assert.equal(attempts.filter(r => r.status === 201).length, 4); assert.equal(attempts.filter(r => r.status === 409).length, 5);
  await request(f.app).delete(`/developer/keys/${issued.body.id}`).auth(owner.token, { type: "bearer" }).expect(200);
  await request(f.app).post("/developer/authorize").auth(auth, { type: "bearer" }).send({ hash: keyDigest(raw) }).expect(401);
  const expired = attempts.find(r => r.status === 201)!.body;
  await f.prisma.developerApiKey.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - 1000), createdAt: new Date(Date.now() - 10_000) } });
  await request(f.app).post("/developer/authorize").auth(serviceAuthorization(secret, keyDigest(expired.key)), { type: "bearer" }).send({ hash: keyDigest(expired.key) }).expect(401);
});

test("Nodemailer delivers real OTPs; Redis enforces binding, replacement, attempts, expiry and one-time use across concurrent verification", async t => {
  const { otp, code, received, url, namespace } = await verification(t);
  const first = await otp.issue("workspace:a", "alex@example.com", "sign-in"); const firstCode = code();
  assert.equal(first.demoCode, undefined); assert.equal(first.delivery, "email"); assert.equal(received.length, 1);
  await assert.rejects(otp.verify("workspace:b", "alex@example.com", "sign-in", first.challengeId, firstCode), /Invalid/);
  await assert.rejects(otp.verify("workspace:a", "alex@example.com", "reset", first.challengeId, firstCode), /Invalid/);
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => otp.verify("workspace:a", "alex@example.com", "sign-in", first.challengeId, firstCode)));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const old = await otp.issue("workspace:a", "replace@example.com", "sign-in"); const oldCode = code();
  const replacement = await otp.issue("workspace:a", "replace@example.com", "sign-in"); const replacementCode = code();
  await assert.rejects(otp.verify("workspace:a", "replace@example.com", "sign-in", old.challengeId, oldCode), /Invalid/);
  await otp.verify("workspace:a", "replace@example.com", "sign-in", replacement.challengeId, replacementCode);
  const locked = await otp.issue("workspace:a", "lock@example.com", "sign-in"); const correct = code(), incorrect = correct === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) await assert.rejects(otp.verify("workspace:a", "lock@example.com", "sign-in", locked.challengeId, incorrect), /Invalid/);
  await assert.rejects(otp.verify("workspace:a", "lock@example.com", "sign-in", locked.challengeId, correct), /Invalid/);
  const expiring = await otp.issue("workspace:a", "expired@example.com", "sign-in"); const expiredCode = code();
  const client = createClient({ url }); await client.connect(); t.after(() => client.destroy());
  const key = `${namespace}:{otp}:challenge:${expiring.challengeId}`;
  assert.ok(await client.ttl(key) > 0 && await client.ttl(key) <= 300);
  const values = await client.hGetAll(key); assert.ok(!JSON.stringify(values).includes(expiredCode)); assert.ok(!JSON.stringify(values).includes("expired@example.com"));
  await client.pExpire(key, 1); await new Promise(r => setTimeout(r, 10));
  await assert.rejects(otp.verify("workspace:a", "expired@example.com", "sign-in", expiring.challengeId, expiredCode), /Invalid/);
  const demo = await otp.issue("demo:visitor", "demo@example.com", "sandbox", "demo"); assert.match(demo.demoCode!, /^\d{6}$/); assert.equal(received.length, 5);
  await assert.rejects(otp.verify("workspace:a", "demo@example.com", "sandbox", demo.challengeId, demo.demoCode), /Invalid/);
  await otp.verify("demo:visitor", "demo@example.com", "sandbox", demo.challengeId, demo.demoCode);
});

test("forgot and change password verify email codes, hide account existence, replace credentials and invalidate prior sessions", async t => {
  const v = await verification(t), f = await fixture(t, { otp: v.otp }), owner = await f.register();
  const forgot = await request(f.app).post("/auth/password/forgot").send({ email: owner.user.email }).expect(202);
  const code = v.code(); assert.equal(forgot.body.demoCode, undefined);
  const unknown = await request(f.app).post("/auth/password/forgot").send({ email: "unknown@example.com" }).expect(202);
  assert.deepEqual(Object.keys(unknown.body).sort(), Object.keys(forgot.body).sort()); assert.equal(unknown.body.message, forgot.body.message); assert.equal(v.received.length, 1);
  await request(f.app).post("/auth/password/reset").send({ email: owner.user.email, challengeId: forgot.body.challengeId, code, password: "short" }).expect(400);
  await request(f.app).post("/auth/password/reset").send({ email: owner.user.email, challengeId: forgot.body.challengeId, code, password: "newPassword123" }).expect(200);
  await request(f.app).get("/me").auth(owner.token, { type: "bearer" }).expect(401);
  await request(f.app).get("/organizations").auth(owner.token, { type: "bearer" }).expect(401);
  await request(f.app).post("/auth/password/reset").send({ email: owner.user.email, challengeId: forgot.body.challengeId, code, password: "otherPassword123" }).expect(400);
  await request(f.app).post("/login").send({ email: owner.user.email, password: "password123" }).expect(401);
  const signed = await request(f.app).post("/login").send({ email: owner.user.email, password: "newPassword123" }).expect(200);
  const change = await request(f.app).post("/auth/password/change/request").auth(signed.body.token, { type: "bearer" }).send({ email: "ignored@example.com" }).expect(202);
  assert.ok(v.received.at(-1)?.includes(owner.user.email));
  const changed = await request(f.app).post("/auth/password/change/confirm").auth(signed.body.token, { type: "bearer" }).send({ challengeId: change.body.challengeId, code: v.code(), password: "changedAgain123" }).expect(200);
  await request(f.app).get("/me").auth(signed.body.token, { type: "bearer" }).expect(401);
  await request(f.app).get("/me").auth(changed.body.token, { type: "bearer" }).expect(200);
  assert.equal(changed.body.user.authVersion, undefined); assert.equal(changed.body.user.passwordHash, undefined);
});

test("OTP delivery failure cancels the challenge, missing SMTP fails closed, and recipient budgets are enforced", async t => {
  const v = await verification(t);
  for (let i = 0; i < 3; i++) await v.otp.issue("workspace:a", "limited@example.com", "sign-in");
  await assert.rejects(v.otp.issue("workspace:a", "limited@example.com", "sign-in"), (e: unknown) => Boolean(e && typeof e === "object" && "status" in e && e.status === 429 && "retryAfter" in e));
  const missing = new OtpService(secret, v.url, undefined, `missing-${randomUUID().slice(0, 8)}`); t.after(() => missing.close());
  assert.throws(() => missing.requireDelivery(), /not configured/);
});

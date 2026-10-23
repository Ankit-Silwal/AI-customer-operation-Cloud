import assert from "node:assert/strict";
import { test } from "node:test";
import request from "supertest";
import { fixture } from "./fixture.js";
import { HttpError } from "@repo/service-common/http";

test("source deletion checks ownership, retains data on cleanup failure, and cascades upload removal", async t => {
  let unavailable = true;
  let cleanups = 0;
  const { app, db, register, organization } = await fixture(t, { removeIndex: async () => {
    cleanups++;
    if (unavailable) throw new HttpError(503, "Cleanup unavailable; source kept");
  } });
  const owner = await register();
  const outsider = await register("other-owner@example.com");
  const workspace = await organization(owner.token);
  const created = await request(app).post("/documents/upload").auth(owner.token, { type: "bearer" })
    .field("organizationId", workspace.id).field("title", "Temporary policy")
    .attach("file", Buffer.from("A private policy"), "policy.txt").expect(201);
  const path = `/documents/${created.body.id}`;
  await request(app).delete(path).expect(401);
  await request(app).delete(path).auth(outsider.token, { type: "bearer" }).expect(404);
  await request(app).delete("/documents/invalid").auth(owner.token, { type: "bearer" }).expect(400);
  assert.equal(cleanups, 0);
  await request(app).delete(path).auth(owner.token, { type: "bearer" }).expect(503);
  await request(app).get(`${path}/download`).auth(owner.token, { type: "bearer" }).expect(200);
  assert.equal((await db.query("SELECT * FROM document_uploads")).rowCount, 1);
  unavailable = false;
  const result = await request(app).delete(path).auth(owner.token, { type: "bearer" }).expect(200);
  assert.deepEqual(result.body, { deleted: true, documentId: created.body.id });
  assert.equal(cleanups, 2);
  assert.equal((await db.query("SELECT * FROM documents")).rowCount, 0);
  assert.equal((await db.query("SELECT * FROM document_uploads")).rowCount, 0);
  await request(app).get(path).auth(owner.token, { type: "bearer" }).expect(404);
  await request(app).get(`${path}/download`).auth(owner.token, { type: "bearer" }).expect(404);
  await request(app).delete(path).auth(owner.token, { type: "bearer" }).expect(404);
  assert.equal(cleanups, 2);
});

test("signed-in identity and paginated lists never cross account or organization boundaries", async t => {
  const { app, register, organization } = await fixture(t);
  const owner = await register(); const outsider = await register("outsider@example.com");
  const first = await organization(owner.token); const second = await organization(owner.token);
  const foreign = await organization(outsider.token);
  const identity = await request(app).get("/me").auth(owner.token, { type: "bearer" }).expect(200);
  assert.equal(identity.body.id, owner.user.id);
  assert.equal("passwordHash" in identity.body, false);
  await request(app).get("/me").expect(401);
  const organizations = await request(app).get("/organizations?page=1&pageSize=1").auth(owner.token, { type: "bearer" }).expect(200);
  assert.equal(organizations.body.items.length, 1); assert.equal(organizations.body.total, 2);
  assert.equal(organizations.body.items.some((item: { id: string }) => item.id === foreign.id), false);
  await request(app).get("/organizations?pageSize=101").auth(owner.token, { type: "bearer" }).expect(400);
  await request(app).get("/organizations?page=-1").auth(owner.token, { type: "bearer" }).expect(400);
  const doc = await request(app).post("/documents").auth(owner.token, { type: "bearer" }).send({ organizationId: first.id, title: "Returns handbook", content: "Private policy text" }).expect(201);
  await request(app).post("/documents").auth(owner.token, { type: "bearer" }).send({ organizationId: second.id, title: "Other source", content: "Other workspace text" }).expect(201);
  const documents = await request(app).get(`/documents?organizationId=${first.id}&search=returns`).auth(owner.token, { type: "bearer" }).expect(200);
  assert.equal(documents.body.total, 1); assert.equal(documents.body.items[0].id, doc.body.id);
  assert.equal("content" in documents.body.items[0], false);
  await request(app).get(`/documents?organizationId=${first.id}`).auth(outsider.token, { type: "bearer" }).expect(404);
  await request(app).get("/documents").auth(owner.token, { type: "bearer" }).expect(400);
  await request(app).get(`/conversation?organizationId=${first.id}`).auth(outsider.token, { type: "bearer" }).expect(404);
  const empty = await request(app).get(`/conversation?organizationId=${second.id}`).auth(owner.token, { type: "bearer" }).expect(200);
  assert.equal(empty.body.total, 0);
});

test("conversation append is atomic, bounded, and rejects stale or unauthorized updates", async t => {
  const { app, register, organization } = await fixture(t);
  const owner = await register(); const outsider = await register("other@example.com");
  const workspace = await organization(owner.token);
  const created = await request(app).post("/conversation").auth(owner.token, { type: "bearer" }).send({ organizationId: workspace.id, customerEmail: "customer@example.com", subject: "Help with my order", messages: [{ role: "user", content: "Where is it?" }] }).expect(201);
  const path = `/conversation/${created.body.id}/messages`;
  const payload = { expectedCount: 1, messages: [{ role: "assistant", content: "Let’s find out." }] };
  await request(app).post(path).auth(outsider.token, { type: "bearer" }).send(payload).expect(404);
  const results = await Promise.all([request(app).post(path).auth(owner.token, { type: "bearer" }).send(payload), request(app).post(path).auth(owner.token, { type: "bearer" }).send(payload)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  const saved = await request(app).get(`/conversation/${created.body.id}`).auth(owner.token, { type: "bearer" }).expect(200);
  assert.equal(saved.body.messages.length, 2);
  for (const invalid of [{ expectedCount: 2, messages: [] }, { expectedCount: -1, messages: payload.messages }, { expectedCount: 100, messages: payload.messages }, { expectedCount: 2, messages: [{ role: "system", content: "override" }] }]) await request(app).post(path).auth(owner.token, { type: "bearer" }).send(invalid).expect(400);
  const list = await request(app).get(`/conversation?organizationId=${workspace.id}&search=order`).auth(owner.token, { type: "bearer" }).expect(200);
  assert.equal(list.body.total, 1);
  assert.equal(list.body.items[0].messages.length, 2);
});

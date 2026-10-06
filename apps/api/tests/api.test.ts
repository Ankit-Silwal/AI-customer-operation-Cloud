import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, type TestContext } from "node:test";
import jwt from "jsonwebtoken";
import { DataType, newDb } from "pg-mem";
import { Pool } from "pg";
import request from "supertest";
import { createApp } from "../src/app.js";
import { initializeDatabase } from "../src/database/database.js";
import type { AuthResponse } from "../src/modules/auth/auth.types.js";
import type { Organization } from "../src/modules/organizations/organization.types.js";
import type { Conversation } from "../src/modules/conversations/conversation.types.js";
import type { Document } from "../src/modules/documents/document.types.js";

const secret = "integration-test-secret-at-least-32-characters";

async function fixture(t: TestContext) {
  let db: Pool;
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (databaseUrl) {
    const schema = `test_${randomUUID().replaceAll("-", "")}`;
    const admin = new Pool({ connectionString: databaseUrl });
    await admin.query(`CREATE SCHEMA "${schema}"`);
    db = new Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${schema}`,
    });
    t.after(async () => {
      await db.end();
      try {
        await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await admin.end();
      }
    });
  } else {
    const memory = newDb();
    memory.public.registerFunction({
      name: "gen_random_uuid",
      returns: DataType.uuid,
      impure: true,
      implementation: randomUUID,
    });
    const adapter = memory.adapters.createPg();
    db = new adapter.Pool();
    t.after(() => db.end());
  }
  await initializeDatabase(db);
  const app = createApp(db, secret);
  async function register(email = "owner@example.com"): Promise<AuthResponse> {
    const response = await request(app)
      .post("/register")
      .send({
        name: "Owner",
        email,
        password: "password123",
      })
      .expect(201);
    return response.body as AuthResponse;
  }
  async function organization(token: string): Promise<Organization> {
    const response = await request(app)
      .post("/organizations")
      .auth(token, { type: "bearer" })
      .send({ name: "Support" })
      .expect(201);
    return response.body as Organization;
  }
  return { app, db, register, organization };
}

test("register and login persist a hashed password and never expose it", async (t) => {
  const { app, db, register } = await fixture(t);
  const registered = await register(" OWNER@example.com ");
  assert.equal(registered.user.email, "owner@example.com");
  assert.ok(registered.token);
  assert.ok(registered.user.createdAt);
  assert.equal("passwordHash" in registered.user, false);
  assert.equal("password_hash" in registered.user, false);
  const saved = await db.query<{ password_hash: string }>(
    "SELECT password_hash FROM users",
  );
  assert.notEqual(saved.rows[0]?.password_hash, "password123");
  const login = await request(app)
    .post("/login")
    .send({ email: "OWNER@example.com", password: "password123" })
    .expect(200);
  assert.deepEqual(login.body.user, registered.user);
  await request(app)
    .post("/login")
    .send({ email: "owner@example.com", password: "incorrect" })
    .expect(401);
  await request(app)
    .post("/login")
    .send({ email: "missing@example.com", password: "password123" })
    .expect(401);
});

test("duplicate registration returns 409", async (t) => {
  const { app, register } = await fixture(t);
  await register();
  const response = await request(app)
    .post("/register")
    .send({
      name: "Duplicate",
      email: "OWNER@example.com",
      password: "password123",
    })
    .expect(409);
  assert.equal(response.body.error, "Email is already registered");
});

test("all resource routes enforce authentication", async (t) => {
  const { app } = await fixture(t);
  for (const path of ["/organizations", "/conversation", "/documents"]) {
    await request(app).post(path).send({}).expect(401);
  }
  for (const path of ["/organizations", "/conversation"]) {
    await request(app).get(`${path}/${randomUUID()}`).expect(401);
  }
  await request(app)
    .post("/organizations")
    .auth("invalid", { type: "bearer" })
    .send({})
    .expect(401);
  for (const options of [
    { subject: randomUUID(), expiresIn: -1, issuer: "customer-operation-api" },
    { subject: randomUUID(), expiresIn: 60, issuer: "other-api" },
    { expiresIn: 60, issuer: "customer-operation-api" },
  ]) {
    const token = jwt.sign({}, secret, options);
    await request(app)
      .post("/organizations")
      .auth(token, { type: "bearer" })
      .send({ name: "Support" })
      .expect(401);
  }
});

test("organization, conversation and document routes preserve data and camelCase fields", async (t) => {
  const { app, db, register, organization } = await fixture(t);
  const { token, user } = await register();
  const org = await organization(token);
  assert.equal(org.ownerId, user.id);
  const readOrg = await request(app)
    .get(`/organizations/${org.id}`)
    .auth(token, { type: "bearer" })
    .expect(200);
  assert.deepEqual(readOrg.body, org);
  const messages = [
    { role: "user", content: " Where is my order? " },
    { role: "assistant", content: "Let me check." },
  ];
  const saved = await request(app)
    .post("/conversation")
    .auth(token, { type: "bearer" })
    .send({
      organizationId: org.id,
      customerEmail: " CUSTOMER@example.com ",
      subject: " Order ",
      messages,
    })
    .expect(201);
  const conversation = saved.body as Conversation;
  assert.equal(conversation.organizationId, org.id);
  assert.equal(conversation.customerEmail, "customer@example.com");
  assert.equal(conversation.subject, "Order");
  assert.equal(conversation.messages[0]?.content, "Where is my order?");
  const readConversation = await request(app)
    .get(`/conversation/${conversation.id}`)
    .auth(token, { type: "bearer" })
    .expect(200);
  assert.deepEqual(readConversation.body, conversation);
  const documentResponse = await request(app)
    .post("/documents")
    .auth(token, { type: "bearer" })
    .send({
      organizationId: org.id,
      title: " Policy ",
      content: " Refunds within 30 days. ",
    })
    .expect(201);
  const document = documentResponse.body as Document;
  assert.equal(document.organizationId, org.id);
  assert.equal(document.title, "Policy");
  assert.equal(document.content, "Refunds within 30 days.");
  const stored = await db.query<{ content: string }>(
    "SELECT content FROM documents WHERE id = $1",
    [document.id],
  );
  assert.equal(stored.rows[0]?.content, document.content);
});

test("conversation messages default to an empty array", async (t) => {
  const { app, register, organization } = await fixture(t);
  const { token } = await register();
  const org = await organization(token);
  const response = await request(app)
    .post("/conversation")
    .auth(token, { type: "bearer" })
    .send({
      organizationId: org.id,
      customerEmail: "customer@example.com",
      subject: "Question",
    })
    .expect(201);
  assert.deepEqual(response.body.messages, []);
});

test("another user cannot read or create resources in an owned organization", async (t) => {
  const { app, db, register, organization } = await fixture(t);
  const owner = await register();
  const outsider = await register("outsider@example.com");
  const org = await organization(owner.token);
  const conversation = await request(app)
    .post("/conversation")
    .auth(owner.token, { type: "bearer" })
    .send({
      organizationId: org.id,
      customerEmail: "customer@example.com",
      subject: "Private",
    })
    .expect(201);
  await request(app)
    .get(`/organizations/${org.id}`)
    .auth(outsider.token, { type: "bearer" })
    .expect(404);
  await request(app)
    .get(`/conversation/${conversation.body.id}`)
    .auth(outsider.token, { type: "bearer" })
    .expect(404);
  await request(app)
    .post("/conversation")
    .auth(outsider.token, { type: "bearer" })
    .send({
      organizationId: org.id,
      customerEmail: "customer@example.com",
      subject: "Denied",
    })
    .expect(404);
  await request(app)
    .post("/documents")
    .auth(outsider.token, { type: "bearer" })
    .send({
      organizationId: org.id,
      title: "Denied",
      content: "Denied",
    })
    .expect(404);
  const conversations = await db.query("SELECT id FROM conversations");
  const documents = await db.query("SELECT id FROM documents");
  assert.equal(conversations.rowCount, 1);
  assert.equal(documents.rowCount, 0);
});

test("missing resources return 404 and invalid UUIDs return 400", async (t) => {
  const { app, register } = await fixture(t);
  const { token } = await register();
  for (const path of ["/organizations", "/conversation"]) {
    await request(app)
      .get(`${path}/${randomUUID()}`)
      .auth(token, { type: "bearer" })
      .expect(404);
    await request(app)
      .get(`${path}/invalid`)
      .auth(token, { type: "bearer" })
      .expect(400);
  }
  await request(app)
    .post("/documents")
    .auth(token, { type: "bearer" })
    .send({
      organizationId: randomUUID(),
      title: "Missing",
      content: "Missing",
    })
    .expect(404);
  await request(app).get("/missing").expect(404);
});

test("invalid inputs and malformed or oversized JSON return controlled errors", async (t) => {
  const { app, register, organization } = await fixture(t);
  for (const body of [
    null,
    [],
    {},
    { name: "Owner", email: "invalid", password: "password123" },
    { name: "Owner", email: "owner@example.com", password: "short" },
  ]) {
    await request(app)
      .post("/register")
      .set("Content-Type", "application/json")
      .send(JSON.stringify(body))
      .expect(400);
  }
  await request(app)
    .post("/register")
    .set("Content-Type", "application/json")
    .send('{"broken":')
    .expect(400);
  await request(app)
    .post("/register")
    .send({ name: "x".repeat(1024 * 1024) })
    .expect(413);
  const { token } = await register();
  const org = await organization(token);
  for (const messages of [
    {},
    [null],
    [{ role: "system", content: "Invalid" }],
    [{ role: "user", content: "" }],
    Array.from({ length: 101 }, () => ({ role: "user", content: "Hi" })),
  ]) {
    await request(app)
      .post("/conversation")
      .auth(token, { type: "bearer" })
      .send({
        organizationId: org.id,
        customerEmail: "customer@example.com",
        subject: "Question",
        messages,
      })
      .expect(400);
  }
  await request(app)
    .post("/documents")
    .auth(token, { type: "bearer" })
    .send({
      organizationId: org.id,
      title: "Too large",
      content: "x".repeat(200001),
    })
    .expect(400);
});

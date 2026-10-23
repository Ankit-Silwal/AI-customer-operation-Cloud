import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";
import type { PrismaClient } from "../src/database/prisma.js";
import { readServiceRole } from "../src/services.js";
import { fixture, secret } from "./fixture.js";

test("domain roles expose only their own routes and reject invalid role names", async () => {
  const db = { $queryRaw: async () => [] } as unknown as PrismaClient;
  const secret = "service-boundary-test-at-least-32-characters";
  const identity = createApp(db, secret, { serviceRole: "identity", logger: () => {} });
  await request(identity).post("/organizations").send({}).expect(404);
  const documents = createApp(db, secret, { serviceRole: "documents", organizationAccess: async () => false, logger: () => {} });
  await request(documents).post("/register").send({}).expect(404);
  await request(documents).post("/documents").send({}).expect(401);
  await request(documents).get("/health/ready").expect(200);
  assert.throws(() => readServiceRole("typo"), /Invalid SERVICE_ROLE/);
});

test("core hosts auth and organizations on their own stores and excludes conversations and documents", async (t) => {
  const identity = await fixture(t);
  const organizations = await fixture(t);
  // The shared regression fixture has a legacy FK absent from the dedicated organizations store.
  await organizations.db.query("ALTER TABLE organizations DROP CONSTRAINT organizations_owner_id_fkey");
  const core = createApp(identity.prisma, secret, {
    serviceRole: "core", organizationDb: organizations.prisma, logger: () => {},
  });
  const registered = await request(core).post("/register").send({ name: "Core owner", email: "core@example.com", password: "password123" }).expect(201);
  const token = String(registered.body.token);
  await request(core).post("/organizations").auth(token, { type: "bearer" }).send({ name: "Core organization" }).expect(201);
  assert.equal(await identity.prisma.user.count(), 1);
  assert.equal(await identity.prisma.organization.count(), 0);
  assert.equal(await organizations.prisma.organization.count(), 1);
  assert.equal(await organizations.prisma.user.count(), 0);
  await request(core).post("/conversation").auth(token, { type: "bearer" }).send({}).expect(404);
  await request(core).post("/documents").auth(token, { type: "bearer" }).send({}).expect(404);
});

test("core readiness requires both identity and organization databases", async () => {
  const healthy = { $queryRaw: async () => [] } as unknown as PrismaClient;
  const unavailable = { $queryRaw: async () => { throw new Error("Organization database unavailable"); } } as unknown as PrismaClient;
  const core = createApp(healthy, secret, { serviceRole: "core", organizationDb: unavailable, logger: () => {} });
  await request(core).get("/health/live").expect(200);
  await request(core).get("/health/ready").expect(503);
  const conversations = createApp(healthy, secret, { serviceRole: "conversations", logger: () => {} });
  await request(conversations).post("/organizations").send({}).expect(404);
  await request(conversations).post("/register").send({}).expect(404);
  await request(conversations).post("/documents").send({}).expect(404);
});

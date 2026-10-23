import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";
import type { PrismaClient } from "../src/database/prisma.js";
import { readServiceRole } from "../src/services.js";

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

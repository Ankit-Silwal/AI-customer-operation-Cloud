import { randomUUID } from "node:crypto";
import { type TestContext } from "node:test";
import { Pool } from "pg";
import request from "supertest";

import { createHttpApp, finishHttpApp } from "@repo/service-common/app";
import { setupRoutes } from "../src/routes.js";
import { createPrisma as createConversationPrisma, setupRoutes as setupConversationRoutes } from "@repo/conversation-server";
import { createPrisma as createDocumentPrisma, setupRoutes as setupDocumentRoutes } from "@repo/document-server";
import { initializeDatabase } from "../src/database/database.js";
import { createPrisma } from "../src/database/prisma.js";

import type { AuthResponse } from "../src/modules/auth/auth.types.js";
import type { Organization } from "../src/modules/organizations/organization.types.js";

// Used only by the app created for these tests.
export const secret = "integration-test-secret-at-least-32-characters";

// Prepare a fresh database and Express app for each test.
export async function fixture(t: TestContext) {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl)
    throw new Error(
      "Use npm test or set TEST_DATABASE_URL to run Prisma integration tests",
    );
  // Real PostgreSQL: give this test its own temporary schema.
  const schema = `test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl });

  await admin.query(`CREATE SCHEMA "${schema}"`);

  const db = new Pool({
    connectionString: databaseUrl,
    options: `-c search_path=${schema}`,
  });

  const prisma = createPrisma(db, schema);
  const conversationPrisma = createConversationPrisma(db, schema);
  const documentPrisma = createDocumentPrisma(db, schema);
  // Remove this test's schema and close connections afterward.
  t.after(async () => {
    try {
      try {
        await Promise.all([prisma.$disconnect(), conversationPrisma.$disconnect(), documentPrisma.$disconnect()]);
      } finally {
        await db.end();
      }
    } finally {
      try {
        await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await admin.end();
      }
    }
  });

  await initializeDatabase(db);
  // Integration-only composition: production apps mount only their own routes.
  const organizationAccess = async (organizationId: string, ownerId: string) => {
    const result = await db.query("SELECT id FROM organizations WHERE id = $1 AND owner_id = $2", [organizationId, ownerId]);
    return result.rows.length > 0;
  };
  const app = createHttpApp(() => prisma.$queryRaw`SELECT 1`, { logger: () => undefined });
  setupRoutes(app, prisma, secret);
  setupConversationRoutes(app, conversationPrisma, secret, organizationAccess);
  setupDocumentRoutes(app, documentPrisma, secret, organizationAccess);
  finishHttpApp(app, () => undefined);

  // Helper: register a user and return { user, token }.
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

  // Helper: create an organization owned by this token's user.
  async function organization(token: string): Promise<Organization> {
    const response = await request(app)
      .post("/organizations")
      .auth(token, { type: "bearer" })
      .send({ name: "Support" })
      .expect(201);

    return response.body as Organization;
  }

  return { app, db, prisma, conversationPrisma, documentPrisma, organizationAccess, register, organization };
}

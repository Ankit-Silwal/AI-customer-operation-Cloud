import { randomUUID } from "node:crypto";
import { type TestContext } from "node:test";
import { Pool } from "pg";
import request from "supertest";

import { createApp } from "../src/app.js";
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
  // Remove this test's schema and close connections afterward.
  t.after(async () => {
    try {
      try {
        await prisma.$disconnect();
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
  const app = createApp(prisma, secret, { logger: () => undefined });

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

  return { app, db, prisma, register, organization };
}

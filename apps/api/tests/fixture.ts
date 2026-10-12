import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { type TestContext } from "node:test";
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

// Used only by the app created for these tests.
export const secret = "integration-test-secret-at-least-32-characters";

// Prepare a fresh database and Express app for each test.
export async function fixture(t: TestContext) {
  let db: Pool;
  const databaseUrl = process.env.TEST_DATABASE_URL;

  if (databaseUrl) {
    // Real PostgreSQL: give this test its own temporary schema.
    const schema = `test_${randomUUID().replaceAll("-", "")}`;
    const admin = new Pool({ connectionString: databaseUrl });

    await admin.query(`CREATE SCHEMA "${schema}"`);

    db = new Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${schema}`,
    });

    // Remove this test's schema and close connections afterward.
    t.after(async () => {
      await db.end();

      try {
        await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await admin.end();
      }
    });
  } else {
    // Default: create a fresh in-memory PostgreSQL emulator.
    // pg-mem's AST coverage checker rejects repeated CREATE IF NOT EXISTS.
    // SQL constraints still run; real PostgreSQL separately verifies migrations.
    const memory = newDb({ noAstCoverageCheck: true });

    // Your SQL schema uses gen_random_uuid().
    memory.public.registerFunction({
      name: "gen_random_uuid",
      returns: DataType.uuid,
      impure: true,
      implementation: randomUUID,
    });
    memory.public.registerFunction({ name: "pg_advisory_xact_lock", args: [DataType.integer], returns: DataType.integer, implementation: () => 1 });
    memory.public.registerFunction({ name: "btrim", args: [DataType.text], returns: DataType.text, implementation: (value: string) => value.trim() });
    memory.public.registerFunction({ name: "char_length", args: [DataType.text], returns: DataType.integer, implementation: (value: string) => Array.from(value).length });
    memory.public.registerFunction({ name: "jsonb_typeof", args: [DataType.jsonb], returns: DataType.text, implementation: (value: unknown) => Array.isArray(value) ? "array" : typeof value });
    memory.public.registerFunction({ name: "jsonb_array_length", args: [DataType.jsonb], returns: DataType.integer, implementation: (value: unknown[]) => value.length });
    memory.public.registerFunction({ name: "octet_length", args: [DataType.bytea], returns: DataType.integer, implementation: (value: Buffer) => value.length });

    const adapter = memory.adapters.createPg();
    db = new adapter.Pool();

    t.after(() => db.end());
  }

  await initializeDatabase(db);
  const app = createApp(db, secret, { logger: () => undefined });

  // Helper: register a user and return { user, token }.
  async function register(
    email = "owner@example.com",
  ): Promise<AuthResponse> {
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
  async function organization(
    token: string,
  ): Promise<Organization> {
    const response = await request(app)
      .post("/organizations")
      .auth(token, { type: "bearer" })
      .send({ name: "Support" })
      .expect(201);

    return response.body as Organization;
  }

  return { app, db, register, organization };
}


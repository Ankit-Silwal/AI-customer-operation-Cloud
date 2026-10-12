import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool } from "pg";
import { fixture } from "./fixture.js";
import { initializeDatabase } from "../src/database/database.js";

async function restoreVersion0Schema(db: Pool) {
  await db.query(`DROP TABLE document_uploads; DROP TABLE schema_migrations;
    ALTER TABLE users DROP CONSTRAINT users_name_valid, DROP CONSTRAINT users_email_valid, DROP CONSTRAINT users_password_hash_valid;
    ALTER TABLE organizations DROP CONSTRAINT organizations_name_valid;
    ALTER TABLE conversations DROP CONSTRAINT conversations_subject_valid, DROP CONSTRAINT conversations_email_valid, DROP CONSTRAINT conversations_messages_valid;
    ALTER TABLE documents DROP CONSTRAINT documents_title_valid, DROP CONSTRAINT documents_content_valid;`);
}

test("real PostgreSQL upgrades existing Version 0 data and retains useful indexes", { skip: !process.env.TEST_DATABASE_URL }, async (t) => {
  const { db, register, organization } = await fixture(t);
  const account = await register();
  const org = await organization(account.token);
  await restoreVersion0Schema(db);
  const original = await db.query("INSERT INTO documents (organization_id, title, content) VALUES ($1, 'Legacy', 'Preserved') RETURNING id", [org.id]);
  await initializeDatabase(db);
  const retained = await db.query("SELECT content FROM documents WHERE id = $1", [original.rows[0].id]);
  assert.equal(retained.rows[0].content, "Preserved");
  assert.equal((await db.query("SELECT * FROM users")).rowCount, 1);
  assert.equal((await db.query("SELECT * FROM schema_migrations")).rowCount, 1);
  const indexes = new Set((await db.query("SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()")).rows.map((row) => row.indexname));
  for (const name of ["organizations_owner_idx", "conversations_organization_idx", "documents_organization_idx", "document_uploads_pkey"]) assert.ok(indexes.has(name), name);
});

test("real PostgreSQL rejects invalid legacy data and rolls migration changes back without deleting rows", { skip: !process.env.TEST_DATABASE_URL }, async (t) => {
  const { db, register } = await fixture(t);
  const account = await register();
  await restoreVersion0Schema(db);
  await db.query("INSERT INTO organizations (name, owner_id) VALUES ('   ', $1)", [account.user.id]);
  await assert.rejects(initializeDatabase(db), (error: unknown) => (error as { code?: string }).code === "23514");
  assert.equal((await db.query("SELECT * FROM organizations")).rowCount, 1);
  const constraints = await db.query("SELECT conname FROM pg_constraint WHERE conrelid = 'users'::regclass AND conname = 'users_name_valid'");
  assert.equal(constraints.rowCount, 0, "earlier migration statements must also be rolled back");
});

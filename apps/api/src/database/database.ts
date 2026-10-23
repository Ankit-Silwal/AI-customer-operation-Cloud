import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
export { createDatabase } from "@repo/service-common/database";

export async function initializeDatabase(pool: Pool): Promise<void> {
  const schema = await readFile(
    new URL("./schema.sql", import.meta.url),
    "utf8",
  );
  const migration = await readFile(
    new URL("./migrations/001-version1.sql", import.meta.url),
    "utf8",
  );
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize startup migrations across API replicas without holding a session lock.
    await client.query("SELECT pg_advisory_xact_lock(10812001)");
    await client.query(schema);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    const applied = await client.query(
      "SELECT version FROM schema_migrations WHERE version = 1",
    );
    if (!applied.rows.length) {
      await client.query(migration);
      await client.query("INSERT INTO schema_migrations (version) VALUES (1)");
    }
    await client.query(
      await readFile(
        new URL("./services/developer.sql", import.meta.url),
        "utf8",
      ),
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

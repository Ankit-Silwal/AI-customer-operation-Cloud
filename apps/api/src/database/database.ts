import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import type { Environment } from "../config/env.js";
import { errorCode, jsonLogger, type Logger } from "../common/logger.js";

export function createDatabase(
  connectionString: string,
  settings?: Pick<Environment, "poolMax" | "poolIdleTimeoutMs" | "poolConnectionTimeoutMs" | "poolQueryTimeoutMs">,
  logger: Logger = jsonLogger,
): Pool {
  const pool = new Pool({
    connectionString,
    max: settings?.poolMax ?? 10,
    idleTimeoutMillis: settings?.poolIdleTimeoutMs ?? 30000,
    connectionTimeoutMillis: settings?.poolConnectionTimeoutMs ?? 3000,
    query_timeout: settings?.poolQueryTimeoutMs ?? 5000,
    statement_timeout: settings?.poolQueryTimeoutMs ?? 5000,
  });
  pool.on("error", (error: Error) => {
    logger({ level: "error", event: "database_idle_error", code: errorCode(error) });
  });
  return pool;
}

export async function initializeDatabase(pool: Pool): Promise<void> {
  const schema = await readFile(
    new URL("./schema.sql", import.meta.url),
    "utf8",
  );
  const migration = await readFile(new URL("./migrations/001-version1.sql", import.meta.url), "utf8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize startup migrations across API replicas without holding a session lock.
    await client.query("SELECT pg_advisory_xact_lock(10812001)");
    await client.query(schema);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    const applied = await client.query("SELECT version FROM schema_migrations WHERE version = 1");
    if (!applied.rows.length) {
      await client.query(migration);
      await client.query("INSERT INTO schema_migrations (version) VALUES (1)");
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import type { Environment } from "./env.js";
import { errorCode, jsonLogger, type Logger } from "./logger.js";

export function createDatabase(connectionString: string, settings?: Pick<Environment, "poolMax" | "poolIdleTimeoutMs" | "poolConnectionTimeoutMs" | "poolQueryTimeoutMs">, logger: Logger = jsonLogger): Pool {
  const pool = new Pool({
    connectionString, max: settings?.poolMax ?? 10,
    idleTimeoutMillis: settings?.poolIdleTimeoutMs ?? 30000,
    connectionTimeoutMillis: settings?.poolConnectionTimeoutMs ?? 3000,
    query_timeout: settings?.poolQueryTimeoutMs ?? 5000,
    statement_timeout: settings?.poolQueryTimeoutMs ?? 5000,
  });
  pool.on("error", (error: Error) => logger({ level: "error", event: "database_idle_error", code: errorCode(error) }));
  return pool;
}

export async function initializeSchema(pool: Pool, schemaUrl: URL): Promise<void> {
  const sql = await readFile(schemaUrl, "utf8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(10812002)");
    await client.query(sql);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

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
  await pool.query(schema);
}

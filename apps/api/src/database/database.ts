import { readFile } from "node:fs/promises";
import { Pool } from "pg";

export function createDatabase(connectionString: string): Pool {
  const pool = new Pool({ connectionString });
  pool.on("error", (error: Error) =>
    console.error("Idle database connection failed", error),
  );
  return pool;
}

export async function initializeDatabase(pool: Pool): Promise<void> {
  const schema = await readFile(
    new URL("./schema.sql", import.meta.url),
    "utf8",
  );
  await pool.query(schema);
}

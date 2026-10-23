import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import type { DatabaseRole } from "../services.js";

export async function initializeServiceDatabase(pool: Pool, role: DatabaseRole): Promise<void> {
  const sql = await readFile(new URL(`./services/${role}.sql`, import.meta.url), "utf8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(10812002)");
    await client.query(sql);
    if (role === "organizations") await client.query(await readFile(new URL("./services/developer.sql", import.meta.url), "utf8"));
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

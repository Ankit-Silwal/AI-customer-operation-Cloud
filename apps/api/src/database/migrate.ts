import { createDatabase, initializeDatabase } from "./database.js";
import { initializeServiceDatabase } from "./service-database.js";
import { readServiceRole } from "../services.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const pool = createDatabase(url);
try {
  const role = readServiceRole(process.env.SERVICE_ROLE);
  if (role === "core") throw new Error("Initialize identity and organizations databases separately before starting core");
  if (role === "all") await initializeDatabase(pool);
  else await initializeServiceDatabase(pool, role);
  console.log(JSON.stringify({ event: "migrations_complete" }));
} finally {
  await pool.end();
}

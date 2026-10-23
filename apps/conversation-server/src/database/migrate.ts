import { createDatabase, initializeSchema } from "@repo/service-common/database";
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const pool = createDatabase(url);
try { await initializeSchema(pool, new URL("./schema.sql", import.meta.url)); }
finally { await pool.end(); }

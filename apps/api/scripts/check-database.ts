import {
  createDatabase,
  initializeDatabase,
} from "../src/database/database.js";
import { createPrisma } from "../src/database/prisma.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const pool = createDatabase(url);
const prisma = createPrisma(pool);
try {
  await initializeDatabase(pool);
  const [connection] = await prisma.$queryRaw<
    { database: string; version: string }[]
  >`
    SELECT current_database() AS database, version()`;
  const users = await prisma.user.count();
  console.log(JSON.stringify({ status: "connected", ...connection, users }));
} finally {
  try {
    await prisma.$disconnect();
  } finally {
    await pool.end();
  }
}

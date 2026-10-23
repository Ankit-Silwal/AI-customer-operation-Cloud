import { PrismaPg } from "@prisma/adapter-pg";
import type { Pool } from "pg";
import { PrismaClient } from "../generated/prisma/client.js";

// Reuse the configured pool: timeouts, pool metrics and idle-error logging stay intact.
// The caller owns the pool and closes it after Prisma disconnects.
export function createPrisma(pool: Pool, schema = "public"): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
}

export type { PrismaClient } from "../generated/prisma/client.js";

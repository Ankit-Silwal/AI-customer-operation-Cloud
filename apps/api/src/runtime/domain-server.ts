import { readEnvironment } from "@repo/service-common/env";
import { startDatabaseServer } from "@repo/service-common/server";
import { createApp } from "../app.js";
import { createDatabase, initializeDatabase } from "../database/database.js";
import { createPrisma } from "../database/prisma.js";
import type { ServiceRole } from "../services.js";

export async function startDomainServer(serviceRole: ServiceRole): Promise<void> {
  const env = readEnvironment();
  if (serviceRole === "core" && !/^postgres(?:ql)?:\/\//.test(process.env.ORGANIZATIONS_DATABASE_URL ?? "")) {
    throw new Error("ORGANIZATIONS_DATABASE_URL must be a PostgreSQL connection URL for core");
  }
  const pool = createDatabase(env.databaseUrl, env);
  const prisma = createPrisma(pool);
  const pools = [pool];
  const clients = [prisma];
  const coreOptions = serviceRole === "core" ? (() => {
    const organizationPool = createDatabase(process.env.ORGANIZATIONS_DATABASE_URL!, env);
    const organizationDb = createPrisma(organizationPool);
    pools.push(organizationPool); clients.push(organizationDb);
    return { organizationDb };
  })() : {};
  await startDatabaseServer({
    name: "core", port: env.port, pools, clients,
    ...(serviceRole === "all" ? { initialize: () => initializeDatabase(pool) } : {}),
    createApp: isDraining => createApp(prisma, env.jwtSecret, { ...coreOptions, serviceRole, isDraining }),
  });
}

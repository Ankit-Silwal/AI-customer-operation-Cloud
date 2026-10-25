import { readEnvironment } from "@repo/service-common/env";
import { createDatabase } from "@repo/service-common/database";
import { createOrganizationAccess } from "@repo/service-common/organizations";
import { startDatabaseServer } from "@repo/service-common/server";
import { createReadReplicas, parseReadUrls } from "@repo/service-common/read-replicas";
import { createPrisma } from "./database/prisma.js";
import { createApp } from "./app.js";

const env = readEnvironment();
if (!process.env.ORGANIZATIONS_URL) throw new Error("ORGANIZATIONS_URL is required");
const access = createOrganizationAccess(process.env.ORGANIZATIONS_URL, env.jwtSecret);
const pool = createDatabase(env.databaseUrl, env);
const prisma = createPrisma(pool);
const reads = createReadReplicas(pool, prisma, parseReadUrls(process.env.DATABASE_READ_URLS), createPrisma, env);
await startDatabaseServer({
  name: "conversations", port: env.port, pools: [pool], clients: [prisma], onClose: () => reads.close(),
  createApp: isDraining => createApp(prisma, env.jwtSecret, access, { isDraining, reads }),
});

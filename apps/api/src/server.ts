import { createApp } from "./app.js";
import { readEnvironment } from "./config/env.js";
import { createDatabase, initializeDatabase } from "./database/database.js";
import { errorCode, jsonLogger } from "./common/logger.js";
import { createPrisma } from "./database/prisma.js";
import { readServiceRole } from "./services.js";
import { createOrganizationAccess } from "./clients/organizations.js";

const env = readEnvironment();
const serviceRole = readServiceRole(process.env.SERVICE_ROLE);
const needsOrganizations = serviceRole === "conversations" || serviceRole === "documents";
if (needsOrganizations && !process.env.ORGANIZATIONS_URL) throw new Error("ORGANIZATIONS_URL is required");
const organizationOptions = needsOrganizations
  ? { organizationAccess: createOrganizationAccess(process.env.ORGANIZATIONS_URL!, env.jwtSecret) }
  : {};
const db = createDatabase(env.databaseUrl, env);
const prisma = createPrisma(db);
async function closeDatabase(): Promise<void> {
  try { await prisma.$disconnect(); } finally { await db.end(); }
}
let shuttingDown = false;

try {
  // Compose runs migrations once before starting the domain services.
  if (serviceRole === "all") await initializeDatabase(db);
  await prisma.$connect();
  await prisma.$queryRaw`SELECT 1`;
} catch (error) {
  await closeDatabase();
  jsonLogger({ level: "error", event: "database_startup_failed", code: errorCode(error) });
  process.exit(1);
}

const server = createApp(prisma, env.jwtSecret, { ...organizationOptions, serviceRole, isDraining: () => shuttingDown }).listen(env.port, "0.0.0.0", () => {
  jsonLogger({ level: "info", event: "server_started" });
});
server.headersTimeout = 10000;
server.requestTimeout = 30000;
server.keepAliveTimeout = 5000;

const metricsTimer = setInterval(() => {
  jsonLogger({
    level: "info", event: "database_pool",
    poolTotal: db.totalCount, poolIdle: db.idleCount, poolWaiting: db.waitingCount,
  });
}, 10000);
metricsTimer.unref();

server.on("error", (error: Error) => {
  jsonLogger({ level: "error", event: "server_error", code: errorCode(error) });
  clearInterval(metricsTimer);
  void closeDatabase().finally(() => {
    process.exitCode = 1;
  });
});

function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(metricsTimer);
  jsonLogger({ level: "info", event: "server_draining" });
  const timeout = setTimeout(() => {
    jsonLogger({ level: "error", event: "shutdown_timeout" });
    process.exit(1);
  }, 10000);
  timeout.unref();
  server.close((error) => {
    void closeDatabase()
      .then(() => {
        clearTimeout(timeout);
        process.exitCode = error ? 1 : 0;
      })
      .catch((dbError: unknown) => {
        jsonLogger({ level: "error", event: "database_shutdown_error", code: errorCode(dbError) });
        clearTimeout(timeout);
        process.exitCode = 1;
      });
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

import { createApp } from "../app.js";
import { readEnvironment } from "../config/env.js";
import { createDatabase, initializeDatabase } from "../database/database.js";
import { createPrisma } from "../database/prisma.js";
import { errorCode, jsonLogger } from "../common/logger.js";
import type { ServiceRole } from "../services.js";
import { createOrganizationAccess } from "../clients/organizations.js";

export async function startDomainServer(serviceRole: ServiceRole): Promise<void> {
  const env = readEnvironment();
  const needsOrganizations = serviceRole === "conversations" || serviceRole === "documents";
  if (needsOrganizations && !process.env.ORGANIZATIONS_URL) throw new Error("ORGANIZATIONS_URL is required");
  const organizationOptions = needsOrganizations
    ? { organizationAccess: createOrganizationAccess(process.env.ORGANIZATIONS_URL!, env.jwtSecret) }
    : {};
  if (serviceRole === "core" && !/^postgres(?:ql)?:\/\//.test(process.env.ORGANIZATIONS_DATABASE_URL ?? "")) {
    throw new Error("ORGANIZATIONS_DATABASE_URL must be a PostgreSQL connection URL for core");
  }
  const db = createDatabase(env.databaseUrl, env);
  const prisma = createPrisma(db);
  const pools = [db];
  const clients = [prisma];
  // Core hosts both HTTP domains while retaining their databases and existing records.
  const coreOptions = serviceRole === "core" ? (() => {
    const organizationPool = createDatabase(process.env.ORGANIZATIONS_DATABASE_URL!, env);
    const organizationDb = createPrisma(organizationPool);
    pools.push(organizationPool);
    clients.push(organizationDb);
    return { organizationDb };
  })() : {};
  let closePromise: Promise<void> | undefined;
  function closeDatabase(): Promise<void> {
    closePromise ??= (async () => {
      try { await Promise.all(clients.map(client => client.$disconnect())); }
      finally { await Promise.all(pools.map(pool => pool.end())); }
    })();
    return closePromise;
  }
  let shuttingDown = false;
  try {
    if (serviceRole === "all") await initializeDatabase(db);
    await Promise.all(clients.map(async client => {
      await client.$connect();
      await client.$queryRaw`SELECT 1`;
    }));
  } catch (error) {
    await closeDatabase();
    jsonLogger({ level: "error", event: "database_startup_failed", code: errorCode(error) });
    process.exitCode = 1;
    return;
  }
  const app = createApp(prisma, env.jwtSecret, {
    ...organizationOptions, ...coreOptions, serviceRole, isDraining: () => shuttingDown,
  });
  const server = app.listen(env.port, "0.0.0.0", () => {
    console.log(JSON.stringify({ event: "server_started", service: serviceRole }));
  });
  server.headersTimeout = 10000;
  server.requestTimeout = 30000;
  server.keepAliveTimeout = 5000;
  const metricsTimer = setInterval(() => {
    jsonLogger({
      level: "info", event: "database_pool",
      poolTotal: pools.reduce((count, pool) => count + pool.totalCount, 0),
      poolIdle: pools.reduce((count, pool) => count + pool.idleCount, 0),
      poolWaiting: pools.reduce((count, pool) => count + pool.waitingCount, 0),
    });
  }, 10000);
  metricsTimer.unref();
  server.on("error", (error: Error) => {
    jsonLogger({ level: "error", event: "server_error", code: errorCode(error) });
    clearInterval(metricsTimer);
    void closeDatabase().finally(() => { process.exitCode = 1; });
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
      void closeDatabase().then(() => {
        clearTimeout(timeout);
        process.exitCode = error ? 1 : 0;
      }).catch((dbError: unknown) => {
        jsonLogger({ level: "error", event: "database_shutdown_error", code: errorCode(dbError) });
        clearTimeout(timeout);
        process.exitCode = 1;
      });
    });
  }
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

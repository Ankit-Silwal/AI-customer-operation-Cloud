import { createApp } from "./app.js";
import { readEnvironment } from "./config/env.js";
import { createDatabase, initializeDatabase } from "./database/database.js";
import { errorCode, jsonLogger } from "./common/logger.js";

const env = readEnvironment();
const db = createDatabase(env.databaseUrl, env);
let shuttingDown = false;

try {
  await initializeDatabase(db);
} catch (error) {
  await db.end();
  jsonLogger({ level: "error", event: "database_startup_failed", code: errorCode(error) });
  process.exit(1);
}

const server = createApp(db, env.jwtSecret, { isDraining: () => shuttingDown }).listen(env.port, "0.0.0.0", () => {
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
  void db.end().finally(() => {
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
    void db
      .end()
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

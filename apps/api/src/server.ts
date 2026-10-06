import { createApp } from "./app.js";
import { readEnvironment } from "./config/env.js";
import { createDatabase, initializeDatabase } from "./database/database.js";

const env = readEnvironment();
const db = createDatabase(env.databaseUrl);

try {
  await initializeDatabase(db);
} catch (error) {
  await db.end();
  throw error;
}

const server = createApp(db, env.jwtSecret).listen(env.port, "0.0.0.0", () => {
  console.log(`Customer operation API listening on port ${env.port}`);
});

server.on("error", (error: Error) => {
  console.error("API server failed", error);
  void db.end().finally(() => {
    process.exitCode = 1;
  });
});

let shuttingDown = false;
function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  const timeout = setTimeout(() => {
    console.error("Graceful shutdown timed out");
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
        console.error("Database shutdown failed", dbError);
        clearTimeout(timeout);
        process.exitCode = 1;
      });
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

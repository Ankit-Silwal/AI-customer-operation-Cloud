import { closeOtpServices } from "./otp.js";
import type { Express } from "express";
import type { Pool } from "pg";
import { errorCode, jsonLogger } from "./logger.js";
import { closeRateLimiters } from "./rate-limit.js";

export interface ManagedClient {
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  $queryRaw(query: TemplateStringsArray): PromiseLike<unknown>;
}

export async function startDatabaseServer(options: {
  name: string;
  port: number;
  pools: Pool[];
  clients: ManagedClient[];
  createApp: (isDraining: () => boolean) => Express;
  initialize?: () => Promise<void>;
  // Optional resources (read replicas) are closed on shutdown but never block startup.
  onClose?: () => Promise<void>;
}): Promise<void> {
  const { pools, clients } = options;
  let closePromise: Promise<void> | undefined;
  function closeDatabase(): Promise<void> {
    closePromise ??= (async () => {
      closeRateLimiters();
      closeOtpServices();
      try {
        await Promise.all(clients.map((client) => client.$disconnect()));
      } finally {
        await Promise.all([
          ...pools.map((pool) => pool.end()),
          options.onClose?.(),
        ]);
      }
    })();
    return closePromise;
  }
  try {
    await options.initialize?.();
    await Promise.all(
      clients.map(async (client) => {
        await client.$connect();
        await client.$queryRaw`SELECT 1`;
      }),
    );
  } catch (error) {
    await closeDatabase();
    jsonLogger({
      level: "error",
      event: "database_startup_failed",
      code: errorCode(error),
    });
    process.exitCode = 1;
    return;
  }
  let draining = false;
  const server = options
    .createApp(() => draining)
    .listen(options.port, "0.0.0.0", () => {
      console.log(
        JSON.stringify({ event: "server_started", service: options.name }),
      );
    });
  server.headersTimeout = 10000;
  server.requestTimeout = 30000;
  server.keepAliveTimeout = 5000;
  const metrics = setInterval(
    () =>
      jsonLogger({
        level: "info",
        event: "database_pool",
        poolTotal: pools.reduce((sum, pool) => sum + pool.totalCount, 0),
        poolIdle: pools.reduce((sum, pool) => sum + pool.idleCount, 0),
        poolWaiting: pools.reduce((sum, pool) => sum + pool.waitingCount, 0),
      }),
    10000,
  );
  metrics.unref();
  server.on("error", (error: Error) => {
    jsonLogger({
      level: "error",
      event: "server_error",
      code: errorCode(error),
    });
    clearInterval(metrics);
    void closeDatabase().then(
      () => {
        process.exitCode = 1;
      },
      () => {
        process.exitCode = 1;
      },
    );
  });
  function shutdown() {
    if (draining) return;
    draining = true;
    clearInterval(metrics);
    const deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
    server.close((error) => {
      void closeDatabase()
        .then(() => {
          clearTimeout(deadline);
          process.exitCode = error ? 1 : 0;
        })
        .catch((error: unknown) => {
          jsonLogger({
            level: "error",
            event: "database_shutdown_error",
            code: errorCode(error),
          });
          clearTimeout(deadline);
          process.exitCode = 1;
        });
    });
  }
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

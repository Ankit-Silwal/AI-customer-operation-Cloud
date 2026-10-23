import { createHttpApp, finishHttpApp } from "@repo/service-common/app";
import type { PrismaClient } from "./database/prisma.js";
import { setupRoutes, type RouteOptions } from "./routes.js";

export type AppOptions = RouteOptions;
export function createApp(db: PrismaClient, jwtSecret: string, options: AppOptions = {}) {
  const databases = options.organizationDb && options.organizationDb !== db ? [db, options.organizationDb] : [db];
  const app = createHttpApp(() => Promise.all(databases.map(client => client.$queryRaw`SELECT 1`)), options);
  setupRoutes(app, db, jwtSecret, options);
  return finishHttpApp(app, options.logger);
}

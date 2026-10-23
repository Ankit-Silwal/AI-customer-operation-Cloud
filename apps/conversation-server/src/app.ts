import { createHttpApp, finishHttpApp, type HttpOptions } from "@repo/service-common/app";
import type { OrganizationAccess } from "@repo/service-common/organizations";
import type { PrismaClient } from "./database/prisma.js";
import { setupRoutes } from "./routes.js";

export function createApp(db: PrismaClient, jwtSecret: string, organizationAccess: OrganizationAccess, options: HttpOptions = {}) {
  const app = createHttpApp(() => db.$queryRaw`SELECT 1`, { ...options, rateService: "conversations" });
  setupRoutes(app, db, jwtSecret, organizationAccess);
  return finishHttpApp(app, options.logger);
}

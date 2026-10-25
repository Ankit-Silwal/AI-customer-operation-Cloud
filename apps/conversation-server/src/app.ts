import { createHttpApp, finishHttpApp, type HttpOptions } from "@repo/service-common/app";
import type { OrganizationAccess } from "@repo/service-common/organizations";
import type { ReadSource } from "@repo/service-common/read-replicas";
import type { PrismaClient } from "./database/prisma.js";
import { setupRoutes } from "./routes.js";

export function createApp(db: PrismaClient, jwtSecret: string, organizationAccess: OrganizationAccess, options: HttpOptions & { reads?: ReadSource<PrismaClient> } = {}) {
  const app = createHttpApp(() => db.$queryRaw`SELECT 1`, { ...options, rateService: "conversations" });
  setupRoutes(app, db, jwtSecret, organizationAccess, options.reads);
  return finishHttpApp(app, options.logger);
}

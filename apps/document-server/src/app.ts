import { createHttpApp, finishHttpApp, type HttpOptions } from "@repo/service-common/app";
import type { OrganizationAccess } from "@repo/service-common/organizations";
import type { ReadSource } from "@repo/service-common/read-replicas";
import type { PrismaClient } from "./database/prisma.js";
import { setupRoutes } from "./routes.js";

export function createApp(db: PrismaClient, jwtSecret: string, organizationAccess: OrganizationAccess, options: HttpOptions & { reads?: ReadSource<PrismaClient> } = {}) {
  const app = createHttpApp(() => db.$queryRaw`SELECT 1`, { ...options, rateService: "documents" });
  setupRoutes(app, db, jwtSecret, organizationAccess, undefined, options.reads);
  return finishHttpApp(app, options.logger);
}

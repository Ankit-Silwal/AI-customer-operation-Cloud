import type { Express } from "express";
import { authenticate } from "@repo/service-common/authenticate";
import { rememberRoutePrefix } from "@repo/service-common/request-context";
import { TokenService } from "@repo/service-common/token";
import type { HttpOptions } from "@repo/service-common/app";
import type { PrismaClient } from "./database/prisma.js";
import { PrismaAuthRepository } from "./modules/auth/auth.repository.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { PrismaOrganizationRepository } from "./modules/organizations/organization.repository.js";
import { organizationRoutes } from "./modules/organizations/organization.routes.js";
import { OrganizationService } from "./modules/organizations/organization.service.js";
import type { ServiceRole } from "./services.js";

export interface RouteOptions extends HttpOptions {
  serviceRole?: ServiceRole;
  organizationDb?: PrismaClient;
}

export function setupRoutes(app: Express, db: PrismaClient, jwtSecret: string, options: RouteOptions = {}): void {
  const { serviceRole = "core", organizationDb = db } = options;
  const tokens = new TokenService(jwtSecret);
  const auth = authenticate(tokens);
  if (serviceRole !== "organizations") app.use(authRoutes(new AuthService(new PrismaAuthRepository(db), tokens)));
  if (serviceRole !== "identity") app.use("/organizations", rememberRoutePrefix, organizationRoutes(new OrganizationService(new PrismaOrganizationRepository(organizationDb)), auth));
}

import express, { type Express } from "express";
import type { PrismaClient } from "./database/prisma.js";
import { authenticate } from "./middleware/authenticate.js";
import { rememberRoutePrefix } from "./middleware/request-context.js";
import { PrismaAuthRepository } from "./modules/auth/auth.repository.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { TokenService } from "./modules/auth/token.service.js";
import { PrismaConversationRepository } from "./modules/conversations/conversation.repository.js";
import { conversationRoutes } from "./modules/conversations/conversation.routes.js";
import { ConversationService } from "./modules/conversations/conversation.service.js";
import { PrismaDocumentRepository } from "./modules/documents/document.repository.js";
import { documentRoutes } from "./modules/documents/document.routes.js";
import { DocumentService } from "./modules/documents/document.service.js";
import { healthRoutes } from "./modules/health/health.routes.js";
import { PrismaOrganizationRepository } from "./modules/organizations/organization.repository.js";
import { organizationRoutes } from "./modules/organizations/organization.routes.js";
import { OrganizationService } from "./modules/organizations/organization.service.js";
import type { ServiceRole } from "./services.js";
import type { OrganizationAccess } from "./clients/organizations.js";

export interface RouteOptions {
  isDraining?: () => boolean;
  serviceRole?: ServiceRole;
  organizationAccess?: OrganizationAccess;
  organizationDb?: PrismaClient;
}

export function setupRoutes(
  app: Express,
  db: PrismaClient,
  jwtSecret: string,
  options: RouteOptions = {},
): void {
  const { isDraining = () => false, serviceRole = "all", organizationAccess, organizationDb = db } = options;
  const tokens = new TokenService(jwtSecret);
  const auth = authenticate(tokens);

  // Health probes must remain independent of request body parsing.
  app.use("/health", rememberRoutePrefix, healthRoutes(db, isDraining, organizationDb === db ? [] : [organizationDb]));
  app.use(express.json({ limit: "1mb" }));
  if (serviceRole === "all" || serviceRole === "core" || serviceRole === "identity") {
    app.use(authRoutes(new AuthService(new PrismaAuthRepository(db), tokens)));
  }
  if (serviceRole === "all" || serviceRole === "core" || serviceRole === "organizations") app.use(
    "/organizations",
    rememberRoutePrefix,
    organizationRoutes(
      new OrganizationService(new PrismaOrganizationRepository(organizationDb)),
      auth,
    ),
  );
  if (serviceRole === "all" || serviceRole === "conversations") app.use(
    "/conversation",
    rememberRoutePrefix,
    conversationRoutes(
      new ConversationService(new PrismaConversationRepository(db, organizationAccess)),
      auth,
    ),
  );
  if (serviceRole === "all" || serviceRole === "documents") app.use(
    "/documents",
    rememberRoutePrefix,
    documentRoutes(
      new DocumentService(new PrismaDocumentRepository(db, organizationAccess)),
      auth,
    ),
  );
}

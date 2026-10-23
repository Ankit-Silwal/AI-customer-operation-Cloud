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

export function setupRoutes(
  app: Express,
  db: PrismaClient,
  jwtSecret: string,
  isDraining: () => boolean = () => false,
): void {
  const tokens = new TokenService(jwtSecret);
  const auth = authenticate(tokens);

  // Health probes must remain independent of request body parsing.
  app.use("/health", rememberRoutePrefix, healthRoutes(db, isDraining));
  app.use(express.json({ limit: "1mb" }));
  app.use(authRoutes(new AuthService(new PrismaAuthRepository(db), tokens)));
  app.use(
    "/organizations",
    rememberRoutePrefix,
    organizationRoutes(
      new OrganizationService(new PrismaOrganizationRepository(db)),
      auth,
    ),
  );
  app.use(
    "/conversation",
    rememberRoutePrefix,
    conversationRoutes(
      new ConversationService(new PrismaConversationRepository(db)),
      auth,
    ),
  );
  app.use(
    "/documents",
    rememberRoutePrefix,
    documentRoutes(
      new DocumentService(new PrismaDocumentRepository(db)),
      auth,
    ),
  );
}

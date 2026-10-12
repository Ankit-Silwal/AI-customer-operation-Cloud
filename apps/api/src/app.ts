import express, { type Express } from "express";
import type { Pool } from "pg";
import helmet from "helmet";
import { jsonLogger, type Logger } from "./common/logger.js";
import { requestContext, rememberRoutePrefix } from "./middleware/request-context.js";
import { healthRoutes } from "./modules/health/health.routes.js";
import { authenticate } from "./middleware/authenticate.js";
import { createErrorHandler } from "./middleware/error-handler.js";
import { PostgresAuthRepository } from "./modules/auth/auth.repository.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { TokenService } from "./modules/auth/token.service.js";
import { PostgresConversationRepository } from "./modules/conversations/conversation.repository.js";
import { conversationRoutes } from "./modules/conversations/conversation.routes.js";
import { ConversationService } from "./modules/conversations/conversation.service.js";
import { PostgresDocumentRepository } from "./modules/documents/document.repository.js";
import { documentRoutes } from "./modules/documents/document.routes.js";
import { DocumentService } from "./modules/documents/document.service.js";
import { PostgresOrganizationRepository } from "./modules/organizations/organization.repository.js";
import { organizationRoutes } from "./modules/organizations/organization.routes.js";
import { OrganizationService } from "./modules/organizations/organization.service.js";

export interface AppOptions {
  logger?: Logger;
  isDraining?: () => boolean;
}

export function createApp(db: Pool, jwtSecret: string, options: AppOptions = {}): Express {
  const app = express();
  const tokens = new TokenService(jwtSecret);
  const auth = authenticate(tokens);
  app.disable("x-powered-by");
  const logger = options.logger ?? jsonLogger;
  app.use(requestContext(logger));
  app.use(helmet());
  app.use("/health", rememberRoutePrefix, healthRoutes(db, options.isDraining ?? (() => false)));
  app.use(express.json({ limit: "1mb" }));
  app.use(authRoutes(new AuthService(new PostgresAuthRepository(db), tokens)));
  app.use(
    "/organizations",
    rememberRoutePrefix,
    organizationRoutes(
      new OrganizationService(new PostgresOrganizationRepository(db)),
      auth,
    ),
  );
  app.use(
    "/conversation",
    rememberRoutePrefix,
    conversationRoutes(
      new ConversationService(new PostgresConversationRepository(db)),
      auth,
    ),
  );
  app.use(
    "/documents",
    rememberRoutePrefix,
    documentRoutes(
      new DocumentService(new PostgresDocumentRepository(db)),
      auth,
    ),
  );
  app.use((_req, res) => {
    res.status(404).json({ error: "Endpoint not found", requestId: res.locals.requestId });
  });
  app.use(createErrorHandler(logger));
  return app;
}

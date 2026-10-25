import type { Express } from "express";
import { authenticate } from "@repo/service-common/authenticate";
import { TokenService } from "@repo/service-common/token";
import { rememberRoutePrefix } from "@repo/service-common/request-context";
import type { OrganizationAccess } from "@repo/service-common/organizations";
import type { ReadSource } from "@repo/service-common/read-replicas";
import type { PrismaClient } from "./database/prisma.js";
import { PrismaConversationRepository } from "./modules/conversations/conversation.repository.js";
import { ConversationService } from "./modules/conversations/conversation.service.js";
import { conversationRoutes } from "./modules/conversations/conversation.routes.js";

export function setupRoutes(app: Express, db: PrismaClient, jwtSecret: string, organizationAccess: OrganizationAccess, reads?: ReadSource<PrismaClient>): void {
  const auth = authenticate(new TokenService(jwtSecret));
  app.use("/conversation", rememberRoutePrefix, conversationRoutes(new ConversationService(new PrismaConversationRepository(db, organizationAccess, reads)), auth));
}

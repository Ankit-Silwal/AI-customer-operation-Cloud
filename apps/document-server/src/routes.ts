import type { Express } from "express";
import { authenticate } from "@repo/service-common/authenticate";
import { TokenService } from "@repo/service-common/token";
import { rememberRoutePrefix } from "@repo/service-common/request-context";
import type { OrganizationAccess } from "@repo/service-common/organizations";
import type { PrismaClient } from "./database/prisma.js";
import { PrismaDocumentRepository } from "./modules/documents/document.repository.js";
import { DocumentService } from "./modules/documents/document.service.js";
import { documentRoutes } from "./modules/documents/document.routes.js";
import {
  createIndexRemoval,
  type RemoveDocumentIndex,
} from "./modules/documents/document.index.js";

export function setupRoutes(
  app: Express,
  db: PrismaClient,
  jwtSecret: string,
  organizationAccess: OrganizationAccess,
  removeIndex: RemoveDocumentIndex = createIndexRemoval(
    process.env.RAG_URL ?? "http://localhost:4102",
  ),
): void {
  const auth = authenticate(new TokenService(jwtSecret));
  app.use(
    "/documents",
    rememberRoutePrefix,
    documentRoutes(
      new DocumentService(
        new PrismaDocumentRepository(db, organizationAccess),
        removeIndex,
      ),
      auth,
    ),
  );
}

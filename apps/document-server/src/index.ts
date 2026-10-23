export { createApp } from "./app.js";
export { setupRoutes } from "./routes.js";
export { createPrisma } from "./database/prisma.js";
export type { PrismaClient } from "./database/prisma.js";
export { PrismaDocumentRepository } from "./modules/documents/document.repository.js";
export { createIndexRemoval, type RemoveDocumentIndex } from "./modules/documents/document.index.js";
export type * from "./modules/documents/document.types.js";

export { MAX_UPLOAD_BYTES } from "./modules/documents/document.upload.js";

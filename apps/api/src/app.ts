import express, { type Express } from "express";
import type { PrismaClient } from "./database/prisma.js";
import helmet from "helmet";
import { jsonLogger, type Logger } from "./common/logger.js";
import { requestContext } from "./middleware/request-context.js";
import { createErrorHandler } from "./middleware/error-handler.js";
import { setupRoutes, type RouteOptions } from "./routes.js";

export interface AppOptions extends RouteOptions {
  logger?: Logger;
}

export function createApp(db: PrismaClient, jwtSecret: string, options: AppOptions = {}): Express {
  const app = express();
  app.disable("x-powered-by");
  const logger = options.logger ?? jsonLogger;
  app.use(requestContext(logger));
  app.use(helmet());
  setupRoutes(app, db, jwtSecret, options);
  app.use((_req, res) => {
    res.status(404).json({ error: "Endpoint not found", requestId: res.locals.requestId });
  });
  app.use(createErrorHandler(logger));
  return app;
}

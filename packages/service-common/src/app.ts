import express, { type Express } from "express";
import helmet from "helmet";
import { requestContext } from "./request-context.js";
import { createErrorHandler } from "./error-handler.js";
import { jsonLogger, type Logger } from "./logger.js";

export interface HttpOptions {
  logger?: Logger;
  isDraining?: () => boolean;
}

export function createHttpApp(checkReadiness: () => PromiseLike<unknown>, options: HttpOptions = {}): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(requestContext(options.logger ?? jsonLogger));
  app.use(helmet());
  app.get("/health/live", (_req, res) => res.json({ status: "ok", version: "1.0.0" }));
  app.get("/health/ready", async (_req, res) => {
    let timeout: NodeJS.Timeout | undefined;
    try {
      if (options.isDraining?.()) throw new Error("Draining");
      const deadline = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("Readiness deadline")), 1000);
      });
      await Promise.race([checkReadiness(), deadline]);
      res.json({ status: "ready", version: "1.0.0" });
    } catch {
      res.status(503).json({ status: "not_ready", requestId: res.locals.requestId });
    } finally { clearTimeout(timeout); }
  });
  app.use(express.json({ limit: "1mb" }));
  return app;
}

export function finishHttpApp(app: Express, logger: Logger = jsonLogger): Express {
  app.use((_req, res) => res.status(404).json({ error: "Endpoint not found", requestId: res.locals.requestId }));
  app.use(createErrorHandler(logger));
  return app;
}

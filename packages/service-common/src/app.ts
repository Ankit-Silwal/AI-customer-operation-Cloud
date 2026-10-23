import express, { type Express } from "express";
import helmet from "helmet";
import { requestContext } from "./request-context.js";
import { createErrorHandler } from "./error-handler.js";
import { jsonLogger, type Logger } from "./logger.js";
import { environmentLimiter, type RateLimiter } from "./rate-limit.js";

export interface HttpOptions {
  logger?: Logger;
  isDraining?: () => boolean;
  rateLimiter?: RateLimiter | false;
  rateService?: string;
}

export function createHttpApp(checkReadiness: () => PromiseLike<unknown>, options: HttpOptions = {}): Express {
  const app = express();
  const limiter = options.rateLimiter === false ? undefined : options.rateLimiter ?? environmentLimiter(options.rateService ?? "core");
  app.locals.rateLimiter = limiter;
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
      await Promise.race([Promise.all([checkReadiness(), limiter?.ready()]), deadline]);
      res.json({ status: "ready", version: "1.0.0" });
    } catch {
      res.status(503).json({ status: "not_ready", requestId: res.locals.requestId });
    } finally { clearTimeout(timeout); }
  });
  if (limiter) app.use(limiter.global());
  app.use(express.json({ limit: "1mb" }));
  return app;
}

export function finishHttpApp(app: Express, logger: Logger = jsonLogger): Express {
  app.use((_req, res) => res.status(404).json({ error: "Endpoint not found", requestId: res.locals.requestId }));
  app.use(createErrorHandler(logger));
  return app;
}

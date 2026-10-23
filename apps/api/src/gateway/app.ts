import express, { type Express } from "express";
import helmet from "helmet";
import { requestContext } from "../middleware/request-context.js";
import { jsonLogger, type Logger } from "../common/logger.js";
import { setupGatewayRoutes, type GatewayTargets } from "./routes.js";

export function createGateway(targets: GatewayTargets, logger: Logger = jsonLogger, isDraining = () => false): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(requestContext(logger));
  app.use(helmet());
  app.get("/health/live", (_req, res) => res.json({ status: "ok", service: "gateway" }));
  app.get("/health/ready", async (_req, res) => {
    // Missing LLM credentials do not prevent the core business services from starting.
    const core = [targets.core, targets.conversations, targets.documents];
    try {
      if (isDraining()) throw new Error("Draining");
      const checks = await Promise.all(core.map(url => fetch(`${url}/health/ready`, { signal: AbortSignal.timeout(1500) })));
      if (checks.some(response => !response.ok)) throw new Error("Dependency unavailable");
      res.json({ status: "ready", service: "gateway" });
    } catch {
      res.status(503).json({ status: "not_ready", requestId: res.locals.requestId });
    }
  });
  // Stream JSON and multipart bytes to the owning service without buffering uploads.
  setupGatewayRoutes(app, targets);
  app.use((_req, res) => res.status(404).json({ error: "Endpoint not found", requestId: res.locals.requestId }));
  return app;
}

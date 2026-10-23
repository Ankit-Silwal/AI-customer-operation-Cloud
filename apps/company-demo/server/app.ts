import { createHttpApp } from "@repo/service-common/app";
import { createErrorHandler } from "@repo/service-common/error-handler";
import { HttpError } from "@repo/service-common/http";
import { ApiFailure, type WebConfig } from "@repo/web-runtime/http";
import { DemoService } from "./service.js";
import { setupRoutes } from "./routes.js";
export function createApp(config: WebConfig, demo = new DemoService(config)) {
  const app = createHttpApp(
    async () => {
      // The storefront stays available while an operator configures an API key.
      await demo.status();
    },
    { rateService: "company-demo" },
  );
  setupRoutes(app, config, demo);
  app.use(
    (
      error: unknown,
      _req: import("express").Request,
      res: import("express").Response,
      next: import("express").NextFunction,
    ) => {
      if (error instanceof ApiFailure && error.retryAfter)
        res.set("Retry-After", String(error.retryAfter));
      if (error instanceof HttpError && error.status === 503)
        res.set("Retry-After", "5");
      next(error);
    },
  );
  app.use(createErrorHandler());
  return { app, demo };
}

import { createHttpApp } from "@repo/service-common/app";
import { createErrorHandler } from "@repo/service-common/error-handler";
import { upstream, type WebConfig } from "@repo/web-runtime/http";
import { setupRoutes } from "./routes.js";

export function createApp(config: WebConfig) {
  const app = createHttpApp(
    async () => {
      const response = await upstream(config, "/health/ready", {
        timeoutMs: 750,
      });
      await response.arrayBuffer();
      if (!response.ok) throw new Error("Unavailable");
    },
    { rateService: "web" },
  );
  setupRoutes(app, config);
  app.use(createErrorHandler());
  return app;
}

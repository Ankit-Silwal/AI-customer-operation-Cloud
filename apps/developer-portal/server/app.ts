import { createHttpApp } from "@repo/service-common/app";
import { createErrorHandler } from "@repo/service-common/error-handler";
import { environmentOtp } from "@repo/service-common/otp";
import type { WebConfig } from "@repo/web-runtime/http";
import { setupRoutes } from "./routes.js";
import { DemoService } from "./service.js";

export function createApp(config: WebConfig, demo = new DemoService(config)) {
  const otp = environmentOtp();
  const app = createHttpApp(async () => { await otp?.ready(); }, { rateService: "developer-portal" });
  setupRoutes(app, config, demo, otp);
  app.use(createErrorHandler());
  return { app, demo };
}

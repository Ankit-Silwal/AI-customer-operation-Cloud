import { fileURLToPath } from "node:url";
import { startWeb, webConfig } from "@repo/web-runtime/http";
import { createApp } from "./app.js";
const config = webConfig();
const root = fileURLToPath(
  new URL(
    process.env.NODE_ENV === "production" ? "../../" : "../",
    import.meta.url,
  ),
);
await startWeb(createApp(config), root, config.port);

import { fileURLToPath } from "node:url";
import { startWeb, webConfig } from "@repo/web-runtime/http";
import { createApp } from "./app.js";
const config = webConfig(true);
const { app, demo } = createApp(config);
const root = fileURLToPath(
  new URL(
    process.env.NODE_ENV === "production" ? "../../" : "../",
    import.meta.url,
  ),
);
await startWeb(app, root, config.port);
async function prepare() {
  try {
    await demo.prepare();
    console.log(JSON.stringify({ event: "demo_ready" }));
  } catch {
    console.error(JSON.stringify({ event: "demo_preparation_pending" }));
    setTimeout(() => {
      void prepare();
    }, 60000).unref();
  }
}
void prepare();

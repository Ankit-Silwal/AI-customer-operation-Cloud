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
  const wasReady = demo.state === "ready";
  try {
    await demo.prepare();
    if (!wasReady) console.log(JSON.stringify({ event: "demo_ready" }));
  } catch {
    console.error(JSON.stringify({ event: "demo_preparation_pending" }));
  }
}
void prepare();
// Refresh the private owner session before its seven-day expiry and recover
// after a dependency outage without requiring a container restart.
setInterval(() => {
  void prepare();
}, 60000).unref();

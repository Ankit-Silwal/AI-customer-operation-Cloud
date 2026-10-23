import { fileURLToPath } from "node:url";
import { startWeb, webConfig } from "@repo/web-runtime/http";
import { createApp } from "./app.js";
const port = Number(process.env.DOCS_PORT ?? 3040);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid DOCS_PORT");
const origin = new URL(process.env.DOCS_ORIGIN ?? `http://localhost:${port}`).origin;
if (!/^https?:\/\//.test(origin)) throw new Error("DOCS_ORIGIN must use HTTP or HTTPS");
const config = { ...webConfig(), port, origin, secure: process.env.WEB_COOKIE_SECURE === "true" || origin.startsWith("https:") };
const { app, demo } = createApp(config);
await startWeb(app, fileURLToPath(new URL(process.env.NODE_ENV === "production" ? "../../" : "../", import.meta.url)), port);
async function prepare() {
  try { await demo.prepare(); } catch { console.error(JSON.stringify({ event: "docs_sandbox_preparation_pending" })); }
}
void prepare();
setInterval(() => { void prepare(); }, 60000).unref();

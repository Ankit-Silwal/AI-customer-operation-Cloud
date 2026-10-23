import { createGateway } from "./app.js";

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
let draining = false;
const app = createGateway({
  identity: process.env.IDENTITY_URL ?? "http://identity:3001",
  organizations: process.env.ORGANIZATIONS_URL ?? "http://organizations:3001",
  conversations: process.env.CONVERSATIONS_URL ?? "http://conversations:3001",
  documents: process.env.DOCUMENTS_URL ?? "http://documents:3001",
  rag: process.env.RAG_URL ?? "http://rag:8000",
}, undefined, () => draining);
const server = app.listen(port, "0.0.0.0", () => console.log(JSON.stringify({ event: "gateway_started" })));
server.headersTimeout = 10000;
server.requestTimeout = 65000;
function shutdown() {
  if (draining) return;
  draining = true;
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  server.close(() => { clearTimeout(deadline); });
}
server.on("error", () => { process.exitCode = 1; });
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

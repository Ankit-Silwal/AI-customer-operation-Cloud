import { request as httpRequest, type OutgoingHttpHeaders } from "node:http";
import type { Express, RequestHandler } from "express";

export interface GatewayTargets {
  core: string;
  conversations: string;
  documents: string;
  rag: string;
}

const hopHeaders = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade", "host"]);

function proxy(target: string): RequestHandler {
  const origin = new URL(target);
  if (origin.protocol !== "http:") throw new Error("Internal service URLs must use HTTP");
  return (req, res) => {
    const headers: OutgoingHttpHeaders = { ...req.headers, "x-request-id": String(res.locals.requestId) };
    for (const name of hopHeaders) delete headers[name];
    const upstream = httpRequest({
      hostname: origin.hostname,
      port: origin.port || 80,
      path: req.originalUrl,
      method: req.method,
      agent: false,
      headers,
    }, (response) => {
      res.status(response.statusCode ?? 502);
      for (const [name, value] of Object.entries(response.headers)) {
        if (!hopHeaders.has(name) && value !== undefined) res.setHeader(name, value);
      }
      response.on("error", () => res.destroy());
      response.pipe(res);
    });
    // A total deadline also bounds peers that keep sending partial responses.
    const deadline = setTimeout(() => upstream.destroy(new Error("Upstream deadline")), 60000);
    const cleanup = () => clearTimeout(deadline);
    res.once("finish", cleanup);
    res.once("close", () => { cleanup(); upstream.destroy(); });
    upstream.on("error", () => {
      if (res.headersSent) { res.destroy(); return; }
      res.status(503).json({ error: "Service temporarily unavailable", requestId: res.locals.requestId });
    });
    req.once("aborted", () => upstream.destroy());
    req.pipe(upstream);
  };
}

export function setupGatewayRoutes(app: Express, targets: GatewayTargets): void {
  app.use(["/register", "/login", "/organizations"], proxy(targets.core));
  app.use("/conversation", proxy(targets.conversations));
  app.use("/documents", proxy(targets.documents));
  app.use("/rag", proxy(targets.rag));
}

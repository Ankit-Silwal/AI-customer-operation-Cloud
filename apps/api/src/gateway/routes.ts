import { request as httpRequest, type OutgoingHttpHeaders } from "node:http";
import type { Express, RequestHandler } from "express";
import {
  addressHeaders,
  clientAddress,
  signedAddressHeaders,
} from "@repo/service-common/client-address";

export interface GatewayTargets {
  core: string;
  conversations: string;
  documents: string;
  rag: string;
  developer?: string;
}

const hopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
]);

function proxy(target: string, secret?: string): RequestHandler {
  const origin = new URL(target);
  if (origin.protocol !== "http:")
    throw new Error("Internal service URLs must use HTTP");
  return (req, res) => {
    const headers: OutgoingHttpHeaders = {
      ...req.headers,
      "x-request-id": String(res.locals.requestId),
    };
    for (const name of hopHeaders) delete headers[name];
    for (const name of [
      ...addressHeaders,
      "forwarded",
      "x-forwarded-for",
      "x-real-ip",
    ])
      delete headers[name];
    if (secret)
      Object.assign(
        headers,
        signedAddressHeaders(
          req,
          String(res.locals.requestId),
          secret,
          "rate-forward-v1",
          clientAddress(
            req,
            secret,
            process.env.RATE_LIMIT_TRUST_FRONTEND === "true",
            "rate-frontend-v1",
          ),
        ),
      );
    const upstream = httpRequest(
      {
        hostname: origin.hostname,
        port: origin.port || 80,
        path: req.originalUrl,
        method: req.method,
        agent: false,
        headers,
      },
      (response) => {
        res.status(response.statusCode ?? 502);
        for (const [name, value] of Object.entries(response.headers)) {
          if (!hopHeaders.has(name) && value !== undefined)
            res.setHeader(name, value);
        }
        response.on("error", () => res.destroy());
        response.pipe(res);
      },
    );
    // A total deadline also bounds peers that keep sending partial responses.
    const deadline = setTimeout(
      () => upstream.destroy(new Error("Upstream deadline")),
      60000,
    );
    const cleanup = () => clearTimeout(deadline);
    res.once("finish", cleanup);
    res.once("close", () => {
      cleanup();
      upstream.destroy();
    });
    upstream.on("error", () => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res
        .status(503)
        .json({
          error: "Service temporarily unavailable",
          requestId: res.locals.requestId,
        });
    });
    req.once("aborted", () => upstream.destroy());
    req.pipe(upstream);
  };
}

export function setupGatewayRoutes(
  app: Express,
  targets: GatewayTargets,
  secret?: string,
): void {
  app.use(
    ["/register", "/login", "/me", "/organizations", "/auth", "/developer"],
    proxy(targets.core, secret),
  );
  if (targets.developer) app.use("/v1", proxy(targets.developer, secret));
  app.use("/conversation", proxy(targets.conversations, secret));
  app.use("/documents", proxy(targets.documents, secret));
  app.use("/rag", proxy(targets.rag, secret));
}

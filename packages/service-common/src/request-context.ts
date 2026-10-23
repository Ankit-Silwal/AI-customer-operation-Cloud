import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import type { Logger } from "./logger.js";

export const rememberRoutePrefix: RequestHandler = (req, res, next) => {
  res.locals.routePrefix = req.baseUrl;
  next();
};

export function requestContext(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const supplied = req.get("x-request-id");
    const requestId = supplied && /^[A-Za-z0-9_-]{1,64}$/.test(supplied)
      ? supplied : randomUUID();
    res.locals.requestId = requestId;
    res.setHeader("X-Request-ID", requestId);
    const started = performance.now();
    let logged = false;
    const finish = () => {
      if (logged) return;
      logged = true;
      // Express route templates avoid logging IDs, query strings or tokens.
      const route: unknown = req.route?.path;
      const status = res.writableFinished ? res.statusCode : 499;
      logger({
        level: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
        event: "http_request",
        requestId,
        method: req.method,
        route: typeof route === "string" ? `${res.locals.routePrefix ?? ""}${route}` : "unmatched",
        status,
        durationMs: Math.round((performance.now() - started) * 100) / 100,
      });
    };
    res.once("finish", finish);
    res.once("close", finish);
    next();
  };
}

import express, { type Express } from "express";
import {
  credentialLimit,
  authenticatedLimit,
} from "@repo/service-common/rate-limit";
import { TokenService } from "@repo/service-common/token";
import { HttpError } from "@repo/service-common/http";
import {
  cookie,
  copyResponseHeaders,
  csrf,
  setCookie,
  upstream,
  responseJson,
  type WebConfig,
} from "@repo/web-runtime/http";

export function setupRoutes(app: Express, config: WebConfig): void {
  const tokens = new TokenService(config.secret);
  app.use("/api", csrf(config.origin));
  app.post(
    ["/api/auth/login", "/api/auth/register"],
    (req, res, next) =>
      credentialLimit(req.path.endsWith("register") ? "register" : "login")(
        req,
        res,
        next,
      ),
    async (req, res) => {
      const path = req.path.endsWith("register") ? "/register" : "/login";
      const response = await upstream(config, path, {
        req,
        requestId: String(res.locals.requestId),
        body: req.body,
      });
      copyResponseHeaders(response, res);
      const result = await responseJson<{
        token?: string;
        user?: unknown;
      }>(response);
      if (response.ok && (!result.token || !result.user))
        throw new HttpError(
          503,
          "Sign-in is temporarily unavailable. Please try again",
        );
      if (response.ok && result.token) {
        setCookie(res, "hearth_session", result.token, config.secure);
        res.status(response.status).json({ user: result.user });
      } else res.status(response.status).json(result);
    },
  );
  app.post("/api/auth/logout", (_req, res) => {
    setCookie(res, "hearth_session", "", config.secure, 0);
    res.json({ ok: true });
  });
  app.use("/api", (req, res, next) => {
    const token = cookie(req, "hearth_session");
    try {
      if (!token) throw new Error("Missing");
      res.locals.userId = tokens.verify(token);
    } catch {
      setCookie(res, "hearth_session", "", config.secure, 0);
      throw new HttpError(401, "Please sign in to continue");
    }
    void authenticatedLimit()(req, res, next);
  });
  app.get("/api/session", async (req, res) => {
    const response = await upstream(config, "/me", {
      req,
      requestId: String(res.locals.requestId),
      token: cookie(req, "hearth_session")!,
    });
    copyResponseHeaders(response, res);
    res.status(response.status).send(Buffer.from(await response.arrayBuffer()));
  });
  app.get("/api/service-status", async (req, res) => {
    const response = await upstream(config, "/rag/health/ready", {
      req,
      requestId: String(res.locals.requestId),
    });
    copyResponseHeaders(response, res);
    res.status(response.status).send(Buffer.from(await response.arrayBuffer()));
  });
  app.use(
    "/api/documents/upload",
    express.raw({ type: "multipart/form-data", limit: "1100kb" }),
  );
  app.use("/api", async (req, res) => {
    const path = req.originalUrl.slice(4);
    const pathname = path.split("?")[0]!;
    const allowed =
      req.method === "GET"
        ? /^\/(organizations|documents|conversation)(\/[a-f\d-]{36})?(\/download)?$/i.test(
            pathname,
          )
        : req.method === "POST" &&
          (/^\/(organizations|documents|conversation)$/.test(pathname) ||
            pathname === "/documents/upload" ||
            /^\/conversation\/[a-f\d-]{36}\/messages$/i.test(pathname) ||
            /^\/rag\/(search|query|documents\/[a-f\d-]{36}\/index)$/i.test(
              pathname,
            ));
    if (!allowed) throw new HttpError(404, "Endpoint not found");
    const response = await upstream(config, path, {
      req,
      requestId: String(res.locals.requestId),
      token: cookie(req, "hearth_session")!,
      method: req.method,
      ...(req.method === "GET"
        ? {}
        : {
            body: req.body,
            contentType: req.get("content-type") ?? "application/json",
          }),
    });
    copyResponseHeaders(response, res);
    res.status(response.status).send(Buffer.from(await response.arrayBuffer()));
  });
  app.use("/api", (_req, res) =>
    res
      .status(404)
      .json({ error: "Endpoint not found", requestId: res.locals.requestId }),
  );
}

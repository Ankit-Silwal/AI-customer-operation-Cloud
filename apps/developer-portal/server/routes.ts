import type { Express, RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { HttpError } from "@repo/service-common/http";
import { object, email, id, text } from "@repo/service-common/validation";
import type { RateLimiter } from "@repo/service-common/rate-limit";
import type { OtpService } from "@repo/service-common/otp";
import { cookie, csrf, setCookie, type WebConfig } from "@repo/web-runtime/http";
import { setupExternalRoutes } from "./external.js";
import type { DemoService } from "./service.js";

export function setupRoutes(app: Express, config: WebConfig, demo: DemoService, otp?: OtpService) {
  setupExternalRoutes(app, config, otp);
  app.use("/api", csrf(config.origin));
  const limited: RequestHandler = (req, res, next) => {
    const limiter = app.locals.rateLimiter as RateLimiter | undefined;
    if (limiter) void limiter.middleware(() => [{ policy: "docs_demo", identity: limiter.address(req) }, { policy: "docs_demo_global", identity: "global" }])(req, res, next); else next();
  };
  app.get("/api/demo/status", async (_req, res) => { res.json({ ready: demo.state === "ready", smtpConfigured: otp?.configured() ?? false }); });
  app.post("/api/demo/session", limited, (req, res) => {
    let visitor = randomUUID();
    try {
      const claims = jwt.verify(cookie(req, "hearth_docs_demo") ?? "", config.secret, { algorithms: ["HS256"], issuer: "hearth-docs-demo", audience: "hearth-docs-demo" });
      if (typeof claims !== "string" && claims.sub && /^[a-f\d-]{36}$/i.test(claims.sub)) visitor = claims.sub as ReturnType<typeof randomUUID>;
    } catch { /* Expired sessions start a fresh sandbox. */ }
    const token = jwt.sign({}, config.secret, { algorithm: "HS256", subject: visitor, issuer: "hearth-docs-demo", audience: "hearth-docs-demo", expiresIn: 1800 });
    setCookie(res, "hearth_docs_demo", token, config.secure, 1800_000);
    res.json({ ready: demo.state === "ready", expiresIn: 1800 });
  });
  app.use("/api/demo", limited, (req, res, next) => {
    try {
      const claims = jwt.verify(cookie(req, "hearth_docs_demo") ?? "", config.secret, { algorithms: ["HS256"], issuer: "hearth-docs-demo", audience: "hearth-docs-demo" });
      if (typeof claims === "string" || !claims.sub || !/^[a-f\d-]{36}$/i.test(claims.sub)) throw new Error("Invalid");
      res.locals.visitor = claims.sub;
    } catch { throw new HttpError(401, "Start the sandbox session again"); }
    next();
  });
  app.post("/api/demo/chat", async (req, res) => { const body = object(req.body); res.json(await demo.chat(text(body.question, "question", 2000), body.history ?? [], req)); });
  app.post("/api/demo/otp", async (req, res) => {
    if (!otp) throw new HttpError(503, "Sandbox verification temporarily unavailable");
    res.status(201).json(await otp.issue(`demo:${String(res.locals.visitor)}`, email(object(req.body).email), "sandbox", "demo"));
  });
  app.post("/api/demo/otp/verify", async (req, res) => {
    if (!otp) throw new HttpError(503, "Sandbox verification temporarily unavailable");
    const body = object(req.body);
    res.json(await otp.verify(`demo:${String(res.locals.visitor)}`, email(body.email), "sandbox", id(body.challengeId, "challengeId"), body.code));
  });
  app.use("/api", (_req, _res) => { throw new HttpError(404, "Endpoint not found"); });
}

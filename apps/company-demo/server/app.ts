import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { createHttpApp } from "@repo/service-common/app";
import { createErrorHandler } from "@repo/service-common/error-handler";
import { HttpError } from "@repo/service-common/http";
import { object, text } from "@repo/service-common/validation";
import type { RateLimiter } from "@repo/service-common/rate-limit";
import {
  ApiFailure,
  cookie,
  csrf,
  setCookie,
  type WebConfig,
} from "@repo/web-runtime/http";
import { DemoService } from "./service.js";

export function createApp(config: WebConfig, demo = new DemoService(config)) {
  const app = createHttpApp(
    async () => {
      if (demo.state !== "ready") throw new Error("Demo preparing");
      await demo.status();
    },
    { rateService: "company-demo" },
  );
  app.use("/api", csrf(config.origin));
  app.get("/api/status", async (_req, res) => res.json(await demo.status()));
  const visitor = (raw: string | undefined) => {
    if (raw)
      try {
        const value = jwt.verify(raw, config.secret, {
          algorithms: ["HS256"],
          issuer: "oak-demo-browser",
          audience: "oak-demo",
        });
        if (
          typeof value !== "string" &&
          typeof value.sub === "string" &&
          /^[a-f\d-]{36}$/i.test(value.sub)
        )
          return {
            id: value.sub,
            conversationId:
              typeof value.cid === "string" && /^[a-f\d-]{36}$/i.test(value.cid)
                ? value.cid
                : undefined,
          };
      } catch {
        /* A modified or expired cookie starts a new visitor session. */
      }
    return { id: randomUUID(), conversationId: undefined };
  };
  app.use("/api/support", (req, res, next) => {
    const limiter = app.locals.rateLimiter as RateLimiter | undefined;
    if (req.method !== "POST" || !limiter) {
      next();
      return;
    }
    void limiter.middleware((request) => [
      { policy: "demo_chat_ip", identity: limiter.address(request) },
      { policy: "demo_chat_global", identity: "global" },
    ])(req, res, next);
  });
  app.get("/api/support", async (req, res) => {
    const identity = visitor(cookie(req, "oak_visitor"));
    if (demo.state !== "ready")
      throw new HttpError(503, "Our demo assistant is getting ready");
    const history = await demo.history(identity.conversationId);
    res.json({ messages: history?.messages ?? [] });
  });
  app.post("/api/support/reset", (_req, res) => {
    setCookie(res, "oak_visitor", "", config.secure, 0);
    res.json({ ok: true });
  });
  app.post("/api/support", async (req, res) => {
    const identity = visitor(cookie(req, "oak_visitor"));
    const body = object(req.body);
    const result = await demo.ask(
      text(body.question, "question", 2000),
      identity.conversationId,
      identity.id,
      req,
    );
    const signed = jwt.sign({ cid: result.conversationId }, config.secret, {
      algorithm: "HS256",
      subject: identity.id,
      issuer: "oak-demo-browser",
      audience: "oak-demo",
      expiresIn: "7d",
    });
    setCookie(res, "oak_visitor", signed, config.secure);
    res.json({
      answer: result.answer,
      sources: result.sources,
      mode: result.mode,
    });
  });
  app.use("/api", (_req, res) =>
    res
      .status(404)
      .json({ error: "Endpoint not found", requestId: res.locals.requestId }),
  );
  app.use(
    (
      error: unknown,
      _req: import("express").Request,
      res: import("express").Response,
      next: import("express").NextFunction,
    ) => {
      if (error instanceof ApiFailure && error.retryAfter)
        res.set("Retry-After", error.retryAfter);
      if (error instanceof HttpError && error.status === 503)
        res.set("Retry-After", "5");
      next(error);
    },
  );
  app.use(createErrorHandler());
  return { app, demo };
}

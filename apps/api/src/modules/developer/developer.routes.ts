import { Router } from "express";
import type { HttpHandler } from "@repo/service-common/http";
import { HttpError, authenticatedUserId } from "@repo/service-common/http";
import { id, object, text } from "@repo/service-common/validation";
import { verifyServiceAuthorization } from "@repo/service-common/developer-identity";
import { routeLimit } from "@repo/service-common/rate-limit";
import type { RateLimiter } from "@repo/service-common/rate-limit";
import { DeveloperService, scopes } from "./developer.service.js";

export function developerRoutes(service: DeveloperService, auth: HttpHandler, secret: string) {
  const router = Router();
  router.post("/authorize", (req, res, next) => {
    const body = object(req.body);
    if (typeof body.hash !== "string" || !/^[a-f0-9]{64}$/.test(body.hash)) throw new HttpError(401, "Invalid service request");
    try { verifyServiceAuthorization(secret, req.get("authorization")?.slice(7) ?? "", body.hash); }
    catch { throw new HttpError(401, "Invalid service request"); }
    const limiter = req.app.locals.rateLimiter as RateLimiter | undefined;
    if (limiter) void limiter.middleware(() => [{ policy: "developer_key_resolve", identity: body.hash as string }])(req, res, next);
    else next();
  }, async (req, res) => { res.set("Cache-Control", "no-store").json(await service.resolve((req.body as { hash: string }).hash)); });
  router.get("/keys", auth, async (req, res) => { res.set("Cache-Control", "no-store").json(await service.list(id(req.query.organizationId, "organizationId"), authenticatedUserId(res.locals))); });
  router.post("/keys", auth, routeLimit("developer_key_create"), async (req, res) => {
    const body = object(req.body);
    res.status(201).json(await service.create(id(body.organizationId, "organizationId"), authenticatedUserId(res.locals), text(body.name, "name", 80), scopes(body.scopes)));
  });
  router.delete("/keys/:id", auth, async (req, res) => { res.json(await service.revoke(id(req.params.id, "id"), authenticatedUserId(res.locals))); });
  return router;
}

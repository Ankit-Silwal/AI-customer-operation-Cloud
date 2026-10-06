import { Router } from "express";
import type { HttpHandler } from "../../common/http.js";
import { OrganizationController } from "./organization.controller.js";
import type { OrganizationService } from "./organization.service.js";

export function organizationRoutes(
  service: OrganizationService,
  authenticate: HttpHandler,
): Router {
  const router = Router();
  const controller = new OrganizationController(service);
  router.post("/", authenticate, controller.create);
  router.get("/:id", authenticate, controller.getById);
  return router;
}

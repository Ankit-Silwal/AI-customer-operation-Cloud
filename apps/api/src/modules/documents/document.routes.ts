import { Router } from "express";
import type { HttpHandler } from "../../common/http.js";
import { DocumentController } from "./document.controller.js";
import type { DocumentService } from "./document.service.js";

export function documentRoutes(
  service: DocumentService,
  authenticate: HttpHandler,
): Router {
  const router = Router();
  const controller = new DocumentController(service);
  router.post("/", authenticate, controller.create);
  return router;
}

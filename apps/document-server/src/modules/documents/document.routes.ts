import { routeLimit } from "@repo/service-common/rate-limit";
import { Router } from "express";
import type { HttpHandler } from "@repo/service-common/http";
import { DocumentController } from "./document.controller.js";
import type { DocumentService } from "./document.service.js";
import { parseUpload } from "./document.upload.js";

export function documentRoutes(
  service: DocumentService,
  authenticate: HttpHandler,
): Router {
  const router = Router();
  const controller = new DocumentController(service);
  router.post("/", authenticate, controller.create);
  router.post("/upload", authenticate, routeLimit("document_upload"), parseUpload, controller.upload);
  router.get("/:id", authenticate, controller.get);
  router.get("/:id/download", authenticate, routeLimit("document_download"), controller.download);
  return router;
}

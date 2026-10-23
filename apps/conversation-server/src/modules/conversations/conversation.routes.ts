import { Router } from "express";
import type { HttpHandler } from "@repo/service-common/http";
import { ConversationController } from "./conversation.controller.js";
import type { ConversationService } from "./conversation.service.js";

export function conversationRoutes(
  service: ConversationService,
  authenticate: HttpHandler,
): Router {
  const router = Router();
  const controller = new ConversationController(service);
  router.get("/", authenticate, controller.list);
  router.post("/", authenticate, controller.create);
  router.post("/:id/messages", authenticate, controller.append);
  router.get("/:id", authenticate, controller.getById);
  return router;
}

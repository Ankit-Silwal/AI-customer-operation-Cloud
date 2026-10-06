import { Router } from "express";
import type { HttpHandler } from "../../common/http.js";
import { ConversationController } from "./conversation.controller.js";
import type { ConversationService } from "./conversation.service.js";

export function conversationRoutes(
  service: ConversationService,
  authenticate: HttpHandler,
): Router {
  const router = Router();
  const controller = new ConversationController(service);
  router.post("/", authenticate, controller.create);
  router.get("/:id", authenticate, controller.getById);
  return router;
}

import { Router } from "express";
import { AuthController } from "./auth.controller.js";
import type { AuthService } from "./auth.service.js";
import { credentialLimit } from "@repo/service-common/rate-limit";

export function authRoutes(service: AuthService): Router {
  const router = Router();
  const controller = new AuthController(service);
  router.post("/register", credentialLimit("register"), controller.register);
  router.post("/login", credentialLimit("login"), controller.login);
  return router;
}

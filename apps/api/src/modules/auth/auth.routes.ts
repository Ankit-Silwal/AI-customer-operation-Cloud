import { Router } from "express";
import { AuthController } from "./auth.controller.js";
import type { AuthService } from "./auth.service.js";

export function authRoutes(service: AuthService): Router {
  const router = Router();
  const controller = new AuthController(service);
  router.post("/register", controller.register);
  router.post("/login", controller.login);
  return router;
}

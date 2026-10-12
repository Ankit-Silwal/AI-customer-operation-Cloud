import { Router } from "express";
import type { Pool } from "pg";

export function healthRoutes(db: Pool, isDraining: () => boolean): Router {
  const router = Router();
  router.get("/live", (_req, res) => {
    res.json({ status: "ok", version: "1.0.0" });
  });
  router.get("/ready", async (_req, res) => {
    if (isDraining()) {
      res.status(503).json({ status: "not_ready", requestId: res.locals.requestId });
      return;
    }
    let timeout: NodeJS.Timeout | undefined;
    try {
      const deadline = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("Readiness deadline")), 1000);
      });
      await Promise.race([db.query("SELECT 1"), deadline]);
      res.json({ status: "ready", version: "1.0.0" });
    } catch {
      res.status(503).json({ status: "not_ready", requestId: res.locals.requestId });
    } finally {
      clearTimeout(timeout);
    }
  });
  return router;
}

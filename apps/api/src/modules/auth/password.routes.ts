import { Router } from "express";
import type { PrismaClient } from "../../database/prisma.js";
import {
  HttpError,
  authenticatedUserId,
  type HttpHandler,
} from "@repo/service-common/http";
import { email, id, object, password } from "@repo/service-common/validation";
import type { OtpService } from "@repo/service-common/otp";
import type { TokenService } from "@repo/service-common/token";
import type { RateLimiter } from "@repo/service-common/rate-limit";
import { hashPassword } from "./password.js";

export function passwordRoutes(
  db: PrismaClient,
  tokens: TokenService,
  auth: HttpHandler,
  otp: OtpService | undefined,
) {
  const router = Router();
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    const limiter = req.app.locals.rateLimiter as RateLimiter | undefined;
    if (limiter)
      void limiter.middleware(() => [
        { policy: "password_ip", identity: limiter.address(req) },
      ])(req, res, next);
    else next();
  });
  function verification() {
    if (!otp) throw new HttpError(503, "Verification is not configured yet");
    return otp;
  }
  router.post("/forgot", async (req, res) => {
    const recipient = email(object(req.body).email);
    const service = verification();
    service.requireDelivery();
    const user = await db.user.findUnique({
      where: { email: recipient },
      select: { id: true },
    });
    let challenge;
    try {
      challenge = await service.issue(
        "account",
        recipient,
        "password-reset",
        user ? "email" : "silent",
      );
    } catch (error) {
      // Delivery failures must not reveal that a registered account was found.
      if (
        !(error instanceof HttpError) ||
        error.status !== 503 ||
        error.message !== "Email delivery temporarily unavailable"
      )
        throw error;
      challenge = {
        challengeId: crypto.randomUUID(),
        expiresIn: 300,
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
      };
    }
    res.status(202).json({
      challengeId: challenge.challengeId,
      expiresIn: challenge.expiresIn,
      expiresAt: challenge.expiresAt,
      message: "If an account exists, a verification code has been sent",
    });
  });
  router.post("/reset", async (req, res) => {
    const body = object(req.body),
      recipient = email(body.email),
      nextPassword = password(body.password);
    await verification().verify(
      "account",
      recipient,
      "password-reset",
      id(body.challengeId, "challengeId"),
      body.code,
    );
    const updated = await db.user.updateMany({
      where: { email: recipient },
      data: {
        passwordHash: await hashPassword(nextPassword),
        authVersion: { increment: 1 },
      },
    });
    if (!updated.count)
      throw new HttpError(
        400,
        "Invalid, expired or already used verification code",
      );
    res.json({ reset: true });
  });
  router.post("/change/request", auth, async (_req, res) => {
    const user = await db.user.findUnique({
      where: { id: authenticatedUserId(res.locals) },
      select: { email: true },
    });
    if (!user) throw new HttpError(401, "Account no longer available");
    res
      .status(202)
      .json(
        await verification().issue("account", user.email, "password-change"),
      );
  });
  router.post("/change/confirm", auth, async (req, res) => {
    const body = object(req.body),
      nextPassword = password(body.password),
      userId = authenticatedUserId(res.locals);
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) throw new HttpError(401, "Account no longer available");
    await verification().verify(
      "account",
      user.email,
      "password-change",
      id(body.challengeId, "challengeId"),
      body.code,
    );
    const changed = await db.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hashPassword(nextPassword),
        authVersion: { increment: 1 },
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        authVersion: true,
      },
    });
    const { authVersion, ...safe } = changed;
    res.json({
      user: safe,
      token: tokens.create(userId, 7 * 86400, authVersion),
    });
  });
  return router;
}

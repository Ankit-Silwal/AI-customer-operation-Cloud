import type { HttpHandler } from "./http.js";
import type { TokenService } from "./token.js";
import { InvalidSessionError } from "./token.js";
import jwt from "jsonwebtoken";
import { authenticatedLimit } from "./rate-limit.js";
import { HttpError } from "./http.js";

export function authenticate(tokens: TokenService): HttpHandler {
  return async (req, res, next) => {
    const authorization = req.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      res
        .status(401)
        .json({
          error: "A Bearer token is required",
          requestId: res.locals.requestId,
        });
      return;
    }
    try {
      res.locals.userId = await tokens.verifyActive(authorization.slice(7));
    } catch (error) {
      if (error instanceof HttpError) {
        next(error);
        return;
      }
      if (
        !(error instanceof InvalidSessionError) &&
        !(error instanceof jwt.JsonWebTokenError)
      ) {
        next(error);
        return;
      }
      res
        .status(401)
        .json({
          error: "Invalid or expired token",
          requestId: res.locals.requestId,
        });
      return;
    }
    void authenticatedLimit()(req, res, next);
  };
}

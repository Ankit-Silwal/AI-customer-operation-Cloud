import type { HttpHandler } from "./http.js";
import type { TokenService } from "./token.js";

export function authenticate(tokens: TokenService): HttpHandler {
  return (req, res, next) => {
    const authorization = req.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      res.status(401).json({ error: "A Bearer token is required", requestId: res.locals.requestId });
      return;
    }
    try {
      res.locals.userId = tokens.verify(authorization.slice(7));
    } catch {
      res.status(401).json({ error: "Invalid or expired token", requestId: res.locals.requestId });
      return;
    }
    next();
  };
}

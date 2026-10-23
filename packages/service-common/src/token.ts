import jwt from "jsonwebtoken";
import { HttpError } from "./http.js";

export class TokenService {
  constructor(private readonly secret: string, private readonly sessionCheck?: (id: string, version: number) => Promise<boolean>) {
    if (secret.length < 32)
      throw new Error("JWT_SECRET must contain at least 32 characters");
  }

  create(userId: string, expiresIn = 7 * 86400, authVersion = 0): string {
    return jwt.sign({ av: authVersion }, this.secret, {
      algorithm: "HS256",
      subject: userId,
      expiresIn,
      issuer: "customer-operation-api",
    });
  }

  createInternal(userId: string): string {
    return jwt.sign({ service: true }, this.secret, { algorithm: "HS256", subject: userId, expiresIn: 120, issuer: "customer-operation-api" });
  }

  async verifyActive(token: string): Promise<string> {
    const id = this.verify(token);
    const claims = jwt.decode(token) as jwt.JwtPayload;
    if (claims.service === true) return id;
    const version: unknown = claims.av ?? 0;
    if (!Number.isSafeInteger(version) || Number(version) < 0) throw new Error("Invalid session");
    if (this.sessionCheck) {
      if (!await this.sessionCheck(id, Number(version))) throw new Error("Session revoked");
    } else if (process.env.AUTH_SESSION_URL && process.env.NODE_ENV !== "test") {
      let response: Response;
      try { response = await fetch(process.env.AUTH_SESSION_URL, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(2000), redirect: "error" }); }
      catch { throw new HttpError(503, "Session validation temporarily unavailable"); }
      if (response.status === 401) throw new Error("Session revoked");
      if (!response.ok) throw new HttpError(503, "Session validation temporarily unavailable");
    }
    return id;
  }

  verify(token: string): string {
    const payload = jwt.verify(token, this.secret, {
      algorithms: ["HS256"],
      issuer: "customer-operation-api",
    });
    if (
      typeof payload === "string" ||
      typeof payload.sub !== "string" ||
      !payload.sub
    ) {
      throw new Error("Missing user ID");
    }
    return payload.sub;
  }
}

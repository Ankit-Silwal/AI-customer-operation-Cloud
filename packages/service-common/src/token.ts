import jwt from "jsonwebtoken";

export class TokenService {
  constructor(private readonly secret: string) {
    if (secret.length < 32)
      throw new Error("JWT_SECRET must contain at least 32 characters");
  }

  create(userId: string): string {
    return jwt.sign({}, this.secret, {
      algorithm: "HS256",
      subject: userId,
      expiresIn: "7d",
      issuer: "customer-operation-api",
    });
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

import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";

export const API_SCOPES = [
  "chat:write",
  "documents:read",
  "documents:write",
  "otp:write",
] as const;
export type ApiScope = (typeof API_SCOPES)[number];
export interface KeyIdentity {
  id: string;
  organizationId: string;
  ownerId: string;
  scopes: ApiScope[];
  token: string;
}
export const keyDigest = (key: string) =>
  createHash("sha256").update(key).digest("hex");
export function serviceAuthorization(secret: string, digest: string): string {
  return jwt.sign({}, secret, {
    algorithm: "HS256",
    subject: digest,
    issuer: "hearth-developer-service",
    audience: "hearth-core",
    expiresIn: 30,
  });
}
export function verifyServiceAuthorization(
  secret: string,
  token: string,
  digest: string,
): void {
  const payload = jwt.verify(token, secret, {
    algorithms: ["HS256"],
    issuer: "hearth-developer-service",
    audience: "hearth-core",
  });
  if (typeof payload === "string" || payload.sub !== digest)
    throw new Error("Invalid service identity");
}

import jwt from "jsonwebtoken";
import { HttpError } from "./http.js";
import { fetchWithRetry } from "./retry.js";

export type OrganizationAccess = (
  organizationId: string,
  ownerId: string,
) => Promise<boolean>;

export function createOrganizationAccess(
  baseUrl: string,
  secret: string,
): OrganizationAccess {
  const origin = new URL(baseUrl);
  return async (organizationId, ownerId) => {
    // Delegate the already authenticated caller for this single, short-lived lookup.
    const token = jwt.sign({ service: true }, secret, {
      algorithm: "HS256",
      subject: ownerId,
      expiresIn: "30s",
      issuer: "customer-operation-api",
    });
    try {
      // An idempotent GET: retry another core replica on network errors and 502/503/504.
      const response = await fetchWithRetry(
        new URL(`/organizations/${encodeURIComponent(organizationId)}`, origin),
        { headers: { authorization: `Bearer ${token}` }, timeoutMs: 1500 },
        { attempts: 3 },
      );
      if (response.status === 404) return false;
      if (!response.ok) throw new Error("Organization service unavailable");
      return true;
    } catch {
      throw new HttpError(503, "Organization service temporarily unavailable");
    }
  };
}

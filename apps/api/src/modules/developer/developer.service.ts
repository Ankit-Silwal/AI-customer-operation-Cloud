import { randomBytes } from "node:crypto";
import {
  API_SCOPES,
  keyDigest,
  type ApiScope,
} from "@repo/service-common/developer-identity";
import { HttpError } from "@repo/service-common/http";
import { TokenService } from "@repo/service-common/token";
import type { PrismaClient } from "../../database/prisma.js";

export function scopes(value: unknown): ApiScope[] {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > 4 ||
    value.some((item) => !API_SCOPES.includes(item))
  )
    throw new HttpError(400, "Choose valid API scopes");
  return [...new Set(value)] as ApiScope[];
}
const publicKey = {
  id: true,
  organizationId: true,
  name: true,
  prefix: true,
  scopes: true,
  createdAt: true,
  expiresAt: true,
  revokedAt: true,
} as const;

export class DeveloperService {
  constructor(
    private readonly db: PrismaClient,
    private readonly identityDb: PrismaClient,
    private readonly tokens: TokenService,
  ) {}
  async owned(organizationId: string, ownerId: string) {
    const organization = await this.db.organization.findFirst({
      where: { id: organizationId, ownerId },
    });
    if (!organization) throw new HttpError(404, "Workspace not found");
    return organization;
  }
  async list(organizationId: string, ownerId: string) {
    await this.owned(organizationId, ownerId);
    return {
      keys: await this.db.developerApiKey.findMany({
        where: { organizationId },
        select: publicKey,
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    };
  }
  async create(
    organizationId: string,
    ownerId: string,
    name: string,
    requested: ApiScope[],
  ) {
    await this.owned(organizationId, ownerId);
    return issueKey(this.db, organizationId, name, requested);
  }
  async revoke(keyId: string, ownerId: string) {
    const key = await this.db.developerApiKey.findUnique({
      where: { id: keyId },
    });
    if (!key) throw new HttpError(404, "API key not found");
    await this.owned(key.organizationId, ownerId);
    await this.db.developerApiKey.update({
      where: { id: keyId },
      data: { revokedAt: key.revokedAt ?? new Date() },
    });
    return { revoked: true };
  }
  async resolve(hash: string) {
    const key = await this.db.developerApiKey.findUnique({
      where: { keyHash: hash },
      include: { organization: true },
    });
    if (!key || key.revokedAt || key.expiresAt <= new Date())
      throw new HttpError(401, "Invalid or expired API key");
    const ownerId = key.organization.ownerId;
    if (
      !(await this.identityDb.user.findUnique({
        where: { id: ownerId },
        select: { id: true },
      }))
    )
      throw new HttpError(401, "API key account unavailable");
    return {
      id: key.id,
      organizationId: key.organizationId,
      ownerId,
      scopes: key.scopes,
      token: this.tokens.createInternal(ownerId),
    };
  }
}

// Row locking makes the five-key cap hold under concurrent requests.
export async function issueKey(
  db: PrismaClient,
  organizationId: string,
  name: string,
  requested: ApiScope[],
  days = 90,
) {
  if (
    !Number.isInteger(days) ||
    days < 1 ||
    days > 365 ||
    !name.trim() ||
    name.length > 80
  )
    throw new HttpError(
      400,
      "Use a name of 1-80 characters and 1-365 expiry days",
    );
  const allowed = scopes(requested);
  const raw = `hrt_live_${randomBytes(32).toString("base64url")}`;
  const key = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM organizations WHERE id = ${organizationId}::uuid FOR UPDATE`;
    if (!rows.length) throw new HttpError(404, "Workspace not found");
    if (
      (await tx.developerApiKey.count({
        where: {
          organizationId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      })) >= 5
    )
      throw new HttpError(
        409,
        "Revoke an active key before creating another (maximum five)",
      );
    return tx.developerApiKey.create({
      data: {
        organizationId,
        name: name.trim(),
        keyHash: keyDigest(raw),
        prefix: raw.slice(0, 18),
        scopes: allowed,
        expiresAt: new Date(Date.now() + days * 86400_000),
      },
      select: publicKey,
    });
  });
  return { ...key, key: raw };
}

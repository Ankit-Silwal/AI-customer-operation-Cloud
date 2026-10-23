import type { PrismaClient } from "../../database/prisma.js";
import type { Organization } from "./organization.types.js";

export interface OrganizationRepository {
  create(name: string, ownerId: string): Promise<Organization>;
  findOwnedById(id: string, ownerId: string): Promise<Organization | undefined>;
}

export class PrismaOrganizationRepository implements OrganizationRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(name: string, ownerId: string): Promise<Organization> {
    return this.db.organization.create({ data: { name, ownerId } });
  }

  async findOwnedById(
    id: string,
    ownerId: string,
  ): Promise<Organization | undefined> {
    return (await this.db.organization.findFirst({ where: { id, ownerId } })) ?? undefined;
  }
}

import type { Page, PageQuery } from "@repo/service-common/pagination";
import type { PrismaClient } from "../../database/prisma.js";
import type { Organization } from "./organization.types.js";

export interface OrganizationRepository {
  list(ownerId: string, query: PageQuery): Promise<Page<Organization>>;
  create(name: string, ownerId: string): Promise<Organization>;
  findOwnedById(id: string, ownerId: string): Promise<Organization | undefined>;
}

export class PrismaOrganizationRepository implements OrganizationRepository {
  constructor(private readonly db: PrismaClient) {}

  async list(ownerId: string, query: PageQuery): Promise<Page<Organization>> {
    const where = { ownerId, ...(query.search ? { name: { contains: query.search, mode: "insensitive" as const } } : {}) };
    const [items, total] = await Promise.all([
      this.db.organization.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.db.organization.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

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

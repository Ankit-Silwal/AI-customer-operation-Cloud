import type { Page, PageQuery } from "@repo/service-common/pagination";
import { HttpError } from "@repo/service-common/http";
import { primaryOnly, type ReadSource } from "@repo/service-common/read-replicas";
import type { PrismaClient } from "../../database/prisma.js";
import type { OrganizationAccess } from "@repo/service-common/organizations";
import type { Conversation, CreateConversationInput, Message } from "./conversation.types.js";

export interface ConversationRepository {
  append(id: string, ownerId: string, expectedCount: number, messages: Message[]): Promise<Conversation>;
  list(organizationId: string, ownerId: string, query: PageQuery): Promise<Page<Omit<Conversation, "content">>>;
  createForOwner(input: CreateConversationInput, ownerId: string): Promise<Conversation | undefined>;
  findOwnedById(id: string, ownerId: string): Promise<Conversation | undefined>;
}

export class PrismaConversationRepository implements ConversationRepository {
  constructor(private readonly db: PrismaClient, private readonly organizationAccess: OrganizationAccess, private readonly reads: ReadSource<PrismaClient> = primaryOnly(db)) {}
  async append(id: string, ownerId: string, expectedCount: number, messages: Message[]): Promise<Conversation> {
    const existing = await this.findOwnedById(id, ownerId);
    if (!existing) throw new HttpError(404, "Conversation not found");
    const encoded = JSON.stringify(messages);
    const changed = await this.db.$queryRaw<{ id: string }[]>`UPDATE conversations SET messages = messages || ${encoded}::jsonb WHERE id = ${id}::uuid AND jsonb_array_length(messages) = ${expectedCount} RETURNING id`;
    if (!changed.length) throw new HttpError(409, "Conversation changed. Reload before sending again");
    return (await this.findOwnedById(id, ownerId))!;
  }
  async list(organizationId: string, ownerId: string, query: PageQuery): Promise<Page<Omit<Conversation, "content">>> {
    if (!await this.organizationAccess(organizationId, ownerId)) throw new HttpError(404, "Organization not found");
    const where = { organizationId, ...(query.search ? { subject: { contains: query.search, mode: "insensitive" as const } } : {}) };
    const [saved, total] = await this.reads.read(db => Promise.all([
      db.conversation.findMany({ where,  orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      db.conversation.count({ where }),
    ]));
    const items = saved as unknown as Omit<Conversation, "content">[];
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
  async createForOwner(input: CreateConversationInput, ownerId: string): Promise<Conversation | undefined> {
    if (!await this.organizationAccess(input.organizationId, ownerId)) return undefined;
    const saved = await this.db.conversation.create({ data: { ...input, messages: input.messages.map(message => ({ ...message })) } });
    return { ...saved, messages: input.messages };
  }
  async findOwnedById(id: string, ownerId: string): Promise<Conversation | undefined> {
    const saved = await this.db.conversation.findUnique({ where: { id } });
    if (!saved || !await this.organizationAccess(saved.organizationId, ownerId)) return undefined;
    return { ...saved, messages: saved.messages as unknown as Conversation["messages"] };
  }
}

import type { PrismaClient } from "../../database/prisma.js";
import type { OrganizationAccess } from "@repo/service-common/organizations";
import type { Conversation, CreateConversationInput } from "./conversation.types.js";

export interface ConversationRepository {
  createForOwner(input: CreateConversationInput, ownerId: string): Promise<Conversation | undefined>;
  findOwnedById(id: string, ownerId: string): Promise<Conversation | undefined>;
}

export class PrismaConversationRepository implements ConversationRepository {
  constructor(private readonly db: PrismaClient, private readonly organizationAccess: OrganizationAccess) {}
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

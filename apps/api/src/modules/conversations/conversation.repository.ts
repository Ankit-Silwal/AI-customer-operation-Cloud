import type { PrismaClient } from "../../database/prisma.js";
import type { OrganizationAccess } from "../../clients/organizations.js";
import type {
  Conversation,
  CreateConversationInput,
} from "./conversation.types.js";

export interface ConversationRepository {
  createForOwner(
    input: CreateConversationInput,
    ownerId: string,
  ): Promise<Conversation | undefined>;
  findOwnedById(id: string, ownerId: string): Promise<Conversation | undefined>;
}

export class PrismaConversationRepository implements ConversationRepository {
  constructor(private readonly db: PrismaClient, private readonly organizationAccess?: OrganizationAccess) {}

  async createForOwner(
    input: CreateConversationInput,
    ownerId: string,
  ): Promise<Conversation | undefined> {
    if (this.organizationAccess) {
      if (!await this.organizationAccess(input.organizationId, ownerId)) return undefined;
      const saved = await this.db.conversation.create({
        data: { ...input, messages: input.messages.map(message => ({ ...message })) },
      });
      return { ...saved, messages: input.messages };
    }
    // Keep ownership verification and insertion in a single SQL statement.
    const rows = await this.db.$queryRaw<Conversation[]>`
      INSERT INTO conversations (organization_id, customer_email, subject, messages)
       SELECT id, ${input.customerEmail}, ${input.subject}, ${JSON.stringify(input.messages)}::jsonb
       FROM organizations WHERE id = ${input.organizationId}::uuid AND owner_id = ${ownerId}::uuid
       RETURNING id, organization_id AS "organizationId", customer_email AS "customerEmail",
                 subject, messages, created_at AS "createdAt"`;
    return rows[0];
  }

  async findOwnedById(
    id: string,
    ownerId: string,
  ): Promise<Conversation | undefined> {
    if (this.organizationAccess) {
      const saved = await this.db.conversation.findUnique({ where: { id } });
      if (!saved || !await this.organizationAccess(saved.organizationId, ownerId)) return undefined;
      return { ...saved, messages: saved.messages as unknown as Conversation["messages"] };
    }
    const conversation = await this.db.conversation.findFirst({
      where: { id, organization: { ownerId } },
    });
    if (!conversation) return undefined;
    // Request validation and the SQL array constraint define the stored message shape.
    return { ...conversation, messages: conversation.messages as unknown as Conversation["messages"] };
  }
}

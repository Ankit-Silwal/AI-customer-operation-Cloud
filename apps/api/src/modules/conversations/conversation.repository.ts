import type { Pool } from "pg";
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

export class PostgresConversationRepository implements ConversationRepository {
  constructor(private readonly db: Pool) {}

  async createForOwner(
    input: CreateConversationInput,
    ownerId: string,
  ): Promise<Conversation | undefined> {
    const { rows } = await this.db.query<Conversation>(
      `INSERT INTO conversations (organization_id, customer_email, subject, messages)
       SELECT id, $3, $4, $5::jsonb FROM organizations WHERE id = $1 AND owner_id = $2
       RETURNING id, organization_id AS "organizationId", customer_email AS "customerEmail",
                 subject, messages, created_at AS "createdAt"`,
      [
        input.organizationId,
        ownerId,
        input.customerEmail,
        input.subject,
        JSON.stringify(input.messages),
      ],
    );
    return rows[0];
  }

  async findOwnedById(
    id: string,
    ownerId: string,
  ): Promise<Conversation | undefined> {
    const { rows } = await this.db.query<Conversation>(
      `SELECT c.id, c.organization_id AS "organizationId", c.customer_email AS "customerEmail",
              c.subject, c.messages, c.created_at AS "createdAt"
       FROM conversations c JOIN organizations o ON o.id = c.organization_id
       WHERE c.id = $1 AND o.owner_id = $2`,
      [id, ownerId],
    );
    return rows[0];
  }
}

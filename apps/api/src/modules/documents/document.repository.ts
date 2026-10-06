import type { Pool } from "pg";
import type { CreateDocumentInput, Document } from "./document.types.js";

export interface DocumentRepository {
  createForOwner(
    input: CreateDocumentInput,
    ownerId: string,
  ): Promise<Document | undefined>;
}

export class PostgresDocumentRepository implements DocumentRepository {
  constructor(private readonly db: Pool) {}

  async createForOwner(
    input: CreateDocumentInput,
    ownerId: string,
  ): Promise<Document | undefined> {
    const { rows } = await this.db.query<Document>(
      `INSERT INTO documents (organization_id, title, content)
       SELECT id, $3, $4 FROM organizations WHERE id = $1 AND owner_id = $2
       RETURNING id, organization_id AS "organizationId", title, content, created_at AS "createdAt"`,
      [input.organizationId, ownerId, input.title, input.content],
    );
    return rows[0];
  }
}

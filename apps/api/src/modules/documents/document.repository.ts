import type { Pool } from "pg";
import type { CreateDocumentInput, Document, DocumentFile, UploadDocumentInput } from "./document.types.js";

export interface DocumentRepository {
  createUploadForOwner(input: UploadDocumentInput, ownerId: string): Promise<Document | undefined>;
  findForOwner(id: string, ownerId: string): Promise<Document | undefined>;
  findFileForOwner(id: string, ownerId: string): Promise<DocumentFile | undefined>;
  createForOwner(
    input: CreateDocumentInput,
    ownerId: string,
  ): Promise<Document | undefined>;
}

export class PostgresDocumentRepository implements DocumentRepository {
  constructor(private readonly db: Pool) {}

  async createUploadForOwner(input: UploadDocumentInput, ownerId: string): Promise<Document | undefined> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<Document>(
        `INSERT INTO documents (organization_id, title, content)
         SELECT id, $3, $4 FROM organizations WHERE id = $1 AND owner_id = $2
         RETURNING id, organization_id AS "organizationId", title, content, created_at AS "createdAt"`,
        [input.organizationId, ownerId, input.title, input.content],
      );
      const document = rows[0];
      if (!document) { await client.query("ROLLBACK"); return undefined; }
      await client.query(
        `INSERT INTO document_uploads (document_id, file_name, media_type, byte_length, file_data)
         VALUES ($1, $2, $3, $4, $5)`,
        [document.id, input.fileName, input.mediaType, input.bytes.length, input.bytes],
      );
      await client.query("COMMIT");
      return { ...document, upload: { fileName: input.fileName, mediaType: input.mediaType, byteLength: input.bytes.length } };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async findForOwner(id: string, ownerId: string): Promise<Document | undefined> {
    const { rows } = await this.db.query<Document>(
      `SELECT d.id, d.organization_id AS "organizationId", d.title, d.content, d.created_at AS "createdAt"
       FROM documents d JOIN organizations o ON o.id = d.organization_id
       WHERE d.id = $1 AND o.owner_id = $2`, [id, ownerId],
    );
    const document = rows[0];
    if (!document) return undefined;
    const upload = await this.db.query<{ fileName: string; mediaType: string; byteLength: number }>(
      `SELECT file_name AS "fileName", media_type AS "mediaType", byte_length AS "byteLength"
       FROM document_uploads WHERE document_id = $1`, [id],
    );
    return upload.rows[0] ? { ...document, upload: upload.rows[0] } : document;
  }

  async findFileForOwner(id: string, ownerId: string): Promise<DocumentFile | undefined> {
    const { rows } = await this.db.query<DocumentFile>(
      `SELECT u.file_name AS "fileName", u.media_type AS "mediaType", u.file_data AS bytes
       FROM document_uploads u JOIN documents d ON d.id = u.document_id
       JOIN organizations o ON o.id = d.organization_id WHERE d.id = $1 AND o.owner_id = $2`, [id, ownerId],
    );
    return rows[0];
  }

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

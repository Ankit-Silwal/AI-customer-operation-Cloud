import type { PrismaClient } from "../../database/prisma.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type { CreateDocumentInput, Document, DocumentFile, UploadDocumentInput } from "./document.types.js";

export interface DocumentRepository {
  createUploadForOwner(input: UploadDocumentInput, ownerId: string): Promise<Document | undefined>;
  findForOwner(id: string, ownerId: string): Promise<Document | undefined>;
  findFileForOwner(id: string, ownerId: string): Promise<DocumentFile | undefined>;
  createForOwner(input: CreateDocumentInput, ownerId: string): Promise<Document | undefined>;
}

// INSERT ... SELECT keeps authorization and the write atomic.
async function insertForOwner(db: Prisma.TransactionClient, input: CreateDocumentInput, ownerId: string) {
  const rows = await db.$queryRaw<Document[]>`
    INSERT INTO documents (organization_id, title, content)
    SELECT id, ${input.title}, ${input.content} FROM organizations
    WHERE id = ${input.organizationId}::uuid AND owner_id = ${ownerId}::uuid
    RETURNING id, organization_id AS "organizationId", title, content, created_at AS "createdAt"`;
  return rows[0];
}

export class PrismaDocumentRepository implements DocumentRepository {
  constructor(private readonly db: PrismaClient) {}

  async createUploadForOwner(input: UploadDocumentInput, ownerId: string): Promise<Document | undefined> {
    return this.db.$transaction(async (tx) => {
      const document = await insertForOwner(tx, input, ownerId);
      if (!document) return undefined;
      const upload = { fileName: input.fileName, mediaType: input.mediaType, byteLength: input.bytes.length };
      await tx.documentUpload.create({
        data: { documentId: document.id, ...upload, fileData: new Uint8Array(input.bytes) },
      });
      return { ...document, upload };
    });
  }

  async findForOwner(id: string, ownerId: string): Promise<Document | undefined> {
    const document = await this.db.document.findFirst({
      where: { id, organization: { ownerId } },
      include: { upload: { select: { fileName: true, mediaType: true, byteLength: true } } },
    });
    if (!document) return undefined;
    const { upload, ...metadata } = document;
    return upload ? { ...metadata, upload } : metadata;
  }

  async findFileForOwner(id: string, ownerId: string): Promise<DocumentFile | undefined> {
    const file = await this.db.documentUpload.findFirst({
      where: { documentId: id, document: { organization: { ownerId } } },
      select: { fileName: true, mediaType: true, fileData: true },
    });
    return file ? { fileName: file.fileName, mediaType: file.mediaType, bytes: Buffer.from(file.fileData) } : undefined;
  }

  async createForOwner(input: CreateDocumentInput, ownerId: string): Promise<Document | undefined> {
    return insertForOwner(this.db, input, ownerId);
  }
}

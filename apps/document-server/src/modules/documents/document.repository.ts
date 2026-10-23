import type { Page, PageQuery } from "@repo/service-common/pagination";
import { HttpError } from "@repo/service-common/http";
import type { PrismaClient } from "../../database/prisma.js";
import type { OrganizationAccess } from "@repo/service-common/organizations";
import type { CreateDocumentInput, Document, DocumentFile, UploadDocumentInput } from "./document.types.js";

export interface DocumentRepository {
  deleteForOwner(id: string, ownerId: string): Promise<boolean>;
  list(organizationId: string, ownerId: string, query: PageQuery): Promise<Page<Omit<Document, "content">>>;
  createUploadForOwner(input: UploadDocumentInput, ownerId: string): Promise<Document | undefined>;
  findForOwner(id: string, ownerId: string): Promise<Document | undefined>;
  findFileForOwner(id: string, ownerId: string): Promise<DocumentFile | undefined>;
  createForOwner(input: CreateDocumentInput, ownerId: string): Promise<Document | undefined>;
}

export class PrismaDocumentRepository implements DocumentRepository {
  constructor(private readonly db: PrismaClient, private readonly organizationAccess: OrganizationAccess) {}
  async deleteForOwner(id: string, ownerId: string): Promise<boolean> {
    if (!await this.findForOwner(id, ownerId)) return false;
    const result = await this.db.document.deleteMany({ where: { id } });
    return result.count === 1;
  }
  async list(organizationId: string, ownerId: string, query: PageQuery): Promise<Page<Omit<Document, "content">>> {
    if (!await this.organizationAccess(organizationId, ownerId)) throw new HttpError(404, "Organization not found");
    const where = { organizationId, ...(query.search ? { title: { contains: query.search, mode: "insensitive" as const } } : {}) };
    const [saved, total] = await Promise.all([
      this.db.document.findMany({ where, select: { id: true, organizationId: true, title: true, createdAt: true, upload: { select: { fileName: true, mediaType: true, byteLength: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.db.document.count({ where }),
    ]);
    const items = saved as unknown as Omit<Document, "content">[];
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
  async createUploadForOwner(input: UploadDocumentInput, ownerId: string): Promise<Document | undefined> {
    if (!await this.organizationAccess(input.organizationId, ownerId)) return undefined;
    return this.db.$transaction(async tx => {
      const document = await tx.document.create({ data: { organizationId: input.organizationId, title: input.title, content: input.content } });
      const upload = { fileName: input.fileName, mediaType: input.mediaType, byteLength: input.bytes.length };
      await tx.documentUpload.create({ data: { documentId: document.id, ...upload, fileData: new Uint8Array(input.bytes) } });
      return { ...document, upload };
    });
  }
  async findForOwner(id: string, ownerId: string): Promise<Document | undefined> {
    const document = await this.db.document.findUnique({ where: { id }, include: { upload: { select: { fileName: true, mediaType: true, byteLength: true } } } });
    if (!document || !await this.organizationAccess(document.organizationId, ownerId)) return undefined;
    const { upload, ...metadata } = document;
    return upload ? { ...metadata, upload } : metadata;
  }
  async findFileForOwner(id: string, ownerId: string): Promise<DocumentFile | undefined> {
    if (!await this.findForOwner(id, ownerId)) return undefined;
    const file = await this.db.documentUpload.findUnique({ where: { documentId: id } });
    return file ? { fileName: file.fileName, mediaType: file.mediaType, bytes: Buffer.from(file.fileData) } : undefined;
  }
  async createForOwner(input: CreateDocumentInput, ownerId: string): Promise<Document | undefined> {
    if (!await this.organizationAccess(input.organizationId, ownerId)) return undefined;
    return this.db.document.create({ data: input });
  }
}

import type { PageQuery } from "@repo/service-common/pagination";
import { HttpError } from "@repo/service-common/http";
import type { DocumentRepository } from "./document.repository.js";
import type { CreateDocumentInput, Document, UploadDocumentInput } from "./document.types.js";

export class DocumentService {
  constructor(private readonly repository: DocumentRepository) {}

  list(organizationId: string, ownerId: string, query: PageQuery) { return this.repository.list(organizationId, ownerId, query); }

  async upload(input: UploadDocumentInput, ownerId: string) {
    const document = await this.repository.createUploadForOwner(input, ownerId);
    if (!document) throw new HttpError(404, "Organization not found");
    return document;
  }

  async get(id: string, ownerId: string) {
    const document = await this.repository.findForOwner(id, ownerId);
    if (!document) throw new HttpError(404, "Document not found");
    return document;
  }

  async download(id: string, ownerId: string) {
    const file = await this.repository.findFileForOwner(id, ownerId);
    if (!file) throw new HttpError(404, "Uploaded document not found");
    return file;
  }

  async create(input: CreateDocumentInput, ownerId: string): Promise<Document> {
    const document = await this.repository.createForOwner(input, ownerId);
    if (!document) throw new HttpError(404, "Organization not found");
    return document;
  }
}

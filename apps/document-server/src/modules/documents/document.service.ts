import type { PageQuery } from "@repo/service-common/pagination";
import { HttpError } from "@repo/service-common/http";
import type { DocumentRepository } from "./document.repository.js";
import type { CreateDocumentInput, Document, UploadDocumentInput } from "./document.types.js";
import type { RemoveDocumentIndex } from "./document.index.js";

export class DocumentService {
  constructor(private readonly repository: DocumentRepository, private readonly removeIndex: RemoveDocumentIndex) {}

  async delete(id: string, ownerId: string, token: string) {
    await this.get(id, ownerId);
    await this.removeIndex(id, token);
    if (!await this.repository.deleteForOwner(id, ownerId)) throw new HttpError(404, "Document not found");
    return { deleted: true, documentId: id };
  }

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

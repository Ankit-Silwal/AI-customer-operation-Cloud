import { HttpError } from "../../common/http.js";
import type { DocumentRepository } from "./document.repository.js";
import type { CreateDocumentInput, Document } from "./document.types.js";

export class DocumentService {
  constructor(private readonly repository: DocumentRepository) {}

  async create(input: CreateDocumentInput, ownerId: string): Promise<Document> {
    const document = await this.repository.createForOwner(input, ownerId);
    if (!document) throw new HttpError(404, "Organization not found");
    return document;
  }
}

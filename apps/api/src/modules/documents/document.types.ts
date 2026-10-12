export interface CreateDocumentInput {
  organizationId: string;
  title: string;
  content: string;
}

export interface Document extends CreateDocumentInput {
  id: string;
  createdAt: Date;
  upload?: { fileName: string; mediaType: string; byteLength: number };
}

export interface UploadDocumentInput extends CreateDocumentInput {
  fileName: string;
  mediaType: string;
  bytes: Buffer;
}

export interface DocumentFile {
  fileName: string;
  mediaType: string;
  bytes: Buffer;
}

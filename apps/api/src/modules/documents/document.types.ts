export interface CreateDocumentInput {
  organizationId: string;
  title: string;
  content: string;
}

export interface Document extends CreateDocumentInput {
  id: string;
  createdAt: Date;
}

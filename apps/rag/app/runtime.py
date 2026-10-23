import hashlib
import io
from uuid import NAMESPACE_URL, uuid5

import httpx
from fastapi import HTTPException
from langchain_core.documents import Document
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_qdrant import QdrantVectorStore
from pypdf import PdfReader
from qdrant_client import QdrantClient, models
from transformers import AutoTokenizer

from .config import Settings
from .llm import generate_answer


def tenant_filter(owner_id: str, organization_id: str):
    return models.Filter(must=[
        models.FieldCondition(key="metadata.ownerId", match=models.MatchValue(value=owner_id)),
        models.FieldCondition(key="metadata.organizationId", match=models.MatchValue(value=organization_id)),
    ])


class Runtime:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.http = httpx.Client(timeout=httpx.Timeout(10, connect=3), follow_redirects=False)
        self.embedding_model = HuggingFaceEmbeddings(
            model_name=settings.embedding_model,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )
        self.tokenizer = AutoTokenizer.from_pretrained(settings.embedding_model)
        self.qdrant = QdrantClient(url=settings.qdrant_url, timeout=10)
        if not self.qdrant.collection_exists(settings.collection):
            if not settings.create_collection:
                raise RuntimeError("Qdrant collection does not exist")
            # Concurrent replicas may race to initialize a fresh collection.
            try:
                self.qdrant.create_collection(settings.collection, vectors_config=models.VectorParams(size=384, distance=models.Distance.COSINE))
            except Exception:
                if not self.qdrant.collection_exists(settings.collection):
                    raise
        self.vector_db = QdrantVectorStore.from_existing_collection(
            url=settings.qdrant_url,
            collection_name=settings.collection,
            embedding=self.embedding_model,
        )
        for key in ("metadata.ownerId", "metadata.organizationId"):
            self.qdrant.create_payload_index(settings.collection, key, models.PayloadSchemaType.KEYWORD, wait=True)

    def close(self):
        self.http.close()
        self.vector_db.client.close()
        self.qdrant.close()

    def authorized_get(self, base: str, path: str, token: str):
        response = self.http.get(f"{base.rstrip('/')}{path}", headers={"Authorization": f"Bearer {token}"})
        if response.status_code in (401, 403, 404):
            raise HTTPException(404, "Resource not found")
        if not response.is_success:
            raise HTTPException(503, "Domain service temporarily unavailable")
        return response

    def authorize_organization(self, organization_id: str, token: str):
        self.authorized_get(self.settings.organizations_url, f"/organizations/{organization_id}", token)

    def index_document(self, document_id: str, owner_id: str, token: str):
        document = self.authorized_get(self.settings.documents_url, f"/documents/{document_id}", token).json()
        text = document["content"]
        if document.get("upload", {}).get("mediaType") == "application/pdf":
            data = self.authorized_get(self.settings.documents_url, f"/documents/{document_id}/download", token).content
            try:
                reader = PdfReader(io.BytesIO(data))
                if len(reader.pages) > 100:
                    raise ValueError("Too many PDF pages")
                text = "\n".join(page.extract_text() or "" for page in reader.pages)
            except Exception as error:
                raise HTTPException(422, "PDF must contain extractable text and at most 100 pages") from error
        if not text.strip() or len(text) > 200000:
            raise HTTPException(422, "Document must contain 1 to 200000 text characters")
        # BGE has a 512-token context; keep chunks under that limit with overlap.
        tokens = self.tokenizer.encode(text, add_special_tokens=False)
        chunks = [self.tokenizer.decode(tokens[start:start + 400], skip_special_tokens=True) for start in range(0, len(tokens), 350)]
        if len(chunks) > 1000:
            raise HTTPException(422, "Document has too many chunks")
        digest = hashlib.sha256(text.encode()).hexdigest()
        documents = []
        ids = []
        for index, chunk in enumerate(chunks):
            documents.append(Document(page_content=chunk, metadata={
                "ownerId": owner_id, "organizationId": document["organizationId"],
                "documentId": document_id, "title": document["title"], "chunkIndex": index,
                "embeddingModel": self.settings.embedding_model,
            }))
            ids.append(str(uuid5(NAMESPACE_URL, f"{owner_id}:{document_id}:{digest}:{index}")))
        # Documents are immutable. Stable IDs make retrying an index request idempotent.
        self.vector_db.add_documents(documents, ids=ids, batch_size=32)
        return {"documentId": document_id, "organizationId": document["organizationId"], "chunks": len(chunks), "status": "indexed"}

    def search(self, question: str, organization_id: str, owner_id: str, token: str, top_k: int):
        self.authorize_organization(organization_id, token)
        matches = self.vector_db.similarity_search_with_score(question, k=top_k, filter=tenant_filter(owner_id, organization_id))
        return [{"documentId": doc.metadata["documentId"], "title": doc.metadata.get("title", ""),
                 "chunkIndex": doc.metadata.get("chunkIndex", 0), "text": doc.page_content, "score": float(score)}
                for doc, score in matches]

    def answer(self, question: str, organization_id: str, owner_id: str, token: str, top_k: int):
        if not self.settings.api_key:
            raise HTTPException(503, "Set api_key or GEMINI_API_KEY in .env to enable answer generation")
        sources = self.search(question, organization_id, owner_id, token, top_k)
        return generate_answer(self.settings, question, sources)

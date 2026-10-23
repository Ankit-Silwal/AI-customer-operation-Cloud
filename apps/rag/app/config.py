import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    jwt_secret: str
    organizations_url: str = "http://core:3001"
    documents_url: str = "http://documents:3001"
    qdrant_url: str = "http://qdrant:6333"
    collection: str = "learning_rag"
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    model: str = "gemini-3.1-flash-lite"
    api_key: str = ""
    base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai/"
    create_collection: bool = True
    rate_limit_redis_url: str = "redis://127.0.0.1:6379"

    @classmethod
    def from_env(cls):
        secret = os.getenv("JWT_SECRET", "")
        if len(secret) < 32:
            raise ValueError("JWT_SECRET must contain at least 32 characters")
        embedding_model = os.getenv("AI_EMBEDDING_MODEL") or os.getenv("EMBEDDING_MODEL", cls.embedding_model)
        if embedding_model != "BAAI/bge-small-en-v1.5":
            raise ValueError("AI_EMBEDDING_MODEL must be BAAI/bge-small-en-v1.5 for local embeddings")
        return cls(
            jwt_secret=secret,
            organizations_url=os.getenv("ORGANIZATIONS_URL", cls.organizations_url),
            documents_url=os.getenv("DOCUMENTS_URL", cls.documents_url),
            qdrant_url=os.getenv("QDRANT_URL", cls.qdrant_url),
            collection=os.getenv("QDRANT_COLLECTION") or cls.collection,
            embedding_model=embedding_model,
            model=os.getenv("GEMINI_MODEL", cls.model),
            api_key=os.getenv("GEMINI_API_KEY") or os.getenv("api_key", ""),
            base_url=os.getenv("OPENAI_BASE_URL", cls.base_url),
            create_collection=os.getenv("QDRANT_CREATE_COLLECTION", "true").lower() == "true",
            rate_limit_redis_url=os.getenv("RATE_LIMIT_REDIS_URL", cls.rate_limit_redis_url),
        )

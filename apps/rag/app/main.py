import logging
import re
from contextlib import asynccontextmanager
from uuid import UUID, uuid4

import httpx
import jwt
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from openai import APIError
from pydantic import BaseModel, Field
from qdrant_client.http.exceptions import ResponseHandlingException, UnexpectedResponse

from .config import Settings
from .runtime import Runtime
from .rate_limit import RateLimiter
from starlette.concurrency import run_in_threadpool

security = HTTPBearer(auto_error=False)


class Query(BaseModel):
    organizationId: UUID
    question: str = Field(min_length=1, max_length=2000)
    topK: int = Field(default=4, ge=1, le=8)


def create_app(settings: Settings | None = None, runtime_factory=Runtime, limiter_factory=RateLimiter):
    settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app):
        app.state.limiter = limiter_factory(settings) if limiter_factory else None
        try:
            app.state.runtime = runtime_factory(settings)
            try:
                yield
            finally:
                app.state.runtime.close()
        finally:
            if app.state.limiter:
                await app.state.limiter.close()

    app = FastAPI(title="Customer Operations RAG", lifespan=lifespan, docs_url=None, redoc_url=None)

    @app.middleware("http")
    async def context(request: Request, call_next):
        supplied = request.headers.get("x-request-id", "")
        request.state.request_id = supplied if re.fullmatch(r"[A-Za-z0-9_-]{1,64}", supplied) else str(uuid4())
        content_length = request.headers.get("content-length", "0")
        request.state.rate_headers = {}
        try:
            if request.app.state.limiter and request.url.path not in {"/health/live", "/health/ready", "/rag/health/live", "/rag/health/ready"}:
                await request.app.state.limiter.global_limit(request)
            if not content_length.isdigit() or int(content_length) > 16384:
                raise HTTPException(413, "Request too large")
            response = await call_next(request)
        except HTTPException as error:
            response = JSONResponse(status_code=error.status_code, content={"error": error.detail, "requestId": request.state.request_id}, headers=error.headers)
        response.headers.update(request.state.rate_headers)
        response.headers["X-Request-ID"] = request.state.request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, error: HTTPException):
        return JSONResponse(status_code=error.status_code, content={"error": error.detail, "requestId": request.state.request_id}, headers=error.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, _error):
        return JSONResponse(status_code=422, content={"error": "Invalid request", "requestId": request.state.request_id})

    async def upstream_error(request: Request, _error):
        return JSONResponse(status_code=503, content={"error": "RAG dependency temporarily unavailable", "requestId": request.state.request_id})

    for error_type in (httpx.HTTPError, APIError, ResponseHandlingException, UnexpectedResponse):
        app.add_exception_handler(error_type, upstream_error)

    async def authenticate(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(security)):
        if not credentials:
            raise HTTPException(401, "A Bearer token is required")
        try:
            payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=["HS256"], issuer="customer-operation-api", options={"require": ["sub", "exp", "iss"]})
            owner_id = str(UUID(payload["sub"]))
        except (jwt.PyJWTError, ValueError, TypeError) as error:
            raise HTTPException(401, "Invalid or expired token") from error
        if request.app.state.limiter:
            await request.app.state.limiter.user_limit(request, owner_id)
        return owner_id, credentials.credentials

    async def protected(request: Request, identity=Depends(authenticate)):
        if request.app.state.limiter:
            async with request.app.state.limiter.slot(identity[0]):
                yield identity
        else:
            yield identity

    @app.get("/health/live")
    @app.get("/rag/health/live")
    def live():
        return {"status": "ok", "service": "rag"}

    @app.get("/health/ready")
    @app.get("/rag/health/ready")
    async def ready(request: Request):
        try:
            if request.app.state.limiter:
                await request.app.state.limiter.ready()
            await run_in_threadpool(request.app.state.runtime.qdrant.get_collection, settings.collection)
        except Exception as error:
            raise HTTPException(503, "RAG dependency unavailable") from error
        return {"status": "ready", "service": "rag", "generationConfigured": bool(settings.api_key)}

    @app.post("/rag/documents/{document_id}/index")
    def index(document_id: UUID, request: Request, identity=Depends(protected)):
        return request.app.state.runtime.index_document(str(document_id), *identity)

    @app.post("/rag/search")
    def search(query: Query, request: Request, identity=Depends(protected)):
        if not query.question.strip():
            raise HTTPException(422, "Question must not be blank")
        return {"sources": request.app.state.runtime.search(query.question, str(query.organizationId), *identity, query.topK)}

    @app.post("/rag/query")
    def answer(query: Query, request: Request, identity=Depends(protected)):
        if not query.question.strip():
            raise HTTPException(422, "Question must not be blank")
        return request.app.state.runtime.answer(query.question, str(query.organizationId), *identity, query.topK)

    return app


# Avoid logging provider requests, tokens, prompts or document contents.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
app = create_app()

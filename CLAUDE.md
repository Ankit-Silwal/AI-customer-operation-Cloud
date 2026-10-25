# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Architecture

npm workspaces + Turborepo monorepo (Node 24, npm 11, ESM TypeScript; Python FastAPI for `apps/rag`). The gateway (`apps/api/src/gateway`) is the only public API entrypoint and proxies by path prefix to private services:

- `core` = `apps/api` (`SERVICE_ROLE=core`): auth + organizations, owns two databases (`identity`, `organizations`) via two separate pools/Prisma clients.
- `conversations` = `apps/conversation-server`, `documents` = `apps/document-server`: each owns one database and checks organization ownership over HTTP against core (`packages/service-common/src/organizations.ts`), failing closed with 503.
- `rag` = `apps/rag`: BGE embeddings + Qdrant + Gemini; Qdrant is a derived index (re-index to rebuild).
- Shared Node infrastructure (env, pools, server lifecycle, rate limits, error handler) lives in `packages/service-common`. Domain apps must not import each other in production code.

There are no cross-database joins or foreign keys. Services must stay stateless (no sticky sessions, in-memory state or local files); rate limits and concurrency live in Redis.

## Database rules

- Schema changes go through the versioned SQL files (`apps/api/src/database/services/*.sql`, `apps/*/src/database/schema.sql`) applied by the one-shot `migrate-*` Compose containers. Never use `prisma db push`.
- Each app owns only its own Prisma schema/models; run `npm run db:generate` (or the app's build) after changing a schema.
- Concurrency-sensitive writes use conditional SQL (e.g. conversation append checks `jsonb_array_length` and returns 409); keep that pattern instead of read-then-write.
- Database passwords must be URL-safe. Role passwords are set only on first boot of the Postgres volume (`infra/postgres/001-databases.sh`).

## Commands

- `npm test` spins up disposable Postgres/Redis on ports 55433/55479 (or uses `TEST_DATABASE_URL`/`TEST_REDIS_URL`). It runs from `apps/api` and builds service-common, conversation-server and document-server first.
- Full stack: `docker compose up --build -d --wait --wait-timeout 600` (first build downloads PyTorch + BGE weights; slow). Smoke check: `node --import tsx apps/api/scripts/check-microservices.ts --rag`.
- RAG Python tests run inside the container: `docker compose run --rm --no-deps rag python -m unittest discover -s tests -p "test_*.py"`.
- Root `.env` (copied from `.env.example`) needs `JWT_SECRET` ≥ 32 chars; never commit `.env` or keys.

## Style

Match the surrounding file's density: many source files use compact one-line methods and are not Prettier-formatted. Do not run `npm run format` over the repo; it would reformat unrelated files.

## Git

Commit and push to `main`. Stage only files you changed; the working tree may hold unrelated user deletions/edits that must not be swept into your commits.

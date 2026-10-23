# Microservices verification — 23 October 2026

Verified locally against the actual compiled Docker services. No real Gemini credential was used.

| Check | Result |
| --- | --- |
| `npm run check-types` | Passed across the monorepo |
| `npm run lint` | Passed across the monorepo |
| `npm run build` | Passed |
| Node regression suite, real disposable PostgreSQL | 24 entries passed, 0 failures, 0 skips; includes the pre-existing empty security test file |
| Python RAG contract tests in Docker | 2 passed |
| Core gateway/service smoke check | 17 passed |
| Real BGE/Qdrant smoke check | 27 passed |
| Two conversation and two document replicas, plus restart check | 29 passed |
| Real generation client against local Postman simulation | 3 assertions passed; simulation logged `POST /v1/chat/completions`, HTTP 200 |
| Separate database ownership | Four domain databases present; identity role denied connection to documents database with PostgreSQL `42501` |
| Old PostgreSQL volume | Still present; not migrated or deleted |

The Docker smoke check covers registration/login, duplicate-account rejection, owner access, cross-account denial, conversation persistence, JSON documents, multipart upload/download byte preservation, idempotent vector indexing, semantic retrieval, tenant filtering and the missing-key response. With `--restart`, it restarts documents/RAG and verifies the same document and source vectors using the original JWT. The final run passed with two replicas of conversations and documents. Development was returned to one replica afterward.

`BAAI/bge-small-en-v1.5` was downloaded inside Docker into the shared model cache. Real HuggingFaceEmbeddings and the real Qdrant server performed the indexing/retrieval checks; these paths were not replaced with fake embeddings or an in-memory vector database.

The Gemini mock is maintained at `postman/mocks/gemini`. It was written from Google's documented OpenAI-compatible chat request/response shape. The Postman CLI was signed out, so an owning workspace/mock search was skipped. The actual `generate_answer` client ran against the local simulation, and its request appeared in the simulation log. The simulation was stopped after verification. No mocks were published or deployed.

## Reproduce

```sh
docker compose up --build -d --wait --wait-timeout 600
node --import tsx apps/api/scripts/check-microservices.ts --rag
docker compose up -d --scale conversations=2 --scale documents=2
node --import tsx apps/api/scripts/check-microservices.ts --rag --restart
docker compose up -d --scale conversations=1 --scale documents=1
docker compose run --rm --no-deps rag python -m unittest discover -s tests -p "test_*.py"
```

For generation, start the local simulator in one terminal:

```sh
postman simulation run postman/simulations/rag.sim.yaml --port 4900 --output ndjson --no-history
```

In another PowerShell terminal, use a local Python environment because the simulator listens on host loopback:

```powershell
python -m venv .local-validation/rag-venv
.\.local-validation\rag-venv\Scripts\python.exe -m pip install openai==3.37.0 fastapi==0.161.1
$env:PYTHONPATH = Join-Path (Get-Location) 'apps/rag'
.\.local-validation\rag-venv\Scripts\python.exe apps/rag/tests/check_generation.py
```

This establishes local integration and contract handling. Google's real endpoint, API key permissions, requested model availability and generated answer quality remain unverified until real credentials are configured. Shared PostgreSQL/Qdrant host availability and production load capacity were not tested by these functional checks.

## Follow-up: core, conversation and document servers

The server grouping was updated on 23 October 2026: auth and organizations now share the core HTTP server; conversations and documents use dedicated entrypoints and separate processes. Gateway and RAG targets were updated to core. Docker inspection confirmed the commands `servers/core.js`, `servers/conversations.js` and `servers/documents.js`.

- Type checking, lint, compiled build, both Docker image builds and Compose validation passed.
- The Node suite passed 26 entries, with no failures or skips. Added checks verify that core uses the correct identity/organization clients, excludes conversation/document routes, and becomes unready if either database is unavailable.
- Twelve direct HTTP boundary checks against the actual containers passed. Core exposes auth/organization routes but rejects conversation/document routes; conversations and documents reject each other's routes and core's routes.
- All 29 end-to-end smoke checks passed through the gateway, including real BGE/Qdrant retrieval, tenant isolation, multipart bytes and document/vector persistence after restarting documents and RAG.
- Both Python RAG contract tests passed.
- Counts immediately before and after replacing the servers matched: 6 users, 5 organizations, 3 conversations and 6 documents. No data migration or deletion was performed. Subsequent smoke checks created their usual new test records.
- The final stack has core, conversations, documents, gateway and RAG running as separate healthy processes. PostgreSQL and Qdrant remain the durable stores. Real Gemini generation remains pending credentials.

## Follow-up: independent application folders

The processing applications were physically extracted into `apps/conversation-server` and `apps/document-server`; RAG remains in `apps/rag`, and auth/organizations remain in `apps/api`. Each Node app now owns its app/routes/server files, controllers, services, repositories, Prisma models/client, SQL setup, package scripts and Dockerfile. Shared infrastructure is in `packages/service-common`.

- Monorepo build, type checks, lint and all 26 Node test entries passed after moving the source. The test fixture composes exported routers only for regression coverage; production core does not import the processing applications.
- Separate core, conversation and document images built successfully. A transient npm download reset interrupted the first parallel Docker build; sequential retries passed. The production dependency installs in all three images reported zero vulnerabilities. A full repository audit separately reports four high findings in the existing frontend ESLint plugin/glob dependency chain; that unrelated toolchain was not changed.
- Runtime filesystem assertions passed: the conversation image contains `apps/conversation-server/dist/server.js` and no `apps/api` or document application, while the document image contains `apps/document-server/dist/server.js` and no `apps/api` or conversation application.
- Docker inspection confirmed each container launches its own application's server. Both processors use distinct images: `customer-ops-conversation:local` and `customer-ops-document:local`.
- Database counts immediately before/after deployment matched: 8 users, 7 organizations, 4 conversations and 8 documents. No data migration was needed.
- The real gateway/BGE/Qdrant smoke check passed all 29 checks, including upload/download bytes, owner isolation, index idempotency and document/vector recovery after restarting documents and RAG. Smoke accounts and records were created only after the retention check.
- The gateway, core, conversation, document and RAG servers are running and healthy. Gemini's real endpoint remains unverified until credentials are supplied.

## Follow-up: shared rate limiting

All five HTTP servers now enforce Redis-backed admission. The gateway has global, burst and sustained IP budgets. Each Node service has its own global/IP budgets and verified-user read/write quotas. Auth adds registration and normalized email/IP login limits; documents add pre-parser upload and download limits. RAG adds global, user, indexing, generation and long-term budgets, plus renewable distributed concurrency leases (two total, one per user by default). Settings and failure semantics are documented in [rate limiting](rate-limiting.md).

- Monorepo build, lint and type checks passed. A Prisma code generation race was found during type checking and corrected by ordering each app's type check after its own build. Turbo now forwards rate-limit configuration and the test Redis URL.
- All 34 Node test entries passed against disposable PostgreSQL and Redis, with no failures or skips. Eight new checks cover atomic admissions across replicas, application restart continuity, token refill, independent identities, login normalization, spoofed IP headers, pre-parser upload rejection, global limits, bounded failure responses, configuration validation and IPv6 /64 grouping. The historical empty security test file remains included in the runner's entry count.
- All seven Python tests passed inside the actual RAG image. The five new tests cover concurrent admission, global/per-user concurrency, failed-operation lease release, crashed-worker expiry, stale lease release protection, quota response headers, identity signatures and Redis outage behavior.
- Core, conversation, document and RAG images built successfully with the new shared assets. Production npm dependency audits reported zero vulnerabilities. One final Docker registry DNS lookup failed transiently; retry succeeded. Dockerfiles now cache dependency installation separately from shared source changes, and the RAG image separately caches CPU PyTorch.
- The real gateway/BGE/Qdrant smoke check passed 27 checks with limits enabled, including tenant isolation and upload/download bytes. Six additional live rate-limit checks passed: normalized login/IP limits despite forged forwarding headers, upload rejection before malformed multipart processing, query/index budgets before expensive work, real Redis outage responses, recovery and persisted exhausted counters after restarting Redis.
- After deploying the final images, all 29 end-to-end checks also passed with document/RAG restarts, confirming persistence and retrieval recovery with protection enabled. The final stack is running with the shared Redis service; disposable test containers were removed by the test runner.
- Stopping the real Redis container preserved gateway liveness (`200`), changed readiness to `503`, and rejected business traffic with `503` and `Retry-After: 1`. Restarting Redis restored gateway and RAG readiness; the previously exhausted login bucket still returned `429`, confirming AOF recovery. Redis has no default host port and uses authenticated access, bounded memory and persistent storage.
- The updated RAG OpenAPI YAML parsed successfully and all protected operations include `429` responses and retry/header documentation. Existing `.env` files and historical document deletions were left untouched. Gemini was not called by the rate-limit checks; real provider generation remains pending credentials.

To repeat the live checks, run `node --import tsx apps/api/scripts/check-rate-limits.ts --redis-restart` against the local default stack. This creates one test account and briefly stops Redis; invalid upload/query/index requests are rejected before document/vector writes or model calls. These functional checks establish enforcement and recovery, not production load capacity or Redis high availability.

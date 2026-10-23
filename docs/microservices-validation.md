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

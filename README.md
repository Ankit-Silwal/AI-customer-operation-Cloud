# AI Customer Operation Cloud

Stateless customer operations services with an Express gateway, Prisma/PostgreSQL persistence, and Python RAG using BAAI BGE embeddings, Qdrant and Gemini.

## Run

Requires Docker Desktop with Linux containers. Node 24.11+ and npm 11 are needed for local TypeScript checks.

For a new checkout, copy `.env.example` to `.env` and set a random `JWT_SECRET` of at least 32 characters. Keep an existing `.env` and add missing variables from the example. Real secrets stay out of Git.

```sh
docker compose up --build -d --wait --wait-timeout 600
```

The gateway is at `http://localhost:3001`. The first build installs CPU PyTorch and downloads `BAAI/bge-small-en-v1.5` into a persistent model cache. Auth and organizations share the `core` server; conversations and documents run in their own servers, with RAG separate. The four domain databases and roles are retained, so changing the server grouping does not move or discard records.

Add `api_key=...` or `GEMINI_API_KEY=...` to `.env` when ready, then run `docker compose up -d --force-recreate rag`. Indexing and search already work without that key; answer generation returns `503` until it is configured. The generation defaults are `gemini-3.1-flash-lite` and `https://generativelanguage.googleapis.com/v1beta/openai/`.

## Services and routes

Open **Hearth** at [localhost:3030](http://localhost:3030) for the workspace and **Oak & Ember** at [localhost:3035](http://localhost:3035) for the fictional company demonstration. Both interfaces use warm cream, terracotta and olive colors. The workspace supports sign-in, workspaces, conversations/replies, knowledge uploads/indexing and source-backed search. The company site has a working policy assistant connected to the same services. See [web workflows and setup](docs/web-workflows.md).

| Service                     | Public routes through the gateway                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Core (auth + organizations) | `POST /register`, `POST /login`, `GET /me`, `GET /organizations`, `POST /organizations`, `GET /organizations/:id`  |
| Conversations               | `GET /conversation`, `POST /conversation`, `GET /conversation/:id`, `POST /conversation/:id/messages`              |
| Documents                   | `GET /documents`, `POST /documents`, `POST /documents/upload`, `GET /documents/:id`, `GET /documents/:id/download` |
| RAG                         | `POST /rag/documents/:id/index`, `POST /rag/search`, `POST /rag/query`                                             |
| Health                      | `GET /health/live`, `GET /health/ready`, `GET /rag/health/ready`                                                   |

Resources and RAG require the JWT returned by registration/login. Create an organization and document, index the document, then search or query with `{"organizationId":"<UUID>","question":"What is our refund policy?","topK":4}`. Queries retrieve only chunks belonging to both the caller and the selected organization.

See [architecture, environment variables, RAG workflow and scaling](docs/microservices.md) and the [RAG OpenAPI contract](contracts/rag.openapi.yaml).
Executed checks and their limits are recorded in [service verification](docs/microservices-validation.md) and [web verification](docs/web-validation.md). The new account, list and reply endpoints are described in the [workspace contract](contracts/workspace.openapi.yaml).

All servers enforce Redis-backed rate limits: global ceilings, IP burst and sustained budgets, verified-user quotas, login and registration protection, document limits, and tighter RAG budgets with distributed concurrency control. See [limits, headers, configuration and failure behavior](docs/rate-limiting.md). Redis runs inside Docker with persistent counters; application replicas remain stateless.

## Code layout

```text
apps/
  api/                    # Core: auth + organizations; gateway entrypoint
  conversation-server/    # Own app, routes, server, controllers, Prisma schema and Dockerfile
  document-server/        # Own app, routes, server, upload processing, Prisma schema and Dockerfile
  rag/                    # Python FastAPI, BGE embeddings, Qdrant retrieval and Gemini
  web/                    # Hearth customer operations workspace and secure browser API bridge
  company-demo/           # Oak & Ember storefront and private company-side support integration
packages/
  service-common/         # Shared HTTP/auth infrastructure, validation, logging and lifecycle
  web-runtime/            # Shared browser-server security, upstream requests and web serving
infra/postgres/           # Separate database/role bootstrap
contracts/               # API contracts
postman/                 # Local provider mocks and simulations
```

Each Node domain app has its own `package.json`, `src/app.ts`, `src/routes.ts`, `src/server.ts`, Prisma schema and Dockerfile. Conversation and document controllers/repositories live in their own application folders, not in `apps/api`. Each domain app builds its own image and uses only its own database models. They share infrastructure through `packages/service-common`; neither processing app has a production dependency on the core API. Each app registers its own routes using `setupRoutes`, and the gateway uses `setupGatewayRoutes`. The browser-facing apps keep the same app/routes/server separation in their `server/` folders and call the gateway instead of accessing databases. No requests need a sticky session.

The app-specific READMEs explain standalone development: [conversation server](apps/conversation-server/README.md) and [document server](apps/document-server/README.md). Copy each Node app's `.env.example` to its local `.env` when running outside Docker; the root `.env` supplies the shared signing secret.

## Validate

```sh
npm install
npm run check-types
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:web
node --import tsx apps/api/scripts/check-microservices.ts --rag
node --import tsx apps/api/scripts/check-rate-limits.ts
docker compose -p customer-operation-cloud-test -f compose.test.yaml up -d --wait
docker compose run --rm --no-deps -e TEST_REDIS_URL=redis://host.docker.internal:55479 rag python -m unittest discover -s tests -p "test_*.py"
docker compose -p customer-operation-cloud-test -f compose.test.yaml down
```

`npm test` uses disposable PostgreSQL and Redis containers on ports `55433` and `55479`; set `TEST_DATABASE_URL` and `TEST_REDIS_URL` to use existing test infrastructure. The smoke check uses the running multi-service stack and real embeddings/Qdrant. Gemini generation is additionally exercised against a local Postman simulation; the real provider requires your key and permitted model access.

The regression fixture composes the independently exported app routers against isolated PostgreSQL schemas. Production core does not import the conversation or document apps. Historical SQL is retained for migration regression checks; use explicit service connection URLs when inspecting databases. Each app owns only its own Prisma models. Do not use schema push to bypass the SQL initialization/migration process.

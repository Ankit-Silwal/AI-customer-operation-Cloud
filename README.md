# AI Customer Operation Cloud

Stateless customer operations services with an Express gateway, Prisma/PostgreSQL persistence, and Python RAG using BAAI BGE embeddings, Qdrant and Gemini.

## Run

Requires Docker Desktop with Linux containers. Node 24.11+ and npm 11 are needed for local TypeScript checks.

For a new checkout, copy `.env.example` to `.env` and set a random `JWT_SECRET` of at least 32 characters. Keep an existing `.env` and add missing variables from the example. Real secrets stay out of Git.

```sh
docker compose up --build -d --wait --wait-timeout 600
```

The gateway is at `http://localhost:3001`. The first build installs CPU PyTorch and downloads `BAAI/bge-small-en-v1.5` into a persistent model cache. Identity, organizations, conversations and documents each use a separate PostgreSQL database and role. This stack creates fresh data; it does not migrate or delete the earlier application's volume.

Add `api_key=...` or `GEMINI_API_KEY=...` to `.env` when ready, then run `docker compose up -d --force-recreate rag`. Indexing and search already work without that key; answer generation returns `503` until it is configured. The generation defaults are `gemini-3.1-flash-lite` and `https://generativelanguage.googleapis.com/v1beta/openai/`.

## Services and routes

| Service | Public routes through the gateway |
| --- | --- |
| Identity | `POST /register`, `POST /login` |
| Organizations | `POST /organizations`, `GET /organizations/:id` |
| Conversations | `POST /conversation`, `GET /conversation/:id` |
| Documents | `POST /documents`, `POST /documents/upload`, `GET /documents/:id`, `GET /documents/:id/download` |
| RAG | `POST /rag/documents/:id/index`, `POST /rag/search`, `POST /rag/query` |
| Health | `GET /health/live`, `GET /health/ready`, `GET /rag/health/ready` |

Resources and RAG require the JWT returned by registration/login. Create an organization and document, index the document, then search or query with `{"organizationId":"<UUID>","question":"What is our refund policy?","topK":4}`. Queries retrieve only chunks belonging to both the caller and the selected organization.

See [architecture, environment variables, RAG workflow and scaling](docs/microservices.md) and the [RAG OpenAPI contract](contracts/rag.openapi.yaml).

## Code layout

```text
apps/api/src/
  app.ts                 # Domain Express app and middleware
  routes.ts              # setupRoutes; registers the selected service's routes
  services.ts            # Validated domain roles
  server.ts              # Domain process startup and shutdown
  gateway/               # Stateless streaming gateway; setupGatewayRoutes
  clients/               # HTTP organization ownership checks
  modules/               # Domain controllers, services and Prisma repositories
  database/services/     # SQL initialization per domain database
apps/api/prisma/         # Prisma models and generated-client configuration
apps/rag/app/            # FastAPI, BGE embeddings, tenant retrieval and Gemini client
infra/postgres/          # Separate database/role bootstrap
contracts/              # API contracts
postman/                # Local provider mocks and simulations
```

Each domain registers its routes using `setupRoutes`. The gateway uses `setupGatewayRoutes`. Apps configure middleware and final error handling separately from route composition. The Node services share a build image, but each container exposes only its own domain routes. No requests need a sticky session.

## Validate

```sh
npm install
npm run check-types
npm run lint
npm test
npm run build
node --import tsx apps/api/scripts/check-microservices.ts --rag
docker compose run --rm --no-deps rag python -m unittest discover -s tests -p "test_*.py"
```

`npm test` uses a disposable PostgreSQL container on port `55433`; set `TEST_DATABASE_URL` to use another test database. The smoke check uses the running multi-service stack and real embeddings/Qdrant. Gemini generation is additionally exercised against a local Postman simulation; the real provider requires your key and permitted model access.

The former `SERVICE_ROLE=all` Node runtime remains available for regression tests and the older benchmark configuration. It is not the default Docker architecture. Its `.env` `DATABASE_URL`, `db:check` and `db:studio` commands refer to that compatibility database; use explicit service connection URLs when inspecting the new databases. Do not use Prisma `db push` on an individual domain database.

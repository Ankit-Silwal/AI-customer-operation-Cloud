# AI Customer Operation Cloud

TypeScript monorepo with an Express 5 API, PostgreSQL persistence, and project documentation. The API implements registration, login, organizations, conversations, and documents.

**Current version: 1.0.0.** See [Version 1](docs/Version1/README.md) for health/readiness, security headers, validation, request IDs, structured logs, database constraints/pooling, Text/Markdown/PDF uploads, and k6 traffic with one distinct account per VU. Start with the [study guide](docs/Version1/study-guide.md). Version 1 load campaigns/results are deferred; recorded Version 0 performance numbers describe the older read-only workload.

## Structure

```text
apps/
  api/
    src/
      app.ts                   # Application composition and module wiring
      server.ts                # Startup and graceful shutdown
      config/                  # Validated environment configuration
      database/                # Connection pool and SQL schema
      common/                  # HTTP types, errors, and input validation
      middleware/              # Authentication and error handling
      modules/
        auth/
        organizations/
        conversations/
        documents/
    tests/                     # HTTP, persistence, ownership, and security tests
    scripts/                   # Build asset copying
  docs/                        # Existing endpoint notes
packages/
  ui/                          # Shared React components
  typescript-config/           # Shared strict compiler settings
  eslint-config/               # Shared frontend lint configuration
```

Each API module contains its own `*.routes.ts`, `*.controller.ts`, `*.service.ts`, `*.repository.ts`, and `*.types.ts`. Routes select handlers; controllers validate HTTP input; services apply application rules; repositories execute parameterized SQL. Dependencies are passed through constructors and composed in `app.ts`.

The API uses strict TypeScript, unknown request bodies, typed database results, checked array access, and checked optional properties. Compiled ESM and the SQL schema are emitted into `apps/api/dist`; production runs the compiled JavaScript.

## Local development

Requires Node.js 24+, npm 11.6.1 or later within npm 11, and PostgreSQL 17.

```powershell
Copy-Item .env.example .env
npm install
```

Set `JWT_SECRET` in the root `.env` to a random secret of at least 32 characters, then start PostgreSQL and the apps:

```sh
docker compose up postgres -d
npm run dev
```

API: `http://localhost:3001`. Architecture and performance notes: [docs/Version0](docs/Version0/README.md).

To run only the API, use `npm run dev --workspace @repo/api`. If you change PostgreSQL credentials in `.env`, update `DATABASE_URL` for local development too. Environment configuration is checked on startup. The schema is initialized automatically and existing tables/data are preserved.

## Production

```sh
docker compose up --build -d
```

The Docker build compiles TypeScript in a build stage. The runtime stage contains production dependencies and compiled API files, runs as the `node` user, and serves port 3001. PostgreSQL data is stored in the `postgres_data` Docker volume.

For a local compiled run:

```sh
npm run build --workspace @repo/api
npm run start --workspace @repo/api
```

## Checks

```sh
npm run check-types
npm run lint
npm test
npm run build
```

To run against a disposable PostgreSQL 17 container, use `npm run test:postgres`. This starts a test database on port 5433 and removes the container when the suite finishes.

The API tests exercise routes through the actual controllers, services, and SQL repositories. Without `TEST_DATABASE_URL`, tests use an isolated PostgreSQL emulator. Set `TEST_DATABASE_URL` to run database tests against PostgreSQL; each test creates and drops its own random schema. The database role must be allowed to create schemas. Real PostgreSQL additionally verifies migration and transaction rollback behavior.

Tests cover password hashing, registration/login, JWT rejection, duplicate emails, input validation, malformed/oversized JSON, persistence, camelCase responses, missing resources, and ownership isolation.

## k6 load testing

The commands below describe the original **Version 0 shared-account organization-read test**. For Version 1 mixed traffic and distinct accounts, use `npm run test:load:v1 -- -e USERS=100 -e DURATION=30s`; see [Version 1 instructions](docs/Version1/README.md).

Install [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) and make sure `k6 version` works in your terminal. k6 is a separate executable, not an npm dependency. Start PostgreSQL and the API using the local development commands above, then run this from the repository root:

```sh
npm run test:load -- --vus 50 --duration 1m
```

Change `50` to the number of concurrent virtual users you want to simulate, and `1m` to the run length (`30s`, `5m`, etc.). Each user repeatedly performs one authenticated `GET /organizations/:id`, then waits one second. Virtual users are concurrent users, not a fixed requests-per-second target; achieved throughput depends on response time. Without CLI flags, the defaults are 10 users for 30 seconds. k6 prints request rate, latency, failed requests, and check results at the end. See the [k6 CLI examples](https://grafana.com/docs/k6/latest/get-started/running-k6/) for the underlying flags.

The default API URL is `http://localhost:3001`. To use another test environment:

```sh
npm run test:load -- --vus 100 --duration 2m -e BASE_URL=http://localhost:3001
```

Before generating traffic, the test registers one unique account and creates one organization. These records remain in the database because the API has no delete endpoints. To reuse an existing organization without creating data, supply its owner's JWT and its ID. In PowerShell, environment variables avoid putting the token in the command itself:

```powershell
$env:TOKEN = "<owner-jwt>"
$env:ORGANIZATION_ID = "<organization-uuid>"
npm run test:load -- --vus 50 --duration 1m
Remove-Item Env:TOKEN, Env:ORGANIZATION_ID
```

Supply both `TOKEN` and `ORGANIZATION_ID`, or neither. Setup verifies access before the load starts. The test requires at least one organization read and exits with a failure if organization reads have a failure rate of 1% or more, a 95th percentile latency of 500 ms or more, or a check pass rate of 99% or less. Setup requests are excluded from those thresholds.

To save metrics safely, add `-e SUMMARY_PATH=load.summary.json`. The custom export includes numerical metrics and threshold failure flags, and prints metrics to the console. Avoid `--summary-export`: it also saves the real API JWT returned by setup. Test tokens grant access to the test account's data and must stay out of Git.

For the recorded Docker experiment with 1 CPU and 1 GiB per container, including a reusable multi-user matrix runner, see [Version 0 architecture and test notes](docs/Version0/README.md).

If you prefer Docker instead of installing k6, run this PowerShell command from the repository root with the API already running on the host:

```powershell
docker run --rm --mount "type=bind,source=${PWD}/apps/api/tests/k6,target=/scripts,readonly" grafana/k6:2.3.0 run --vus 50 --duration 1m -e BASE_URL=http://host.docker.internal:3001 /scripts/organization-read.k6.js
```

## Endpoints

JSON request bodies use `Content-Type: application/json`; `POST /documents/upload` uses multipart fields `organizationId`, `title`, and `file`. Register and login return `{ user, token }`. Use `Authorization: Bearer <token>` for resource endpoints. Users can only access organizations they own and their conversations/documents. Public health endpoints and the complete Version 1 route list are documented in [the architecture](docs/Version1/architecture.md).

| Method | Path                 | JSON body                                                                                                                                                                 |
| ------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/register`          | `{ "name": "Ankit", "email": "ankit@example.com", "password": "password123" }`                                                                                            |
| POST   | `/login`             | `{ "email": "ankit@example.com", "password": "password123" }`                                                                                                             |
| POST   | `/organizations`     | `{ "name": "Acme Support" }`                                                                                                                                              |
| GET    | `/organizations/:id` | None                                                                                                                                                                      |
| POST   | `/conversation`      | `{ "organizationId": "<UUID>", "customerEmail": "customer@example.com", "subject": "Order question", "messages": [{ "role": "user", "content": "Where is my order?" }] }` |
| GET    | `/conversation/:id`  | None                                                                                                                                                                      |
| POST   | `/documents`         | `{ "organizationId": "<UUID>", "title": "Refund policy", "content": "Refunds are available within 30 days." }`                                                            |

Create routes return `201` and the saved object, including its `id`. GET routes return the saved object. Response fields use camelCase. `messages` is optional and defaults to `[]`; supported roles are `user` and `assistant`. Tokens expire after seven days. Passwords must have 8-128 characters and are hashed with scrypt.

Errors return `{ "error": "..." }`: `400` for invalid input, `401` for authentication failures, `404` for missing/inaccessible resources, `409` for an already registered email, and `413` for oversized request bodies.

Conversations and documents are stored as submitted JSON/text; AI replies and document parsing are outside this MVP.

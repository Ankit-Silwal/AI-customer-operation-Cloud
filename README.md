# AI Customer Operation Cloud

TypeScript monorepo with an Express 5 API, PostgreSQL persistence, and a Next.js docs app. The API implements registration, login, organizations, conversations, and documents.

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
  docs/                        # Next.js app using TypeScript
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

API: `http://localhost:3001`. Docs: `http://localhost:3000`.

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

The API tests exercise all seven routes through the actual controllers, services, and SQL repositories. Without `TEST_DATABASE_URL`, tests use an isolated PostgreSQL emulator. Set `TEST_DATABASE_URL` to run the same suite against PostgreSQL; each test creates and drops its own random schema. The database role must be allowed to create schemas.

Tests cover password hashing, registration/login, JWT rejection, duplicate emails, input validation, malformed/oversized JSON, persistence, camelCase responses, missing resources, and ownership isolation.

## Endpoints

All request bodies use `Content-Type: application/json`. Register and login return `{ user, token }`. Use `Authorization: Bearer <token>` for the other endpoints. Users can only access organizations they own and their conversations/documents.

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

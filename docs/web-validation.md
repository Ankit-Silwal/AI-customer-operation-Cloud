# Web and workflow verification

Verified on 23 October 2026 using Node 24, Docker Desktop Linux containers, PostgreSQL, authenticated Redis, Qdrant and the real `BAAI/bge-small-en-v1.5` embedding model. This pass covers product workflows; no load balancer, additional database server or scaling work was added.

## Results

| Check                                   | Result                               | What it establishes                                                                                              |
| --------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Monorepo production build               | Passed, 7 tasks                      | Compiled Node services, shared runtime and both Vite clients                                                     |
| Monorepo type checks                    | Passed, 13 tasks                     | Domain apps and browser/server TypeScript compile                                                                |
| Monorepo lint                           | Passed, 8 tasks                      | Existing ESLint checks and the new web packages' TypeScript checks                                               |
| Node integration suite                  | 38 entries passed, no failures/skips | Disposable PostgreSQL/Redis; auth, ownership, uploads, pagination, atomic replies and rate protection            |
| Python RAG suite                        | 12 passed inside the RAG image       | RAG contracts, Redis admission/leases and actual chunked-body size enforcement                                   |
| Live service smoke check                | 27 passed                            | Gateway, separate domain services, real embedding/indexing/retrieval, tenant isolation and upload/download bytes |
| Live rate-limit check                   | 4 passed                             | Login normalization/spoof resistance, upload and RAG quotas before expensive work                                |
| Browser tests against production Docker | 5 passed                             | Both real websites, persisted workflows, browser security, mobile layouts and automated accessibility checks     |
| HTTP dependency failure simulation      | 10 passed                            | Real web server and company API client against local Postman gateway failure responses                           |
| npm dependency audit                    | 0 vulnerabilities reported           | Installed lockfile's current registry advisory results                                                           |

The runner includes the historical empty security test file in its Node entry count. The four added workflow/security checks exercise owner-scoped pagination and metadata, concurrent reply appends, purpose-scoped frontend identity signatures, and source deletion with cleanup failure retention and upload cascading. Only one simultaneous append with the same `expectedCount` succeeds; the other returns `409`. Valid frontend address signatures require the explicit gateway trust flag; wrong purposes, changed identities and request-ID replays use the socket address.

The browser suite ran against `customer-ops-web:local` and `customer-ops-demo:local`, with production security headers enabled. It covers account creation/logout, workspace creation/switching, knowledge creation and indexing, real source search, conversation creation/replies/reload, byte-exact Markdown upload/download, cross-workspace isolation, missing/foreign Origin rejection, HTTP-only cookies, absence of bearer tokens in auth responses, and rejection of arbitrary proxy paths. The updated playground preserves three visible question/reply pairs, sends two then four historical messages for follow-ups, and clears them with New chat. Source deletion was exercised through both the row action and preview, including cancellation, byte removal, an empty subsequent search, and a real Qdrant point count of zero. A focused repeat also checks the mobile chat layout. Company checks cover saved pieces, product details, persistent policy chat, separate visitor history, mobile fit and dialog keyboard dismissal. Axe reported zero WCAG 2 A/AA and 2.1 AA violations in the tested screens. This is automated coverage, not a complete screen-reader or manual accessibility audit. Screenshots were visually inspected.

The failure simulation invokes the actual Express web app and shared HTTP client over HTTP. It verifies `429` with preserved `Retry-After`, JSON `503`, HTML dependency errors converted into safe JSON `503`, upstream `401`, connection refusal, a hanging readiness dependency bounded below 1.8 seconds while liveness remains `200`, demo initialization failure without exposing credentials, and actual document-cleanup HTTP client handling of RAG `429`/`503` failures. The mock is a repository-owned diagnostic based on the gateway's error contract; it does not contact an external provider. Postman request events confirmed `/login`, `/register`, `/me`, `/organizations` and `/health/ready` were reached.

The final Compose stack has the gateway, core, conversation, document, RAG and both websites running with healthy probes. Redis is internal-only again after host development. PostgreSQL and Qdrant retain their existing loopback development ports and persistent volumes. This pass did not migrate or delete existing data; browser/smoke checks create isolated test accounts and records.

## Repeat

Start the production stack and then run the checks serially. Build and type checking both generate Prisma clients; running separate Turbo invocations for them simultaneously can race on Windows. An initial overlapping validation hit that race; the serial, cache-bypassed build and subsequent type checks passed.

```sh
docker compose up --build -d --wait --wait-timeout 600
npm install
npm run build -- --force
npm run check-types
npm run lint
npm audit
npm test
npx playwright install chromium
docker compose -f compose.yaml -f compose.browser-test.yaml up -d --wait --wait-timeout 600
npm run test:web
docker compose up -d --wait --wait-timeout 600
node --import tsx apps/api/scripts/check-microservices.ts --rag
node --import tsx apps/api/scripts/check-rate-limits.ts
```

Browser checks default to http://localhost:3030 and http://localhost:3035. Override `WEB_TEST_URL` and `DEMO_TEST_URL` when testing different addresses. Tests create durable sample records, so use a development/test deployment. They honor normal service limits; repeated runs may need time for registration/IP or RAG budgets to refill. Reports, traces and screenshots are ignored under `.local-validation/`.

Run the reusable local failure simulation in one terminal (Postman CLI 1.70+):

```sh
postman simulation run postman/simulations/web-failures.sim.yaml --port 4901 --output ndjson
```

In another terminal:

```sh
npm run build --workspace @repo/service-common
npm run build --workspace @repo/web-runtime
npm run test:web:failures
```

Stop the simulation after testing. It is local-only and needs no provider credentials or shared Postman workspace publication. Its traffic is diagnostic and must not be substituted for the real gateway in production. Python test commands and earlier Redis outage/restart verification are in [rate limiting](rate-limiting.md) and [service verification](microservices-validation.md).

## Source deletion and chat follow-up

The new route contracts are `DELETE /documents/:id`, `DELETE /rag/documents/:id/index`, and `POST /rag/chat`. Chat uses the existing generation budget when Gemini is configured, or the search budget in retrieval-only mode; a new Redis-backed regression proves the new endpoint cannot bypass either existing budget. The Python suite validates paired/bounded history and tenant/document deletion filters. The document suite verifies that failed cleanup leaves the original downloadable and that successful deletion cascades its upload bytes.

One initial browser run exposed mixed signing secrets between the current `.env` and previously running containers. All services were recreated consistently; the private demo account password was preserved in ignored configuration across that signing-key rotation. PostgreSQL kept its working host port 5433 after the copied example's 5432 mapping was unavailable. The next complete browser run passed, followed by the focused mobile/chat repeat. An additional Python run found the disposable Redis container absent; restarting it and running on the test Docker network produced all 12 passing checks. These were configuration/test-fixture failures; they are not omitted from the validation record.

To repeat Python checks without depending on Docker Desktop's host forwarding:

```sh
docker compose -p customer-operation-cloud-test -f compose.test.yaml up -d --wait redis-test
docker run --rm --network customer-operation-cloud-test_default -e JWT_SECRET=local-rag-test-secret-at-least-32-characters -e TEST_REDIS_URL=redis://redis-test:6379 customer-ops-rag:local python -m unittest discover -s tests -p "test_*.py" -v
docker compose -p customer-operation-cloud-test -f compose.test.yaml down
```

## Remaining external validation

The final stack loads the configured Gemini key, while embeddings remain local BAAI and storage remains Qdrant. No paid generation call was made in this pass. Browser checks used `compose.browser-test.yaml` to disable generation explicitly while retaining real BAAI/Qdrant operations; the override was removed afterward. The actual Gemini-compatible SDK client completed a three-turn conversation against the local Postman simulation, which rejects the diagnostic follow-ups if prior messages are missing. Google account permissions, model access and answer quality still need live-provider verification. Without a key, both interfaces label retrieved policy passages as policy lookup.

The demo is a fictional integration, with no checkout, payment, order system or email delivery. Saved agent replies persist in the inbox; they are not outbound emails. Documents are immutable, so policy revisions are added as new sources. Production retention, backups, deployment TLS and production load capacity remain operational work; these checks establish the implemented workflows and failure behavior.

API checks follow the Postman API Engineer workflow, with the reusable [local failure simulation](../postman/simulations/web-failures.sim.yaml) committed alongside the implementation. No Postman workspace resources were published.

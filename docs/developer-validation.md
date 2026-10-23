# Developer API and email OTP validation

The developer portal runs at http://localhost:3040. External integrations use http://localhost:3001/v1. API-key creation is free in workspace Settings. The company demo reads its own ignored `apps/company-demo/.env`; its blank HEARTH_API_KEY is intentionally left for the operator to fill in.

## Executed checks

- `npm test`: 42 passing Node test entries with disposable real PostgreSQL and Redis. New coverage includes hashed key storage, owner isolation, concurrent five-key admission, expiry/revocation, Nodemailer delivery to a local SMTP receiver, OTP replay/concurrent consumption, binding, replacement, expiry, five-attempt lockout, recipient budgets, delivery failure cleanup, password reset/change, and invalidation of earlier sessions.
- `npm run test:developer:api`: 44 passing checks against the running Docker services. Exercises scoped keys, isolation between two workspaces owned by the same account, text source creation/indexing/chat/deletion, follow-up history, multipart upload/download, conversation concurrency, missing SMTP, revocation, and session invalidation through the real document/conversation-to-core HTTP checks. The test revokes its disposable key on exit.
- `npm run test:web`: 9 passing Chromium workflows across Hearth, the developer portal and the company storefront. Covers three-turn sandbox chat, no-key OTP verification, free key creation/use/revocation, forgot-password and password-change configuration errors, document workflows, persistent company chat, exact-Origin checks, mobile layouts and automated WCAG checks. New text contrast and keyboard-scroll issues found by these checks were corrected. A final targeted rerun also passed both portal workflows with desktop and mobile accessibility assertions.
- RAG: 12 passing Python tests with real Redis; local BAAI/Qdrant were also exercised by the live API and browser workflows.
- Postman `web-failures.sim.yaml`: 6 developer API dependency checks plus 10 existing web/deletion checks. Runs the real HTTP clients against the repository's local diagnostic mock. Covers authorization failure, missing scope, malformed HTML, retry headers, document-service failure, refused connections, and bounded readiness. Mocked provider evidence is separate from the live Docker checks.
- Workspace build, TypeScript checks and lint passed. Dependency installation and the final runtime audit reported zero vulnerabilities. The OpenAPI JSON parsed and all local references resolved across 14 operations. All six Node application images built, and Compose readiness checks passed.

Browser and live chat tests used `compose.browser-test.yaml`, which disables Gemini generation during checks. They used real local embeddings and Qdrant, and verified retrieval responses and history acceptance. Provider generation was already checked separately in the RAG provider simulation; these browser tests do not establish live Gemini answer quality or availability. Normal Compose settings restore the operator's configured Gemini key after validation.

SMTP success was tested with **Nodemailer over a real local SMTP socket**, without sending email to anyone. Real SMTP credentials, provider acceptance, TLS connectivity and inbox delivery remain to be verified when the operator supplies settings. Missing SMTP returns a clear 503 and never fabricates delivery. The public sandbox OTP displays a demo code and sends no email.

## Reproduce

```sh
npm test
npm run build
npm run check-types
npm run lint

# Requires the local Compose stack with SMTP still unconfigured.
docker compose -f compose.yaml -f compose.browser-test.yaml up -d --wait
npm run test:developer:api

# Temporarily configures the external company demo without touching its .env.
npm run test:web:company:prepare
npm run test:web
npm run test:web:company:cleanup

# Local diagnostic HTTP stand-ins; run in a separate terminal.
postman simulation run postman/simulations/web-failures.sim.yaml --port 4901 --output ndjson
npm run test:developer:failures
npm run test:web:failures

# Restore normal generation settings after the checks.
docker compose up -d --no-deps --force-recreate rag
```

The company fixture stores a disposable key only under ignored `.local-validation`, revokes it during cleanup, and restores `apps/company-demo/.env`. Browser reports, traces, screenshots, simulation logs and local secrets are ignored by Git. No existing application data was moved or deleted; database changes add API-key storage and an account session version column. Existing historical documentation deletions were left untouched.

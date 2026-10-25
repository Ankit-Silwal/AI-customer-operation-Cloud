---
name: verify
description: Run this repo's validation sequence (types, lint, tests, build, and optionally the Docker stack smoke checks) before declaring a change done.
---

Run from the repo root and stop at the first failure, reporting its output:

1. `npm run check-types`
2. `npm run lint`
3. `npm test` (needs Docker; uses disposable Postgres/Redis on 55433/55479)
4. `npm run build`

If the change touches Compose, nginx, Dockerfiles, inter-service HTTP or the RAG app, also run the stack checks:

5. `docker compose up --build -d --wait --wait-timeout 600`
6. `node --import tsx apps/api/scripts/check-microservices.ts --rag`
7. `node --import tsx apps/api/scripts/check-rate-limits.ts`
8. For RAG changes: `docker compose run --rm --no-deps rag python -m unittest discover -s tests -p "test_*.py"` (with the test Redis from `compose.test.yaml` and `TEST_REDIS_URL=redis://host.docker.internal:55479`).

Report what passed, what failed (with output), and anything skipped.

# Version 1 validation record

Validation date: **2026-10-12**. Package version: **1.0.0**.

This file records development checks. **No Version 1 k6 load campaign has been executed, and no `results/` directory has been created.** Performance measurements are deferred until requested. The mocked k6 lifecycle check below verifies script behavior, not service throughput.

## Completed checks

| Check                           | Result                         | Evidence / scope                                                                                                              |
| ------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| API type checking               | Passed                         | `npm run check-types --workspace @repo/api`                                                                                   |
| API lint                        | Passed                         | `npm run lint --workspace @repo/api`                                                                                          |
| Compiled API build              | Passed                         | TypeScript output and SQL/migration assets copied into `dist`                                                                 |
| Real PostgreSQL 17 suite        | 23 passed, 0 failed, 0 skipped | Disposable Docker PostgreSQL; isolated schema per database test                                                               |
| Default in-memory suite         | 20 passed, 0 failed, 3 skipped | Real-PostgreSQL-only checks are intentionally skipped without `TEST_DATABASE_URL`                                             |
| Docker image build              | Passed                         | `docker build -f apps/api/Dockerfile -t customer-operation-api:version1 .`                                                    |
| Compiled Docker API smoke check | 16 HTTP checks passed          | API at 1 CPU / 1 GiB; real PostgreSQL; health, two distinct accounts, three upload formats, downloads and ownership rejection |
| k6 steady configuration         | Passed inspection              | `USERS=100`, `DURATION=30s`: max 100 VUs                                                                                      |
| k6 spike configuration          | Passed inspection              | Ramp to 100 VUs in 5s, hold 30s, ramp down in 5s                                                                              |
| k6 soak configuration           | Passed inspection              | 10 VUs, default 30-minute steady period                                                                                       |
| k6 lifecycle correctness        | Passed with HTTP double        | Actual script provisions 100 distinct accounts and exercises 20 actions per VU across all eight operations                    |
| Runtime API dependency audit    | No vulnerabilities             | API production dependencies only; this is not a whole-monorepo audit claim                                                    |

The Docker smoke check was functional traffic, not a timed concurrency test. Its request count cannot establish capacity or latency percentiles. The test PostgreSQL container was not resource-limited to 1 GiB/1 CPU; only the smoke-test API had those limits. No comparison to the prior limited-container performance runs is implied.

A fresh container using the final image successfully repeated startup against the same test database, passed its readiness healthcheck command, and reached Docker health status `healthy`. Runtime log records parsed as JSON and did not expose the ephemeral JWT signing secret or Bearer credentials.

## What the tests establish

- Registration/login, password hashing, JWT rejection, duplicate email handling and owned organization/conversation/document behavior remain covered.
- Health/readiness handle database failure, a stalled probe and draining; invalid pool configuration is rejected.
- Responses include request IDs and security headers; unexpected errors are generic, and JSON logs omit sensitive request/SQL details.
- Text, Markdown and PDF uploads round-trip original bytes and metadata. Another account cannot read, download or upload into the first account's organization.
- Unsupported files, invalid PDF signatures/UTF-8/control characters, empty/missing files and files over 1 MiB are rejected.
- Database constraints reject invalid direct writes. Repeated initialization does not reapply migration 1.
- Existing valid Version 0 rows survive migration, and expected relationship/file indexes remain present. Invalid legacy data causes startup migration rollback without deleting those rows.
- On real PostgreSQL, failing file persistence rolls back the associated document metadata.
- The k6 lifecycle test confirms distinct account provisioning and VU/account ownership using an in-process HTTP double. Real k6 inspection confirms installed-engine configuration parsing; neither runs the load function against a server.
- Custom summary exports exclude setup credentials while retaining numeric metrics and threshold flags.

Node's reported 23 includes the pre-existing empty `security.test.ts` file as one passing file entry; it is not 23 substantive security scenarios.

## Reproduce functional checks

From the repository root, run the type/lint/build/default test commands in the [README](README.md). For real PostgreSQL checks:

```powershell
docker compose -p customer-operation-cloud-test -f compose.test.yaml up -d --wait
$env:TEST_DATABASE_URL = "postgresql://customer_ops_test:customer_ops_test@localhost:5433/customer_ops_test"
try {
  npm run test --workspace @repo/api
} finally {
  Remove-Item Env:TEST_DATABASE_URL
  docker compose -p customer-operation-cloud-test -f compose.test.yaml down
}
```

These are disposable test database credentials, not deployment credentials. Port 5433 must be free. Tests require a role allowed to create temporary schemas. The dedicated test container uses temporary storage and does not use the normal Compose PostgreSQL volume.

To inspect the k6 configuration without HTTP traffic:

```powershell
k6 inspect --execution-requirements -e USERS=100 -e DURATION=30s apps/api/tests/k6/version1-mixed.k6.js
```

When load runs are authorized, record the workload, dataset, account count, actual resource limits, generator location, duration, throughput, failures, p95/p99 and resource observations. Do not infer Version 1 capacity from Version 0 results or from these correctness checks.

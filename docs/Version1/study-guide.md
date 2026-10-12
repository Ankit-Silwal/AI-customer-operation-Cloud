# Study guide: understand one step at a time

## 1. Follow one organization read

Start with `GET /organizations/:id` rather than reading every source file.

1. The client sends the organization ID and Bearer token.
2. Middleware assigns a request ID and adds security headers.
3. Authentication verifies the JWT and puts the user ID in response locals.
4. The controller validates the UUID.
5. The service asks the repository for this user's organization.
6. The repository runs parameterized SQL using a pooled connection.
7. PostgreSQL returns the matching row, or no row if it is missing/belongs to somebody else.
8. The API returns 200 or 404, and records a JSON completion log.

Read [app.ts](../../apps/api/src/app.ts), then the organization router, controller, service and repository in [the organizations module](../../apps/api/src/modules/organizations). Ask: which layer knows HTTP? Which layer knows SQL? Which layer decides that a missing row is 404?

## 2. Give each pretend person an identity

The Version 0 read test shared one account and organization. That was useful for measuring one repeated read, but did not represent many independent customers.

Version 1 `setup()` creates separate accounts and resources. With 100 VUs, accounts 1–100 exist. VU 1 uses account 1 throughout its loops; VU 2 uses account 2. None registers again each second. Account creation is setup; repeated reads, writes and occasional login are the workload.

Read [version1-mixed.k6.js](../../apps/api/tests/k6/version1-mixed.k6.js). Find `accounts[exec.vu.idInTest - 1]`: this is the connection between a worker number and its credentials. Find the checks that reject duplicate user and organization IDs. This script assumes one local generator and one scenario.

## 3. Follow one upload

Suppose Alice uploads `notes.md` to her organization. Her token is checked before the file is buffered. Multipart fields are parsed, the UUID/title and UTF-8 file are validated, and ownership is checked in SQL. A transaction creates the document and saves the original bytes. Commit makes both durable together.

Alice's `GET /documents/:id` returns metadata and text. Her download returns the original bytes as an attachment. Bob receives 404 for either route, even if he knows the document ID. The [upload tests](../../apps/api/tests/uploads.test.ts) exercise this through HTTP and real repositories.

## 4. Understand the database's second line of defense

Read the [original schema](../../apps/api/src/database/schema.sql) for tables, keys and indexes. Then read [migration 1](../../apps/api/src/database/migrations/001-version1.sql) for new constraints and file storage.

Try to explain why these are different: primary key, foreign key, unique constraint, check constraint and index. A primary key identifies a row; a foreign key requires a related row; unique prevents duplicates; check enforces a rule; an index helps lookup. Some constraints create indexes automatically.

Startup records the migration after applying it in a transaction. It does not repeat the same ALTER TABLE every restart. [Migration tests](../../apps/api/tests/migration.test.ts) verify that valid older rows survive and invalid older rows cause rollback.

## 5. Learn to investigate a failed request

Find its `X-Request-ID` in the response, then its `http_request` log. Look at status, route and duration. For an unexpected error, look for the corresponding `request_error` event and safe error code. Do not log tokens or request bodies to investigate.

Check `/health/live` and `/health/ready`. If live is 200 but ready is 503, the process responds but cannot currently pass its database readiness check. Next inspect database availability and pool/query errors rather than assuming the entire Node process has crashed.

For a slow endpoint, examine pool waiting counts and both API and database resource use. An increasing waiting count is a clue, not proof that a larger pool is the solution.

## 6. Read a load report without guessing

First ask whether useful requests actually happened and all workload types were exercised. Next check failed requests and correctness assertions. Then read p95/p99 and throughput together. Finally compare CPU/RAM, pool waits and database query behavior to identify where waiting starts.

Use filtered `phase:load` metrics for workload conclusions. Global metrics also include setup and expected 400/401/404 validation requests. A global failure rate may therefore differ from the load failure rate.

Each 20-action cycle includes eight organization reads, three conversation reads, two document metadata reads, one download, two conversation writes, one JSON document write, two uploads and one login. The action offset spreads these across VUs. New writes add rows over time; seed reads continue using that VU's initial resources.

`0.99` has different meanings depending on its metric: a failure/check rate is a fraction, while a counter rate is per second. `p(95)<500` uses milliseconds. Revisit the metric table in [concepts](concepts.md) whenever the units are unclear.

## 7. Plan the next experiment when results are authorized

Begin with a small distinct-account baseline, then increase concurrency while keeping the duration, dataset, limits and generator placement consistent. Use a longer steady run to find sustained behavior and a spike run to inspect sudden demand. Compare against the same Version 1 workload after a change; Version 0's shared-account read-only numbers are a different experiment.

A one-second think time means 100 VUs do not guarantee exactly 100 requests/second. Higher latency reduces the achieved rate. “One million accounts” also does not mean “one million simultaneous HTTP requests.” Define concurrency, action rate, request sizes, response-time goals and acceptable failure rate separately.

A test from another laptop separates generator and server resources. A same-network Docker test is useful for API/database behavior; a host or remote test additionally exercises the published-port/network path. Neither alone proves a cloud provider's capacity.

Version 1 load runs and a results folder are intentionally deferred. Use [testResult.md](testResult.md) to distinguish completed functional checks from future performance experiments.

## Official references

- [k6 execution and VU identifiers](https://grafana.com/docs/k6/latest/javascript-api/k6-execution/)
- [k6 lifecycle: setup versus iterations](https://grafana.com/docs/k6/latest/using-k6/test-lifecycle/)
- [node-postgres connection pool](https://node-postgres.com/apis/pool)
- [Express multipart uploads with Multer](https://expressjs.com/en/resources/middleware/multer/)

# Version 1: a safer API and more realistic testing

The root package and `@repo/api` now use version **1.0.0**. Version 1 adds health/readiness, security headers, request IDs, JSON logs, database constraints, bounded connection pooling, and actual Text, Markdown and PDF uploads. The API still runs as one modular Express application backed by PostgreSQL.

## Read these in order

1. [Study guide](study-guide.md): follow one request and learn the vocabulary.
2. [Architecture](architecture.md): see the components, routes and data model.
3. [Concepts](concepts.md): understand the reasoning behind each feature.
4. [Validation record](testResult.md): see which checks actually ran.

**Version 1 load testing is complete: 30 stages, 20 passed and 10 failed thresholds.** The [test results](testResult.md) retain every campaign, with raw evidence and readable stage reports in [results/](results/helper.md). The tests repeat Version 0's three read campaigns and add distinct-account mixed traffic, spikes and a five-minute steady repeat. The compiled API passed 39 HTTP smoke checks and 12 database-recovery/API-restart checks. Version 0 results describe the older API and cannot establish Version 1 capacity.

## Start and check the API

Use Node 24+, npm 11 and PostgreSQL 17. Copy the root `.env.example` to `.env` if you do not already have one. Set a random `JWT_SECRET` of at least 32 characters; keep `.env` out of Git. Preserve existing credentials if the database already contains data.

```powershell
npm ci
npm run dev --workspace @repo/api
```

The local `DATABASE_URL` must point to the **host port actually published by PostgreSQL**. PostgreSQL listens on port 5432 inside its container; a host port of 5433 means a mapping such as `5433:5432`, and a local URL ending in `localhost:5433/customer_ops`. A containerized API instead connects to the database service name and internal port, such as `postgres:5432`.

```powershell
Invoke-RestMethod http://localhost:3001/health/live
Invoke-RestMethod http://localhost:3001/health/ready
npm run check-types --workspace @repo/api
npm run lint --workspace @repo/api
npm run build --workspace @repo/api
npm run test --workspace @repo/api
```

Schema startup uses a transaction and a migration record. Valid existing Version 0 rows are preserved. If legacy rows violate a new constraint, startup fails and the migration rolls back; correct the offending data before restarting. The API never silently deletes those rows.

## Upload documents

`POST /documents/upload` accepts multipart fields `organizationId`, `title`, and one `file`. Authenticate with the organization's owner's Bearer token. Accepted extensions/MIME types are `.txt` / `text/plain`, `.md` / `text/markdown` or `text/plain`, and `.pdf` / `application/pdf`. Maximum file size is **1 MiB = 1,048,576 bytes**. Text must be valid UTF-8 and at most 200,000 characters.

With `$env:TOKEN` and `$env:ORGANIZATION_ID` already populated in your terminal:

```powershell
curl.exe -X POST http://localhost:3001/documents/upload -H "Authorization: Bearer $env:TOKEN" -F "organizationId=$env:ORGANIZATION_ID" -F "title=Study notes" -F "file=@notes.txt;type=text/plain"
```

Use the returned document ID with `GET /documents/:id` for metadata/text or `GET /documents/:id/download` for the original bytes. Downloads use attachment headers. PDF uploads retain bytes and metadata; their `content` field is empty because PDF text extraction is not implemented. The existing JSON `POST /documents` still works; JSON-only documents have no downloadable file.

## k6 commands

These commands **generate traffic when you run them**. Start the Version 1 API and a disposable test database first. Check that `k6 version` works. From the repository root:

```powershell
# 100 VUs; each has a different registered account and organization.
npm run test:load:v1 -- -e USERS=100 -e DURATION=30s

# Burst: ramp up for 5s, hold 100 VUs for 30s, ramp down for 5s.
npm run test:load:v1 -- -e USERS=100 -e PROFILE=spike -e DURATION=30s

# Longer steady traffic; default soak duration is 30 minutes.
npm run test:load:v1 -- -e USERS=100 -e PROFILE=soak -e DURATION=30m
```

From `apps/api`, the same `npm run test:load:v1 -- ...` command works. Use `USERS` and `DURATION` for Version 1, rather than `--vus`/`--duration`; the script checks consolidated options so overrides cannot silently break the account mapping. Use a single local k6 process. Distributed execution is not implemented.

| Setting         | Default                 | Meaning                                                       |
| --------------- | ----------------------- | ------------------------------------------------------------- |
| `USERS`         | `10`                    | Positive integer: maximum VUs and number of distinct accounts |
| `DURATION`      | `30s`; soak `30m`       | Steady/soak duration; spike's hold duration                   |
| `PROFILE`       | `steady`                | `steady`, `spike`, or `soak`                                  |
| `BASE_URL`      | `http://localhost:3001` | API address visible from the load generator                   |
| `THINK_TIME`    | `1`                     | Seconds each VU waits after one action; zero removes the wait |
| `SETUP_BATCH`   | `5`                     | Parallel setup requests, limited to 1–20                      |
| `SETUP_TIMEOUT` | `20m`                   | Time available to provision accounts and seed resources       |
| `SUMMARY_PATH`  | unset                   | Optional metrics-only JSON export path                        |

Setup registers one account, creates one organization, one conversation, and one uploaded document for each VU. It checks health, invalid input and account isolation. All setup completes before concurrent load begins. Accounts and generated writes remain in the database because there are no delete endpoints.

Each VU repeats a 20-action cycle: 14 reads, five writes and one login. Different VUs start at different positions. This is a **70% read / 25% write / 5% login mix over completed cycles**, not a promise of the exact mix in a short or interrupted run. One iteration performs one HTTP action and then sleeps. Run long enough to exercise all action types: a very short one-VU test will fail the coverage thresholds if writes or login never occur.

Pass criteria are at least one load request of each kind, fewer than 1% failed load requests, more than 99% passed load checks, read p95 below 500 ms, and write/login p95 below 1,000 ms. These are learning targets, not measured service guarantees. Setup and intentional validation failures are excluded using `phase:load` tags; unfiltered global metrics still include them.

Do not use `--summary-export`, HTTP debugging or raw setup-data dumps: they can expose live JWTs. The custom `handleSummary` exports only numeric metrics and threshold flags. A JWT is a signed access credential, not a readable copy of `JWT_SECRET`. Keep both private.

Docker k6 can connect through the internal Compose network using `BASE_URL=http://api:3001`; the host can connect using `localhost:3001`. The network name and API service must match your running stack. Running k6 on another computer separates its CPU/RAM usage from the server. At large account counts, k6's per-VU setup-data copies also consume memory; observe the load generator as well as the API.

## Repeat the recorded campaigns

The [full test report](testResult.md) records all executed stages and the reproduction settings. The matrix runner now defaults to a timestamped directory under `docs/Version1/results/` and refuses an existing campaign directory. Every stage retains a safe metrics summary, console log, Docker samples, API log observations and before/after container states. It pauses five seconds between stages and continues after threshold failures.

Use [compose.benchmark.yaml](../../compose.benchmark.yaml) for an isolated API on host port 3002 and PostgreSQL on 5434. Each server is capped at 1 CPU and 1 GiB. This stack has its own persistent database volume and does not use the development database. Set a temporary random signing secret when starting it, and keep it out of logs.

```powershell
$env:JWT_SECRET = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
docker compose -p customer-operation-cloud-v1-benchmark -f compose.benchmark.yaml up --build -d --wait
Remove-Item Env:JWT_SECRET
$env:COMPOSE_PROJECT_NAME = 'customer-operation-cloud-v1-benchmark'
$env:COMPOSE_FILE = 'compose.benchmark.yaml'
$env:BASE_URL = 'http://localhost:3002'
npm run test:load:matrix
```

| Matrix setting  | Meaning                                                                        |
| --------------- | ------------------------------------------------------------------------------ |
| `LOAD_WORKLOAD` | `organization-read` (default) or `mixed`                                       |
| `LOAD_USERS`    | Comma-separated VU counts; default `10,50,100,250,500,1000,2000`               |
| `LOAD_DURATION` | Duration of each load stage; default `30s`                                     |
| `LOAD_PROFILE`  | `steady` (default); mixed traffic also supports `spike` and `soak`             |
| `K6_EXECUTION`  | `native` (default) or `docker`                                                 |
| `BASE_URL`      | Native benchmark: `http://localhost:3002`; Docker benchmark: `http://api:3001` |
| `RESULTS_DIR`   | Optional new evidence directory; never reuse an earlier campaign               |

The read workload warms up for 10 seconds. Mixed traffic warms up for 30 seconds so its one VU reaches reads, writes and login. A matrix with any failing threshold returns exit 1 while preserving every conducted stage; the individual k6 threshold failure is exit 99.

For the isolated stack's real PostgreSQL functional suite, set `TEST_DATABASE_URL=postgresql://customer_ops_benchmark:customer_ops_benchmark@localhost:5434/customer_ops_benchmark` and run `npm run test --workspace @repo/api`. Temporary schemas are removed afterward. Run `node apps/api/scripts/check-version1-docker.ts` for compiled HTTP smoke checks, or add `--resilience` for controlled database-stop/recovery and API-restart checks. Run resilience checks after load traffic has finished. Rebuild the readable reports with `node apps/api/scripts/report-version1.ts --final` after the seven documented campaigns complete.

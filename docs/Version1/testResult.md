# Version 1 Docker and k6 test results

**12 Docker-backed load runs were conducted: 8 passed and 4 failed their thresholds.** The Version 0 read workload was repeated in 12 runs covering 182,880 organization reads. Version 1 mixed traffic was exercised in 0 runs covering 0 load requests. Testing is in progress; subsequent campaigns and conclusions will be added as they complete.

## Scope and environment

These experiments were actually executed on **13 October 2026** against package version **1.0.0**. Every conducted run, including warm-ups and failures, is listed with raw evidence. The API and PostgreSQL each had **1 GiB memory** (1073741824 bytes) and **1 CPU** (1000000000 NanoCPUs), verified by Docker inspect before every campaign.

The API image was built from the current Version 1 source. First campaign source commit: `6290edd7b65f46a0f7eedb798e51494ace93ad21`; each campaign records its own commit, local changes, image IDs and timestamps. The benchmark uses [compose.benchmark.yaml](../../compose.benchmark.yaml), project `customer-operation-cloud-v1-benchmark`, a fresh separate persistent database volume, API port **3002**, and database port **5434**. The existing development stack and database remain separate. Generated accounts and writes persist throughout the campaigns; the database is not reset between stages.

| Environment item       | Observed value                                                     |
| ---------------------- | ------------------------------------------------------------------ |
| Physical CPU           | AMD Ryzen 7 7445HS w/ Radeon 740M Graphics ; 12 logical processors |
| Host RAM               | 16,396,075,008 bytes (15.27 GiB)                                   |
| Docker engine / kernel | 29.0.1 / 6.6.87.2-microsoft-standard-WSL2                          |
| Docker resource pool   | 12 logical CPUs; 7.39 GiB RAM                                      |
| API runtime            | v24.21.0; Express 5; one API process                               |
| Database               | postgres (PostgreSQL) 17.11                                        |
| Load generator         | k6.exe v2.3.0 (commit/e088784614, go1.26.8, windows/amd64)         |
| API / DB limits        | 1 CPU + 1 GiB per container                                        |

This was a local shared-machine test, not an isolated cloud benchmark. The original development stack was also running. Generator placement, dataset size, test order and working-set warmth affect comparisons.

## Workload and criteria

Campaigns A–C repeat Version 0's [organization-read.k6.js](../../apps/api/tests/k6/organization-read.k6.js) with identical user counts, durations, thresholds and one-second think time. Setup registers one unique account, creates one organization and verifies access. All VUs in that stage share its token and read the same organization. It exercises JWT verification, ownership, SQL reads and JSON serialization.

Passing requires at least one read, failed reads below 1%, read p95 below 500 ms and checks above 99%. Each read makes two checks. Setup is excluded by operation tags.

Campaigns D–G run [version1-mixed.k6.js](../../apps/api/tests/k6/version1-mixed.k6.js): distinct account, organization, conversation and uploaded file per VU; 14 reads, five writes and one login per completed 20-action cycle. Reads include organizations, conversations, document metadata and original downloads; writes include conversations, JSON documents and Text/Markdown/PDF uploads. Each action is followed by one second of think time. All VUs' starting action is offset. Provisioning and expected 401/400/404 checks are outside phase:load.

Mixed passing requires every action kind to occur, failed load requests below 1%, load checks above 99%, read p95 below 500 ms and write/login p95 below 1000 ms. Each load request makes three checks. Its warm-up lasts **30 seconds**, so one VU reaches writes and login. Spike ramps up for five seconds, holds for the table duration and ramps down for five seconds. The five-minute soak is a short steady repeat; it does not establish day-long memory stability.

Read RPS and mixed load RPS are the tagged counter rates reported by k6. Setup requests are excluded from their counts, but **k6's counter-rate time denominator includes setup**. Mixed provisioning at high VU counts can therefore depress displayed RPS; do not interpret that column as a precise sustained load-window rate. Percentiles are reported separately for each stage and request kind. HTTP duration excludes initial connection/DNS and sleep; connection failures can have zero duration. Judge latency with errors.

Every campaign begins with a warm-up and pauses five seconds between stages. Resource samples and cgroup deltas cover setup, load and graceful completion. The generator has no explicit cap; Docker mode shares the VM pool. Native generator memory is not measured.

## Campaign A: Windows host through the published API port

Evidence directory: [Campaign A](results/01-windows-10-50-100-250-500-1000-2000-users-30s/summary.md), with [environment](results/01-windows-10-50-100-250-500-1000-2000-users-30s/environment.json) and [run manifest](results/01-windows-10-50-100-250-500-1000-2000-users-30s/runs.json). All planned stages completed.

| Run                                                                                              | VUs  | Time | Reads  | Read RPS | Avg ms | p95 ms | p99 ms   | Failed reads (%) | Checks passed | Result    |
| ------------------------------------------------------------------------------------------------ | ---- | ---- | ------ | -------- | ------ | ------ | -------- | ---------------- | ------------- | --------- |
| [A0](results/01-windows-10-50-100-250-500-1000-2000-users-30s/00-1vu-10s.summary.json) (warm-up) | 1    | 10s  | 10     | 0.98     | 3.69   | 4.19   | 4.24     | 0 (0.000%)       | 100.000%      | PASS (0)  |
| [A1](results/01-windows-10-50-100-250-500-1000-2000-users-30s/01-10vu-30s.summary.json)          | 10   | 30s  | 300    | 9.92     | 4.56   | 6.72   | 33.32    | 0 (0.000%)       | 100.000%      | PASS (0)  |
| [A2](results/01-windows-10-50-100-250-500-1000-2000-users-30s/02-50vu-30s.summary.json)          | 50   | 30s  | 1,500  | 49.51    | 5.53   | 13.64  | 46.80    | 0 (0.000%)       | 100.000%      | PASS (0)  |
| [A3](results/01-windows-10-50-100-250-500-1000-2000-users-30s/03-100vu-30s.summary.json)         | 100  | 30s  | 3,000  | 98.76    | 6.13   | 11.82  | 104.40   | 0 (0.000%)       | 100.000%      | PASS (0)  |
| [A4](results/01-windows-10-50-100-250-500-1000-2000-users-30s/04-250vu-30s.summary.json)         | 250  | 30s  | 7,500  | 243.85   | 13.80  | 85.35  | 188.63   | 20 (0.267%)      | 99.733%       | PASS (0)  |
| [A5](results/01-windows-10-50-100-250-500-1000-2000-users-30s/05-500vu-30s.summary.json)         | 500  | 30s  | 15,000 | 486.49   | 15.35  | 65.73  | 287.11   | 197 (1.313%)     | 98.687%       | FAIL (99) |
| [A6](results/01-windows-10-50-100-250-500-1000-2000-users-30s/06-1000vu-30s.summary.json)        | 1000 | 30s  | 28,745 | 923.71   | 58.47  | 228.88 | 429.12   | 1,206 (4.196%)   | 95.804%       | FAIL (99) |
| [A7](results/01-windows-10-50-100-250-500-1000-2000-users-30s/07-2000vu-30s.summary.json)        | 2000 | 30s  | 39,649 | 1,259.82 | 538.08 | 990.24 | 3,248.53 | 3,748 (9.453%)   | 90.547%       | FAIL (99) |

**PASS (0)** — 300 organization reads, 9.92 requests/second, read p95 6.72 ms, 0 failed requests (0.000%). Every configured load threshold passed.

**PASS (0)** — 1,500 organization reads, 49.51 requests/second, read p95 13.64 ms, 0 failed requests (0.000%). Every configured load threshold passed.

**PASS (0)** — 3,000 organization reads, 98.76 requests/second, read p95 11.82 ms, 0 failed requests (0.000%). Every configured load threshold passed.

**PASS (0)** — 7,500 organization reads, 243.85 requests/second, read p95 85.35 ms, 20 failed requests (0.267%). Every configured load threshold passed.

**FAIL (99)** — 15,000 organization reads, 486.49 requests/second, read p95 65.73 ms, 197 failed requests (1.313%). Failed criteria: `checks{operation:organization_read}: rate>0.99`, `http_req_failed{operation:organization_read}: rate<0.01`.

**FAIL (99)** — 28,745 organization reads, 923.71 requests/second, read p95 228.88 ms, 1,206 failed requests (4.196%). Failed criteria: `http_req_failed{operation:organization_read}: rate<0.01`, `checks{operation:organization_read}: rate>0.99`.

**FAIL (99)** — 39,649 organization reads, 1,259.82 requests/second, read p95 990.24 ms, 3,748 failed requests (9.453%). Failed criteria: `http_req_failed{operation:organization_read}: rate<0.01`, `checks{operation:organization_read}: rate>0.99`, `http_req_duration{operation:organization_read}: p(95)<500`.

## Campaign B: k6 inside the Docker network

Evidence directory: [Campaign B](results/02-docker-500-1000-2000-users-30s/summary.md), with [environment](results/02-docker-500-1000-2000-users-30s/environment.json) and [run manifest](results/02-docker-500-1000-2000-users-30s/runs.json). All planned stages completed.

| Run                                                                               | VUs  | Time | Reads  | Read RPS | Avg ms | p95 ms | p99 ms   | Failed reads (%) | Checks passed | Result    |
| --------------------------------------------------------------------------------- | ---- | ---- | ------ | -------- | ------ | ------ | -------- | ---------------- | ------------- | --------- |
| [B0](results/02-docker-500-1000-2000-users-30s/00-1vu-10s.summary.json) (warm-up) | 1    | 10s  | 10     | 0.99     | 2.48   | 3.20   | 3.27     | 0 (0.000%)       | 100.000%      | PASS (0)  |
| [B1](results/02-docker-500-1000-2000-users-30s/01-500vu-30s.summary.json)         | 500  | 30s  | 14,891 | 511.82   | 19.11  | 53.49  | 517.68   | 0 (0.000%)       | 100.000%      | PASS (0)  |
| [B2](results/02-docker-500-1000-2000-users-30s/02-1000vu-30s.summary.json)        | 1000 | 30s  | 29,474 | 1,014.60 | 31.59  | 149.62 | 429.61   | 0 (0.000%)       | 100.000%      | PASS (0)  |
| [B3](results/02-docker-500-1000-2000-users-30s/03-2000vu-30s.summary.json)        | 2000 | 30s  | 42,801 | 1,453.86 | 387.27 | 796.71 | 2,284.46 | 0 (0.000%)       | 100.000%      | FAIL (99) |

**PASS (0)** — 14,891 organization reads, 511.82 requests/second, read p95 53.49 ms, 0 failed requests (0.000%). Every configured load threshold passed.

**PASS (0)** — 29,474 organization reads, 1,014.60 requests/second, read p95 149.62 ms, 0 failed requests (0.000%). Every configured load threshold passed.

**FAIL (99)** — 42,801 organization reads, 1,453.86 requests/second, read p95 796.71 ms, 0 failed requests (0.000%). Failed criteria: `http_req_duration{operation:organization_read}: p(95)<500`.

## Campaign C: longer repeat and stress stage

Not yet executed.

## Campaign D: Version 1 mixed traffic on Windows

Not yet executed.

## Campaign E: Version 1 mixed traffic inside Docker

Not yet executed.

## Campaign F: Version 1 spike traffic

Not yet executed.

## Campaign G: Version 1 five-minute steady repeat

Not yet executed.

## Resource observations for every run

| Run | API max CPU | API max MiB | PostgreSQL max CPU | PostgreSQL max MiB | Samples API / DB | Generator max MiB |
| --- | ----------- | ----------- | ------------------ | ------------------ | ---------------- | ----------------- |
| A0  | 0.48%       | 25.36       | 3.68%              | 45.39              | 3 / 3            | not sampled       |
| A1  | 10.83%      | 26.64       | 6.97%              | 55.43              | 9 / 9            | not sampled       |
| A2  | 11.68%      | 39.21       | 6.36%              | 55.09              | 9 / 9            | not sampled       |
| A3  | 9.19%       | 46.83       | 7.41%              | 62.44              | 9 / 9            | not sampled       |
| A4  | 32.98%      | 67.16       | 13.71%             | 61.25              | 9 / 9            | not sampled       |
| A5  | 54.74%      | 93.07       | 18.34%             | 63.41              | 9 / 9            | not sampled       |
| A6  | 96.26%      | 77.51       | 41.33%             | 61.73              | 9 / 9            | not sampled       |
| A7  | 105.96%     | 114.10      | 50.59%             | 61.83              | 10 / 10          | not sampled       |
| B0  | 7.09%       | 105.90      | 3.73%              | 45.38              | 2 / 2            | 11.88             |
| B1  | 55.99%      | 77.06       | 18.68%             | 61.23              | 6 / 6            | 180.00            |
| B2  | 67.90%      | 81.70       | 29.64%             | 61.16              | 6 / 6            | 348.10            |
| B3  | 104.43%     | 112.40      | 46.61%             | 61.93              | 6 / 6            | 603.20            |

These are the highest sampled Docker values, not continuous peaks. Memory is MiB (1 GiB = 1024 MiB). Sampling uses a two-second pause plus Docker stats queries; Docker-generator collection adds query time. Samples can include the distinct-account setup phase, so maxima cannot always be attributed to load alone. Detailed samples retain chronological values, network I/O and timestamps.

## CPU-counter and pool observations

| Run | Scheduler periods | Throttled periods | Share throttled | Throttled time (seconds) | Max sampled pool waiters |
| --- | ----------------- | ----------------- | --------------- | ------------------------ | ------------------------ |
| A0  | 38                | 1                 | 2.632%          | 0.038                    | 0                        |
| A1  | 93                | 2                 | 2.151%          | 0.046                    | 0                        |
| A2  | 112               | 2                 | 1.786%          | 0.018                    | 0                        |
| A3  | 126               | 6                 | 4.762%          | 0.149                    | 0                        |
| A4  | 206               | 10                | 4.854%          | 0.699                    | 0                        |
| A5  | 242               | 3                 | 1.240%          | 0.035                    | 0                        |
| A6  | 325               | 27                | 8.308%          | 1.375                    | 0                        |
| A7  | 335               | 103               | 30.746%         | 3.840                    | 1109                     |
| B0  | 39                | 1                 | 2.564%          | 0.017                    | 0                        |
| B1  | 308               | 25                | 8.117%          | 1.140                    | 0                        |
| B2  | 308               | 14                | 4.545%          | 0.869                    | 0                        |
| B3  | 317               | 90                | 28.391%         | 3.736                    | 603                      |

The runner resolved /proc/self/cgroup and collected that group's cpu.stat and cpu.max for every stage. These counters cover the complete run interval, including setup and graceful completion; their throttled time is not an individual request's waiting time. Pool observations come from the API's ten-second JSON logs.

## How to read and reproduce the evidence

Every row links to a metrics-only k6 summary. Its matching .log contains warnings, .stats.json contains sampled Docker resources, .api-observations.json aggregates API status counts and pool observations, and .summary.md explains the stage. Each campaign's summary.md combines its results. [Beginner helper](results/helper.md) explains units, thresholds and the workload. [metrics.json](results/metrics.json) collects all campaigns numerically. No credentials or setup_data are exported.

Exit 0 means pass; exit 99 means a threshold was breached. The matrix retains threshold failures and continues, then returns exit 1 if any stage failed. Other exits stop the matrix as operational failures. JSON threshold booleans are failure flags: false = did not fail, true = failed. Report generation checks threshold/exit agreement, load/action totals and check counts against raw summaries.

Use an ephemeral signing secret for the benchmark and preserve your normal .env. These database credentials belong only to the isolated local benchmark.

```powershell
$env:JWT_SECRET = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
docker compose -p customer-operation-cloud-v1-benchmark -f compose.benchmark.yaml up --build -d --wait
Remove-Item Env:JWT_SECRET
$env:COMPOSE_PROJECT_NAME = 'customer-operation-cloud-v1-benchmark'
$env:COMPOSE_FILE = 'compose.benchmark.yaml'
$env:BASE_URL = 'http://localhost:3002'
# Set RESULTS_DIR to a NEW directory for each repeat; retain earlier evidence.
$env:RESULTS_DIR = 'docs/Version1/results/repeat-windows-30s'
npm run test:load:matrix
# B: Docker; LOAD_USERS=500,1000,2000; LOAD_DURATION=30s
# C: Docker; LOAD_USERS=2000,5000; LOAD_DURATION=1m
# D: native; LOAD_WORKLOAD=mixed; LOAD_USERS=10,50,100,250,500
# E: Docker; LOAD_WORKLOAD=mixed; LOAD_USERS=250,500,1000
# F: Docker; LOAD_WORKLOAD=mixed; LOAD_PROFILE=spike; LOAD_USERS=250,1000
# G: Docker; LOAD_WORKLOAD=mixed; LOAD_PROFILE=soak; LOAD_USERS=100; LOAD_DURATION=5m
# Docker campaigns: set K6_EXECUTION=docker and BASE_URL=http://api:3001.
# Use LOAD_PROFILE=steady and LOAD_DURATION=30s for D/E.
# Read-only campaigns: set LOAD_WORKLOAD=organization-read, LOAD_PROFILE=steady.
# Rebuild reports from retained evidence:
node apps/api/scripts/report-version1.ts --final
```

The measured stages bound observations. Untested user counts have no result; one passing small read workload does not establish the same capacity for mixed traffic. The separate generator still shares host resources. Dataset warmth, the fresh database, port 3002, API changes and execution order also differ from Version 0, so comparisons are observations rather than a controlled causal experiment.

## Functional and code checks

- API type checking, lint and compiled build passed; retained [validation logs](results/validation/).
- The default suite reported **20 passed, 0 failed, 3 intentionally skipped** without TEST_DATABASE_URL. [Log](results/validation/in-memory-tests.log).
- The real PostgreSQL 17 suite reported **23 passed, 0 failed, 0 skipped** against isolated temporary schemas in the benchmark database. [Log](results/validation/functional-tests.log). Node counts the pre-existing empty security.test.ts as a passing file entry; this is not 23 substantive security scenarios.
- Docker image build and readiness completed successfully before the load campaigns. [Log](results/validation/docker-build-start.log).
- Tests cover registration/login, JWT/ownership rejection, request IDs, security headers, generic errors and private logging, migration preservation/rollback, database constraints and upload byte/metadata validation.
- Custom summary regression checks cover credential exclusion. Mocked k6 lifecycle checks establish script/account assignment correctness; actual campaigns above establish the measured traffic results.
- Compiled Docker HTTP smoke checks: **39 passed**, **0 failed**. [Evidence](results/validation/docker-smoke.json).

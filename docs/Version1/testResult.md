# Version 1 Docker and k6 test results

**30 Docker-backed load runs were conducted: 20 passed and 10 failed their thresholds.** The Version 0 read workload was repeated in 15 runs covering 348,655 organization reads. Version 1 mixed traffic was exercised in 15 runs covering 90,367 load requests. Every planned campaign is retained below.

The highest passing read stage was **250 VUs / 30s through Windows** and **1000 VUs / 30s inside Docker**. These are passing tested stages, not exact capacity boundaries. The highest passing Docker mixed stage was **250 distinct-account VUs / 30s**, with read/write/login p95 of 458.01 / 471.00 / 780.58 ms.

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

Read RPS and mixed load RPS are the tagged counter rates reported by k6. Setup requests are excluded from their counts, but **k6's counter-rate time denominator includes setup**. The installed-version source computes counter rate from test-run duration and marks the run started before setup: [counter calculation](https://github.com/grafana/k6/blob/v2.3.0/metrics/sink.go), [execution lifecycle](https://github.com/grafana/k6/blob/v2.3.0/internal/execution/scheduler.go). Mixed provisioning at high VU counts can therefore depress displayed RPS; do not interpret that column as a precise sustained load-window rate. Percentiles are reported separately for each stage and request kind. HTTP duration excludes initial connection/DNS and sleep; connection failures can have zero duration. Judge latency with errors.

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

Evidence directory: [Campaign C](results/03-docker-2000-5000-users-1m/summary.md), with [environment](results/03-docker-2000-5000-users-1m/environment.json) and [run manifest](results/03-docker-2000-5000-users-1m/runs.json). All planned stages completed.

| Run                                                                          | VUs  | Time | Reads  | Read RPS | Avg ms   | p95 ms   | p99 ms   | Failed reads (%) | Checks passed | Result    |
| ---------------------------------------------------------------------------- | ---- | ---- | ------ | -------- | -------- | -------- | -------- | ---------------- | ------------- | --------- |
| [C0](results/03-docker-2000-5000-users-1m/00-1vu-10s.summary.json) (warm-up) | 1    | 10s  | 10     | 0.99     | 2.49     | 3.28     | 3.29     | 0 (0.000%)       | 100.000%      | PASS (0)  |
| [C1](results/03-docker-2000-5000-users-1m/01-2000vu-1m.summary.json)         | 2000 | 1m   | 81,658 | 1,434.53 | 445.37   | 1,010.86 | 1,246.76 | 0 (0.000%)       | 100.000%      | FAIL (99) |
| [C2](results/03-docker-2000-5000-users-1m/02-5000vu-1m.summary.json)         | 5000 | 1m   | 84,107 | 1,436.77 | 2,167.17 | 5,616.15 | 8,973.45 | 6,232 (7.410%)   | 92.590%       | FAIL (99) |

**FAIL (99)** — 81,658 organization reads, 1,434.53 requests/second, read p95 1,010.86 ms, 0 failed requests (0.000%). Failed criteria: `http_req_duration{operation:organization_read}: p(95)<500`.

**FAIL (99)** — 84,107 organization reads, 1,436.77 requests/second, read p95 5,616.15 ms, 6,232 failed requests (7.410%). Failed criteria: `http_req_failed{operation:organization_read}: rate<0.01`, `http_req_duration{operation:organization_read}: p(95)<500`, `checks{operation:organization_read}: rate>0.99`.

## Campaign D: Version 1 mixed traffic on Windows

Evidence directory: [Campaign D](results/04-windows-mixed-10-50-100-250-500-users-30s/summary.md), with [environment](results/04-windows-mixed-10-50-100-250-500-users-30s/environment.json) and [run manifest](results/04-windows-mixed-10-50-100-250-500-users-30s/runs.json). All planned stages completed.

| Run                                                                                          | VUs | Time | Load requests | Load RPS | Reads | Writes | Logins | Read avg ms | Read p95 ms | Read p99 ms | Write p95 ms | Login p95 ms | Failed load (%) | Checks passed | Result    |
| -------------------------------------------------------------------------------------------- | --- | ---- | ------------- | -------- | ----- | ------ | ------ | ----------- | ----------- | ----------- | ------------ | ------------ | --------------- | ------------- | --------- |
| [D0](results/04-windows-mixed-10-50-100-250-500-users-30s/00-1vu-30s.summary.json) (warm-up) | 1   | 30s  | 30            | 0.99     | 24    | 5      | 1      | 3.24        | 4.92        | 6.22        | 6.37         | 51.41        | 0 (0.000%)      | 100.000%      | PASS (0)  |
| [D1](results/04-windows-mixed-10-50-100-250-500-users-30s/01-10vu-30s.summary.json)          | 10  | 30s  | 300           | 9.75     | 225   | 65     | 10     | 4.13        | 8.06        | 10.37       | 20.08        | 69.14        | 0 (0.000%)      | 100.000%      | PASS (0)  |
| [D2](results/04-windows-mixed-10-50-100-250-500-users-30s/02-50vu-30s.summary.json)          | 50  | 30s  | 1,500         | 44.92    | 1,065 | 365    | 70     | 9.25        | 33.50       | 81.14       | 23.08        | 121.14       | 0 (0.000%)      | 100.000%      | PASS (0)  |
| [D3](results/04-windows-mixed-10-50-100-250-500-users-30s/03-100vu-30s.summary.json)         | 100 | 30s  | 2,996         | 82.07    | 2,096 | 750    | 150    | 13.73       | 47.41       | 253.44      | 70.06        | 263.02       | 0 (0.000%)      | 100.000%      | PASS (0)  |
| [D4](results/04-windows-mixed-10-50-100-250-500-users-30s/04-250vu-30s.summary.json)         | 250 | 30s  | 6,863         | 149.44   | 4,822 | 1,704  | 337    | 90.40       | 314.21      | 600.30      | 320.39       | 665.16       | 0 (0.000%)      | 100.000%      | PASS (0)  |
| [D5](results/04-windows-mixed-10-50-100-250-500-users-30s/05-500vu-30s.summary.json)         | 500 | 30s  | 8,392         | 144.90   | 5,889 | 2,083  | 420    | 833.60      | 1,690.15    | 4,013.12    | 1,118.11     | 2,102.23     | 0 (0.000%)      | 100.000%      | FAIL (99) |

**PASS (0)** — 300 load requests, 9.75 requests/second, read p95 8.06 ms, 0 failed requests (0.000%). Every configured load threshold passed.

**PASS (0)** — 1,500 load requests, 44.92 requests/second, read p95 33.50 ms, 0 failed requests (0.000%). Every configured load threshold passed.

**PASS (0)** — 2,996 load requests, 82.07 requests/second, read p95 47.41 ms, 0 failed requests (0.000%). Every configured load threshold passed.

**PASS (0)** — 6,863 load requests, 149.44 requests/second, read p95 314.21 ms, 0 failed requests (0.000%). Every configured load threshold passed.

**FAIL (99)** — 8,392 load requests, 144.90 requests/second, read p95 1,690.15 ms, 0 failed requests (0.000%). Failed criteria: `http_req_duration{phase:load,kind:read}: p(95)<500`, `http_req_duration{phase:load,kind:login}: p(95)<1000`, `http_req_duration{phase:load,kind:write}: p(95)<1000`.

## Campaign E: Version 1 mixed traffic inside Docker

Evidence directory: [Campaign E](results/05-docker-mixed-250-500-1000-users-30s/summary.md), with [environment](results/05-docker-mixed-250-500-1000-users-30s/environment.json) and [run manifest](results/05-docker-mixed-250-500-1000-users-30s/runs.json). All planned stages completed.

| Run                                                                                    | VUs  | Time | Load requests | Load RPS | Reads | Writes | Logins | Read avg ms | Read p95 ms | Read p99 ms | Write p95 ms | Login p95 ms | Failed load (%) | Checks passed | Result    |
| -------------------------------------------------------------------------------------- | ---- | ---- | ------------- | -------- | ----- | ------ | ------ | ----------- | ----------- | ----------- | ------------ | ------------ | --------------- | ------------- | --------- |
| [E0](results/05-docker-mixed-250-500-1000-users-30s/00-1vu-30s.summary.json) (warm-up) | 1    | 30s  | 30            | 1.07     | 24    | 5      | 1      | 2.58        | 3.56        | 4.33        | 22.48        | 49.43        | 0 (0.000%)      | 100.000%      | PASS (0)  |
| [E1](results/05-docker-mixed-250-500-1000-users-30s/01-250vu-30s.summary.json)         | 250  | 30s  | 6,626         | 154.98   | 4,654 | 1,640  | 332    | 131.53      | 458.01      | 726.81      | 471.00       | 780.58       | 0 (0.000%)      | 100.000%      | PASS (0)  |
| [E2](results/05-docker-mixed-250-500-1000-users-30s/02-500vu-30s.summary.json)         | 500  | 30s  | 7,581         | 134.06   | 5,305 | 1,899  | 377    | 954.15      | 2,143.45    | 4,916.58    | 1,421.47     | 2,295.32     | 0 (0.000%)      | 100.000%      | FAIL (99) |
| [E3](results/05-docker-mixed-250-500-1000-users-30s/03-1000vu-30s.summary.json)        | 1000 | 30s  | 8,058         | 87.86    | 5,710 | 1,957  | 391    | 2,167.31    | 8,244.56    | 10,000.18   | 8,217.08     | 8,865.80     | 1,082 (13.428%) | 86.572%       | FAIL (99) |

**PASS (0)** — 6,626 load requests, 154.98 requests/second, read p95 458.01 ms, 0 failed requests (0.000%). Every configured load threshold passed.

**FAIL (99)** — 7,581 load requests, 134.06 requests/second, read p95 2,143.45 ms, 0 failed requests (0.000%). Failed criteria: `http_req_duration{phase:load,kind:read}: p(95)<500`, `http_req_duration{phase:load,kind:login}: p(95)<1000`, `http_req_duration{phase:load,kind:write}: p(95)<1000`.

**FAIL (99)** — 8,058 load requests, 87.86 requests/second, read p95 8,244.56 ms, 1,082 failed requests (13.428%). Failed criteria: `checks{phase:load}: rate>0.99`, `http_req_duration{phase:load,kind:write}: p(95)<1000`, `http_req_failed{phase:load}: rate<0.01`, `http_req_duration{phase:load,kind:read}: p(95)<500`, `http_req_duration{phase:load,kind:login}: p(95)<1000`.

## Campaign F: Version 1 spike traffic

Evidence directory: [Campaign F](results/06-docker-mixed-spike-250-1000-users-30s/summary.md), with [environment](results/06-docker-mixed-spike-250-1000-users-30s/environment.json) and [run manifest](results/06-docker-mixed-spike-250-1000-users-30s/runs.json). All planned stages completed.

| Run                                                                                      | VUs  | Time | Load requests | Load RPS | Reads | Writes | Logins | Read avg ms | Read p95 ms | Read p99 ms | Write p95 ms | Login p95 ms | Failed load (%) | Checks passed | Result    |
| ---------------------------------------------------------------------------------------- | ---- | ---- | ------------- | -------- | ----- | ------ | ------ | ----------- | ----------- | ----------- | ------------ | ------------ | --------------- | ------------- | --------- |
| [F0](results/06-docker-mixed-spike-250-1000-users-30s/00-1vu-30s.summary.json) (warm-up) | 1    | 30s  | 30            | 1.07     | 24    | 5      | 1      | 2.43        | 3.32        | 3.66        | 12.32        | 47.21        | 0 (0.000%)      | 100.000%      | PASS (0)  |
| [F1](results/06-docker-mixed-spike-250-1000-users-30s/01-250vu-30s.summary.json)         | 250  | 30s  | 8,100         | 158.08   | 5,677 | 2,022  | 401    | 82.67       | 304.89      | 486.05      | 350.60       | 600.64       | 0 (0.000%)      | 100.000%      | PASS (0)  |
| [F2](results/06-docker-mixed-spike-250-1000-users-30s/02-1000vu-30s.summary.json)        | 1000 | 30s  | 10,072        | 108.01   | 7,128 | 2,455  | 489    | 2,352.37    | 8,983.21    | 10,000.75   | 7,980.10     | 8,191.37     | 1,269 (12.599%) | 87.401%       | FAIL (99) |

**PASS (0)** — 8,100 load requests, 158.08 requests/second, read p95 304.89 ms, 0 failed requests (0.000%). Every configured load threshold passed.

**FAIL (99)** — 10,072 load requests, 108.01 requests/second, read p95 8,983.21 ms, 1,269 failed requests (12.599%). Failed criteria: `http_req_duration{phase:load,kind:login}: p(95)<1000`, `http_req_duration{phase:load,kind:read}: p(95)<500`, `checks{phase:load}: rate>0.99`, `http_req_duration{phase:load,kind:write}: p(95)<1000`, `http_req_failed{phase:load}: rate<0.01`.

## Campaign G: Version 1 five-minute steady repeat

Evidence directory: [Campaign G](results/07-docker-mixed-soak-100-users-5m/summary.md), with [environment](results/07-docker-mixed-soak-100-users-5m/environment.json) and [run manifest](results/07-docker-mixed-soak-100-users-5m/runs.json). All planned stages completed.

| Run                                                                               | VUs | Time | Load requests | Load RPS | Reads  | Writes | Logins | Read avg ms | Read p95 ms | Read p99 ms | Write p95 ms | Login p95 ms | Failed load (%) | Checks passed | Result   |
| --------------------------------------------------------------------------------- | --- | ---- | ------------- | -------- | ------ | ------ | ------ | ----------- | ----------- | ----------- | ------------ | ------------ | --------------- | ------------- | -------- |
| [G0](results/07-docker-mixed-soak-100-users-5m/00-1vu-30s.summary.json) (warm-up) | 1   | 30s  | 30            | 1.07     | 24     | 5      | 1      | 2.86        | 4.47        | 4.96        | 5.07         | 45.76        | 0 (0.000%)      | 100.000%      | PASS (0) |
| [G1](results/07-docker-mixed-soak-100-users-5m/01-100vu-5m.summary.json)          | 100 | 5m   | 29,759        | 104.43   | 20,832 | 7,439  | 1,488  | 4.70        | 8.09        | 56.58       | 14.71        | 124.95       | 0 (0.000%)      | 100.000%      | PASS (0) |

**PASS (0)** — 29,759 load requests, 104.43 requests/second, read p95 8.09 ms, 0 failed requests (0.000%). Every configured load threshold passed.

## What the measured limits show

The **100-user five-minute mixed repeat passed**, recording **29,759 load requests**, **zero failed load requests**, **100.000% passed checks**, and read/write/login p95 of **8.09 / 14.71 / 124.95 ms**. API sampled memory ranged from 68.62 to 121.50 MiB, with a last sample of 120.20 MiB. This confirms the exercise's criteria for five minutes, not long-term leak freedom or a production guarantee.

Windows request logs recorded connection refusals in A4, A5, A6, A7. Read p95 also failed at 2000 VUs. Moving k6 inside Docker eliminated refusal warnings in the comparison stages, while high-concurrency latency could still fail. This separates a published-port observation from an intrinsic application-capacity claim; it does not isolate one operating-system/proxy cause.

The 5,000-user read stress stage recorded **84,107 reads**, **1,436.77 reported read RPS**, **5,616.15 ms p95**, **6,232 failures (7.410%)**, and **38.644% of API scheduler periods throttled**. The highest observed database-pool waiting count was **3490**. API logs separately recorded statuses `{"200":77881,"201":2,"499":2659,"500":733,"503":1}`, including setup and health probes. Rising latency, throttling and pool waiters are consistent with CPU/queue pressure, but these measurements do not isolate the responsible function or SQL query.

Mixed traffic produced different limits from the single shared organization read. Failed mixed stages were D5, E2, E3, F2; their exact failing read/write/login/error/check criteria remain in the stage reports. Setup provisioned distinct datasets before load and continued to accumulate writes, so these results must be compared by workload and generator placement. Mixed steady campaigns stopped at the explicitly tested 1,000-account stage; 2,000/5,000-account mixed traffic was not tested. The read-only 2,000/5,000-user campaigns above still ran as requested.

Across these runs, the largest sampled API memory was **191.20 MiB**, and PostgreSQL's was **77.14 MiB**, against their separate 1,024 MiB limits. No recorded OOM kill, server stop or restart-count increase occurred during the load campaigns. Short sampled tests cannot establish indefinite memory stability.

## Version 0 comparison for the repeated read workload

| Stage | VUs  | Time | V0 read RPS | V1 read RPS | V0 p95 ms | V1 p95 ms | V0 failed reads | V1 failed reads | V0   | V1   |
| ----- | ---- | ---- | ----------- | ----------- | --------- | --------- | --------------- | --------------- | ---- | ---- |
| A7    | 2000 | 30s  | 1,843.67    | 1,259.82    | 199.65    | 990.24    | 6.659%          | 9.453%          | FAIL | FAIL |
| B1    | 500  | 30s  | 487.93      | 511.82      | 60.34     | 53.49     | 0.000%          | 0.000%          | PASS | PASS |
| B2    | 1000 | 30s  | 972.95      | 1,014.60    | 66.38     | 149.62    | 0.000%          | 0.000%          | PASS | PASS |
| B3    | 2000 | 30s  | 1,850.80    | 1,453.86    | 227.52    | 796.71    | 0.000%          | 0.000%          | PASS | FAIL |
| C1    | 2000 | 1m   | 1,918.94    | 1,434.53    | 109.60    | 1,010.86  | 0.000%          | 0.000%          | PASS | FAIL |
| C2    | 5000 | 1m   | 1,915.27    | 1,436.77    | 2,341.15  | 5,616.15  | 0.484%          | 7.410%          | FAIL | FAIL |

These numbers come from the retained Version 0 [metrics](../Version0/results/metrics.json) and the new raw summaries. Workload, thresholds and server caps match; dates, API implementation, database content, host-port number, background activity and test order differ. The observed change is not a controlled attribution to any one Version 1 feature.

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
| C0  | 7.08%       | 106.30      | 0.40%              | 45.54              | 2 / 2            | 11.11             |
| C1  | 103.19%     | 116.90      | 47.83%             | 61.21              | 11 / 11          | 691.00            |
| C2  | 104.35%     | 191.20      | 50.56%             | 61.66              | 11 / 11          | 1,528.83          |
| D0  | 5.83%       | 165.60      | 4.54%              | 45.93              | 9 / 9            | not sampled       |
| D1  | 5.20%       | 66.19       | 7.72%              | 56.00              | 9 / 9            | not sampled       |
| D2  | 105.10%     | 117.20      | 8.14%              | 65.45              | 9 / 9            | not sampled       |
| D3  | 106.28%     | 129.80      | 12.04%             | 67.66              | 10 / 10          | not sampled       |
| D4  | 106.81%     | 148.40      | 25.64%             | 68.84              | 13 / 13          | not sampled       |
| D5  | 105.28%     | 153.30      | 26.54%             | 70.40              | 15 / 15          | not sampled       |
| E0  | 6.35%       | 91.55       | 7.39%              | 48.77              | 6 / 6            | 12.18             |
| E1  | 101.65%     | 120.60      | 22.59%             | 69.25              | 8 / 8            | 198.80            |
| E2  | 102.95%     | 142.60      | 20.97%             | 70.32              | 11 / 11          | 566.60            |
| E3  | 107.76%     | 171.00      | 27.29%             | 72.23              | 17 / 17          | 1,609.73          |
| F0  | 25.03%      | 98.83       | 5.45%              | 52.30              | 6 / 6            | 11.86             |
| F1  | 100.63%     | 136.40      | 18.94%             | 73.00              | 10 / 10          | 223.10            |
| F2  | 107.10%     | 160.70      | 22.53%             | 75.46              | 18 / 18          | 1,666.05          |
| G0  | 33.60%      | 53.94       | 7.68%              | 55.20              | 6 / 6            | 12.07             |
| G1  | 108.00%     | 121.50      | 11.90%             | 77.14              | 52 / 52          | 75.57             |

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
| C0  | 33                | 0                 | 0.000%          | 0.000                    | 0                        |
| C1  | 612               | 208               | 33.987%         | 8.444                    | 718                      |
| C2  | 634               | 245               | 38.644%         | 14.721                   | 3490                     |
| D0  | 94                | 3                 | 3.191%          | 0.042                    | 0                        |
| D1  | 100               | 9                 | 9.000%          | 0.781                    | 0                        |
| D2  | 201               | 60                | 29.851%         | 6.027                    | 0                        |
| D3  | 356               | 117               | 32.865%         | 14.948                   | 0                        |
| D4  | 493               | 398               | 80.730%         | 82.521                   | 34                       |
| D5  | 624               | 614               | 98.397%         | 144.594                  | 361                      |
| E0  | 87                | 3                 | 3.448%          | 0.044                    | 0                        |
| E1  | 467               | 390               | 83.512%         | 76.093                   | 59                       |
| E2  | 615               | 598               | 97.236%         | 138.525                  | 180                      |
| E3  | 991               | 972               | 98.083%         | 198.711                  | 376                      |
| F0  | 86                | 4                 | 4.651%          | 0.112                    | 0                        |
| F1  | 563               | 428               | 76.021%         | 83.827                   | 30                       |
| F2  | 1033              | 1004              | 97.193%         | 212.530                  | 503                      |
| G0  | 78                | 3                 | 3.846%          | 0.034                    | 0                        |
| G1  | 2928              | 364               | 12.432%         | 37.045                   | 0                        |

The runner resolved /proc/self/cgroup and collected that group's cpu.stat and cpu.max for every stage. These counters cover the complete run interval, including setup and graceful completion; their throttled time is not an individual request's waiting time. Pool observations come from the API's ten-second JSON logs.

### Reported-rate timing caveat

Several Docker exports imply a counter-rate denominator shorter than the configured load window. The denominator below is derived as tagged request count divided by its exported rate; it is not a separately measured duration.

| Run | Configured load seconds | Implied k6 rate denominator seconds | Manifest execution seconds | Tagged count / configured seconds |
| --- | ----------------------- | ----------------------------------- | -------------------------- | --------------------------------- |
| B1  | 30                      | 29.09                               | 31.40                      | 496.37                            |
| C1  | 60                      | 56.92                               | 60.28                      | 1,360.97                          |
| G1  | 300                     | 284.96                              | 286.35                     | 99.20                             |

The cause of this timing discrepancy was not established. RPS columns preserve k6's raw reported rates, as in Version 0, and should be treated as approximate when comparing capacity. Count/configured-seconds is an arithmetic reference, not an independently measured steady-window rate; setup and graceful completion complicate wall-clock comparisons. Request counts, failure/check rates, percentile thresholds and recorded exit codes remain as observed.

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
- Compiled Docker readiness/restart checks: **12 passed**, **0 failed**. [Evidence](results/validation/resilience.json).
- Database snapshot [dataset-before-mixed.json](results/validation/dataset-before-mixed.json): 17 users, 16 organizations, 1 conversations, 4 documents and 3 uploads; 8.16 MiB total database size.
- Database snapshot [dataset-after-campaigns.json](results/validation/dataset-after-campaigns.json): 4,032 users, 4,031 organizations, 12,948 conversations, 17,461 documents and 12,970 uploads; 18.98 MiB total database size.
- API production dependency audit: **0 vulnerabilities**. [Evidence](results/validation/runtime-audit.json). This is not a whole-monorepo audit.
- Documentation formatting, relative links, JSON validity, credential exclusion and consistency of all 30 stage records were verified. [Verification record](results/validation/verification.json).
- The benchmark API and PostgreSQL remained running and healthy after the recovery checks. [Final container state](results/validation/final-container-state.json).

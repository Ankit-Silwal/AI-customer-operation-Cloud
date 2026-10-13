# Version 1 campaign D: Version 1 mixed traffic on Windows

**6 stages: 5 passed and 1 failed.** 20,081 load requests and 0 failed requests were recorded. Every planned stage is retained.

[Beginner helper](../helper.md) | [Full test report](../../testResult.md)

These tests were actually executed on 2026-10-13. Numbers below are rounded; linked JSON preserves full precision. Each row describes a separate stage; percentiles are not combined.

## What ran

| Item               | Value                                                              |
| ------------------ | ------------------------------------------------------------------ |
| Generator          | native: k6.exe v2.3.0 (commit/e088784614, go1.26.8, windows/amd64) |
| Target             | http://localhost:3002                                              |
| API cap            | 1 CPU + 1 GiB                                                      |
| PostgreSQL cap     | A separate 1 CPU + 1 GiB                                           |
| Generator cap      | No explicit CPU/RAM cap; Docker generator shares VM pool           |
| Workload / profile | mixed / steady                                                     |
| Identity           | One distinct account and organization per VU                       |
| Warm-up            | 1 VU / 30s to cover all actions                                    |
| Environment        | [environment.json](environment.json)                               |
| Execution          | [runs.json](runs.json)                                             |

## Every stage: traffic, correctness and latency

| Run                                     | VUs | Time | Load requests | Load RPS | Reads | Writes | Logins | Read avg ms | Read p95 ms | Read p99 ms | Write p95 ms | Login p95 ms | Failed load (%) | Checks passed | Result    |
| --------------------------------------- | --- | ---- | ------------- | -------- | ----- | ------ | ------ | ----------- | ----------- | ----------- | ------------ | ------------ | --------------- | ------------- | --------- |
| [D0](00-1vu-30s.summary.json) (warm-up) | 1   | 30s  | 30            | 0.99     | 24    | 5      | 1      | 3.24        | 4.92        | 6.22        | 6.37         | 51.41        | 0 (0.000%)      | 100.000%      | PASS (0)  |
| [D1](01-10vu-30s.summary.json)          | 10  | 30s  | 300           | 9.75     | 225   | 65     | 10     | 4.13        | 8.06        | 10.37       | 20.08        | 69.14        | 0 (0.000%)      | 100.000%      | PASS (0)  |
| [D2](02-50vu-30s.summary.json)          | 50  | 30s  | 1,500         | 44.92    | 1,065 | 365    | 70     | 9.25        | 33.50       | 81.14       | 23.08        | 121.14       | 0 (0.000%)      | 100.000%      | PASS (0)  |
| [D3](03-100vu-30s.summary.json)         | 100 | 30s  | 2,996         | 82.07    | 2,096 | 750    | 150    | 13.73       | 47.41       | 253.44      | 70.06        | 263.02       | 0 (0.000%)      | 100.000%      | PASS (0)  |
| [D4](04-250vu-30s.summary.json)         | 250 | 30s  | 6,863         | 149.44   | 4,822 | 1,704  | 337    | 90.40       | 314.21      | 600.30      | 320.39       | 665.16       | 0 (0.000%)      | 100.000%      | PASS (0)  |
| [D5](05-500vu-30s.summary.json)         | 500 | 30s  | 8,392         | 144.90   | 5,889 | 2,083  | 420    | 833.60      | 1,690.15    | 4,013.12    | 1,118.11     | 2,102.23     | 0 (0.000%)      | 100.000%      | FAIL (99) |

HTTP duration excludes initial connection/DNS and sleep. Failed reads can contribute zero durations. Mixed RPS excludes setup counts but uses k6's reported counter-rate denominator, which includes setup wall time. This can lower mixed RPS substantially at large account counts; it is not a steady-window throughput estimate.

## Why each stage passed or failed

| Run | Failed criteria                                                                                                                                                      | Request warnings | Connection refusals | Timeout warnings | Container state                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------- | ---------------- | ------------------------------------------------------------------------------------------- |
| D0  | None                                                                                                                                                                 | 0                | 0                   | 0                | API: running=true; OOM=false; restarts 0 -> 0; DB: running=true; OOM=false; restarts 0 -> 0 |
| D1  | None                                                                                                                                                                 | 0                | 0                   | 0                | API: running=true; OOM=false; restarts 0 -> 0; DB: running=true; OOM=false; restarts 0 -> 0 |
| D2  | None                                                                                                                                                                 | 0                | 0                   | 0                | API: running=true; OOM=false; restarts 0 -> 0; DB: running=true; OOM=false; restarts 0 -> 0 |
| D3  | None                                                                                                                                                                 | 0                | 0                   | 0                | API: running=true; OOM=false; restarts 0 -> 0; DB: running=true; OOM=false; restarts 0 -> 0 |
| D4  | None                                                                                                                                                                 | 0                | 0                   | 0                | API: running=true; OOM=false; restarts 0 -> 0; DB: running=true; OOM=false; restarts 0 -> 0 |
| D5  | `http_req_duration{phase:load,kind:read}: p(95)<500`; `http_req_duration{phase:load,kind:login}: p(95)<1000`; `http_req_duration{phase:load,kind:write}: p(95)<1000` | 0                | 0                   | 0                | API: running=true; OOM=false; restarts 0 -> 0; DB: running=true; OOM=false; restarts 0 -> 0 |

D0: **PASS (0)** — 30 load requests, 0.99 requests/second, read p95 4.92 ms, 0 failed requests (0.000%). Every configured load threshold passed.

D1: **PASS (0)** — 300 load requests, 9.75 requests/second, read p95 8.06 ms, 0 failed requests (0.000%). Every configured load threshold passed.

D2: **PASS (0)** — 1,500 load requests, 44.92 requests/second, read p95 33.50 ms, 0 failed requests (0.000%). Every configured load threshold passed.

D3: **PASS (0)** — 2,996 load requests, 82.07 requests/second, read p95 47.41 ms, 0 failed requests (0.000%). Every configured load threshold passed.

D4: **PASS (0)** — 6,863 load requests, 149.44 requests/second, read p95 314.21 ms, 0 failed requests (0.000%). Every configured load threshold passed.

D5: **FAIL (99)** — 8,392 load requests, 144.90 requests/second, read p95 1,690.15 ms, 0 failed requests (0.000%). Failed criteria: `http_req_duration{phase:load,kind:read}: p(95)<500`, `http_req_duration{phase:load,kind:login}: p(95)<1000`, `http_req_duration{phase:load,kind:write}: p(95)<1000`.

## Sampled CPU and RAM

| Run | API max CPU | API max MiB | PostgreSQL max CPU | PostgreSQL max MiB | Samples API / DB | Generator max MiB |
| --- | ----------- | ----------- | ------------------ | ------------------ | ---------------- | ----------------- |
| D0  | 5.83%       | 165.60      | 4.54%              | 45.93              | 9 / 9            | not sampled       |
| D1  | 5.20%       | 66.19       | 7.72%              | 56.00              | 9 / 9            | not sampled       |
| D2  | 105.10%     | 117.20      | 8.14%              | 65.45              | 9 / 9            | not sampled       |
| D3  | 106.28%     | 129.80      | 12.04%             | 67.66              | 10 / 10          | not sampled       |
| D4  | 106.81%     | 148.40      | 25.64%             | 68.84              | 13 / 13          | not sampled       |
| D5  | 105.28%     | 153.30      | 26.54%             | 70.40              | 15 / 15          | not sampled       |

Sampling includes setup and graceful completion, and a two-second delay plus Docker query time. Docker generator queries add elapsed time, so sample cadence is irregular. Native generator memory was not collected.

## CPU throttling and pool observations

| Run | Scheduler periods | Throttled periods | Share throttled | Throttled time (seconds) | Max sampled pool waiters |
| --- | ----------------- | ----------------- | --------------- | ------------------------ | ------------------------ |
| D0  | 94                | 3                 | 3.191%          | 0.042                    | 0                        |
| D1  | 100               | 9                 | 9.000%          | 0.781                    | 0                        |
| D2  | 201               | 60                | 29.851%         | 6.027                    | 0                        |
| D3  | 356               | 117               | 32.865%         | 14.948                   | 0                        |
| D4  | 493               | 398               | 80.730%         | 82.521                   | 34                       |
| D5  | 624               | 614               | 98.397%         | 144.594                  | 361                      |

The actual API cgroup was resolved in every stage. CPU snapshots cover the entire execution interval, including setup. Pool observations are ten seconds apart.

## What to learn from these results

Every failed threshold remains visible. A latency failure is not cancelled by a passing error rate. More VUs need not mean more completed work; compare throughput, tails, failures and CPU together. Small repeated reads, distinct-account mixed traffic, spike traffic and five-minute repeats cover different conditions and cannot be treated as equivalent capacity measurements.

## Evidence links for every stage

| Stage        | Readable report                   | Raw metrics                       | Console                 | Docker samples                   | API observations                          |
| ------------ | --------------------------------- | --------------------------------- | ----------------------- | -------------------------------- | ----------------------------------------- |
| 00-1vu-30s   | [Report](00-1vu-30s.summary.md)   | [JSON](00-1vu-30s.summary.json)   | [Log](00-1vu-30s.log)   | [Stats](00-1vu-30s.stats.json)   | [API](00-1vu-30s.api-observations.json)   |
| 01-10vu-30s  | [Report](01-10vu-30s.summary.md)  | [JSON](01-10vu-30s.summary.json)  | [Log](01-10vu-30s.log)  | [Stats](01-10vu-30s.stats.json)  | [API](01-10vu-30s.api-observations.json)  |
| 02-50vu-30s  | [Report](02-50vu-30s.summary.md)  | [JSON](02-50vu-30s.summary.json)  | [Log](02-50vu-30s.log)  | [Stats](02-50vu-30s.stats.json)  | [API](02-50vu-30s.api-observations.json)  |
| 03-100vu-30s | [Report](03-100vu-30s.summary.md) | [JSON](03-100vu-30s.summary.json) | [Log](03-100vu-30s.log) | [Stats](03-100vu-30s.stats.json) | [API](03-100vu-30s.api-observations.json) |
| 04-250vu-30s | [Report](04-250vu-30s.summary.md) | [JSON](04-250vu-30s.summary.json) | [Log](04-250vu-30s.log) | [Stats](04-250vu-30s.stats.json) | [API](04-250vu-30s.api-observations.json) |
| 05-500vu-30s | [Report](05-500vu-30s.summary.md) | [JSON](05-500vu-30s.summary.json) | [Log](05-500vu-30s.log) | [Stats](05-500vu-30s.stats.json) | [API](05-500vu-30s.api-observations.json) |

# Version 1 campaign E: Version 1 mixed traffic inside Docker

**4 stages: 2 passed and 2 failed.** 22,295 load requests and 1,082 failed requests were recorded. Every planned stage is retained.

[Beginner helper](../helper.md) | [Full test report](../../testResult.md)

These tests were actually executed on 2026-10-13. Numbers below are rounded; linked JSON preserves full precision. Each row describes a separate stage; percentiles are not combined.

## What ran

| Item               | Value                                                        |
| ------------------ | ------------------------------------------------------------ |
| Generator          | docker: k6 v2.3.0 (commit/e088784614, go1.27.1, linux/amd64) |
| Target             | http://api:3001                                              |
| API cap            | 1 CPU + 1 GiB                                                |
| PostgreSQL cap     | A separate 1 CPU + 1 GiB                                     |
| Generator cap      | No explicit CPU/RAM cap; Docker generator shares VM pool     |
| Workload / profile | mixed / steady                                               |
| Identity           | One distinct account and organization per VU                 |
| Warm-up            | 1 VU / 30s to cover all actions                              |
| Environment        | [environment.json](environment.json)                         |
| Execution          | [runs.json](runs.json)                                       |

## Every stage: traffic, correctness and latency

| Run                                     | VUs  | Time | Load requests | Load RPS | Reads | Writes | Logins | Read avg ms | Read p95 ms | Read p99 ms | Write p95 ms | Login p95 ms | Failed load (%) | Checks passed | Result    |
| --------------------------------------- | ---- | ---- | ------------- | -------- | ----- | ------ | ------ | ----------- | ----------- | ----------- | ------------ | ------------ | --------------- | ------------- | --------- |
| [E0](00-1vu-30s.summary.json) (warm-up) | 1    | 30s  | 30            | 1.07     | 24    | 5      | 1      | 2.58        | 3.56        | 4.33        | 22.48        | 49.43        | 0 (0.000%)      | 100.000%      | PASS (0)  |
| [E1](01-250vu-30s.summary.json)         | 250  | 30s  | 6,626         | 154.98   | 4,654 | 1,640  | 332    | 131.53      | 458.01      | 726.81      | 471.00       | 780.58       | 0 (0.000%)      | 100.000%      | PASS (0)  |
| [E2](02-500vu-30s.summary.json)         | 500  | 30s  | 7,581         | 134.06   | 5,305 | 1,899  | 377    | 954.15      | 2,143.45    | 4,916.58    | 1,421.47     | 2,295.32     | 0 (0.000%)      | 100.000%      | FAIL (99) |
| [E3](03-1000vu-30s.summary.json)        | 1000 | 30s  | 8,058         | 87.86    | 5,710 | 1,957  | 391    | 2,167.31    | 8,244.56    | 10,000.18   | 8,217.08     | 8,865.80     | 1,082 (13.428%) | 86.572%       | FAIL (99) |

HTTP duration excludes initial connection/DNS and sleep. Failed reads can contribute zero durations. Mixed RPS excludes setup counts but uses k6's reported counter-rate denominator, which includes setup wall time. This can lower mixed RPS substantially at large account counts; it is not a steady-window throughput estimate.

## Why each stage passed or failed

| Run | Failed criteria                                                                                                                                                                                                                                 | Request warnings | Connection refusals | Timeout warnings | Container state                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------- | ---------------- | ------------------------------------------------------------------------------------------- |
| E0  | None                                                                                                                                                                                                                                            | 0                | 0                   | 0                | API: running=true; OOM=false; restarts 0 -> 0; DB: running=true; OOM=false; restarts 0 -> 0 |
| E1  | None                                                                                                                                                                                                                                            | 0                | 0                   | 0                | API: running=true; OOM=false; restarts 0 -> 0; DB: running=true; OOM=false; restarts 0 -> 0 |
| E2  | `http_req_duration{phase:load,kind:read}: p(95)<500`; `http_req_duration{phase:load,kind:login}: p(95)<1000`; `http_req_duration{phase:load,kind:write}: p(95)<1000`                                                                            | 0                | 0                   | 0                | API: running=true; OOM=false; restarts 0 -> 0; DB: running=true; OOM=false; restarts 0 -> 0 |
| E3  | `checks{phase:load}: rate>0.99`; `http_req_duration{phase:load,kind:write}: p(95)<1000`; `http_req_failed{phase:load}: rate<0.01`; `http_req_duration{phase:load,kind:read}: p(95)<500`; `http_req_duration{phase:load,kind:login}: p(95)<1000` | 1082             | 0                   | 1082             | API: running=true; OOM=false; restarts 0 -> 0; DB: running=true; OOM=false; restarts 0 -> 0 |

E0: **PASS (0)** — 30 load requests, 1.07 requests/second, read p95 3.56 ms, 0 failed requests (0.000%). Every configured load threshold passed.

E1: **PASS (0)** — 6,626 load requests, 154.98 requests/second, read p95 458.01 ms, 0 failed requests (0.000%). Every configured load threshold passed.

E2: **FAIL (99)** — 7,581 load requests, 134.06 requests/second, read p95 2,143.45 ms, 0 failed requests (0.000%). Failed criteria: `http_req_duration{phase:load,kind:read}: p(95)<500`, `http_req_duration{phase:load,kind:login}: p(95)<1000`, `http_req_duration{phase:load,kind:write}: p(95)<1000`.

E3: **FAIL (99)** — 8,058 load requests, 87.86 requests/second, read p95 8,244.56 ms, 1,082 failed requests (13.428%). Failed criteria: `checks{phase:load}: rate>0.99`, `http_req_duration{phase:load,kind:write}: p(95)<1000`, `http_req_failed{phase:load}: rate<0.01`, `http_req_duration{phase:load,kind:read}: p(95)<500`, `http_req_duration{phase:load,kind:login}: p(95)<1000`.

## Sampled CPU and RAM

| Run | API max CPU | API max MiB | PostgreSQL max CPU | PostgreSQL max MiB | Samples API / DB | Generator max MiB |
| --- | ----------- | ----------- | ------------------ | ------------------ | ---------------- | ----------------- |
| E0  | 6.35%       | 91.55       | 7.39%              | 48.77              | 6 / 6            | 12.18             |
| E1  | 101.65%     | 120.60      | 22.59%             | 69.25              | 8 / 8            | 198.80            |
| E2  | 102.95%     | 142.60      | 20.97%             | 70.32              | 11 / 11          | 566.60            |
| E3  | 107.76%     | 171.00      | 27.29%             | 72.23              | 17 / 17          | 1,609.73          |

Sampling includes setup and graceful completion, and a two-second delay plus Docker query time. Docker generator queries add elapsed time, so sample cadence is irregular. Native generator memory was not collected.

## CPU throttling and pool observations

| Run | Scheduler periods | Throttled periods | Share throttled | Throttled time (seconds) | Max sampled pool waiters |
| --- | ----------------- | ----------------- | --------------- | ------------------------ | ------------------------ |
| E0  | 87                | 3                 | 3.448%          | 0.044                    | 0                        |
| E1  | 467               | 390               | 83.512%         | 76.093                   | 59                       |
| E2  | 615               | 598               | 97.236%         | 138.525                  | 180                      |
| E3  | 991               | 972               | 98.083%         | 198.711                  | 376                      |

The actual API cgroup was resolved in every stage. CPU snapshots cover the entire execution interval, including setup. Pool observations are ten seconds apart.

## What to learn from these results

Every failed threshold remains visible. A latency failure is not cancelled by a passing error rate. More VUs need not mean more completed work; compare throughput, tails, failures and CPU together. Small repeated reads, distinct-account mixed traffic, spike traffic and five-minute repeats cover different conditions and cannot be treated as equivalent capacity measurements.

## Evidence links for every stage

| Stage         | Readable report                    | Raw metrics                        | Console                  | Docker samples                    | API observations                           |
| ------------- | ---------------------------------- | ---------------------------------- | ------------------------ | --------------------------------- | ------------------------------------------ |
| 00-1vu-30s    | [Report](00-1vu-30s.summary.md)    | [JSON](00-1vu-30s.summary.json)    | [Log](00-1vu-30s.log)    | [Stats](00-1vu-30s.stats.json)    | [API](00-1vu-30s.api-observations.json)    |
| 01-250vu-30s  | [Report](01-250vu-30s.summary.md)  | [JSON](01-250vu-30s.summary.json)  | [Log](01-250vu-30s.log)  | [Stats](01-250vu-30s.stats.json)  | [API](01-250vu-30s.api-observations.json)  |
| 02-500vu-30s  | [Report](02-500vu-30s.summary.md)  | [JSON](02-500vu-30s.summary.json)  | [Log](02-500vu-30s.log)  | [Stats](02-500vu-30s.stats.json)  | [API](02-500vu-30s.api-observations.json)  |
| 03-1000vu-30s | [Report](03-1000vu-30s.summary.md) | [JSON](03-1000vu-30s.summary.json) | [Log](03-1000vu-30s.log) | [Stats](03-1000vu-30s.stats.json) | [API](03-1000vu-30s.api-observations.json) |

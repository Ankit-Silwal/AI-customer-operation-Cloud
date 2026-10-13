# Version 1 campaign F: Version 1 spike traffic

**3 stages: 2 passed and 1 failed.** 18,202 load requests and 1,269 failed requests were recorded. Every planned stage is retained.

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
| Workload / profile | mixed / spike                                                |
| Identity           | One distinct account and organization per VU                 |
| Warm-up            | 1 VU / 30s to cover all actions                              |
| Environment        | [environment.json](environment.json)                         |
| Execution          | [runs.json](runs.json)                                       |

## Every stage: traffic, correctness and latency

| Run                                     | VUs  | Time | Load requests | Load RPS | Reads | Writes | Logins | Read avg ms | Read p95 ms | Read p99 ms | Write p95 ms | Login p95 ms | Failed load (%) | Checks passed | Result    |
| --------------------------------------- | ---- | ---- | ------------- | -------- | ----- | ------ | ------ | ----------- | ----------- | ----------- | ------------ | ------------ | --------------- | ------------- | --------- |
| [F0](00-1vu-30s.summary.json) (warm-up) | 1    | 30s  | 30            | 1.07     | 24    | 5      | 1      | 2.43        | 3.32        | 3.66        | 12.32        | 47.21        | 0 (0.000%)      | 100.000%      | PASS (0)  |
| [F1](01-250vu-30s.summary.json)         | 250  | 30s  | 8,100         | 158.08   | 5,677 | 2,022  | 401    | 82.67       | 304.89      | 486.05      | 350.60       | 600.64       | 0 (0.000%)      | 100.000%      | PASS (0)  |
| [F2](02-1000vu-30s.summary.json)        | 1000 | 30s  | 10,072        | 108.01   | 7,128 | 2,455  | 489    | 2,352.37    | 8,983.21    | 10,000.75   | 7,980.10     | 8,191.37     | 1,269 (12.599%) | 87.401%       | FAIL (99) |

HTTP duration excludes initial connection/DNS and sleep. Failed reads can contribute zero durations. Mixed RPS excludes setup counts but uses k6's reported counter-rate denominator, which includes setup wall time. This can lower mixed RPS substantially at large account counts; it is not a steady-window throughput estimate.

## Why each stage passed or failed

| Run | Failed criteria                                                                                                                                                                                                                                 | Request warnings | Connection refusals | Timeout warnings | Container state                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------- | ---------------- | ------------------------------------------------------------------------------------------- |
| F0  | None                                                                                                                                                                                                                                            | 0                | 0                   | 0                | API: running=true; OOM=false; restarts 0 -> 0; DB: running=true; OOM=false; restarts 0 -> 0 |
| F1  | None                                                                                                                                                                                                                                            | 0                | 0                   | 0                | API: running=true; OOM=false; restarts 0 -> 0; DB: running=true; OOM=false; restarts 0 -> 0 |
| F2  | `http_req_duration{phase:load,kind:login}: p(95)<1000`; `http_req_duration{phase:load,kind:read}: p(95)<500`; `checks{phase:load}: rate>0.99`; `http_req_duration{phase:load,kind:write}: p(95)<1000`; `http_req_failed{phase:load}: rate<0.01` | 1269             | 0                   | 1269             | API: running=true; OOM=false; restarts 0 -> 0; DB: running=true; OOM=false; restarts 0 -> 0 |

F0: **PASS (0)** — 30 load requests, 1.07 requests/second, read p95 3.32 ms, 0 failed requests (0.000%). Every configured load threshold passed.

F1: **PASS (0)** — 8,100 load requests, 158.08 requests/second, read p95 304.89 ms, 0 failed requests (0.000%). Every configured load threshold passed.

F2: **FAIL (99)** — 10,072 load requests, 108.01 requests/second, read p95 8,983.21 ms, 1,269 failed requests (12.599%). Failed criteria: `http_req_duration{phase:load,kind:login}: p(95)<1000`, `http_req_duration{phase:load,kind:read}: p(95)<500`, `checks{phase:load}: rate>0.99`, `http_req_duration{phase:load,kind:write}: p(95)<1000`, `http_req_failed{phase:load}: rate<0.01`.

## Sampled CPU and RAM

| Run | API max CPU | API max MiB | PostgreSQL max CPU | PostgreSQL max MiB | Samples API / DB | Generator max MiB |
| --- | ----------- | ----------- | ------------------ | ------------------ | ---------------- | ----------------- |
| F0  | 25.03%      | 98.83       | 5.45%              | 52.30              | 6 / 6            | 11.86             |
| F1  | 100.63%     | 136.40      | 18.94%             | 73.00              | 10 / 10          | 223.10            |
| F2  | 107.10%     | 160.70      | 22.53%             | 75.46              | 18 / 18          | 1,666.05          |

Sampling includes setup and graceful completion, and a two-second delay plus Docker query time. Docker generator queries add elapsed time, so sample cadence is irregular. Native generator memory was not collected.

## CPU throttling and pool observations

| Run | Scheduler periods | Throttled periods | Share throttled | Throttled time (seconds) | Max sampled pool waiters |
| --- | ----------------- | ----------------- | --------------- | ------------------------ | ------------------------ |
| F0  | 86                | 4                 | 4.651%          | 0.112                    | 0                        |
| F1  | 563               | 428               | 76.021%         | 83.827                   | 30                       |
| F2  | 1033              | 1004              | 97.193%         | 212.530                  | 503                      |

The actual API cgroup was resolved in every stage. CPU snapshots cover the entire execution interval, including setup. Pool observations are ten seconds apart.

## What to learn from these results

Every failed threshold remains visible. A latency failure is not cancelled by a passing error rate. More VUs need not mean more completed work; compare throughput, tails, failures and CPU together. Small repeated reads, distinct-account mixed traffic, spike traffic and five-minute repeats cover different conditions and cannot be treated as equivalent capacity measurements.

## Evidence links for every stage

| Stage         | Readable report                    | Raw metrics                        | Console                  | Docker samples                    | API observations                           |
| ------------- | ---------------------------------- | ---------------------------------- | ------------------------ | --------------------------------- | ------------------------------------------ |
| 00-1vu-30s    | [Report](00-1vu-30s.summary.md)    | [JSON](00-1vu-30s.summary.json)    | [Log](00-1vu-30s.log)    | [Stats](00-1vu-30s.stats.json)    | [API](00-1vu-30s.api-observations.json)    |
| 01-250vu-30s  | [Report](01-250vu-30s.summary.md)  | [JSON](01-250vu-30s.summary.json)  | [Log](01-250vu-30s.log)  | [Stats](01-250vu-30s.stats.json)  | [API](01-250vu-30s.api-observations.json)  |
| 02-1000vu-30s | [Report](02-1000vu-30s.summary.md) | [JSON](02-1000vu-30s.summary.json) | [Log](02-1000vu-30s.log) | [Stats](02-1000vu-30s.stats.json) | [API](02-1000vu-30s.api-observations.json) |

# Version 1 campaign A: Windows host through the published API port

**8 stages: 5 passed and 3 failed.** 95,704 organization reads and 5,171 failed requests were recorded. Every planned stage is retained.

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
| Workload / profile | organization-read / steady                                         |
| Identity           | One shared account and organization per stage                      |
| Warm-up            | 1 VU / 10s                                                         |
| Environment        | [environment.json](environment.json)                               |
| Execution          | [runs.json](runs.json)                                             |

## Every stage: traffic, correctness and latency

| Run                                     | VUs  | Time | Reads  | Read RPS | Avg ms | p95 ms | p99 ms   | Failed reads (%) | Checks passed | Result    |
| --------------------------------------- | ---- | ---- | ------ | -------- | ------ | ------ | -------- | ---------------- | ------------- | --------- |
| [A0](00-1vu-10s.summary.json) (warm-up) | 1    | 10s  | 10     | 0.98     | 3.69   | 4.19   | 4.24     | 0 (0.000%)       | 100.000%      | PASS (0)  |
| [A1](01-10vu-30s.summary.json)          | 10   | 30s  | 300    | 9.92     | 4.56   | 6.72   | 33.32    | 0 (0.000%)       | 100.000%      | PASS (0)  |
| [A2](02-50vu-30s.summary.json)          | 50   | 30s  | 1,500  | 49.51    | 5.53   | 13.64  | 46.80    | 0 (0.000%)       | 100.000%      | PASS (0)  |
| [A3](03-100vu-30s.summary.json)         | 100  | 30s  | 3,000  | 98.76    | 6.13   | 11.82  | 104.40   | 0 (0.000%)       | 100.000%      | PASS (0)  |
| [A4](04-250vu-30s.summary.json)         | 250  | 30s  | 7,500  | 243.85   | 13.80  | 85.35  | 188.63   | 20 (0.267%)      | 99.733%       | PASS (0)  |
| [A5](05-500vu-30s.summary.json)         | 500  | 30s  | 15,000 | 486.49   | 15.35  | 65.73  | 287.11   | 197 (1.313%)     | 98.687%       | FAIL (99) |
| [A6](06-1000vu-30s.summary.json)        | 1000 | 30s  | 28,745 | 923.71   | 58.47  | 228.88 | 429.12   | 1,206 (4.196%)   | 95.804%       | FAIL (99) |
| [A7](07-2000vu-30s.summary.json)        | 2000 | 30s  | 39,649 | 1,259.82 | 538.08 | 990.24 | 3,248.53 | 3,748 (9.453%)   | 90.547%       | FAIL (99) |

HTTP duration excludes initial connection/DNS and sleep. Failed reads can contribute zero durations. Mixed RPS excludes setup counts but uses k6's reported counter-rate denominator, which includes setup wall time. This can lower mixed RPS substantially at large account counts; it is not a steady-window throughput estimate.

## Why each stage passed or failed

| Run | Failed criteria                                                                                                                                                          | Request warnings | Connection refusals | Timeout warnings | Container state                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | ------------------- | ---------------- | ------------------------------------------------------------------------------------------- |
| A0  | None                                                                                                                                                                     | 0                | 0                   | 0                | API: running=true; OOM=false; restarts 0 -> 0; DB: running=true; OOM=false; restarts 0 -> 0 |
| A1  | None                                                                                                                                                                     | 0                | 0                   | 0                | API: running=true; OOM=false; restarts 0 -> 0; DB: running=true; OOM=false; restarts 0 -> 0 |
| A2  | None                                                                                                                                                                     | 0                | 0                   | 0                | API: running=true; OOM=false; restarts 0 -> 0; DB: running=true; OOM=false; restarts 0 -> 0 |
| A3  | None                                                                                                                                                                     | 0                | 0                   | 0                | API: running=true; OOM=false; restarts 0 -> 0; DB: running=true; OOM=false; restarts 0 -> 0 |
| A4  | None                                                                                                                                                                     | 20               | 20                  | 0                | API: running=true; OOM=false; restarts 0 -> 0; DB: running=true; OOM=false; restarts 0 -> 0 |
| A5  | `checks{operation:organization_read}: rate>0.99`; `http_req_failed{operation:organization_read}: rate<0.01`                                                              | 197              | 197                 | 0                | API: running=true; OOM=false; restarts 0 -> 0; DB: running=true; OOM=false; restarts 0 -> 0 |
| A6  | `http_req_failed{operation:organization_read}: rate<0.01`; `checks{operation:organization_read}: rate>0.99`                                                              | 1206             | 1206                | 0                | API: running=true; OOM=false; restarts 0 -> 0; DB: running=true; OOM=false; restarts 0 -> 0 |
| A7  | `http_req_failed{operation:organization_read}: rate<0.01`; `checks{operation:organization_read}: rate>0.99`; `http_req_duration{operation:organization_read}: p(95)<500` | 3748             | 3748                | 0                | API: running=true; OOM=false; restarts 0 -> 0; DB: running=true; OOM=false; restarts 0 -> 0 |

A0: **PASS (0)** — 10 organization reads, 0.98 requests/second, read p95 4.19 ms, 0 failed requests (0.000%). Every configured load threshold passed.

A1: **PASS (0)** — 300 organization reads, 9.92 requests/second, read p95 6.72 ms, 0 failed requests (0.000%). Every configured load threshold passed.

A2: **PASS (0)** — 1,500 organization reads, 49.51 requests/second, read p95 13.64 ms, 0 failed requests (0.000%). Every configured load threshold passed.

A3: **PASS (0)** — 3,000 organization reads, 98.76 requests/second, read p95 11.82 ms, 0 failed requests (0.000%). Every configured load threshold passed.

A4: **PASS (0)** — 7,500 organization reads, 243.85 requests/second, read p95 85.35 ms, 20 failed requests (0.267%). Every configured load threshold passed.

A5: **FAIL (99)** — 15,000 organization reads, 486.49 requests/second, read p95 65.73 ms, 197 failed requests (1.313%). Failed criteria: `checks{operation:organization_read}: rate>0.99`, `http_req_failed{operation:organization_read}: rate<0.01`.

A6: **FAIL (99)** — 28,745 organization reads, 923.71 requests/second, read p95 228.88 ms, 1,206 failed requests (4.196%). Failed criteria: `http_req_failed{operation:organization_read}: rate<0.01`, `checks{operation:organization_read}: rate>0.99`.

A7: **FAIL (99)** — 39,649 organization reads, 1,259.82 requests/second, read p95 990.24 ms, 3,748 failed requests (9.453%). Failed criteria: `http_req_failed{operation:organization_read}: rate<0.01`, `checks{operation:organization_read}: rate>0.99`, `http_req_duration{operation:organization_read}: p(95)<500`.

## Sampled CPU and RAM

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

Sampling includes setup and graceful completion, and a two-second delay plus Docker query time. Docker generator queries add elapsed time, so sample cadence is irregular. Native generator memory was not collected.

## CPU throttling and pool observations

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

The actual API cgroup was resolved in every stage. CPU snapshots cover the entire execution interval, including setup. Pool observations are ten seconds apart.

## What to learn from these results

Every failed threshold remains visible. A latency failure is not cancelled by a passing error rate. More VUs need not mean more completed work; compare throughput, tails, failures and CPU together. Small repeated reads, distinct-account mixed traffic, spike traffic and five-minute repeats cover different conditions and cannot be treated as equivalent capacity measurements.

## Evidence links for every stage

| Stage         | Readable report                    | Raw metrics                        | Console                  | Docker samples                    | API observations                           |
| ------------- | ---------------------------------- | ---------------------------------- | ------------------------ | --------------------------------- | ------------------------------------------ |
| 00-1vu-10s    | [Report](00-1vu-10s.summary.md)    | [JSON](00-1vu-10s.summary.json)    | [Log](00-1vu-10s.log)    | [Stats](00-1vu-10s.stats.json)    | [API](00-1vu-10s.api-observations.json)    |
| 01-10vu-30s   | [Report](01-10vu-30s.summary.md)   | [JSON](01-10vu-30s.summary.json)   | [Log](01-10vu-30s.log)   | [Stats](01-10vu-30s.stats.json)   | [API](01-10vu-30s.api-observations.json)   |
| 02-50vu-30s   | [Report](02-50vu-30s.summary.md)   | [JSON](02-50vu-30s.summary.json)   | [Log](02-50vu-30s.log)   | [Stats](02-50vu-30s.stats.json)   | [API](02-50vu-30s.api-observations.json)   |
| 03-100vu-30s  | [Report](03-100vu-30s.summary.md)  | [JSON](03-100vu-30s.summary.json)  | [Log](03-100vu-30s.log)  | [Stats](03-100vu-30s.stats.json)  | [API](03-100vu-30s.api-observations.json)  |
| 04-250vu-30s  | [Report](04-250vu-30s.summary.md)  | [JSON](04-250vu-30s.summary.json)  | [Log](04-250vu-30s.log)  | [Stats](04-250vu-30s.stats.json)  | [API](04-250vu-30s.api-observations.json)  |
| 05-500vu-30s  | [Report](05-500vu-30s.summary.md)  | [JSON](05-500vu-30s.summary.json)  | [Log](05-500vu-30s.log)  | [Stats](05-500vu-30s.stats.json)  | [API](05-500vu-30s.api-observations.json)  |
| 06-1000vu-30s | [Report](06-1000vu-30s.summary.md) | [JSON](06-1000vu-30s.summary.json) | [Log](06-1000vu-30s.log) | [Stats](06-1000vu-30s.stats.json) | [API](06-1000vu-30s.api-observations.json) |
| 07-2000vu-30s | [Report](07-2000vu-30s.summary.md) | [JSON](07-2000vu-30s.summary.json) | [Log](07-2000vu-30s.log) | [Stats](07-2000vu-30s.stats.json) | [API](07-2000vu-30s.api-observations.json) |

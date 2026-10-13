# Version 1 campaign C: longer repeat and stress stage

**3 stages: 1 passed and 2 failed.** 165,775 organization reads and 6,232 failed requests were recorded. Every planned stage is retained.

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
| Workload / profile | organization-read / steady                                   |
| Identity           | One shared account and organization per stage                |
| Warm-up            | 1 VU / 10s                                                   |
| Environment        | [environment.json](environment.json)                         |
| Execution          | [runs.json](runs.json)                                       |

## Every stage: traffic, correctness and latency

| Run                                     | VUs  | Time | Reads  | Read RPS | Avg ms   | p95 ms   | p99 ms   | Failed reads (%) | Checks passed | Result    |
| --------------------------------------- | ---- | ---- | ------ | -------- | -------- | -------- | -------- | ---------------- | ------------- | --------- |
| [C0](00-1vu-10s.summary.json) (warm-up) | 1    | 10s  | 10     | 0.99     | 2.49     | 3.28     | 3.29     | 0 (0.000%)       | 100.000%      | PASS (0)  |
| [C1](01-2000vu-1m.summary.json)         | 2000 | 1m   | 81,658 | 1,434.53 | 445.37   | 1,010.86 | 1,246.76 | 0 (0.000%)       | 100.000%      | FAIL (99) |
| [C2](02-5000vu-1m.summary.json)         | 5000 | 1m   | 84,107 | 1,436.77 | 2,167.17 | 5,616.15 | 8,973.45 | 6,232 (7.410%)   | 92.590%       | FAIL (99) |

HTTP duration excludes initial connection/DNS and sleep. Failed reads can contribute zero durations. Mixed RPS excludes setup counts but uses k6's reported counter-rate denominator, which includes setup wall time. This can lower mixed RPS substantially at large account counts; it is not a steady-window throughput estimate.

## Why each stage passed or failed

| Run | Failed criteria                                                                                                                                                          | Request warnings | Connection refusals | Timeout warnings | Container state                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | ------------------- | ---------------- | ------------------------------------------------------------------------------------------- |
| C0  | None                                                                                                                                                                     | 0                | 0                   | 0                | API: running=true; OOM=false; restarts 0 -> 0; DB: running=true; OOM=false; restarts 0 -> 0 |
| C1  | `http_req_duration{operation:organization_read}: p(95)<500`                                                                                                              | 0                | 0                   | 0                | API: running=true; OOM=false; restarts 0 -> 0; DB: running=true; OOM=false; restarts 0 -> 0 |
| C2  | `http_req_failed{operation:organization_read}: rate<0.01`; `http_req_duration{operation:organization_read}: p(95)<500`; `checks{operation:organization_read}: rate>0.99` | 5499             | 0                   | 5499             | API: running=true; OOM=false; restarts 0 -> 0; DB: running=true; OOM=false; restarts 0 -> 0 |

C0: **PASS (0)** — 10 organization reads, 0.99 requests/second, read p95 3.28 ms, 0 failed requests (0.000%). Every configured load threshold passed.

C1: **FAIL (99)** — 81,658 organization reads, 1,434.53 requests/second, read p95 1,010.86 ms, 0 failed requests (0.000%). Failed criteria: `http_req_duration{operation:organization_read}: p(95)<500`.

C2: **FAIL (99)** — 84,107 organization reads, 1,436.77 requests/second, read p95 5,616.15 ms, 6,232 failed requests (7.410%). Failed criteria: `http_req_failed{operation:organization_read}: rate<0.01`, `http_req_duration{operation:organization_read}: p(95)<500`, `checks{operation:organization_read}: rate>0.99`.

## Sampled CPU and RAM

| Run | API max CPU | API max MiB | PostgreSQL max CPU | PostgreSQL max MiB | Samples API / DB | Generator max MiB |
| --- | ----------- | ----------- | ------------------ | ------------------ | ---------------- | ----------------- |
| C0  | 7.08%       | 106.30      | 0.40%              | 45.54              | 2 / 2            | 11.11             |
| C1  | 103.19%     | 116.90      | 47.83%             | 61.21              | 11 / 11          | 691.00            |
| C2  | 104.35%     | 191.20      | 50.56%             | 61.66              | 11 / 11          | 1,528.83          |

Sampling includes setup and graceful completion, and a two-second delay plus Docker query time. Docker generator queries add elapsed time, so sample cadence is irregular. Native generator memory was not collected.

## CPU throttling and pool observations

| Run | Scheduler periods | Throttled periods | Share throttled | Throttled time (seconds) | Max sampled pool waiters |
| --- | ----------------- | ----------------- | --------------- | ------------------------ | ------------------------ |
| C0  | 33                | 0                 | 0.000%          | 0.000                    | 0                        |
| C1  | 612               | 208               | 33.987%         | 8.444                    | 718                      |
| C2  | 634               | 245               | 38.644%         | 14.721                   | 3490                     |

The actual API cgroup was resolved in every stage. CPU snapshots cover the entire execution interval, including setup. Pool observations are ten seconds apart.

## What to learn from these results

Every failed threshold remains visible. A latency failure is not cancelled by a passing error rate. More VUs need not mean more completed work; compare throughput, tails, failures and CPU together. Small repeated reads, distinct-account mixed traffic, spike traffic and five-minute repeats cover different conditions and cannot be treated as equivalent capacity measurements.

## Evidence links for every stage

| Stage        | Readable report                   | Raw metrics                       | Console                 | Docker samples                   | API observations                          |
| ------------ | --------------------------------- | --------------------------------- | ----------------------- | -------------------------------- | ----------------------------------------- |
| 00-1vu-10s   | [Report](00-1vu-10s.summary.md)   | [JSON](00-1vu-10s.summary.json)   | [Log](00-1vu-10s.log)   | [Stats](00-1vu-10s.stats.json)   | [API](00-1vu-10s.api-observations.json)   |
| 01-2000vu-1m | [Report](01-2000vu-1m.summary.md) | [JSON](01-2000vu-1m.summary.json) | [Log](01-2000vu-1m.log) | [Stats](01-2000vu-1m.stats.json) | [API](01-2000vu-1m.api-observations.json) |
| 02-5000vu-1m | [Report](02-5000vu-1m.summary.md) | [JSON](02-5000vu-1m.summary.json) | [Log](02-5000vu-1m.log) | [Stats](02-5000vu-1m.stats.json) | [API](02-5000vu-1m.api-observations.json) |

# Version 1 campaign B: k6 inside the Docker network

**4 stages: 3 passed and 1 failed.** 87,176 organization reads and 0 failed requests were recorded. Every planned stage is retained.

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

| Run                                     | VUs  | Time | Reads  | Read RPS | Avg ms | p95 ms | p99 ms   | Failed reads (%) | Checks passed | Result    |
| --------------------------------------- | ---- | ---- | ------ | -------- | ------ | ------ | -------- | ---------------- | ------------- | --------- |
| [B0](00-1vu-10s.summary.json) (warm-up) | 1    | 10s  | 10     | 0.99     | 2.48   | 3.20   | 3.27     | 0 (0.000%)       | 100.000%      | PASS (0)  |
| [B1](01-500vu-30s.summary.json)         | 500  | 30s  | 14,891 | 511.82   | 19.11  | 53.49  | 517.68   | 0 (0.000%)       | 100.000%      | PASS (0)  |
| [B2](02-1000vu-30s.summary.json)        | 1000 | 30s  | 29,474 | 1,014.60 | 31.59  | 149.62 | 429.61   | 0 (0.000%)       | 100.000%      | PASS (0)  |
| [B3](03-2000vu-30s.summary.json)        | 2000 | 30s  | 42,801 | 1,453.86 | 387.27 | 796.71 | 2,284.46 | 0 (0.000%)       | 100.000%      | FAIL (99) |

HTTP duration excludes initial connection/DNS and sleep. Failed reads can contribute zero durations. Mixed RPS excludes setup counts but uses k6's reported counter-rate denominator, which includes setup wall time. This can lower mixed RPS substantially at large account counts; it is not a steady-window throughput estimate.

## Why each stage passed or failed

| Run | Failed criteria                                             | Request warnings | Connection refusals | Timeout warnings | Container state                                                                             |
| --- | ----------------------------------------------------------- | ---------------- | ------------------- | ---------------- | ------------------------------------------------------------------------------------------- |
| B0  | None                                                        | 0                | 0                   | 0                | API: running=true; OOM=false; restarts 0 -> 0; DB: running=true; OOM=false; restarts 0 -> 0 |
| B1  | None                                                        | 0                | 0                   | 0                | API: running=true; OOM=false; restarts 0 -> 0; DB: running=true; OOM=false; restarts 0 -> 0 |
| B2  | None                                                        | 0                | 0                   | 0                | API: running=true; OOM=false; restarts 0 -> 0; DB: running=true; OOM=false; restarts 0 -> 0 |
| B3  | `http_req_duration{operation:organization_read}: p(95)<500` | 0                | 0                   | 0                | API: running=true; OOM=false; restarts 0 -> 0; DB: running=true; OOM=false; restarts 0 -> 0 |

B0: **PASS (0)** — 10 organization reads, 0.99 requests/second, read p95 3.20 ms, 0 failed requests (0.000%). Every configured load threshold passed.

B1: **PASS (0)** — 14,891 organization reads, 511.82 requests/second, read p95 53.49 ms, 0 failed requests (0.000%). Every configured load threshold passed.

B2: **PASS (0)** — 29,474 organization reads, 1,014.60 requests/second, read p95 149.62 ms, 0 failed requests (0.000%). Every configured load threshold passed.

B3: **FAIL (99)** — 42,801 organization reads, 1,453.86 requests/second, read p95 796.71 ms, 0 failed requests (0.000%). Failed criteria: `http_req_duration{operation:organization_read}: p(95)<500`.

## Sampled CPU and RAM

| Run | API max CPU | API max MiB | PostgreSQL max CPU | PostgreSQL max MiB | Samples API / DB | Generator max MiB |
| --- | ----------- | ----------- | ------------------ | ------------------ | ---------------- | ----------------- |
| B0  | 7.09%       | 105.90      | 3.73%              | 45.38              | 2 / 2            | 11.88             |
| B1  | 55.99%      | 77.06       | 18.68%             | 61.23              | 6 / 6            | 180.00            |
| B2  | 67.90%      | 81.70       | 29.64%             | 61.16              | 6 / 6            | 348.10            |
| B3  | 104.43%     | 112.40      | 46.61%             | 61.93              | 6 / 6            | 603.20            |

Sampling includes setup and graceful completion, and a two-second delay plus Docker query time. Docker generator queries add elapsed time, so sample cadence is irregular. Native generator memory was not collected.

## CPU throttling and pool observations

| Run | Scheduler periods | Throttled periods | Share throttled | Throttled time (seconds) | Max sampled pool waiters |
| --- | ----------------- | ----------------- | --------------- | ------------------------ | ------------------------ |
| B0  | 39                | 1                 | 2.564%          | 0.017                    | 0                        |
| B1  | 308               | 25                | 8.117%          | 1.140                    | 0                        |
| B2  | 308               | 14                | 4.545%          | 0.869                    | 0                        |
| B3  | 317               | 90                | 28.391%         | 3.736                    | 603                      |

The actual API cgroup was resolved in every stage. CPU snapshots cover the entire execution interval, including setup. Pool observations are ten seconds apart.

## What to learn from these results

Every failed threshold remains visible. A latency failure is not cancelled by a passing error rate. More VUs need not mean more completed work; compare throughput, tails, failures and CPU together. Small repeated reads, distinct-account mixed traffic, spike traffic and five-minute repeats cover different conditions and cannot be treated as equivalent capacity measurements.

## Evidence links for every stage

| Stage         | Readable report                    | Raw metrics                        | Console                  | Docker samples                    | API observations                           |
| ------------- | ---------------------------------- | ---------------------------------- | ------------------------ | --------------------------------- | ------------------------------------------ |
| 00-1vu-10s    | [Report](00-1vu-10s.summary.md)    | [JSON](00-1vu-10s.summary.json)    | [Log](00-1vu-10s.log)    | [Stats](00-1vu-10s.stats.json)    | [API](00-1vu-10s.api-observations.json)    |
| 01-500vu-30s  | [Report](01-500vu-30s.summary.md)  | [JSON](01-500vu-30s.summary.json)  | [Log](01-500vu-30s.log)  | [Stats](01-500vu-30s.stats.json)  | [API](01-500vu-30s.api-observations.json)  |
| 02-1000vu-30s | [Report](02-1000vu-30s.summary.md) | [JSON](02-1000vu-30s.summary.json) | [Log](02-1000vu-30s.log) | [Stats](02-1000vu-30s.stats.json) | [API](02-1000vu-30s.api-observations.json) |
| 03-2000vu-30s | [Report](03-2000vu-30s.summary.md) | [JSON](03-2000vu-30s.summary.json) | [Log](03-2000vu-30s.log) | [Stats](03-2000vu-30s.stats.json) | [API](03-2000vu-30s.api-observations.json) |

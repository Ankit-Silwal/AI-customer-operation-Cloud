# Version 1 campaign G: Version 1 five-minute steady repeat

**1 stages: 1 passed and 0 failed.** 30 load requests and 0 failed requests were recorded. Campaign is still in progress.

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
| Workload / profile | mixed / soak                                                 |
| Identity           | One distinct account and organization per VU                 |
| Warm-up            | 1 VU / 30s to cover all actions                              |
| Environment        | [environment.json](environment.json)                         |
| Execution          | [runs.json](runs.json)                                       |

## Every stage: traffic, correctness and latency

| Run                                     | VUs | Time | Load requests | Load RPS | Reads | Writes | Logins | Read avg ms | Read p95 ms | Read p99 ms | Write p95 ms | Login p95 ms | Failed load (%) | Checks passed | Result   |
| --------------------------------------- | --- | ---- | ------------- | -------- | ----- | ------ | ------ | ----------- | ----------- | ----------- | ------------ | ------------ | --------------- | ------------- | -------- |
| [G0](00-1vu-30s.summary.json) (warm-up) | 1   | 30s  | 30            | 1.07     | 24    | 5      | 1      | 2.86        | 4.47        | 4.96        | 5.07         | 45.76        | 0 (0.000%)      | 100.000%      | PASS (0) |

HTTP duration excludes initial connection/DNS and sleep. Failed reads can contribute zero durations. Mixed RPS excludes setup counts but uses k6's reported counter-rate denominator, which includes setup wall time. This can lower mixed RPS substantially at large account counts; it is not a steady-window throughput estimate.

## Why each stage passed or failed

| Run | Failed criteria | Request warnings | Connection refusals | Timeout warnings | Container state                                                                             |
| --- | --------------- | ---------------- | ------------------- | ---------------- | ------------------------------------------------------------------------------------------- |
| G0  | None            | 0                | 0                   | 0                | API: running=true; OOM=false; restarts 0 -> 0; DB: running=true; OOM=false; restarts 0 -> 0 |

G0: **PASS (0)** — 30 load requests, 1.07 requests/second, read p95 4.47 ms, 0 failed requests (0.000%). Every configured load threshold passed.

## Sampled CPU and RAM

| Run | API max CPU | API max MiB | PostgreSQL max CPU | PostgreSQL max MiB | Samples API / DB | Generator max MiB |
| --- | ----------- | ----------- | ------------------ | ------------------ | ---------------- | ----------------- |
| G0  | 33.60%      | 53.94       | 7.68%              | 55.20              | 6 / 6            | 12.07             |

Sampling includes setup and graceful completion, and a two-second delay plus Docker query time. Docker generator queries add elapsed time, so sample cadence is irregular. Native generator memory was not collected.

## CPU throttling and pool observations

| Run | Scheduler periods | Throttled periods | Share throttled | Throttled time (seconds) | Max sampled pool waiters |
| --- | ----------------- | ----------------- | --------------- | ------------------------ | ------------------------ |
| G0  | 78                | 3                 | 3.846%          | 0.034                    | 0                        |

The actual API cgroup was resolved in every stage. CPU snapshots cover the entire execution interval, including setup. Pool observations are ten seconds apart.

## What to learn from these results

Every failed threshold remains visible. A latency failure is not cancelled by a passing error rate. More VUs need not mean more completed work; compare throughput, tails, failures and CPU together. Small repeated reads, distinct-account mixed traffic, spike traffic and five-minute repeats cover different conditions and cannot be treated as equivalent capacity measurements.

## Evidence links for every stage

| Stage      | Readable report                 | Raw metrics                     | Console               | Docker samples                 | API observations                        |
| ---------- | ------------------------------- | ------------------------------- | --------------------- | ------------------------------ | --------------------------------------- |
| 00-1vu-30s | [Report](00-1vu-30s.summary.md) | [JSON](00-1vu-30s.summary.json) | [Log](00-1vu-30s.log) | [Stats](00-1vu-30s.stats.json) | [API](00-1vu-30s.api-observations.json) |

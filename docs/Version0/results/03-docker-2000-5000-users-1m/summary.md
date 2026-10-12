# Docker campaign 03: 2000 and 5000 users for one minute

**3 stages: 2 passed and 1 failed.** 233,927 organization reads and 568 failed reads were recorded across the stages.

[Beginner helper](../helper.md) | [Windows overview](../01-windows-10-50-100-250-500-1000-2000-users-30s/summary.md) | [Full test report](../../testResult.md)

This report combines the existing results from 11 October 2026 into one readable file. No new load test was run to create it. Numbers below are rounded; the linked JSON preserves full precision. Each row describes a separate stage; percentiles are not combined across stages.

## What ran

| Item | Value |
| --- | --- |
| Load generator | Separate Docker container running grafana/k6:2.3.0 |
| Request path | k6 container -> http://api:3001 -> API -> PostgreSQL |
| API limit | 1 CPU + 1 GiB RAM (1024 MiB) |
| PostgreSQL limit | A separate 1 CPU + 1 GiB RAM (1024 MiB) |
| Generator limit | No explicit container CPU/RAM cap; shares the Docker VM resource pool |
| Workload | Read one organization, check status/ID, wait one second, repeat |
| Setup | Register one account, create one organization, verify access: three HTTP requests once per stage |
| User identity | All VUs in a stage share its one account and organization |
| Warm-up | Stage 00: one user for 10 seconds |
| Environment evidence | [environment.json](environment.json) |
| Execution and exit-code evidence | [runs.json](runs.json) |

A virtual user is one independent worker running the loop; it is not automatically a separate account. Requested duration is the load window. Setup, graceful completion, resource sampling and reporting can add wall-clock time.

## Every stage: traffic, correctness and latency

Read RPS means organization-read requests per second across all VUs. Read totals exclude setup; total HTTP includes setup. Rate percentages refer to failures or check successes, not request speed.

| Stage and raw summary | VUs | Duration | Reads | Total HTTP | Read RPS | Avg ms | p95 ms | p99 ms | Failed reads | Checks passed | Result |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- |
| [00-1vu-10s](00-1vu-10s.summary.json) | 1 | 10s | 10 | 13 | 1.00 | 1.70 | 2.16 | 2.36 | 0 (0.000%) | 100.000% | PASS (0) |
| [01-2000vu-1m](01-2000vu-1m.summary.json) | 2,000 | 1m | 116,623 | 116,626 | 1,918.94 | 29.29 | 109.60 | 695.04 | 0 (0.000%) | 100.000% | PASS (0) |
| [02-5000vu-1m](02-5000vu-1m.summary.json) | 5,000 | 1m | 117,294 | 117,297 | 1,915.27 | 1,531.91 | 2,341.15 | 4,664.34 | 568 (0.484%) | 99.516% | FAIL (99) |

p95 is the estimated 95th percentile: about 95% of measured durations are at or below it. p99 describes a slower tail. 1000 ms = one second. Read HTTP duration excludes initial connection/DNS work and the one-second sleep. Inspect errors alongside timings.

## Why each stage passed or failed

The exercise requires at least one read, failed reads below 1%, read p95 below 500 ms, and check success above 99%. Every criterion must pass.

| Stage | Reads > 0 | Failed reads < 1% | p95 < 500 ms | Checks > 99% | Exit code |
| --- | --- | --- | --- | --- | ---: |
| 00-1vu-10s | PASS | PASS (0.000%) | PASS (2.16 ms) | PASS (100.000%) | 0 |
| 01-2000vu-1m | PASS | PASS (0.000%) | PASS (109.60 ms) | PASS (100.000%) | 0 |
| 02-5000vu-1m | PASS | PASS (0.484%) | FAIL (2,341.15 ms) | PASS (99.516%) | 99 |

These are learning criteria, not a production SLA. Exit 0 means the stage passed; exit 99 means a threshold was breached. In the raw summary JSON, false inside thresholds means did not fail and true means failed.

## Sampled CPU and RAM

| Stage | API max CPU | API max RAM (MiB) | PostgreSQL max CPU | PostgreSQL max RAM (MiB) | Samples per container |
| --- | ---: | ---: | ---: | ---: | ---: |
| 00-1vu-10s | 5.62% | 92.46 | 2.83% | 23.00 | 3 |
| 01-2000vu-1m | 99.62% | 98.81 | 42.37% | 38.01 | 16 |
| 02-5000vu-1m | 105.45% | 178.30 | 73.30% | 38.52 | 16 |

These are occasional sampled maxima, not guaranteed instantaneous peaks. About 100% CPU represents one logical CPU's work. A short sample can read slightly above 100% despite the one-CPU quota. RAM limits are caps, not reserved or immediately allocated memory.

## Errors and container health

| Stage | Request warnings in log | Failed reads | API restarts before -> after | PostgreSQL restarts before -> after | OOM killed after run |
| --- | ---: | ---: | --- | --- | --- |
| 00-1vu-10s | 0 | 0 | 0 -> 0 | 0 -> 0 | API: false; DB: false |
| 01-2000vu-1m | 0 | 0 | 0 -> 0 | 0 -> 0 | API: false; DB: false |
| 02-5000vu-1m | 0 | 568 | 0 -> 0 | 0 -> 0 | API: false; DB: false |

The API and database remained running in the recorded after-run states. No restart-count increase or recorded out-of-memory kill occurred.

## CPU throttling evidence

Docker can pause CPU work when a container exhausts its allowed CPU time. Campaign 03 collected the API's actual cgroup counters; the earlier campaign did not. The recorded cpu.max was 100000 100000, confirming the one-CPU quota.

| Stage | Scheduler periods | Throttled periods | Share throttled | Recorded throttled time (seconds) |
| --- | ---: | ---: | ---: | ---: |
| 00-1vu-10s | 26 | 0 | 0.00% | 0.000 |
| 01-2000vu-1m | 611 | 50 | 8.18% | 0.739 |
| 02-5000vu-1m | 618 | 474 | 76.70% | 14.913 |

These counters describe API CPU throttling, not a direct measurement of each request's waiting time.

## What to learn from the 2000-user and 5000-user comparison

- At 2000 users, the one-minute repeat passed: 1918.94 reads/second, p95 109.60 ms and zero failed reads. Some slow-tail requests still exceeded 500 ms; p99 was 695.04 ms.
- At 5000 users, throughput stayed near 1915.27 reads/second while p95 rose to 2341.15 ms (2.34 seconds). This stage failed the latency criterion.
- The 568 failed reads were request timeouts. Their 0.484% failure rate remained below 1%, and check success remained above 99%, so those criteria passed. Passing the error criterion does not cancel a failed latency criterion.
- More users produced much more waiting without more completed work per second. Increased API CPU throttling supports investigating CPU/queue pressure.
- API sampled RAM reached 178.30 MiB, below its 1024 MiB cap. The test did not demonstrate memory exhaustion. Adding RAM alone is not established as a remedy.
- Profiling and SQL/pool-wait measurements are needed to identify the exact limiting work. No intermediate stage between 2000 and 5000 was tested, so the exact capacity boundary is unknown.

The 2000-user stage is a passing observation for this small read workload over one minute, not a guarantee of 2000-user capacity for every feature or cloud deployment.

## Evidence links for every stage

| Stage | Raw metrics | Console and warnings | Docker samples |
| --- | --- | --- |
| 00-1vu-10s | [JSON](00-1vu-10s.summary.json) | [Log](00-1vu-10s.log) | [Stats](00-1vu-10s.stats.json) |
| 01-2000vu-1m | [JSON](01-2000vu-1m.summary.json) | [Log](01-2000vu-1m.log) | [Stats](01-2000vu-1m.stats.json) |
| 02-5000vu-1m | [JSON](02-5000vu-1m.summary.json) | [Log](02-5000vu-1m.log) | [Stats](02-5000vu-1m.stats.json) |

This workload covers one authenticated organization GET using a shared test account and a small repeated database working set. It does not load-test registration/login storms, conversation/document writes, uploads, AI calls or a large cold database. The generator shares the Docker VM's resources with the server, so this is a local experiment.

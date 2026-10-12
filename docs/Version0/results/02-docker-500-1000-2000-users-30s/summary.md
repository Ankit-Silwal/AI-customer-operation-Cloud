# Docker campaign 02: 500, 1000 and 2000 users for 30 seconds

**4 stages: 4 passed and 0 failed.** 102,343 organization reads and 0 failed reads were recorded across the stages.

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
| [00-1vu-10s](00-1vu-10s.summary.json) | 1 | 10s | 10 | 13 | 0.99 | 1.94 | 2.28 | 2.32 | 0 (0.000%) | 100.000% | PASS (0) |
| [01-500vu-30s](01-500vu-30s.summary.json) | 500 | 30s | 15,000 | 15,003 | 487.93 | 12.69 | 60.34 | 299.08 | 0 (0.000%) | 100.000% | PASS (0) |
| [02-1000vu-30s](02-1000vu-30s.summary.json) | 1,000 | 30s | 30,000 | 30,003 | 972.95 | 17.02 | 66.38 | 318.57 | 0 (0.000%) | 100.000% | PASS (0) |
| [03-2000vu-30s](03-2000vu-30s.summary.json) | 2,000 | 30s | 57,333 | 57,336 | 1,850.80 | 53.75 | 227.52 | 747.21 | 0 (0.000%) | 100.000% | PASS (0) |

p95 is the estimated 95th percentile: about 95% of measured durations are at or below it. p99 describes a slower tail. 1000 ms = one second. Read HTTP duration excludes initial connection/DNS work and the one-second sleep. Inspect errors alongside timings.

## Why each stage passed or failed

The exercise requires at least one read, failed reads below 1%, read p95 below 500 ms, and check success above 99%. Every criterion must pass.

| Stage | Reads > 0 | Failed reads < 1% | p95 < 500 ms | Checks > 99% | Exit code |
| --- | --- | --- | --- | --- | ---: |
| 00-1vu-10s | PASS | PASS (0.000%) | PASS (2.28 ms) | PASS (100.000%) | 0 |
| 01-500vu-30s | PASS | PASS (0.000%) | PASS (60.34 ms) | PASS (100.000%) | 0 |
| 02-1000vu-30s | PASS | PASS (0.000%) | PASS (66.38 ms) | PASS (100.000%) | 0 |
| 03-2000vu-30s | PASS | PASS (0.000%) | PASS (227.52 ms) | PASS (100.000%) | 0 |

These are learning criteria, not a production SLA. Exit 0 means the stage passed; exit 99 means a threshold was breached. In the raw summary JSON, false inside thresholds means did not fail and true means failed.

## Sampled CPU and RAM

| Stage | API max CPU | API max RAM (MiB) | PostgreSQL max CPU | PostgreSQL max RAM (MiB) | Samples per container |
| --- | ---: | ---: | ---: | ---: | ---: |
| 00-1vu-10s | 0.16% | 35.35 | 2.96% | 23.21 | 3 |
| 01-500vu-30s | 46.02% | 54.10 | 13.18% | 37.98 | 8 |
| 02-1000vu-30s | 63.91% | 74.96 | 29.43% | 38.28 | 9 |
| 03-2000vu-30s | 90.63% | 98.29 | 44.78% | 38.58 | 9 |

These are occasional sampled maxima, not guaranteed instantaneous peaks. About 100% CPU represents one logical CPU's work. A short sample can read slightly above 100% despite the one-CPU quota. RAM limits are caps, not reserved or immediately allocated memory.

## Errors and container health

| Stage | Request warnings in log | Failed reads | API restarts before -> after | PostgreSQL restarts before -> after | OOM killed after run |
| --- | ---: | ---: | --- | --- | --- |
| 00-1vu-10s | 0 | 0 | 0 -> 0 | 0 -> 0 | API: false; DB: false |
| 01-500vu-30s | 0 | 0 | 0 -> 0 | 0 -> 0 | API: false; DB: false |
| 02-1000vu-30s | 0 | 0 | 0 -> 0 | 0 -> 0 | API: false; DB: false |
| 03-2000vu-30s | 0 | 0 | 0 -> 0 | 0 -> 0 | API: false; DB: false |

The API and database remained running in the recorded after-run states. No restart-count increase or recorded out-of-memory kill occurred.

## CPU-counter limitation

The runner originally read the cgroup root rather than the API's actual cgroup. Therefore the CPU-counter snapshots in this campaign's runs.json do not establish API throttling or its absence. The sampled Docker CPU/RAM table above remains useful. Campaign 03 corrected the counter scope.

## What to learn from this campaign

- All four stages passed with zero failed reads; the three load stages ran for 30 seconds each.
- At 2000 users, p95 was 227.52 ms, below 500 ms, but p99 was 747.21 ms. A p95 pass does not mean every request was fast.
- The matching Windows stages had failed-read rates of 1.460% at 500 users, 4.050% at 1000 and 6.659% at 2000; their logs recorded connection refusals. These Docker-network stages avoided those failures.
- Generator placement, network path, OS, test order and working-set warmth changed. The comparison supports investigating the Windows published-port path, but does not isolate its exact cause.
- API CPU usage rose with load, while sampled memory remained well below its cap. Neither RAM size nor this short experiment establishes whole-product capacity.

Continue with the [one-minute repeat and stress summary](../03-docker-2000-5000-users-1m/summary.md) to see how longer tests and a higher user count changed latency and CPU throttling.

## Evidence links for every stage

| Stage | Raw metrics | Console and warnings | Docker samples |
| --- | --- | --- |
| 00-1vu-10s | [JSON](00-1vu-10s.summary.json) | [Log](00-1vu-10s.log) | [Stats](00-1vu-10s.stats.json) |
| 01-500vu-30s | [JSON](01-500vu-30s.summary.json) | [Log](01-500vu-30s.log) | [Stats](01-500vu-30s.stats.json) |
| 02-1000vu-30s | [JSON](02-1000vu-30s.summary.json) | [Log](02-1000vu-30s.log) | [Stats](02-1000vu-30s.stats.json) |
| 03-2000vu-30s | [JSON](03-2000vu-30s.summary.json) | [Log](03-2000vu-30s.log) | [Stats](03-2000vu-30s.stats.json) |

This workload covers one authenticated organization GET using a shared test account and a small repeated database working set. It does not load-test registration/login storms, conversation/document writes, uploads, AI calls or a large cold database. The generator shares the Docker VM's resources with the server, so this is a local experiment.

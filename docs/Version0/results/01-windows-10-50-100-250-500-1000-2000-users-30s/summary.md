# Windows load-test overview

**8 stages: 5 passed and 3 failed.** There were 114,459 organization reads and 5,258 failed reads across these stages.

[Read the beginner helper](../helper.md) | [Full cross-campaign report](../../testResult.md)

These tests were conducted on 11 October 2026 using native Windows k6 against the Docker API through localhost:3001. Both API and PostgreSQL were capped at 1 CPU and 1 GiB each. This overview and the per-stage Markdown reports are derived from the retained results; no new test was run to generate them.

## Every conducted Windows stage

Read RPS means organization reads/second, not users. Latency values are milliseconds. Each row links to a readable report containing all exported numeric metrics, check counts, thresholds, and sampled resources.

| Stage report | Users | Duration | Reads | Read RPS | Avg ms | p95 ms | p99 ms | Failed reads | Checks passed | Result |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- |
| [00-1vu-10s](00-1vu-10s.summary.md) | 1 | 10s | 10 | 0.99 | 3.38 | 3.75 | 3.76 | 0 (0.000%) | 100.000% | PASS (0) |
| [01-10vu-30s](01-10vu-30s.summary.md) | 10 | 30s | 300 | 9.93 | 4.08 | 8.71 | 21.87 | 0 (0.000%) | 100.000% | PASS (0) |
| [02-50vu-30s](02-50vu-30s.summary.md) | 50 | 30s | 1,500 | 49.61 | 4.21 | 9.50 | 29.37 | 0 (0.000%) | 100.000% | PASS (0) |
| [03-100vu-30s](03-100vu-30s.summary.md) | 100 | 30s | 3,000 | 99.05 | 4.85 | 10.64 | 55.74 | 0 (0.000%) | 100.000% | PASS (0) |
| [04-250vu-30s](04-250vu-30s.summary.md) | 250 | 30s | 7,500 | 246.36 | 7.45 | 15.54 | 157.03 | 14 (0.187%) | 99.813% | PASS (0) |
| [05-500vu-30s](05-500vu-30s.summary.md) | 500 | 30s | 15,000 | 488.39 | 10.84 | 26.65 | 174.18 | 219 (1.460%) | 98.540% | FAIL (99) |
| [06-1000vu-30s](06-1000vu-30s.summary.md) | 1,000 | 30s | 29,826 | 960.18 | 20.13 | 109.79 | 330.35 | 1,208 (4.050%) | 95.950% | FAIL (99) |
| [07-2000vu-30s](07-2000vu-30s.summary.md) | 2,000 | 30s | 57,323 | 1,843.67 | 56.55 | 199.65 | 467.24 | 3,817 (6.659%) | 93.341% | FAIL (99) |

## CPU and RAM observations

| Stage | API max CPU | API max RAM (MiB) | PostgreSQL max CPU | PostgreSQL max RAM (MiB) | Samples per container |
| --- | ---: | ---: | ---: | ---: | ---: |
| [00-1vu-10s](00-1vu-10s.summary.md) | 0.38% | 26.59 | 0.06% | 22.40 | 3 |
| [01-10vu-30s](01-10vu-30s.summary.md) | 1.53% | 27.46 | 3.19% | 30.77 | 8 |
| [02-50vu-30s](02-50vu-30s.summary.md) | 4.30% | 30.71 | 3.98% | 37.63 | 8 |
| [03-100vu-30s](03-100vu-30s.summary.md) | 9.11% | 32.05 | 5.30% | 37.80 | 8 |
| [04-250vu-30s](04-250vu-30s.summary.md) | 23.12% | 36.82 | 9.43% | 37.95 | 8 |
| [05-500vu-30s](05-500vu-30s.summary.md) | 51.62% | 47.20 | 13.90% | 38.22 | 8 |
| [06-1000vu-30s](06-1000vu-30s.summary.md) | 50.22% | 68.65 | 21.25% | 38.57 | 8 |
| [07-2000vu-30s](07-2000vu-30s.summary.md) | 98.03% | 87.39 | 46.09% | 38.48 | 8 |

These are occasional sampled maxima. Each container had a 1024 MiB memory cap. Neither container restarted or recorded an OOM kill during these stages. The first campaign's raw CPU-counter scope was incorrect, so those counters are not evidence of API throttling.

## Understand the trend

- The one-user warm-up made 10 reads in its ten-second load window. Account creation and setup add three other HTTP requests.
- The 10-, 50-, and 100-user load stages passed with zero failed reads.
- At 250 users, 14 reads failed, but 0.187% remained below the 1% limit and all four criteria passed.
- At 500, 1000, and 2000 users, connection-refusal errors pushed the failure rate above 1% and the check pass rate below the required level. These stages failed despite p95 remaining below 500 ms.
- Total throughput increased with user count, but useful throughput and response correctness must be considered together. Each user also completes fewer loops per second when response times grow.
- These failures occurred while opening connections from Windows to the Docker API. Larger comparison stages inside Docker avoided the refusals. The exact cause was not isolated; do not label the Windows result a universal API capacity limit.

## Is this a RAM problem?

The API's highest sampled memory in this Windows campaign was 87.39 MiB, below its 1024 MiB cap; memory exhaustion was not demonstrated. API CPU reached a sampled 98.03%, so CPU pressure is also worth investigating at high load, but it does not by itself explain the connection refusals.

In the separate Docker 5000-user stage, recorded API CPU throttling and higher latency support investigating the one-CPU cap. RAM alone cannot determine supported user count. The tests exercise one small, repeatedly read organization, not the whole application or millions of unique users.

## Where to go next

Open the [1-user report](00-1vu-10s.summary.md) to learn the fields, then the [250-user report](04-250vu-30s.summary.md) to see a passing stage with some failures, then the [500-user report](05-500vu-30s.summary.md) to see why a stage fails. Compare the [Docker campaigns in the full report](../../testResult.md) after understanding the Windows results.

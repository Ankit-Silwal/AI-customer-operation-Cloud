# How to read the Version 1 load-test results

Start with the [Windows overview](01-windows-10-50-100-250-500-1000-2000-users-30s/summary.md) and [full report](../testResult.md). Each campaign has a combined summary and one readable Markdown report per stage. JSON and logs are the raw evidence.

## What happens in a test

Campaigns A–C repeat Version 0: **ask for one organization -> check status/ID -> wait one second -> repeat**. VUs share the stage's account. Campaigns D–G provision one account/organization/conversation/upload per VU and mix reads, writes and login. One action is one iteration; 70% read / 25% write / 5% login applies over completed 20-action cycles.

## Decode the names

| Name                         | Meaning                                                      |
| ---------------------------- | ------------------------------------------------------------ |
| 01 / A                       | Windows published-port read matrix, 10–2000 VUs / 30s        |
| 02 / B                       | Docker-network reads, 500/1000/2000 VUs / 30s                |
| 03 / C                       | Docker-network reads, 2000/5000 VUs / 1m                     |
| 04 / D                       | Windows mixed traffic, 10/50/100/250/500 VUs / 30s           |
| 05 / E                       | Docker mixed traffic, 250/500/1000 VUs / 30s                 |
| 06 / F                       | Docker spike, 250/1000 VUs, 5s up + 30s hold + 5s down       |
| 07 / G                       | Docker short steady repeat, 100 VUs / 5m                     |
| 00-1vu-10s                   | Stage zero, one VU, ten seconds                              |
| 00-1vu-30s                   | Mixed warm-up, long enough to execute login and writes       |
| summary.json                 | Numeric k6 metrics and threshold failure flags               |
| summary.md                   | Readable stage or combined campaign report                   |
| stats.json                   | Sampled Docker resources and host free memory                |
| api-observations.json        | API status totals and ten-second pool observations           |
| runs.json / environment.json | Commands, timestamps, image IDs, states, limits and versions |
| metrics.json                 | Combined machine-readable campaign results                   |

## Counts, rates and percentages

count is a total; request-counter rate is requests/second; checks and http_req_failed rate are fractions. Multiply fractions by 100 for percentages. In failure-rate metrics passes counts failed requests and fails counts successful requests, because the predicate is failure. Each baseline read has two checks; mixed requests have three.

Tagged counts exclude setup. **The k6 counter-rate denominator still includes setup wall time**; distinct-account provisioning can lower mixed RPS. Read/write/login p95 values are separate request-duration percentiles in ms, not cycle time. 1000 ms is one second. Failed connections may have zero HTTP duration. A low p95 is not sufficient if error/check criteria fail.

## Decisions and resources

Every configured threshold must pass. Exit 0 is pass; 99 is a threshold failure. In raw JSON, false means the threshold did not fail. The matrix keeps stress failures and returns 1 if any stage failed.

Docker CPU around 100% is one logical CPU's work. A short sample can exceed 100% despite a one-CPU time quota. Each server's RAM cap is 1024 MiB, and caps are not reservations. Resources and cgroup counters include setup and graceful completion; sampled maxima are not continuous peaks. Native k6 memory was not measured; Docker k6 samples are separate from API/DB samples. Pool waiters are ten-second observations.

## What the results establish

These are observations on one shared local machine. VUs mean concurrent workers, not a fixed arrival rate or a production user-capacity promise. Five minutes is a short soak, not a day-long stability test. Compare equivalent workloads, placements and durations, and retain both passes and failures. No credentials or setup_data are retained in summaries.

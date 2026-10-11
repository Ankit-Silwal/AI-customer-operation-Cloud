# Version 0 Docker and k6 test results

**15 Docker load runs were conducted: 11 passed and 4 failed their thresholds, covering 450,729 organization reads.** Inside the Docker network, 2,000 users passed a one-minute test at about 1,919 read requests/second with zero failures. At 5,000 users, throughput stayed near 1,915 reads/second while p95 rose to 2.34 seconds and the latency criterion failed. Windows published-port runs had separate startup connection-refusal failures. The sections below retain every run and explain these limits.

## Scope and environment

These experiments were actually executed on 11 October 2026. Every conducted Docker load run, including warm-ups and failed stages, is listed below with retained raw evidence. Earlier development smoke checks are listed separately at the end.

The API and PostgreSQL each ran with **1 GiB memory** (`1073741824` bytes) and **1 CPU** (`1000000000` NanoCPUs). Both limits were applied by Docker Compose and verified using `docker inspect`. The API image was built from the inspected source before testing. Source baseline: `f360afedbce8ee8cc8f4d2d89536ae7066da60e3`, with the documented local resource, test, runner, and documentation changes.

| Environment item     | Observed value                                                                     |
| -------------------- | ---------------------------------------------------------------------------------- |
| Physical CPU         | AMD Ryzen 7 7445HS; Windows reports 6 physical cores / 12 logical processors       |
| Host RAM             | 16,396,075,008 bytes, about 15.27 GiB usable as reported by Node                   |
| Docker               | Docker Desktop engine 29.0.1, Linux/WSL2 kernel `6.6.87.2-microsoft-standard-WSL2` |
| Docker resource pool | 12 logical CPUs; 7,938,981,888 bytes RAM, about 7.39 GiB                           |
| API runtime          | Node.js v24.21.0; Express 5; one API process                                       |
| Database             | Real PostgreSQL 17.11, persistent named volume                                     |
| Load generator       | k6 2.3.0, native Windows or pinned `grafana/k6:2.3.0` Docker image                 |
| API and DB limits    | 1 CPU + 1 GiB **per container**                                                    |

This was a local test on a shared machine, not an isolated cloud benchmark. The database contained existing development data and gained one test account and organization per k6 run. No existing data was deleted.

## Workload and criteria

[organization-read.k6.js](../../apps/api/tests/k6/organization-read.k6.js) registers one unique user, creates one owned organization, and verifies it during setup. Each virtual user then sends one authenticated `GET /organizations/:id`, checks HTTP 200 and the expected ID, and sleeps for one second. All users within a run read the same organization using the same token.

This is a constant-VU closed model. User count is concurrency, not a fixed request-rate target. It exercises JWT verification, ownership checks, a small SQL read, and JSON serialization. It does not load-test registration, login, conversation/document writes, AI calls, or a large cold dataset. [k6 workload models](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/open-vs-closed/)

Passing requires all four read-tagged thresholds:

- At least one organization read: `count>0`.
- Failed request rate below 1%: `rate<0.01`.
- Read p95 latency below 500 ms: `p(95)<500`.
- Check pass rate above 99%: `rate>0.99`.

Setup requests are excluded from the tables and thresholds. Each read produces two checks. RPS is the rate k6 reports for the read-tagged counter. Latencies are `http_req_duration` in milliseconds; they exclude initial connection/DNS time and include failed reads, some of which have zero-valued HTTP duration. Always read latency alongside failures. A low latency value does not compensate for refused connections.

Each campaign begins with a 1-user, 10-second warm-up. Stages run sequentially, with a five-second pause between runs and k6's default graceful completion period. CPU and memory maxima are the highest **sampled** Docker stats values, not continuous peaks. Sampling uses a two-second delay plus the stats query's own elapsed time, usually giving roughly 3–4 seconds between samples.

## Campaign A: Windows host through the published API port

Target: `http://localhost:3001`. Generator: native Windows k6. Command from the repository root:

```powershell
npm run test:load:matrix
```

Evidence directory: [Campaign A](results/2026-10-11T15-32-34-199Z/). Its [environment](results/2026-10-11T15-32-34-199Z/environment.json) and [run manifest](results/2026-10-11T15-32-34-199Z/runs.json) retain versions, image IDs, precise UTC timestamps, executed commands, and container states.

| Run                                                                      |  VUs | Time |  Reads | Read RPS | Avg ms | p95 ms | p99 ms | Failed reads (%) | Checks passed | Result    |
| ------------------------------------------------------------------------ | ---: | ---- | -----: | -------: | -----: | -----: | -----: | ---------------- | ------------: | --------- |
| [A0](results/2026-10-11T15-32-34-199Z/00-1vu-10s.summary.json) (warm-up) |    1 | 10s  |     10 |     0.99 |   3.38 |   3.75 |   3.76 | 0 (0.000%)       |      100.000% | PASS (0)  |
| [A1](results/2026-10-11T15-32-34-199Z/01-10vu-30s.summary.json)          |   10 | 30s  |    300 |     9.93 |   4.08 |   8.71 |  21.87 | 0 (0.000%)       |      100.000% | PASS (0)  |
| [A2](results/2026-10-11T15-32-34-199Z/02-50vu-30s.summary.json)          |   50 | 30s  |  1,500 |    49.61 |   4.21 |   9.50 |  29.37 | 0 (0.000%)       |      100.000% | PASS (0)  |
| [A3](results/2026-10-11T15-32-34-199Z/03-100vu-30s.summary.json)         |  100 | 30s  |  3,000 |    99.05 |   4.85 |  10.64 |  55.74 | 0 (0.000%)       |      100.000% | PASS (0)  |
| [A4](results/2026-10-11T15-32-34-199Z/04-250vu-30s.summary.json)         |  250 | 30s  |  7,500 |   246.36 |   7.45 |  15.54 | 157.03 | 14 (0.187%)      |       99.813% | PASS (0)  |
| [A5](results/2026-10-11T15-32-34-199Z/05-500vu-30s.summary.json)         |  500 | 30s  | 15,000 |   488.39 |  10.84 |  26.65 | 174.18 | 219 (1.460%)     |       98.540% | FAIL (99) |
| [A6](results/2026-10-11T15-32-34-199Z/06-1000vu-30s.summary.json)        | 1000 | 30s  | 29,826 |   960.18 |  20.13 | 109.79 | 330.35 | 1,208 (4.050%)   |       95.950% | FAIL (99) |
| [A7](results/2026-10-11T15-32-34-199Z/07-2000vu-30s.summary.json)        | 2000 | 30s  | 57,323 |  1843.67 |  56.55 | 199.65 | 467.24 | 3,817 (6.659%)   |       93.341% | FAIL (99) |

At 250 users, 14 reads failed with TCP connection refusals, but the error and check rates still met the configured criteria. At 500, 1,000, and 2,000 users, error/check thresholds failed even though p95 remained below 500 ms. All recorded request warnings in those stages reported `actively refused` connections to `127.0.0.1:3001`.

The warnings clustered near stage startup: 250 and 500 users in the first timestamped second; 1,000 users over the first roughly two seconds; 2,000 users over the first roughly three seconds. Both containers remained running, with no restart-count increase or recorded OOM kill. The highest passing stage in this particular published-port experiment was 250 VUs; that does not establish an intrinsic 250-user application limit.

## Campaign B: k6 inside the Docker network

Target: `http://api:3001`. Generator: a separate k6 container joined to the API's existing Compose network. Server limits and workload remained the same. The generator had no explicit CPU or memory cap, and shared the Docker VM's overall pool.

```powershell
docker pull grafana/k6:2.3.0
$env:K6_EXECUTION = "docker"
$env:LOAD_USERS = "500,1000,2000"
npm run test:load:matrix
Remove-Item Env:K6_EXECUTION, Env:LOAD_USERS
```

Evidence directory: [Campaign B](results/2026-10-11T15-38-40-845Z/), with its [environment](results/2026-10-11T15-38-40-845Z/environment.json) and [run manifest](results/2026-10-11T15-38-40-845Z/runs.json).

| Run                                                                      |  VUs | Time |  Reads | Read RPS | Avg ms | p95 ms | p99 ms | Failed reads (%) | Checks passed | Result   |
| ------------------------------------------------------------------------ | ---: | ---- | -----: | -------: | -----: | -----: | -----: | ---------------- | ------------: | -------- |
| [B0](results/2026-10-11T15-38-40-845Z/00-1vu-10s.summary.json) (warm-up) |    1 | 10s  |     10 |     0.99 |   1.94 |   2.28 |   2.32 | 0 (0.000%)       |      100.000% | PASS (0) |
| [B1](results/2026-10-11T15-38-40-845Z/01-500vu-30s.summary.json)         |  500 | 30s  | 15,000 |   487.93 |  12.69 |  60.34 | 299.08 | 0 (0.000%)       |      100.000% | PASS (0) |
| [B2](results/2026-10-11T15-38-40-845Z/02-1000vu-30s.summary.json)        | 1000 | 30s  | 30,000 |   972.95 |  17.02 |  66.38 | 318.57 | 0 (0.000%)       |      100.000% | PASS (0) |
| [B3](results/2026-10-11T15-38-40-845Z/03-2000vu-30s.summary.json)        | 2000 | 30s  | 57,333 |  1850.80 |  53.75 | 227.52 | 747.21 | 0 (0.000%)       |      100.000% | PASS (0) |

All stages passed with zero failed reads. At 2,000 users, p95 was below the exercise's limit, while p99 was substantially higher. A p95 pass therefore does not mean every request was below 500 ms.

Changing generator placement eliminated the connection-refusal failures in these comparison runs. This supports investigating the published-port path and simultaneous startup connection burst rather than attributing Campaign A's failures solely to API CPU or RAM. It does not identify one exact operating-system/proxy/backlog cause: topology, generator OS, working-set warmth, and test order also changed.

## Campaign C: longer repeat and stress stage

The Docker-network workload was repeated for one minute at 2,000 users, followed by a one-minute 5,000-user stress stage. The API's actual cgroup was resolved for CPU counter collection in this campaign.

```powershell
$env:K6_EXECUTION = "docker"
$env:LOAD_USERS = "2000,5000"
$env:LOAD_DURATION = "1m"
npm run test:load:matrix
Remove-Item Env:K6_EXECUTION, Env:LOAD_USERS, Env:LOAD_DURATION
```

Evidence directory: [Campaign C](results/2026-10-11T15-41-33-761Z/), with its [environment](results/2026-10-11T15-41-33-761Z/environment.json) and [run manifest](results/2026-10-11T15-41-33-761Z/runs.json).

| Run                                                                      |  VUs | Time |   Reads | Read RPS |  Avg ms |  p95 ms |  p99 ms | Failed reads (%) | Checks passed | Result    |
| ------------------------------------------------------------------------ | ---: | ---- | ------: | -------: | ------: | ------: | ------: | ---------------- | ------------: | --------- |
| [C0](results/2026-10-11T15-41-33-761Z/00-1vu-10s.summary.json) (warm-up) |    1 | 10s  |      10 |     1.00 |    1.70 |    2.16 |    2.36 | 0 (0.000%)       |      100.000% | PASS (0)  |
| [C1](results/2026-10-11T15-41-33-761Z/01-2000vu-1m.summary.json)         | 2000 | 1m   | 116,623 |  1918.94 |   29.29 |  109.60 |  695.04 | 0 (0.000%)       |      100.000% | PASS (0)  |
| [C2](results/2026-10-11T15-41-33-761Z/02-5000vu-1m.summary.json)         | 5000 | 1m   | 117,294 |  1915.27 | 1531.91 | 2341.15 | 4664.34 | 568 (0.484%)     |       99.516% | FAIL (99) |

The 2,000-user repeat passed: **116,623 reads**, **1,918.94 read requests/second**, **109.60 ms p95**, and zero failed reads. Its p99 was 695.04 ms, and its maximum recorded HTTP duration was 1,145.75 ms. This is evidence that this specific small read workload passed the exercise's p95/error criteria for one minute, not a claim that all production traffic supports 2,000 users.

The 5,000-user stress stage failed the **latency threshold**: p95 was **2,341.15 ms**, with p99 at 4,664.34 ms. It produced **117,294 reads** at **1,915.27 read requests/second**, almost unchanged throughput despite 2.5 times as many users. It had **568 failed reads (0.484%)**, all matching request-timeout warnings; error/check thresholds themselves still passed. Failure count and warning count were checked against the retained log.

API CPU approached its quota and the corrected cgroup counters showed substantially more throttling during the stress stage. Together with the throughput plateau and rising latency, this supports CPU/queue pressure as a limiting factor in this experiment. It does not prove one specific function or SQL statement is responsible; profiling and pool-wait measurements would be needed for that. No intermediate stages between 2,000 and 5,000 users were tested, so the exact boundary is unknown.

## Resource observations for every run

The following values come from each run's `.stats.json` file. CPU percentages use Docker's convention; roughly 100% represents one logical CPU's worth of time. Memory is shown in MiB (1 GiB = 1,024 MiB).

| Run                                                               | API max CPU | API max MiB | PostgreSQL max CPU | PostgreSQL max MiB | Samples per container |
| ----------------------------------------------------------------- | ----------: | ----------: | -----------------: | -----------------: | --------------------: |
| [A0](results/2026-10-11T15-32-34-199Z/00-1vu-10s.summary.json)    |       0.38% |       26.59 |              0.06% |              22.40 |                     3 |
| [A1](results/2026-10-11T15-32-34-199Z/01-10vu-30s.summary.json)   |       1.53% |       27.46 |              3.19% |              30.77 |                     8 |
| [A2](results/2026-10-11T15-32-34-199Z/02-50vu-30s.summary.json)   |       4.30% |       30.71 |              3.98% |              37.63 |                     8 |
| [A3](results/2026-10-11T15-32-34-199Z/03-100vu-30s.summary.json)  |       9.11% |       32.05 |              5.30% |              37.80 |                     8 |
| [A4](results/2026-10-11T15-32-34-199Z/04-250vu-30s.summary.json)  |      23.12% |       36.82 |              9.43% |              37.95 |                     8 |
| [A5](results/2026-10-11T15-32-34-199Z/05-500vu-30s.summary.json)  |      51.62% |       47.20 |             13.90% |              38.22 |                     8 |
| [A6](results/2026-10-11T15-32-34-199Z/06-1000vu-30s.summary.json) |      50.22% |       68.65 |             21.25% |              38.57 |                     8 |
| [A7](results/2026-10-11T15-32-34-199Z/07-2000vu-30s.summary.json) |      98.03% |       87.39 |             46.09% |              38.48 |                     8 |
| [B0](results/2026-10-11T15-38-40-845Z/00-1vu-10s.summary.json)    |       0.16% |       35.35 |              2.96% |              23.21 |                     3 |
| [B1](results/2026-10-11T15-38-40-845Z/01-500vu-30s.summary.json)  |      46.02% |       54.10 |             13.18% |              37.98 |                     8 |
| [B2](results/2026-10-11T15-38-40-845Z/02-1000vu-30s.summary.json) |      63.91% |       74.96 |             29.43% |              38.28 |                     9 |
| [B3](results/2026-10-11T15-38-40-845Z/03-2000vu-30s.summary.json) |      90.63% |       98.29 |             44.78% |              38.58 |                     9 |
| [C0](results/2026-10-11T15-41-33-761Z/00-1vu-10s.summary.json)    |       5.62% |       92.46 |              2.83% |              23.00 |                     3 |
| [C1](results/2026-10-11T15-41-33-761Z/01-2000vu-1m.summary.json)  |      99.62% |       98.81 |             42.37% |              38.01 |                    16 |
| [C2](results/2026-10-11T15-41-33-761Z/02-5000vu-1m.summary.json)  |     105.45% |      178.30 |             73.30% |              38.52 |                    16 |

Across all 15 Docker runs, the largest sampled API memory usage was **178.30 MiB**, and PostgreSQL's was **38.58 MiB**, well below their 1,024 MiB caps. No container restart-count increase or recorded OOM kill occurred. This workload did not demonstrate a need for more memory; it also did not establish a safe minimum memory size for other endpoints or long-running operation. Docker's CLI memory accounting differs from total host/VM memory, and these short sampled runs cannot establish that memory usage is stable indefinitely.

The 5,000-user stage's sampled API CPU briefly read 105.45%. Docker quotas constrain CPU time over scheduling periods and do not pin execution to one physical core; sampling windows and parallel runtime work can produce a value slightly above 100%. The recorded `cpu.max` still confirmed the one-CPU quota.

### CPU-counter collection correction

The first two campaigns captured `/sys/fs/cgroup/cpu.stat`. Inspection showed that this Docker Desktop environment exposes the full hierarchy inside the container and the API's actual membership is `/docker/<container-id>`. The earlier root counters are retained in their manifests but are **not used as API throttling evidence**. Their zero throttling values do not establish an absence of API throttling.

The runner was corrected to resolve `/proc/self/cgroup`, then read that group's `cpu.stat` and `cpu.max`. Campaign C records the resolved path and `cpu.max = 100000 100000`, confirming the one-CPU quota. [Docker cgroup metrics](https://docs.docker.com/engine/containers/runmetrics/)

| Campaign C run                                                   | Scheduler periods | Throttled periods | Share of periods throttled | Throttled time (seconds) |
| ---------------------------------------------------------------- | ----------------: | ----------------: | -------------------------: | -----------------------: |
| [C0](results/2026-10-11T15-41-33-761Z/00-1vu-10s.summary.json)   |                26 |                 0 |                      0.00% |                    0.000 |
| [C1](results/2026-10-11T15-41-33-761Z/01-2000vu-1m.summary.json) |               611 |                50 |                      8.18% |                    0.739 |
| [C2](results/2026-10-11T15-41-33-761Z/02-5000vu-1m.summary.json) |               618 |               474 |                     76.70% |                   14.913 |

## How to read and reproduce the evidence

For every table row, its linked summary retains raw k6 metrics. The same file stem has `.log` for the console output and warnings, and `.stats.json` for CPU, RAM, network I/O, and sample timestamps. `runs.json` contains before/after container states, exit codes, commands, and CPU snapshots. `environment.json` records the target and generator placement. JWTs, passwords, and `.env` contents are not stored in these reports.

Exit 0 means the k6 run passed. Exit 99 means a threshold was breached; the runner retains the run and continues the matrix. A matrix with any failing stage returns exit 1. A failure is part of the experimental result, not something removed from the report. In legacy k6 summary JSON, threshold booleans are failure flags: `false` means that threshold did not fail.

The checked-in runner is [run-k6-matrix.ts](../../apps/api/scripts/run-k6-matrix.ts). Native mode uses the locally installed executable. Docker mode pins the generator image, mounts the test script read-only and the results directory writable, and discovers the API's Docker network. It requires both API and PostgreSQL to be running with the 1 CPU / 1 GiB experimental caps.

To repeat, start the Docker stack, confirm its limits, then use the commands above. To run one case directly:

```powershell
docker compose up --build -d
docker compose ps
npm run test:load -- --vus 100 --duration 1m
docker stats
```

For a production capacity decision, test representative read/write/auth traffic, larger datasets, a gradual ramp, repeat runs, and a longer soak. Use a separate load-generator machine to reduce shared-host interference. Measure pool waits, SQL duration, event-loop delay, and end-to-end latency to distinguish causes. The tested stages bound the observations here; untested user counts have no measured pass/fail result.

## Functional and code checks

- Docker API image build completed successfully before the campaigns.
- Compose configuration validated successfully; both running containers had the requested resource caps.
- API type checking and lint passed for the final matrix runner and k6 script.
- The API functional suite passed **9/9 tests against a separate disposable PostgreSQL 17 Docker container** after the load campaigns. It exercised the actual controllers, services, repositories, auth, validation, persistence, and ownership rules. [Retained functional test log](results/validation/functional-tests.log).
- Documentation formatting, relative links, and the consistency of every result table with its raw JSON were checked before publication.
- The API and main PostgreSQL container remained running after the experiments; the separate functional-test container was removed.

## Earlier development checks, separate from this Docker benchmark

These checks happened earlier in the conversation. They used a temporary API with pg-mem unless otherwise stated, so they are not PostgreSQL Docker capacity results. Their console evidence was observed at execution time, but raw files were not retained in the directories above.

| Check                                                        | Observed result                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 3 VUs for 3 seconds, automatic setup                         | Passed: 9 organization reads, 18/18 checks, read p95 about 9.71 ms             |
| 2 VUs for 2 seconds, supplied token and organization         | Passed: 4 organization reads, 8/8 checks, read p95 about 3.14 ms               |
| Token supplied without organization ID                       | Rejected during initialization; no load started                                |
| Invalid token with an organization ID                        | Rejected during preflight with HTTP 401; no load started                       |
| User-reported 50-VU/1-minute attempt before starting the API | Failed registration with connection refused/HTTP 0; no read load was conducted |

These historical checks verify setup and failure handling. They should not be averaged together with the measured Docker runs.

For the implementation behind these results, read [architecture.md](architecture.md) and [concepts.md](concepts.md).

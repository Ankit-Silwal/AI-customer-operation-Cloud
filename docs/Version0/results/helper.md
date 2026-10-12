# How to read the load-test results

Start with the [Windows overview](01-windows-10-50-100-250-500-1000-2000-users-30s/summary.md). It links to a readable report for every user count. The original JSON and logs remain the evidence behind the reports.

For Docker, read the combined [campaign 02 summary](02-docker-500-1000-2000-users-30s/summary.md) and [campaign 03 summary](03-docker-2000-5000-users-1m/summary.md). Each file collects all its stages, thresholds, CPU/RAM observations, and conclusions in one place.

## What happens in a test

Before the load starts, k6 registers one test account, creates an organization, and checks access. Then each virtual user repeats this activity:

**Ask for the organization -> check the reply -> wait one second -> ask again.**

Repeating is normal activity, even when the previous request succeeded. This script does not immediately retry failed requests. All virtual users within one stage share that stage's account and organization. They simulate concurrent activity, not separate registered accounts.

## Decode the names

| Name or part | Meaning |
| --- | --- |
| `01-windows-10-50-100-250-500-1000-2000-users-30s` | Campaign 01: Windows k6, those user counts, 30 seconds per load stage. |
| `02-docker-500-1000-2000-users-30s` | Campaign 02: k6 inside Docker, three user counts, 30 seconds each. |
| `03-docker-2000-5000-users-1m` | Campaign 03: k6 inside Docker, 2000 then 5000 users, one minute each. |
| `00-1vu-10s` | Stage 00, one virtual user, ten seconds of repeating activity. |
| `04-250vu-30s` | Stage 04, 250 virtual users working together for 30 seconds. |
| `00`, `01`, `04` | Stage order, starting at zero; not the user count. |
| `vu` | Virtual user: a simulated person executing the script. |
| `s`, `m` | Seconds, minutes. |
| `.summary.json` | Machine-readable totals and timing statistics for that stage. |
| `.summary.md` | The same stage's results presented as readable Markdown. |
| `.stats.json` | Occasional Docker resource measurements during the stage. |
| `.log` | Console output, warnings, and errors. |
| `summary.md` | Combined overview of a campaign's stages. Windows also links to individual Markdown stage reports; each Docker overview presents its campaign in one file. |
| `runs.json` | Stage order, execution times, commands, exit codes, and container states. |
| `environment.json` | Machine/runtime details, resource limits, and test placement. |
| `metrics.json` | Combined numerical results from all three historical campaigns. |

Every campaign starts with a one-user, ten-second warm-up. Setup and final reporting take additional time, so the wall-clock time in `runs.json` can exceed the requested load duration. Exact timestamps remain in the manifests; `Z` means UTC. Recorded commands keep the original output paths from before the campaign folders were renamed.

## Count, rate, and percentages

`count` is a total. `rate` depends on the metric: it does not always mean the same thing.

| Metric | Meaning of rate | How to judge it |
| --- | --- | --- |
| `http_reqs`, `iterations` | Requests or completed loops per second. | Enough useful work for your needs, with acceptable latency and errors. |
| `http_req_failed` | Fraction of requests that failed. | Lower is better; zero is ideal. |
| `checks` | Fraction of assertions that passed. | Higher is better; one means 100%. |
| `data_sent`, `data_received` | Bytes per second. | Describes traffic volume; neither direction is automatically better. |

For a fraction, multiply by 100 to get a percentage: `0.01 = 1%`, `0.99 = 99%`, `1 = 100%`, and `0 = 0%`. Historical rate metrics store this fraction in `value`; the newer safe exporter may use `rate`.

The Windows warm-up has 10 reads and about 0.985 reads/second. It is slightly below one per second because each loop includes request/check work in addition to its one-second wait. As responses get slower, each virtual user can finish fewer loops per second.

## Timing statistics

Durations in the JSON reports are milliseconds: **1000 ms = 1 second**.

| Field | Meaning |
| --- | --- |
| `min` | Fastest measured duration. |
| `avg` | Arithmetic average. |
| `med` | Median, also called p50: the middle of the ordered measurements. |
| `max` | Slowest measured duration. |
| `p(90)` | Estimated duration at the 90th percentile. |
| `p(95)` | Estimated duration at the 95th percentile; about 95% of measurements are at or below it. |
| `p(99)` | Estimated duration at the 99th percentile; reveals a slower tail. |

Imagine arranging request times from fastest to slowest. p95 looks near the slow end, so it helps expose slow experiences hidden by an average. Small samples give limited information about rare slow requests. A p95 pass does not mean every request was fast.

## Every metric in a stage summary

| Metric | Meaning |
| --- | --- |
| `http_reqs` | Number of HTTP requests and requests per second. |
| `http_req_duration` | Sending + waiting + receiving time; excludes the initial connection/DNS work and the script's one-second sleep. |
| `http_req_blocked` | Time before a request can start, including connection-slot/DNS-related work. |
| `http_req_connecting` | Time establishing a TCP connection. |
| `http_req_tls_handshaking` | Time setting up HTTPS encryption; zero in this HTTP experiment. |
| `http_req_sending` | Time transmitting the request. |
| `http_req_waiting` | Time until the first response byte; includes server processing and network delay. |
| `http_req_receiving` | Time receiving the response body. |
| `http_req_failed` | Fraction of requests k6 classifies as failed, including connection failures. |
| `checks` | Assertions that the response status is 200 and its organization ID matches. |
| `iterations` | Completed repetitions of the user's activity. |
| `iteration_duration` | Duration of a whole repetition, including the one-second sleep. |
| `vus` | Active virtual users at the reported observation, with min/max observations. |
| `vus_max` | Virtual-user capacity allocated for the run. |
| `data_sent`, `data_received` | Bytes sent/received and bytes per second. |
| `root_group` | Check/group names and pass/fail counts; IDs identify checks, not users or performance. |

`{operation:organization_read}` filters to the repeated organization reads. Without that suffix, HTTP metrics also include setup. For example, the warm-up made **13 total HTTP requests: 3 setup requests + 10 reads**. Each read has two checks, producing 20 checks. `{expected_response:true}` filters requests k6 classified as having expected responses; it does not independently prove the body was correct.

Two confusing JSON conventions:

- For `checks`, `passes` counts successful assertions and `fails` counts unsuccessful assertions.
- For `http_req_failed`, `passes` counts the failure condition being true, so it is the **failed-request count**. `fails` counts requests where that condition was false, meaning successful requests. Thus `passes: 0, fails: 10, value: 0` means zero failed requests, not ten failures. The Markdown reports use clear labels instead.

## Thresholds and service level

| Criterion | Requirement for this exercise |
| --- | --- |
| `count>0` | At least one organization read happened. |
| `rate<0.01` on failed reads | Fewer than 1% failed. Exactly 1% fails this strict criterion. |
| `p(95)<500` | Read p95 below 500 ms, or half a second. |
| `rate>0.99` on checks | More than 99% of checks passed. Exactly 99% fails this criterion. |

Every criterion must pass. These are chosen learning criteria, not an agreed production service-level objective or contractual service-level agreement. The experiment does not establish uptime or whole-product capacity.

Inside historical JSON `thresholds`, `false` means **did not fail**, and `true` means **failed**. The safe exporter preserves this convention. A k6 exit code of `0` means success; `99` means thresholds failed. Setup/other operational errors can have different nonzero exit codes. The matrix itself returns a nonzero code when any stage fails.

## Docker resource fields

Each entry in `.stats.json` is one observation of one container, not one user.

| Field | Meaning |
| --- | --- |
| `sampledAt` | Measurement time. |
| `Name` | API or PostgreSQL container name. |
| `ID`, `Container` | Short/full container identifier. |
| `CPUPerc` | CPU usage; roughly 100% corresponds to one logical CPU's work. |
| `MemUsage` | Used memory / container limit. `26.59MiB / 1GiB` means about 27 MiB used out of 1024 MiB. |
| `MemPerc` | Percentage of the container's memory limit in use. |
| `NetIO` | Cumulative network received / sent for the container; not necessarily this stage alone. |
| `BlockIO` | Cumulative block-storage reads / writes; not necessarily this stage alone. |
| `PIDs` | Processes/threads, not simulated users. |

Resource maxima in the Markdown reports are the highest sampled values, not guaranteed instantaneous peaks. Samples were several seconds apart. A CPU percentage slightly above 100% can occur over a short measurement window even with a one-CPU quota.

`runs.json` also records restart counts, running state, and `OOMKilled` (whether the container was killed for exceeding memory). CPU counters in the first two campaigns came from the wrong cgroup scope and cannot establish API throttling. The corrected third campaign provides actual API throttling evidence; see [the full results](../testResult.md).

## Errors, bottlenecks, and RAM

Read results in this order: **user count/duration -> failed-read rate -> latency -> throughput -> logs -> CPU/RAM**.

The Windows campaign's errors were connection refusals while opening connections to the Docker API. They do not prove RAM exhaustion or a fixed 250-user API limit. Comparable Docker-network stages avoided those errors; the exact Windows-path cause was not isolated. A refused connection may record a zero HTTP duration, so low latency alongside many failures can be misleading.

A bottleneck is the part of the request path limiting useful work. More traffic can produce more waiting instead of more completed requests. In the Docker 5000-user experiment, throughput stayed near the 2000-user result while p95 increased to 2.34 seconds. API CPU throttling supports investigating its one-CPU limit; the highest sampled API memory was only 178.30 MiB out of its 1024 MiB cap.

RAM is like available desk space; CPU is the worker's processing time. More desk space does not automatically make the worker faster. These tests capped the API and PostgreSQL at **1 CPU and 1 GiB each**, not 8 GiB for the API. Neither RAM size nor one short read-endpoint test establishes a universal number of supported users.

The test's JWT stays in memory for authentication and is excluded from the safe export. Use the existing numerical reports for study; do not publish credentials or `.env` contents.

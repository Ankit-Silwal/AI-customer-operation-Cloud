# Version 0: architecture and performance notes

Read these files in this order:

1. [Study guide](study-guide.md): signing keys versus JWTs, what the three result folders mean, and how to read a load-test result.
2. [Architecture](architecture.md): what runs, how a request travels through the API, how data is stored, and where the system can fail.
3. [Concepts](concepts.md): the programming, security, database, deployment, and performance ideas used in the implementation.
4. [Test results](testResult.md): the actual Docker and k6 experiments, their evidence, and what they do and do not demonstrate.

The source code is the authority for current behavior. These notes describe the Version 0 implementation inspected on 11 October 2026. Proposed improvements are explicitly separated from features already implemented.

## Run the application

From the repository root, configure `.env` using [`.env.example`](../../.env.example), then run:

```powershell
docker compose up --build -d
docker compose ps
docker stats
```

The current experiment caps **each** of the API and PostgreSQL containers at **1 CPU and 1 GiB RAM**. These are separate maximum limits, so the two containers can together demand up to 2 GiB of RAM plus supporting infrastructure. Limits do not reserve resources or provide dedicated cores.

## Reproduce the load experiments

Install k6 so `k6 version` works. The default target is the Docker API exposed at `http://localhost:3001`.

```powershell
# One run; --vus controls concurrent users.
npm run test:load -- --vus 50 --duration 30s

# Warm-up, then 10, 50, 100, 250, 500, 1000 and 2000 users for 30 seconds each.
npm run test:load:matrix

# Custom matrix. Run from the repository root.
$env:LOAD_USERS = "25,75,150"
$env:LOAD_DURATION = "1m"
npm run test:load:matrix
Remove-Item Env:LOAD_USERS, Env:LOAD_DURATION

# Compare direct Docker-network traffic with the Windows published port.
docker pull grafana/k6:2.3.0
$env:K6_EXECUTION = "docker"
$env:LOAD_USERS = "500,1000,2000"
npm run test:load:matrix
Remove-Item Env:K6_EXECUTION, Env:LOAD_USERS
```

The matrix runner verifies that both containers have the experimental limits. It runs stages sequentially, pauses five seconds between stages, and creates a directory named with the generator, user counts, duration, and timestamp under `results/`. Every directory contains environment metadata, commands, exit codes, container states, k6 summaries/logs, and Docker resource samples. It continues after k6 threshold failures so they are recorded, and stops after an operational failure such as unsuccessful setup. A failing matrix returns a nonzero exit code even when expected stress stages are successfully recorded.

`K6_EXECUTION=native` uses installed Windows k6 and defaults to `http://localhost:3001`; `K6_EXECUTION=docker` mounts the script and output directory into the pinned k6 image, joins the API's Docker network, and defaults to `http://api:3001`. `K6_DOCKER_IMAGE` can override that image. The Docker generator has no explicit CPU/memory cap, so it shares the Docker VM's overall resource pool. `BASE_URL` overrides the target. `RESULTS_DIR` optionally selects a new output directory. Each run creates one test account and organization; records persist because the API has no deletion endpoints. Each virtual user uses that run's same account and organization.

The runner uses the script's `handleSummary()` with `SUMMARY_PATH` to export numerical metrics and threshold failure flags, and prints a compact metrics summary to the console. It never exports setup credentials. Do not use k6's `--summary-export` with this test: that separate export includes the live JWT returned by `setup()`. To save one run safely, use `npm run test:load -- --vus 50 --duration 30s -e SUMMARY_PATH=load.summary.json`. Check versions before comparing results from different machines or releases.

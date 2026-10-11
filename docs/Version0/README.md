# Version 0: architecture and performance notes

Read these files in this order:

1. [Architecture](architecture.md): what runs, how a request travels through the API, how data is stored, and where the system can fail.
2. [Concepts](concepts.md): the programming, security, database, deployment, and performance ideas used in the implementation.
3. [Test results](testResult.md): the actual Docker and k6 experiments, their evidence, and what they do and do not demonstrate.

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

The matrix runner verifies that both containers have the experimental limits. It runs stages sequentially, pauses five seconds between stages, and creates a new timestamped directory under `results/`. Every directory contains environment metadata, commands, exit codes, container states, k6 summaries/logs, and Docker resource samples. It continues after k6 threshold failures so they are recorded, and stops after an operational failure such as unsuccessful setup. A failing matrix returns a nonzero exit code even when expected stress stages are successfully recorded.

`K6_EXECUTION=native` uses installed Windows k6 and defaults to `http://localhost:3001`; `K6_EXECUTION=docker` mounts the script and output directory into the pinned k6 image, joins the API's Docker network, and defaults to `http://api:3001`. `K6_DOCKER_IMAGE` can override that image. The Docker generator has no explicit CPU/memory cap, so it shares the Docker VM's overall resource pool. `BASE_URL` overrides the target. `RESULTS_DIR` optionally selects a new output directory. Each run creates one test account and organization; records persist because the API has no deletion endpoints. Each virtual user uses that run's same account and organization.

The runner uses the installed k6 CLI's `--summary-export` to retain raw metrics and the normal console summary. This export is the legacy JSON format in k6 2.3.0; a future migration can use `handleSummary()` if the CLI changes. Check versions before comparing results from different machines or releases.

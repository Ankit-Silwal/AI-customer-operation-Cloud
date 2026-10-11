# Concepts used in this project

## A learning map

| Concept                | Concrete example here                                     | Why it matters                                                               |
| ---------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Modular monolith       | Four feature folders inside one API process               | Code can have clear boundaries without independent services.                 |
| HTTP/JSON API          | GET organization, POST registration/conversation/document | Methods, status codes, headers, and payloads form the client contract.       |
| Layered design         | Route -> controller -> service -> repository              | Transport logic, rules, and persistence have separate jobs.                  |
| Dependency injection   | Constructors wired in `app.ts`                            | Modules receive dependencies instead of hiding global connections.           |
| Interfaces             | `OrganizationRepository` implemented by SQL repository    | Services depend on a contract rather than SQL details.                       |
| Runtime validation     | `object`, `text`, `email`, `id`, conversation parser      | Network input can violate TypeScript assumptions.                            |
| Authentication         | Bearer JWT verification                                   | Establishes the identity making a request.                                   |
| Authorization          | SQL checks `owner_id` against authenticated `userId`      | Establishes whether that identity can access this resource.                  |
| Password hashing       | Salted scrypt, timing-safe verification                   | A password cannot be safely stored as ordinary text or a fast hash.          |
| Relational integrity   | UUID primary keys, foreign keys, unique email             | The database enforces relationships and uniqueness under concurrency.        |
| Parameterized SQL      | `$1`, `$2` parameters separate from SQL text              | External values are handled as data rather than SQL syntax.                  |
| Connection pooling     | One `pg.Pool` reused by repositories                      | Reuses a bounded number of connections while HTTP requests overlap.          |
| JSONB                  | `conversations.messages`                                  | Stores structured message data without a separate message table.             |
| Central error handling | `error-handler.ts`                                        | Keeps error responses consistent and hides unexpected implementation errors. |
| Configuration          | Root `.env`, Compose environment, `readEnvironment`       | Separates deployment values from code and validates them at startup.         |
| Containerization       | API image and PostgreSQL container                        | Makes runtime dependencies and resource caps reproducible.                   |
| Persistence            | `postgres_data` named volume                              | Data survives normal container replacement.                                  |
| Multi-stage build      | TypeScript build stage, production runtime stage          | Keeps build tools out of the production runtime.                             |
| Graceful shutdown      | SIGTERM handler and pool close                            | Gives in-flight work a chance to finish during restarts.                     |
| Functional testing     | API tests with pg-mem or disposable PostgreSQL            | Checks behavior and ownership correctness.                                   |
| Load testing           | k6 VUs repeatedly execute the read path                   | Measures behavior under concurrent traffic.                                  |

## Walk through a feature before memorizing patterns

Open [the organization controller](../../apps/api/src/modules/organizations/organization.controller.ts). The GET handler validates the URL's UUID and obtains the user ID set by middleware. It calls the service and returns JSON.

Open [the service](../../apps/api/src/modules/organizations/organization.service.ts). It asks its repository for an owned organization and throws an `HttpError(404, ...)` when no row exists.

Open [the repository](../../apps/api/src/modules/organizations/organization.repository.ts). Its query constrains both `id` and `owner_id`, and aliases snake_case database fields to camelCase API fields.

Now ask: if you changed PostgreSQL to a different store, which file would change first? The repository. If the API changed a validation rule, the controller/parser would change. If a new business rule controlled organization access, the service and authorization design would need attention. Boundaries help localize changes; they do not eliminate cross-layer decisions.

## Authentication is not authorization

A valid JWT proves that the caller possesses a token signed by this API for a user. It does not prove that the user owns an arbitrary organization ID submitted in the URL.

This project derives identity from the verified JWT and supplies that identity to SQL ownership checks. It does not trust a caller-supplied `ownerId`. Reading another user's organization therefore returns 404 even when the token itself is valid.

Follow [token.service.ts](../../apps/api/src/modules/auth/token.service.ts), [authenticate.ts](../../apps/api/src/middleware/authenticate.ts), and the repository predicate together. Each is only one part of the security boundary.

## Concurrent requests and database connections are different

At 500 VUs, many users are sleeping and some requests are waiting for HTTP/network/SQL work. The API's pool does not create 500 PostgreSQL connections; its unconfigured default maximum is 10. Waiting requests can build up without an equal number of active database queries. [Pool documentation](https://node-postgres.com/apis/pool)

Increasing the pool may help if queries are fast and the database has spare capacity. It may hurt if PostgreSQL is already CPU-bound. If five API replicas each have a pool of 10, their combined potential budget is 50 database connections. Measure before changing it.

## CPU limits and memory limits

`cpus: "1.0"` limits available CPU time to the equivalent of one logical CPU. It does not pin the process to a specific physical core. CPU saturation can cause throttling and queueing, which increase latency even while requests still succeed.

`mem_limit: 1g` is a 1 GiB container memory cap, not an immediate allocation. The API and database have separate caps. Container-reported memory, Node's JavaScript heap, database cache, host memory, and the Docker/WSL memory pool are different measurements. A memory cap does not automatically set PostgreSQL's internal tuning parameters. [Docker resource constraints](https://docs.docker.com/engine/containers/resource_constraints/)

The experiment samples Docker CPU and memory usage. These are sampled observations, not guaranteed instantaneous peaks. It also records CPU counters and before/after restart/OOM state. The final runner resolves the API's cgroup from `/proc/self/cgroup`; this matters because Docker Desktop can expose the full host hierarchy inside a container. Root-hierarchy counters from the first two campaigns are retained as raw evidence but excluded from API throttling conclusions. Under the Linux CPU accounting convention, about 100% CPU corresponds to one logical CPU's worth of time.

## Users are not requests per second

The k6 script uses a constant number of VUs. Each VU performs one organization GET, checks it, and sleeps for one second. For an illustrative response time of 0.05 seconds:

```text
Approximate throughput = VUs / (response time + think time)
50 / (0.05 + 1.00) = about 47.6 requests/second
```

This is an approximation under stable conditions, not a promise about the measured result. If response time becomes one second, the same 50 VUs produce approximately 25 requests/second. Slow responses cause this closed model to reduce the arrival rate. An arrival-rate executor is needed to test an independent fixed RPS target. [k6 open and closed workload models](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/open-vs-closed/)

The first registration and organization creation happen once per run in `setup()`. They are not a registration/login traffic storm. The load phase exercises JWT verification, ownership validation, a database read, and JSON serialization.

## Average and tail latency

- Average latency describes the arithmetic mean.
- Median/p50 describes the middle request.
- p95 means 95% of measured requests were at or below this duration.
- p99 shows a more extreme tail and can reveal pauses that the average hides.
- Maximum describes one worst observed request and is sensitive to run duration and outliers.

For example, an average of 20 ms with p95 of 800 ms tells a different story from every request taking roughly 20 ms. Report latency alongside throughput and errors; a high request rate with unacceptable latency is not a passing service-level result.

## Checks, thresholds, and exit codes

The script checks status 200 and the returned organization ID. It has thresholds for read error rate below 1%, p95 below 500 ms, check pass rate above 99%, and at least one organization read.

These thresholds are chosen criteria for this exercise, not a production SLO agreed with customers. Read-tagged metrics exclude setup requests. If setup fails, no load was conducted and zero-valued summaries are not useful measurements.

The matrix records the process exit code as well as the metrics. Exit 0 is success; exit 99 indicates breached k6 thresholds. An operational failure stops the matrix. The legacy summary JSON stores threshold booleans as failure flags: `false` means that threshold did not fail, so use the exit code and console output when inspecting these raw files.

## How to reason about capacity

Find the highest tested stage meeting the criteria, then check whether it was stable, whether a repeat agrees, whether CPU or memory was close to its limit, and whether the workload resembles production. A single short test of one organization does not establish a universal maximum number of users.

This read test repeatedly fetches a small, cached database working set. It does not establish the capacity of password hashing, large documents, conversation writes, an AI provider, cold database reads, or long-lived requests. Run representative mixed traffic and a longer soak test before making deployment decisions.

CPU throttling observed with increasing latency supports a CPU-pressure hypothesis. It does not prove which code consumes that CPU. Profiling, SQL timings, pool wait metrics, and an independently hosted load generator would help distinguish causes. Changing several resource limits at once would make that diagnosis harder.

## Practical learning exercises

1. Trace `GET /organizations/:id` through every layer and explain each file's responsibility.
2. Register two users and verify that one user's JWT cannot read the other's organization.
3. Read the schema and explain what prevents two concurrent registrations from using the same email.
4. Compare measured throughput with `VUs / (1 + average latency in seconds)`; explain why the approximation differs from raw k6 rates.
5. Repeat the same traffic with API CPU limits of 1 and 2 while holding database settings and memory constant; retain a separate report for the comparison.
6. Write a separate workload for conversation creation and predict why its SQL, data growth, and persistence costs differ from a repeated GET.
7. Design a readiness endpoint: what should it check, and how should it behave when PostgreSQL is unavailable?
8. Sketch a second API replica behind a proxy and calculate its combined database connection budget. Decide which state is shared and which belongs to one process.

Read [the measured results](testResult.md) after these concepts so you can connect observations to the implementation.

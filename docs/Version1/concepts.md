# Version 1 concepts, in plain words

Imagine a small shop. The API is the receptionist. PostgreSQL is the filing cabinet. Each HTTP request asks the receptionist to do one job.

## Health and readiness

**Liveness** asks “Can the receptionist answer?” `/health/live` does not open the filing cabinet.

**Readiness** asks “Can the receptionist do useful work right now?” `/health/ready` tries a tiny database query and returns 503 if the database is unavailable, the probe takes too long, or shutdown has started. Both responses include version `1.0.0` when healthy. A deployment can use readiness to stop sending work to an unavailable instance.

## Validation and constraints

Validation checks the request before work begins: valid email, UUID, text length and allowed file type. Invalid input receives a controlled 400, unsupported upload types receive 415, and oversized bodies/files receive 413.

A database constraint checks stored data even if an application bug or direct SQL bypasses request validation. A foreign key prevents a document from referring to an organization that does not exist. A unique email constraint prevents duplicate accounts, including concurrent registrations. Check constraints reject invalid sizes and shapes. These layers protect different boundaries.

## Authentication and ownership

Authentication asks “Who are you?” A verified JWT identifies a user. Authorization asks “May that user access this organization/document?” Repository queries check the organization's owner.

Another user's resource returns 404, including uploads and downloads. That avoids confirming whether a resource belonging to someone else exists. A virtual user is a k6 worker, not automatically an account. Version 1 explicitly creates one distinct account per worker.

A JWT is signed using `JWT_SECRET`; it is not supposed to look like the secret. It still grants access and must not be published. Test-generated JWTs are real credentials for the test database until they expire or the signing secret changes.

## Error handling, request IDs and logs

Expected errors receive suitable status codes and a short response: 401 for missing/invalid authentication, 404 for unavailable resources, 409 for duplicate email, and 503 for readiness or certain database availability errors. Unexpected errors return a generic 500. SQL details and stack traces stay out of API responses.

A **request ID** is a receipt number for one request. Send an optional safe `X-Request-ID` header, or let the API generate one. The response and corresponding log share that ID. An error response also includes `requestId`, so you can find the event without logging its password or file content.

**Structured logging** means each log is a JSON object with consistent fields. For example, a `http_request` record includes status and `durationMs`. Filter for slow requests, 500 responses or one request ID. Routes use templates such as `/documents/:id` to avoid filling logs with individual IDs or arbitrary URL text. **Security headers** help browsers handle responses safely; they do not replace authentication.

## Pooling and indexes

The database pool is like ten checkout desks. Hundreds of callers can arrive, but at most ten database clients are open for this API process by default. Short queries finish and the desk serves the next caller. Transactions keep one desk until commit or rollback.

When callers wait too long, raising the pool limit may help only if the database can handle more work. It may instead increase CPU contention. Check pool waiting counts, database CPU, query duration, locks and API CPU before changing it. An idle pool client is an unused open connection; it is not a logged-in application user.

An **index** is a filing-cabinet directory. It can help PostgreSQL locate rows without reading every row. It also uses storage and adds work to writes. Primary keys and unique emails already have indexes. Add another index for an actual access pattern, then inspect `EXPLAIN (ANALYZE, BUFFERS)` on representative data. A small test table may legitimately use a sequential scan.

## Uploads and transactions

Multipart HTTP carries named fields plus file bytes. The API authenticates first, limits the multipart size, validates fields/file content, checks ownership, and stores bytes in PostgreSQL.

A **transaction** makes metadata and file persistence one operation. If saving bytes fails, metadata rolls back too. Otherwise you could return a document ID that has no file. Text and Markdown also populate the document's text field; PDF keeps its binary data and leaves extracted text empty.

The API checks PDF signature markers, not whether every object in the PDF is valid or safe. Attachments download rather than render inline. A single-file size limit also does not limit total concurrent upload memory.

## Reading k6 metrics

| Metric or expression | Meaning                                       | Example                                                 |
| -------------------- | --------------------------------------------- | ------------------------------------------------------- |
| VU                   | Independent worker repeating actions          | 100 VUs use 100 distinct accounts in Version 1          |
| Duration             | How long the concurrent workload runs         | `30s` means each active worker loops during that window |
| Iteration            | One invocation of the workload function       | Here: one HTTP action followed by a wait                |
| `http_reqs` count    | Number of HTTP requests                       | Includes setup unless filtered                          |
| Counter `rate`       | Events per second                             | `50/s` means about fifty requests each second           |
| Failure `rate`       | Fraction of failed requests                   | `0.01` means 1%; `0.05` means 5%                        |
| Check `rate`         | Fraction of assertions that passed            | `0.99` means 99%, not 0.99 requests/second              |
| Throughput           | Requests completed/generated per unit time    | Compare achieved requests/second at each load           |
| Average              | Arithmetic mean of recorded times             | Can conceal a slow tail                                 |
| Median / p50         | Middle of the latency distribution            | About half of requests were at or below it              |
| p95                  | 95th percentile of recorded durations         | p95 = 500 ms means about 95% were at or below 500 ms    |
| p99                  | 99th percentile                               | Shows the slower tail beyond p95                        |
| `p(95)<500`          | Threshold applied to duration in milliseconds | Pass only when the recorded p95 is below 500 ms         |
| `rate<0.01`          | Threshold applied to failure fraction         | Pass only when failures are below 1%                    |

HTTP failures and check failures are different. An HTTP 200 response with the wrong organization ID may count as HTTP success but fail a correctness check. Version 1 measures both. Its `checks` rate aggregates three assertions per load request, so it is not an exact percentage of wholly correct requests.

`http_req_duration` covers sending, waiting and receiving an HTTP request. Connection setup and DNS timing have separate metrics. A refused connection may produce HTTP status zero and little/no request-duration time. Low p95 with failures therefore does not establish a healthy service.

Setup runs once before load, not once for every iteration. Version 1 provisions four resources per account, probes health twice, and makes two validation requests plus one cross-account validation when there are at least two accounts. Thus a normal setup makes **4 × USERS + 4** HTTP requests for one account, or **4 × USERS + 5** for two or more accounts, before repeated load actions. These are application requests written in the script, not hidden k6 traffic.

Sleeping for one second is deliberate pacing, not retrying an error. A VU starts its next action after response time **plus** that wait. Roughly, throughput ≈ active VUs / (average action seconds + think-time seconds), before other bottlenecks. If response time rises, fixed VUs complete fewer requests per second.

## What counts as a bottleneck?

Increasing VUs while throughput stops growing and latency increases suggests saturation. Check where work waits: API CPU, PostgreSQL queries/connections, disk, networking or k6 itself. CPU throttling means a container reached its CPU quota. It does not prove that giving it more RAM would help.

Local Docker versus Windows k6 changes the load-generator/network path. Both still share your physical computer. Matching a cloud instance's CPU count and RAM limit does not match its processor speed, disk, network or noisy neighbors. Local results help you learn and compare changes under the same conditions; they do not certify production capacity.

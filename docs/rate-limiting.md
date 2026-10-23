# Rate limiting

The gateway, core, conversation, document and RAG servers use shared Redis counters. No sticky sessions or in-process counter fallback is used. Each admission atomically checks and charges all its buckets using Redis time. A denied admission does not consume its other buckets. An earlier layer may already have charged the request: a login rejected by its account quota still counts as gateway traffic.

## Default budgets

These are token buckets: they start full and refill continuously at `limit / seconds`, allowing bounded bursts without fixed-window boundary spikes. The daily bucket is a long-term refill budget, not a calendar-day billing ceiling. All attempts count, including successful logins and downstream errors.

| Layer / operation | Policy name | Default | Scope |
| --- | --- | --- | --- |
| Gateway ceiling | `gateway_global` | 1,000 / second | All gateway replicas |
| Gateway burst | `gateway_burst` | 30 / second | Client IP or IPv6 /64 |
| Gateway sustained traffic | `gateway_ip` | 600 / minute | Client IP or IPv6 /64 |
| Each Node service ceiling | `service_global` | 200 / second | All replicas of that service |
| Pre-auth service traffic | `service_ip` | 1,200 / minute | Client IP, separately per service |
| Authenticated reads | `user_read` | 300 / minute | Verified user, separately per service |
| Authenticated writes | `user_write` | 60 / minute | Verified user, separately per service |
| Registration | `register_ip` | 20 / hour | Client IP |
| Login | `login_ip` | 30 / 15 minutes | Client IP |
| Login account attempts | `login_account_ip` | 5 / 15 minutes | Normalized email + client IP |
| Document upload | `document_upload` | 10 / minute | Verified user |
| Document download | `document_download` | 60 / minute | Verified user |
| All RAG traffic | `rag_global` | 120 / minute | All RAG replicas |
| Search | `rag_search` | 30 / minute | Verified user |
| Answer generation | `rag_query` | 10 / minute | Verified user |
| Long-term generation | `rag_query_daily` | 100 / day | Verified user |
| Generation ceiling | `rag_query_global` | 60 / minute | All users and replicas |
| Indexing | `rag_index` | 5 / minute | Verified user |
| Long-term indexing | `rag_index_hourly` | 20 / hour | Verified user |

RAG also allows two expensive operations simultaneously across all replicas, with one per verified user. This covers indexing, embedding, search and generation. `RAG_MAX_CONCURRENCY` changes the shared ceiling (1–32). Saturation returns immediately rather than creating an unbounded work queue. Unique Redis leases renew every 30 seconds and release on completion or error. Crashed workers' leases expire after five minutes. Work continuing through a Redis outage longer than the lease duration can outlive its lease; leases provide admission control rather than fencing external work.

Registration and login limits precede password hashing and database lookups; upload limits precede multipart buffering. Login's email quota includes the client IP so one network cannot exhaust an account's quota for every legitimate network. The IP-wide login budget also covers attempts spread across many accounts. No account is permanently locked. Protected quotas use the verified JWT subject, never a request-body identity, unverified token, document ID or organization ID. Existing ownership checks remain in effect.

## Response contract

Admissions include `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (seconds until full refill), and `RateLimit-Policy` (`limit;w=seconds`). These describe the last admission's most constrained bucket, not every applicable budget. Through the gateway, the owning service's headers replace the gateway's headers if that service evaluates a limit.

Exhaustion returns `429`, `Retry-After` in whole seconds until a token is available, `Cache-Control: no-store`, `X-Request-ID`, and `{ "error": "Too many requests", "requestId": "..." }`. Busy RAG concurrency uses `429` with the same retry headers and `"RAG capacity busy; retry shortly"`. Honor `Retry-After` and add jitter. Ordinary auth errors remain `401` until a pre-auth budget is exceeded.

Redis failure returns `503` with `Retry-After: 1` and a safe error. Protection fails closed. Node commands have a 500 ms deadline, no offline buffering and a bounded queue; Python connections/commands have 500 ms timeouts, no retries and a bounded pool. Known health routes bypass quotas. Liveness stays available, while readiness includes Redis and returns `503` until recovery.

## Proxy and identity boundaries

The gateway uses the socket address, strips caller-supplied rate identity and forwarding headers, then HMAC-signs the normalized address, timestamp and request ID using the shared JWT secret with a separate purpose string. Services accept this address only with a valid signature within 30 seconds; otherwise they use the socket address. Uvicorn's automatic proxy-header trust is disabled. IPv4-mapped IPv6 is canonicalized; IPv6 clients share a /64 budget.

Redis identities are HMAC digests. Tokens, email addresses and IP addresses are not stored as bucket keys or logged by the limiter. Internal ownership lookups retain verified-user quotas and count against the calling service's socket-IP quota. Docker publishes only the application gateway. Keep internal service ports and Redis private, protect the signing secret, and synchronize host clocks. Rotating the secret or namespace creates new buckets and invalidates old forwarding signatures.

An external ingress/CDN becomes the gateway's apparent client. Add narrowly scoped ingress trust before deploying behind one; unrestricted Express `trust proxy` or Uvicorn forwarding trust would undermine the design. Shared NATs may need adjusted IP limits. Application limits do not replace edge connection and bandwidth controls against network floods.

## Configuration and operations

Node and Python share `packages/service-common/src/rate-policies.json` and the Lua scripts, copied into their images at build time. `RATE_LIMIT_POLICY_OVERRIDES` accepts complete entries for existing policies:

```dotenv
RATE_LIMIT_POLICY_OVERRIDES={"rag_query":{"limit":5,"seconds":60},"register_ip":{"limit":10,"seconds":3600}}
```

Unknown names, extra fields, non-integers and unsafe ranges fail validation. Keep all replicas on identical policy configuration. `RATE_LIMIT_NAMESPACE` isolates deployments (1–40 lowercase letters, digits, underscores or hyphens). Policy changes retain counters; roll changes consistently and allow the old refill interval to elapse before comparing behavior.

Compose supplies the internal `RATE_LIMIT_REDIS_URL` using `REDIS_PASSWORD`. Redis has no published port by default, authenticates clients, persists to `rate_limit_data` with AOF/one-second fsync, and uses a 128 MB cap with `noeviction`. Application restarts retain counters. Redis restarts reload persisted counters; a Redis/host crash can lose roughly the latest second of admissions. Exhausted Redis memory rejects work rather than evicting protection state. Production should use monitored, authenticated Redis with appropriate availability and network isolation.

For host development, use `docker compose -f compose.yaml -f compose.dev.yaml up -d --wait postgres redis`, then the localhost Redis URL in the app `.env.example` files. This override publishes Redis only on loopback. Use a strong URL-safe deployed password. Existing `.env` files are not rewritten.

## Verification

`npm test` starts disposable PostgreSQL and Redis on ports 55433 and 55479. Database fixtures run in test mode; rate-limit tests explicitly inject real Redis-backed limiters. Production enables limits by default. If setting `TEST_DATABASE_URL`, also provide a disposable Redis or `TEST_REDIS_URL`.

Run Python checks against disposable Redis:

```sh
docker compose -p customer-operation-cloud-test -f compose.test.yaml up -d --wait
docker compose run --rm --no-deps -e TEST_REDIS_URL=redis://host.docker.internal:55479 rag python -m unittest discover -s tests -p "test_*.py"
docker compose -p customer-operation-cloud-test -f compose.test.yaml down
```

Docker Desktop supplies `host.docker.internal`; on Linux provide a reachable Redis URL or host-gateway mapping. Tests use isolated namespaces and never flush production Redis. Checks cover atomic cross-replica admission, refill, application restart continuity, spoofed headers, user isolation, pre-parser rejection, dependency failure, distributed concurrency, lease release and crash expiry. The shared atomic execution design follows the [Redis Lua documentation](https://redis.io/docs/latest/develop/programmability/eval-intro/).

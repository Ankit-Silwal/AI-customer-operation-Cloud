import asyncio
import hashlib
import hmac
import ipaddress
import json
import os
import re
import time
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, Request
from redis.asyncio import Redis
from redis.backoff import NoBackoff
from redis.asyncio.retry import Retry


def asset(name):
    local = Path(__file__).with_name(name)
    return (local if local.exists() else Path(__file__).parents[3] / "packages/service-common/src" / name).read_text()


SCRIPT = asset("rate-limit.lua")
LEASE_SCRIPT = asset("rate-concurrency.lua")
DEFAULTS = json.loads(asset("rate-policies.json"))


def normalize_address(address):
    try:
        parsed = ipaddress.ip_address(address)
        if isinstance(parsed, ipaddress.IPv6Address):
            if parsed.ipv4_mapped:
                return str(parsed.ipv4_mapped)
            return str(ipaddress.ip_network(f"{parsed}/64", strict=False).network_address)
        return str(parsed)
    except ValueError:
        return "unknown"


def client_address(request, secret):
    ip = request.headers.get("x-rate-client-ip", "")
    stamp = request.headers.get("x-rate-timestamp", "")
    supplied = request.headers.get("x-rate-signature", "")
    request_id = request.headers.get("x-request-id", "")
    if len(ip) <= 64 and re.fullmatch(r"\d{10}", stamp) and re.fullmatch(r"[a-f0-9]{64}", supplied) and abs(time.time() - int(stamp)) <= 30:
        expected = hmac.new(secret.encode(), f"rate-forward-v1\n{ip}\n{stamp}\n{request_id}".encode(), hashlib.sha256).hexdigest()
        if hmac.compare_digest(expected, supplied):
            return normalize_address(ip)
    return normalize_address(request.client.host if request.client else "unknown")


def load_policies(overrides):
    changes = json.loads(overrides)
    if not isinstance(changes, dict):
        raise ValueError("Invalid rate limit overrides")
    policies = {**DEFAULTS}
    for name, policy in changes.items():
        if name not in DEFAULTS or not isinstance(policy, dict) or set(policy) != {"limit", "seconds"} or type(policy["limit"]) is not int or not 1 <= policy["limit"] <= 1_000_000 or type(policy["seconds"]) is not int or not 1 <= policy["seconds"] <= 86400:
            raise ValueError(f"Invalid rate limit policy: {name}")
        policies[name] = policy
    return policies


class RateLimiter:
    def __init__(self, settings):
        self.secret = settings.jwt_secret
        namespace = os.getenv("RATE_LIMIT_NAMESPACE", "customer-ops")
        if not re.fullmatch(r"[a-z0-9_-]{1,40}", namespace):
            raise ValueError("Invalid rate limit namespace")
        self.prefix = f"{namespace}:{{rag}}"
        self.policies = load_policies(os.getenv("RATE_LIMIT_POLICY_OVERRIDES") or "{}")
        self.concurrency = int(os.getenv("RAG_MAX_CONCURRENCY", "2"))
        if not 1 <= self.concurrency <= 32:
            raise ValueError("RAG_MAX_CONCURRENCY must be between 1 and 32")
        self.redis = Redis.from_url(settings.rate_limit_redis_url, socket_connect_timeout=0.5, socket_timeout=0.5, max_connections=32, retry=Retry(NoBackoff(), 0))

    def digest(self, identity):
        return hmac.new(self.secret.encode(), f"rate-key-v1\n{identity}".encode(), hashlib.sha256).hexdigest()

    async def ready(self):
        await self.redis.ping()

    async def close(self):
        await self.redis.aclose()

    async def consume(self, request, buckets):
        keys, args = [], []
        for name, identity in buckets:
            policy = self.policies[name]
            keys.append(f"{self.prefix}:{name}:{self.digest(identity)}")
            args.extend([policy["limit"], policy["seconds"]])
        try:
            result = await self.redis.eval(SCRIPT, len(keys), *keys, *args)
        except Exception as error:
            raise HTTPException(503, "Request protection temporarily unavailable", headers={"Retry-After": "1", "Cache-Control": "no-store"}) from error
        policy = self.policies[buckets[int(result[1]) - 1][0]]
        request.state.rate_headers = {
            "RateLimit-Limit": str(policy["limit"]), "RateLimit-Remaining": str(result[2]),
            "RateLimit-Reset": str(result[3]), "RateLimit-Policy": f'{policy["limit"]};w={policy["seconds"]}',
        }
        if not result[0]:
            raise HTTPException(429, "Too many requests", headers={"Retry-After": str(max(1, result[4])), "Cache-Control": "no-store"})

    async def global_limit(self, request):
        await self.consume(request, [("rag_global", "global"), ("service_ip", client_address(request, self.secret))])

    async def user_limit(self, request, owner):
        buckets = [("user_write", owner)]
        path = request.scope["route"].path
        if path == "/rag/query":
            buckets.extend([("rag_query", owner), ("rag_query_daily", owner), ("rag_query_global", "global")])
        elif path == "/rag/search":
            buckets.append(("rag_search", owner))
        elif path == "/rag/documents/{document_id}/index":
            buckets.extend([("rag_index", owner), ("rag_index_hourly", owner)])
        await self.consume(request, buckets)

    @asynccontextmanager
    async def slot(self, owner):
        keys = [f"{self.prefix}:inflight:global", f"{self.prefix}:inflight:{self.digest(owner)}"]
        nonce = str(uuid4())

        async def command(mode):
            return await self.redis.eval(LEASE_SCRIPT, len(keys), *keys, mode, nonce, 300_000, self.concurrency, 1)

        try:
            acquired = await command("acquire")
        except Exception as error:
            raise HTTPException(503, "Request protection temporarily unavailable", headers={"Retry-After": "1", "Cache-Control": "no-store"}) from error
        if not acquired:
            raise HTTPException(429, "RAG capacity busy; retry shortly", headers={"Retry-After": "1", "Cache-Control": "no-store"})

        async def heartbeat():
            while True:
                await asyncio.sleep(30)
                try:
                    if not await command("renew"):
                        return
                except Exception:
                    # New admissions fail closed during Redis outages. Retain
                    # the lease for five minutes and retry renewal on recovery.
                    pass

        renewal = asyncio.create_task(heartbeat())
        try:
            yield
        finally:
            renewal.cancel()
            with suppress(asyncio.CancelledError):
                await renewal
            with suppress(Exception):
                await command("release")

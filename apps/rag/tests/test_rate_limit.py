import asyncio
import hashlib
import hmac
import os
import time
import unittest
from contextlib import AsyncExitStack
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

import jwt
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request

os.environ.setdefault("JWT_SECRET", "rate-tests-secret-at-least-32-characters")
from app.config import Settings
from app.main import create_app
from app.rate_limit import LEASE_SCRIPT, RateLimiter, client_address, load_policies, normalize_address

SECRET = os.environ["JWT_SECRET"]
REDIS = os.getenv("TEST_REDIS_URL", "redis://127.0.0.1:55479")


def settings():
    return Settings(jwt_secret=SECRET, rate_limit_redis_url=REDIS)


def new_request(headers=None):
    return Request({"type": "http", "method": "POST", "path": "/rag/search", "headers": [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()], "client": ("192.0.2.1", 3000)})


class RedisTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.env = patch.dict(os.environ, {"RATE_LIMIT_NAMESPACE": f"test-{uuid4().hex}", "RATE_LIMIT_POLICY_OVERRIDES": '{"rag_search":{"limit":3,"seconds":60}}', "RAG_MAX_CONCURRENCY": "2"})
        self.env.start()
        self.first, self.second = RateLimiter(settings()), RateLimiter(settings())
        await self.first.ready()

    async def asyncTearDown(self):
        await self.first.close()
        await self.second.close()
        self.env.stop()

    async def test_atomic_admission_across_replicas(self):
        async def consume(index):
            try:
                await (self.first if index % 2 else self.second).consume(new_request(), [("rag_search", "same-user")])
                return 200
            except HTTPException as error:
                self.assertEqual(error.status_code, 429)
                self.assertGreaterEqual(int(error.headers["Retry-After"]), 1)
                return error.status_code
        results = await asyncio.gather(*(consume(i) for i in range(30)))
        self.assertEqual(results.count(200), 3)
        self.assertEqual(results.count(429), 27)
        await self.first.consume(new_request(), [("rag_search", "other-user")])

    async def test_distributed_concurrency_per_user_and_global_and_release_on_error(self):
        async with AsyncExitStack() as stack:
            await stack.enter_async_context(self.first.slot("one"))
            with self.assertRaises(HTTPException) as duplicate:
                async with self.second.slot("one"):
                    self.fail("Same user must not run two expensive operations")
            self.assertEqual(duplicate.exception.status_code, 429)
            async with self.second.slot("two"):
                with self.assertRaises(HTTPException) as saturated:
                    async with self.first.slot("three"):
                        self.fail("Global concurrency must span replicas")
                self.assertEqual(saturated.exception.status_code, 429)
            with self.assertRaises(ValueError):
                async with self.second.slot("two"):
                    raise ValueError("Operation failed")
            async with self.second.slot("two"):
                pass

    async def test_crashed_worker_leases_expire_and_stale_release_cannot_remove_new_work(self):
        keys = [f"{self.first.prefix}:test-crash:global", f"{self.first.prefix}:test-crash:owner"]
        async def command(mode, nonce, ttl=100):
            return await self.first.redis.eval(LEASE_SCRIPT, 2, *keys, mode, nonce, ttl, 1, 1)
        self.assertEqual(await command("acquire", "crashed"), 1)
        self.assertEqual(await command("acquire", "next"), 0)
        await asyncio.sleep(0.15)
        self.assertEqual(await command("acquire", "next", 1000), 1)
        await command("release", "crashed")
        self.assertEqual(await command("acquire", "third"), 0)
        self.assertEqual(await command("renew", "next", 1000), 1)
        await command("release", "next")
        self.assertEqual(await command("acquire", "third"), 1)


class HttpTests(unittest.TestCase):
    def test_user_quota_headers_health_and_redis_outage(self):
        class RuntimeWithoutExternalCalls:
            def __init__(self, _settings):
                self.qdrant = SimpleNamespace(get_collection=lambda _: {})
                self.calls = 0
            def close(self):
                pass
            def search(self, *_args):
                self.calls += 1
                return []

        def token():
            return jwt.encode({"sub": str(uuid4()), "iss": "customer-operation-api", "exp": datetime.now(timezone.utc) + timedelta(minutes=1)}, SECRET, algorithm="HS256")

        with patch.dict(os.environ, {"RATE_LIMIT_NAMESPACE": f"test-{uuid4().hex}", "RATE_LIMIT_POLICY_OVERRIDES": '{"rag_search":{"limit":1,"seconds":60}}'}):
            app = create_app(settings(), RuntimeWithoutExternalCalls)
            with TestClient(app) as client:
                body = {"organizationId": str(uuid4()), "question": "refund policy"}
                auth = {"Authorization": f"Bearer {token()}"}
                self.assertEqual(client.post("/rag/search", json=body).status_code, 401)
                first = client.post("/rag/search", json=body, headers=auth)
                self.assertEqual(first.status_code, 200)
                self.assertEqual(first.headers["ratelimit-remaining"], "0")
                denied = client.post("/rag/search", json=body, headers={**auth, "X-Forwarded-For": "198.51.100.12"})
                self.assertEqual(denied.status_code, 429)
                self.assertGreaterEqual(int(denied.headers["retry-after"]), 1)
                self.assertEqual(denied.headers["cache-control"], "no-store")
                self.assertEqual(denied.json()["requestId"], denied.headers["x-request-id"])
                self.assertEqual(app.state.runtime.calls, 1)
                self.assertEqual(client.post("/rag/search", json=body, headers={"Authorization": f"Bearer {token()}"}).status_code, 200)
                self.assertEqual(client.get("/health/ready").status_code, 200)
            # A new app on an unreachable Redis URL establishes failure policy
            # without stopping the shared test server used by other suites.
            down = create_app(Settings(jwt_secret=SECRET, rate_limit_redis_url="redis://127.0.0.1:1"), RuntimeWithoutExternalCalls)
            with TestClient(down) as client:
                self.assertEqual(client.get("/health/live").status_code, 200)
                self.assertEqual(client.get("/health/ready").status_code, 503)
                failure = client.post("/rag/search", json=body, headers=auth)
                self.assertEqual(failure.status_code, 503)
                self.assertEqual(failure.headers["retry-after"], "1")

    def test_proxy_signature_validation_ipv6_and_invalid_configuration(self):
        stamp = str(int(time.time()))
        forwarded = "2001:db8:1234:5678::ab"
        request_id = "rate-test"
        signature = hmac.new(SECRET.encode(), f"rate-forward-v1\n{forwarded}\n{stamp}\n{request_id}".encode(), hashlib.sha256).hexdigest()
        headers = {"x-rate-client-ip": forwarded, "x-rate-timestamp": stamp, "x-rate-signature": signature, "x-request-id": request_id}
        self.assertEqual(client_address(new_request(headers), SECRET), "2001:db8:1234:5678::")
        self.assertEqual(client_address(new_request({**headers, "x-rate-client-ip": "203.0.113.1"}), SECRET), "192.0.2.1")
        self.assertEqual(client_address(new_request({**headers, "x-rate-timestamp": str(int(stamp) - 31)}), SECRET), "192.0.2.1")
        self.assertEqual(normalize_address("::ffff:192.0.2.1"), "192.0.2.1")
        for overrides in ('null', '[]', '{"rag_query":{"limit":true,"seconds":60}}', '{"rag_query":{"limit":1,"seconds":0}}'):
            with self.assertRaises(ValueError):
                load_policies(overrides)


if __name__ == "__main__":
    unittest.main()

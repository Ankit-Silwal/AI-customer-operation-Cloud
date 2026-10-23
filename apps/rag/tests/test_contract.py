import os
import unittest
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import jwt
from fastapi.testclient import TestClient

os.environ.setdefault("JWT_SECRET", "contract-test-secret-at-least-32-characters")
from app.config import Settings
from app.main import create_app
from app.runtime import tenant_filter


class ContractTests(unittest.TestCase):
    def test_tenant_filter_requires_both_owner_and_organization(self):
        filters = tenant_filter("owner-a", "organization-a").model_dump()
        self.assertEqual(len(filters["must"]), 2)
        self.assertEqual({row["key"] for row in filters["must"]}, {"metadata.ownerId", "metadata.organizationId"})

    def test_authentication_and_query_validation_run_before_retrieval(self):
        class RuntimeWithoutExternalCalls:
            def __init__(self, _settings):
                pass
            def close(self):
                pass
            def search(self, *_args):
                raise AssertionError("Invalid requests must not invoke retrieval")

        settings = Settings(jwt_secret=os.environ["JWT_SECRET"])
        with TestClient(create_app(settings, RuntimeWithoutExternalCalls, limiter_factory=None)) as client:
            body = {"organizationId": str(uuid4()), "question": "refund policy"}
            self.assertEqual(client.post("/rag/search", json=body).status_code, 401)
            self.assertEqual(client.post("/rag/search", json=body, headers={"Authorization": "Bearer invalid"}).status_code, 401)
            token = jwt.encode({"sub": str(uuid4()), "iss": "customer-operation-api", "exp": datetime.now(timezone.utc) + timedelta(minutes=1)}, settings.jwt_secret, algorithm="HS256")
            self.assertEqual(client.post("/rag/search", json={**body, "question": " "}, headers={"Authorization": f"Bearer {token}"}).status_code, 422)


if __name__ == "__main__":
    unittest.main()

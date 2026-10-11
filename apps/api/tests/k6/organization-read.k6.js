import http from "k6/http";
import { check, fail, sleep } from "k6";

const baseUrl = (__ENV.BASE_URL || "http://localhost:3001").replace(/\/+$/, "");
const token = __ENV.TOKEN;
const organizationId = __ENV.ORGANIZATION_ID;

if (Boolean(token) !== Boolean(organizationId)) {
  throw new Error("Provide both TOKEN and ORGANIZATION_ID, or neither.");
}

// k6's --vus and --duration CLI flags override these defaults.
export const options = {
  vus: 10,
  duration: "30s",
  thresholds: {
    "http_reqs{operation:organization_read}": ["count>0"],
    "http_req_failed{operation:organization_read}": ["rate<0.01"],
    "http_req_duration{operation:organization_read}": ["p(95)<500"],
    "checks{operation:organization_read}": ["rate>0.99"],
  },
};

function jsonBody(response) {
  try {
    return response.json();
  } catch {
    return null;
  }
}

function setupResponse(response, expectedStatus, step) {
  if (response.status !== expectedStatus) {
    fail(
      `${step} failed (HTTP ${response.status}). Check BASE_URL and API availability.`,
    );
  }
  const body = jsonBody(response);
  if (!body || typeof body !== "object") {
    fail(`${step} did not return a JSON object.`);
  }
  return body;
}

export function setup() {
  let credentials;
  if (token && organizationId) {
    credentials = { token, organizationId };
  } else {
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const registered = setupResponse(
      http.post(
        `${baseUrl}/register`,
        JSON.stringify({
          name: "k6 Load Test",
          email: `k6-${runId}@example.com`,
          password: `k6-${runId}-password`,
        }),
        {
          headers: { "Content-Type": "application/json" },
          tags: { operation: "setup", name: "POST /register" },
          timeout: "10s",
        },
      ),
      201,
      "Registration",
    );
    if (typeof registered.token !== "string" || !registered.token) {
      fail("Registration did not return a token.");
    }

    const organization = setupResponse(
      http.post(
        `${baseUrl}/organizations`,
        JSON.stringify({ name: `k6 Organization ${runId}` }),
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${registered.token}`,
          },
          tags: { operation: "setup", name: "POST /organizations" },
          timeout: "10s",
        },
      ),
      201,
      "Organization creation",
    );
    if (typeof organization.id !== "string" || !organization.id) {
      fail("Organization creation did not return an ID.");
    }
    credentials = { token: registered.token, organizationId: organization.id };
  }

  // Validate credentials before starting any concurrent traffic.
  const organization = setupResponse(
    http.get(`${baseUrl}/organizations/${credentials.organizationId}`, {
      headers: { Authorization: `Bearer ${credentials.token}` },
      tags: { operation: "setup", name: "GET /organizations/:id" },
      timeout: "10s",
    }),
    200,
    "Organization preflight",
  );
  if (organization.id !== credentials.organizationId) {
    fail("Organization preflight returned an unexpected ID.");
  }
  return credentials;
}

export default function (credentials) {
  const response = http.get(
    `${baseUrl}/organizations/${credentials.organizationId}`,
    {
      headers: { Authorization: `Bearer ${credentials.token}` },
      tags: { operation: "organization_read", name: "GET /organizations/:id" },
      timeout: "10s",
    },
  );
  const body = jsonBody(response);
  check(
    response,
    {
      "organization read returns HTTP 200": (res) => res.status === 200,
      "organization read returns the expected ID": () =>
        body !== null && body.id === credentials.organizationId,
    },
    { operation: "organization_read" },
  );
  sleep(1);
}

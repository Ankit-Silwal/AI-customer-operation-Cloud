import http from "k6/http";
import exec from "k6/execution";
import { check, fail, sleep } from "k6";
import { summaryOutputs } from "./safe-summary.js";

const baseUrl = (__ENV.BASE_URL || "http://localhost:3001").replace(/\/+$/, "");
const users = Number(__ENV.USERS || 10);
const batchSize = Number(__ENV.SETUP_BATCH || 5);
const thinkTime = Number(__ENV.THINK_TIME || 1);
const profile = __ENV.PROFILE || "steady";
const duration = __ENV.DURATION || (profile === "soak" ? "30m" : "30s");
if (!Number.isSafeInteger(users) || users < 1) throw new Error("USERS must be a positive integer");
if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 20) throw new Error("SETUP_BATCH must be 1..20");
if (!Number.isFinite(thinkTime) || thinkTime < 0) throw new Error("THINK_TIME must be nonnegative");
if (!["steady", "spike", "soak"].includes(profile)) throw new Error("PROFILE must be steady, spike or soak");

export const options = {
  scenarios: {
    traffic: profile === "spike" ? {
      executor: "ramping-vus", startVUs: 0, gracefulRampDown: "10s", gracefulStop: "10s",
      stages: [{ duration: "5s", target: users }, { duration, target: users }, { duration: "5s", target: 0 }],
    } : { executor: "constant-vus", vus: users, duration, gracefulStop: "10s" },
  },
  setupTimeout: __ENV.SETUP_TIMEOUT || "20m",
  batch: batchSize, batchPerHost: batchSize,
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
  // Exclude raw URLs and credentials from metric dimensions.
  systemTags: ["status", "method", "name", "group", "check", "error_code", "scenario", "expected_response"],
  thresholds: {
    "http_reqs{phase:load}": ["count>0"],
    "http_req_failed{phase:load}": ["rate<0.01"],
    "checks{phase:load}": ["rate>0.99"],
    "http_req_duration{phase:load,kind:read}": ["p(95)<500"],
    "http_req_duration{phase:load,kind:write}": ["p(95)<1000"],
    "http_req_duration{phase:load,kind:login}": ["p(95)<1000"],
  },
};

function params(account, phase, operation, kind, json = true) {
  return {
    headers: {
      ...(json ? { "Content-Type": "application/json" } : {}),
      ...(account ? { Authorization: `Bearer ${account.token}` } : {}),
    },
    tags: { phase, operation, kind, name: operation }, timeout: "10s",
  };
}

function body(response) {
  try { return response.json(); } catch { return null; }
}

function required(response, status, operation) {
  const data = body(response);
  if (response.status !== status || !data || !response.headers["X-Request-Id"]) {
    fail(`${operation} failed (HTTP ${response.status}); check API availability and Version 1 configuration`);
  }
  return data;
}

function seedConversation(account) {
  return { organizationId: account.organizationId, customerEmail: "customer@example.com", subject: "k6 support request", messages: [{ role: "user", content: "Please help" }] };
}

const pdf = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 0 /Kids [] >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n";
function uploadBody(account, type = 0) {
  const files = [
    { data: "Version 1 sample document\n", name: "sample.txt", mime: "text/plain" },
    { data: "# Version 1\nSample document\n", name: "sample.md", mime: "text/markdown" },
    { data: pdf, name: "sample.pdf", mime: "application/pdf" },
  ];
  const file = files[type % files.length];
  return { organizationId: account.organizationId, title: "k6 document", file: http.file(file.data, file.name, file.mime) };
}

export function setup() {
  // Prevent CLI shortcuts/config overrides from silently changing the account count.
  const scenario = exec.test.options.scenarios.traffic;
  const configured = scenario?.executor === "constant-vus" ? scenario.vus :
    scenario?.executor === "ramping-vus" ? Math.max(...scenario.stages.map((stage) => stage.target), scenario.startVUs) : 0;
  if (Object.keys(exec.test.options.scenarios).length !== 1 || configured !== users) {
    fail("Use -e USERS=N and -e DURATION=30s; do not override --vus, --duration or scenarios");
  }
  required(http.get(`${baseUrl}/health/live`, params(null, "setup", "GET /health/live", "health")), 200, "Liveness");
  required(http.get(`${baseUrl}/health/ready`, params(null, "setup", "GET /health/ready", "health")), 200, "Readiness");
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const accounts = [];
  for (let offset = 0; offset < users; offset += batchSize) {
    const batch = Array.from({ length: Math.min(batchSize, users - offset) }, (_, index) => ({
      email: `k6-v1-${runId}-${offset + index}@example.com`, password: `k6-${runId}-password`,
    }));
    const registrations = http.batch(batch.map((account) => ({
      method: "POST", url: `${baseUrl}/register`,
      body: JSON.stringify({ name: "k6 Version 1", email: account.email, password: account.password }),
      params: params(null, "setup", "POST /register", "setup"),
    })));
    batch.forEach((account, index) => {
      const registered = required(registrations[index], 201, "Registration");
      if (!registered.user?.id || !registered.token) fail("Registration did not return user credentials");
      account.userId = registered.user.id;
      account.token = registered.token;
    });
    const organizations = http.batch(batch.map((account) => ({ method: "POST", url: `${baseUrl}/organizations`,
      body: JSON.stringify({ name: "k6 owned organization" }), params: params(account, "setup", "POST /organizations", "setup") })));
    batch.forEach((account, index) => {
      const org = required(organizations[index], 201, "Organization creation");
      if (!org.id || org.ownerId !== account.userId) fail("Organization owner does not match its account");
      account.organizationId = org.id;
    });
    const conversations = http.batch(batch.map((account) => ({ method: "POST", url: `${baseUrl}/conversation`,
      body: JSON.stringify(seedConversation(account)), params: params(account, "setup", "POST /conversation", "setup") })));
    batch.forEach((account, index) => {
      account.conversationId = required(conversations[index], 201, "Conversation creation").id;
    });
    const documents = http.batch(batch.map((account, index) => ({ method: "POST", url: `${baseUrl}/documents/upload`,
      body: uploadBody(account, (offset + index) % 3), params: params(account, "setup", "POST /documents/upload", "setup", false) })));
    batch.forEach((account, index) => {
      account.documentId = required(documents[index], 201, "Document upload").id;
      if (!account.documentId || !account.conversationId) fail("Seed resources did not return IDs");
      accounts.push(account);
    });
  }
  if (new Set(accounts.map((account) => account.userId)).size !== users ||
      new Set(accounts.map((account) => account.organizationId)).size !== users) fail("Accounts and organizations must be distinct");
  // Expected rejections stay outside load-failure thresholds.
  const anonymous = http.get(`${baseUrl}/organizations/${accounts[0].organizationId}`, params(null, "validation", "anonymous", "validation"));
  if (anonymous.status !== 401) fail("Anonymous access must be rejected");
  const invalid = http.post(`${baseUrl}/documents`, JSON.stringify({ organizationId: "invalid" }), params(accounts[0], "validation", "invalid-input", "validation"));
  if (invalid.status !== 400) fail("Invalid input must be rejected");
  if (accounts.length > 1) {
    const foreign = http.get(`${baseUrl}/documents/${accounts[0].documentId}`, params(accounts[1], "validation", "foreign-document", "validation"));
    if (foreign.status !== 404) fail("Cross-account document access must be rejected");
  }
  // Credentials stay in k6 memory and are excluded from handleSummary output.
  return accounts;
}

export default function (accounts) {
  const account = accounts[exec.vu.idInTest - 1];
  if (!account) exec.test.abort("VU has no unique account; run a single local generator with USERS=N");
  // Offset VUs to avoid all users doing the same action together.
  const slot = (exec.vu.iterationInScenario + exec.vu.idInTest - 1) % 20;
  let response;
  let expected = 200;
  let expectedId;
  let operation;
  let kind = "read";
  if (slot < 8) {
    operation = "GET /organizations/:id"; expectedId = account.organizationId;
    response = http.get(`${baseUrl}/organizations/${account.organizationId}`, params(account, "load", operation, kind));
  } else if (slot < 11) {
    operation = "GET /conversation/:id"; expectedId = account.conversationId;
    response = http.get(`${baseUrl}/conversation/${account.conversationId}`, params(account, "load", operation, kind));
  } else if (slot < 13) {
    operation = "GET /documents/:id"; expectedId = account.documentId;
    response = http.get(`${baseUrl}/documents/${account.documentId}`, params(account, "load", operation, kind));
  } else if (slot === 13) {
    operation = "GET /documents/:id/download";
    response = http.get(`${baseUrl}/documents/${account.documentId}/download`, params(account, "load", operation, kind, false));
  } else if (slot < 16) {
    operation = "POST /conversation"; kind = "write"; expected = 201;
    response = http.post(`${baseUrl}/conversation`, JSON.stringify(seedConversation(account)), params(account, "load", operation, kind));
  } else if (slot === 16) {
    operation = "POST /documents"; kind = "write"; expected = 201;
    response = http.post(`${baseUrl}/documents`, JSON.stringify({ organizationId: account.organizationId, title: "k6 JSON document", content: "Sample content" }), params(account, "load", operation, kind));
  } else if (slot < 19) {
    operation = "POST /documents/upload"; kind = "write"; expected = 201;
    response = http.post(`${baseUrl}/documents/upload`, uploadBody(account, exec.vu.iterationInScenario % 3), params(account, "load", operation, kind, false));
  } else {
    operation = "POST /login"; kind = "login";
    response = http.post(`${baseUrl}/login`, JSON.stringify({ email: account.email, password: account.password }), params(null, "load", operation, kind));
  }
  const data = operation.endsWith("/download") ? null : body(response);
  check(response, {
    "expected HTTP status": (res) => res.status === expected,
    "request ID present": (res) => Boolean(res.headers["X-Request-Id"]),
    "correct owned response": () => operation.endsWith("/download") ? Boolean(response.body?.length) :
      kind === "login" ? data?.user?.id === account.userId && Boolean(data.token) :
      expectedId ? data?.id === expectedId : data?.organizationId === account.organizationId && Boolean(data.id),
  }, { phase: "load", operation, kind });
  sleep(thinkTime);
}

export function handleSummary(data) { return summaryOutputs(data, __ENV.SUMMARY_PATH); }

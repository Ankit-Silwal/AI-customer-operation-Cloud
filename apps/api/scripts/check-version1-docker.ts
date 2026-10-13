import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const root = fileURLToPath(new URL("../../../", import.meta.url));
const base = process.env.BASE_URL ?? "http://localhost:3002";
const resilience = process.argv.includes("--resilience");
const startedAt = new Date().toISOString();
const checks: { name: string; status: number; passed: boolean }[] = [];
type Body = {
  id?: string;
  token?: string;
  user?: { id: string };
  ownerId?: string;
  organizationId?: string;
  content?: string;
  status?: string;
  upload?: { fileName: string; mediaType: string; byteLength: number };
};
async function request(
  name: string,
  path: string,
  expected: number,
  options: RequestInit = {},
) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    signal: AbortSignal.timeout(15000),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  const entry = { name, status: response.status, passed: false };
  checks.push(entry);
  assert.equal(response.status, expected, name);
  assert.ok(response.headers.get("x-request-id"), `${name}: request ID`);
  assert.equal(
    response.headers.get("x-content-type-options"),
    "nosniff",
    `${name}: security header`,
  );
  entry.passed = true;
  let body: Body = {};
  try {
    body = JSON.parse(bytes.toString("utf8"));
  } catch {
    /* Download bytes need not be JSON. */
  }
  return { body, bytes, headers: response.headers };
}
const json = (body: unknown, token?: string): RequestInit => ({
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify(body),
});
const auth = (token: string): RequestInit => ({
  headers: { Authorization: `Bearer ${token}` },
});
function upload(
  organizationId: string,
  bytes: Buffer,
  filename: string,
  mime: string,
  token: string,
): RequestInit {
  const form = new FormData();
  form.set("organizationId", organizationId);
  form.set("title", "Docker smoke document");
  form.set("file", new Blob([new Uint8Array(bytes)], { type: mime }), filename);
  return {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  };
}
async function compose(...args: string[]) {
  return execute(
    "docker",
    [
      "compose",
      "-p",
      "customer-operation-cloud-v1-benchmark",
      "-f",
      "compose.benchmark.yaml",
      ...args,
    ],
    { cwd: root },
  );
}
async function waitForReadiness() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/health/ready`, {
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) return;
    } catch {
      /* Startup can briefly refuse connections. */
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error("Readiness recovery timed out");
}
async function main() {
  await request("liveness", "/health/live", 200);
  await request("readiness", "/health/ready", 200);
  const email = `docker-smoke-${randomUUID()}@example.com`;
  const password = `test-${randomUUID()}`;
  const alice = (
    await request(
      "register owner",
      "/register",
      201,
      json({ name: "Smoke owner", email, password }),
    )
  ).body;
  assert.ok(alice.token && alice.user?.id);
  const token = alice.token;
  const org = (
    await request(
      "create owned organization",
      "/organizations",
      201,
      json({ name: "Docker smoke" }, token),
    )
  ).body;
  assert.ok(org.id);
  assert.equal(org.ownerId, alice.user.id);
  const organizationId = org.id;
  const document = (
    await request(
      "create persistent JSON document",
      "/documents",
      201,
      json(
        {
          organizationId,
          title: "Persistent",
          content: "Preserved across restart",
        },
        token,
      ),
    )
  ).body;
  assert.ok(document.id);
  if (resilience) {
    try {
      await compose("stop", "postgres");
      await request("liveness while database is stopped", "/health/live", 200);
      const ready = await request(
        "readiness rejects stopped database",
        "/health/ready",
        503,
      );
      assert.equal(ready.body.status, "not_ready");
    } finally {
      await compose("start", "postgres");
    }
    await waitForReadiness();
    await request("readiness after database recovery", "/health/ready", 200);
    await request(
      "existing session and document after database recovery",
      `/documents/${document.id}`,
      200,
      auth(token),
    );
    await compose("restart", "api");
    await waitForReadiness();
    await request("readiness after API restart", "/health/ready", 200);
    const preserved = await request(
      "session and document survive API restart",
      `/documents/${document.id}`,
      200,
      auth(token),
    );
    assert.equal(preserved.body.content, "Preserved across restart");
    const migration = await compose(
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "customer_ops_benchmark",
      "-d",
      "customer_ops_benchmark",
      "-Atc",
      "SELECT count(*) FROM schema_migrations WHERE version=1",
    );
    assert.equal(
      migration.stdout.trim(),
      "1",
      "migration remains applied exactly once",
    );
    checks.push({
      name: "migration remains applied exactly once",
      status: 0,
      passed: true,
    });
    return;
  }
  const bob = (
    await request(
      "register second account",
      "/register",
      201,
      json({
        name: "Smoke other",
        email: `docker-smoke-${randomUUID()}@example.com`,
        password,
      }),
    )
  ).body;
  assert.ok(bob.token && bob.user?.id);
  assert.notEqual(bob.user.id, alice.user.id);
  const login = await request(
    "login owner",
    "/login",
    200,
    json({ email, password }),
  );
  assert.equal(login.body.user?.id, alice.user.id);
  assert.ok(login.body.token);
  await request(
    "reject incorrect password",
    "/login",
    401,
    json({ email, password: "incorrect-password" }),
  );
  await request(
    "reject duplicate account",
    "/register",
    409,
    json({ name: "Duplicate", email, password }),
  );
  await request(
    "reject anonymous organization access",
    `/organizations/${organizationId}`,
    401,
  );
  await request(
    "reject malformed JWT",
    `/organizations/${organizationId}`,
    401,
    auth("invalid-jwt"),
  );
  await request(
    "reject foreign organization access",
    `/organizations/${organizationId}`,
    404,
    auth(bob.token),
  );
  await request(
    "read JSON document",
    `/documents/${document.id}`,
    200,
    auth(token),
  );
  await request(
    "JSON-only document has no file",
    `/documents/${document.id}/download`,
    404,
    auth(token),
  );
  const conversation = (
    await request(
      "create conversation",
      "/conversation",
      201,
      json(
        {
          organizationId,
          customerEmail: "customer@example.com",
          subject: "Smoke",
          messages: [{ role: "user", content: "Help" }],
        },
        token,
      ),
    )
  ).body;
  assert.ok(conversation.id);
  await request(
    "read owned conversation",
    `/conversation/${conversation.id}`,
    200,
    auth(token),
  );
  await request(
    "reject foreign conversation access",
    `/conversation/${conversation.id}`,
    404,
    auth(bob.token),
  );
  const files = [
    {
      name: "notes.txt",
      mime: "text/plain",
      bytes: Buffer.from("Hello\nWorld\n"),
    },
    {
      name: "notes.md",
      mime: "text/markdown",
      bytes: Buffer.from("# Hello\n"),
    },
    {
      name: "notes.pdf",
      mime: "application/pdf",
      bytes: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n"),
    },
  ];
  for (const file of files) {
    const uploaded = await request(
      `upload ${file.name}`,
      "/documents/upload",
      201,
      upload(organizationId, file.bytes, file.name, file.mime, token),
    );
    assert.ok(uploaded.body.id);
    assert.deepEqual(uploaded.body.upload, {
      fileName: file.name,
      mediaType: file.mime,
      byteLength: file.bytes.length,
    });
    assert.equal(
      uploaded.body.content,
      file.mime === "application/pdf" ? "" : file.bytes.toString(),
    );
    await request(
      `read ${file.name} metadata`,
      `/documents/${uploaded.body.id}`,
      200,
      auth(token),
    );
    const download = await request(
      `download ${file.name} bytes`,
      `/documents/${uploaded.body.id}/download`,
      200,
      auth(token),
    );
    assert.deepEqual(download.bytes, file.bytes);
    assert.match(
      download.headers.get("content-disposition") ?? "",
      /^attachment;/,
    );
    await request(
      `reject foreign ${file.name} metadata`,
      `/documents/${uploaded.body.id}`,
      404,
      auth(bob.token),
    );
    await request(
      `reject foreign ${file.name} download`,
      `/documents/${uploaded.body.id}/download`,
      404,
      auth(bob.token),
    );
  }
  await request(
    "reject foreign upload",
    "/documents/upload",
    404,
    upload(
      organizationId,
      Buffer.from("Hello"),
      "notes.txt",
      "text/plain",
      bob.token,
    ),
  );
  await request(
    "reject unsupported executable upload",
    "/documents/upload",
    415,
    upload(
      organizationId,
      Buffer.from("no"),
      "bad.exe",
      "application/octet-stream",
      token,
    ),
  );
  await request(
    "reject invalid PDF",
    "/documents/upload",
    400,
    upload(
      organizationId,
      Buffer.from("not a PDF"),
      "bad.pdf",
      "application/pdf",
      token,
    ),
  );
  await request(
    "reject invalid UTF-8",
    "/documents/upload",
    400,
    upload(
      organizationId,
      Buffer.from([255, 254]),
      "bad.txt",
      "text/plain",
      token,
    ),
  );
  await request(
    "reject oversized upload",
    "/documents/upload",
    413,
    upload(
      organizationId,
      Buffer.alloc(1048577, 65),
      "large.txt",
      "text/plain",
      token,
    ),
  );
  const supplied = await request(
    "preserve safe request ID",
    "/health/live",
    200,
    { headers: { "X-Request-ID": "docker-smoke_safe" } },
  );
  assert.equal(supplied.headers.get("x-request-id"), "docker-smoke_safe");
  const invalidId = await request(
    "replace invalid request ID",
    "/missing",
    404,
    { headers: { "X-Request-ID": "unsafe.id" } },
  );
  assert.match(invalidId.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/);
}
let failed = 0;
try {
  await main();
} catch (error) {
  failed = 1;
  if (checks.length) checks[checks.length - 1]!.passed = false;
  console.error(
    `Docker validation failed: ${error instanceof Error ? error.name : "unknown error"}; inspect the last named check. Credentials are not printed.`,
  );
  process.exitCode = 1;
}
await writeFile(
  new URL(
    `../../../docs/Version1/results/validation/${resilience ? "resilience" : "docker-smoke"}.json`,
    import.meta.url,
  ),
  JSON.stringify(
    {
      startedAt,
      endedAt: new Date().toISOString(),
      baseUrl: base,
      checks,
      failed,
      note: "Compiled Docker API, real PostgreSQL, each capped at 1 CPU / 1 GiB. Request IDs/security headers checked on every HTTP response. Credentials kept in memory only.",
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Docker ${resilience ? "resilience" : "smoke"} checks: ${checks.filter((check) => check.passed).length} passed, ${failed} failed.`,
);

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { summaryOutputs } from "./k6/safe-summary.js";

// Exercise the actual k6 lifecycle code with an in-process HTTP double.
// This checks provisioning and VU/account assignment without starting a load run.
test("Version 1 k6 provisions 100 distinct accounts and keeps every VU in its own account", async () => {
  const raw = await readFile(new URL("./k6/version1-mixed.k6.js", import.meta.url), "utf8");
  const source = raw.replace(/^import .*;\r?\n/gm, "")
    .replace("export default function", "function iteration")
    .replaceAll("export function", "function").replaceAll("export const", "const");
  let nextUser = 0;
  let nextResource = 0;
  const registrations = new Map<string, { id: string; token: string; email: string }>();
  const resources = new Map<string, { id: string; ownerId?: string; organizationId?: string }>();
  const loadedAccounts = new Set<string>();
  const operations = new Set<string>();
  const execution = { test: { options: { scenarios: {} }, abort: (message: string) => { throw new Error(message); } }, vu: { idInTest: 1, iterationInScenario: 0 } };
  function dispatch(method: string, url: string, payload: unknown, params: { headers: Record<string, string>; tags: Record<string, string> }) {
    const path = new URL(url).pathname;
    const user = [...registrations.values()].find((candidate) => params.headers.Authorization === `Bearer ${candidate.token}`);
    const input = typeof payload === "string" ? JSON.parse(payload) : payload as Record<string, unknown>;
    let status = 200;
    let body: unknown;
    if (path.startsWith("/health/")) body = { status: "ready" };
    else if (path === "/register") {
      const id = `user-${++nextUser}`;
      const record = { id, token: `mock-session-${id}`, email: input.email };
      registrations.set(input.email, record);
      body = { user: { id }, token: record.token }; status = 201;
    } else if (path === "/login") {
      const record = registrations.get(input.email);
      assert.ok(record);
      body = { user: { id: record.id }, token: record.token };
      if (params.tags.phase === "load") loadedAccounts.add(record.id);
    } else if (!user) { status = 401; body = { error: "Unauthenticated" }; }
    else if (method === "POST") {
      if (input.organizationId === "invalid") { status = 400; body = { error: "Invalid" }; }
      else {
        if (path !== "/organizations") assert.equal(resources.get(input.organizationId)?.ownerId, user.id);
        const id = `resource-${++nextResource}`;
        body = { id, ...(path === "/organizations" ? { ownerId: user.id } : { organizationId: input.organizationId }) };
        resources.set(id, body as { id: string; ownerId?: string; organizationId?: string }); status = 201;
      }
    } else {
      const record = resources.get(path.split("/")[2]!);
      const owner = record?.ownerId || resources.get(record?.organizationId || "")?.ownerId;
      if (owner !== user.id) { status = 404; body = { error: "Not found" }; }
      else body = path.endsWith("/download") ? "document bytes" : record;
    }
    if (params.tags.phase === "load") {
      operations.add(params.tags.operation!);
      if (user) loadedAccounts.add(user.id);
      assert.ok(status === 200 || status === 201, "load action must use its own resources");
    }
    return { status, headers: { "X-Request-Id": "mock-request-id" }, body: typeof body === "string" ? body : JSON.stringify(body), json: () => body };
  }
  const script = runInNewContext(source + "\n({setup, iteration, handleSummary, options})", {
    __ENV: { USERS: "100", THINK_TIME: "0" }, exec: execution, summaryOutputs,
    fail: (message: string) => { throw new Error(message); }, sleep: () => undefined,
    check: (response: unknown, checks: Record<string, (response: unknown) => boolean>) => {
      for (const [name, check] of Object.entries(checks)) assert.ok(check(response), name);
    },
    http: {
      get: (url: string, params: Parameters<typeof dispatch>[3]) => dispatch("GET", url, undefined, params),
      post: (url: string, payload: unknown, params: Parameters<typeof dispatch>[3]) => dispatch("POST", url, payload, params),
      batch: (requests: { method: string; url: string; body: unknown; params: Parameters<typeof dispatch>[3] }[]) => requests.map((req) => dispatch(req.method, req.url, req.body, req.params)),
      file: (data: string, name: string, mime: string) => ({ data, name, mime }),
    },
  });
  execution.test.options.scenarios = script.options.scenarios;
  const accounts = script.setup();
  assert.equal(accounts.length, 100);
  assert.equal(registrations.size, 100);
  for (let vu = 1; vu <= 100; vu++) {
    execution.vu.idInTest = vu;
    for (let iteration = 0; iteration < 20; iteration++) {
      execution.vu.iterationInScenario = iteration;
      script.iteration(accounts);
    }
  }
  assert.equal(loadedAccounts.size, 100);
  assert.equal(operations.size, 8);
  const report = script.handleSummary({ setup_data: accounts, metrics: {} });
  assert.ok(!JSON.stringify(report).includes("mock-session"));
  execution.test.options.scenarios = {};
  assert.throws(() => script.setup(), /Use -e USERS=N/);
});

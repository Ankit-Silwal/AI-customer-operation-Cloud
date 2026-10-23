import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AuthResponse } from "../src/modules/auth/auth.types.js";
import type { Organization } from "../src/modules/organizations/organization.types.js";
import type { Conversation } from "../src/modules/conversations/conversation.types.js";
import type { Document } from "../src/modules/documents/document.types.js";

const base = process.env.BASE_URL ?? "http://localhost:3001";
const includeRag = process.argv.includes("--rag");
let checks = 0;

async function call<T = Record<string, unknown>>(path: string, expected: number, token?: string, body?: unknown): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(60000),
  });
  assert.equal(response.status, expected, `${path}: expected ${expected}, got ${response.status}`);
  assert.ok(response.headers.get("x-request-id"), `${path}: request ID`);
  checks++;
  return await response.json() as T;
}

await call("/health/ready", 200);
const email = `services-${randomUUID()}@example.com`;
const credentials = { name: "Service check", email, password: `test-${randomUUID()}` };
const owner = await call<AuthResponse>("/register", 201, undefined, credentials);
const other = await call<AuthResponse>("/register", 201, undefined, { ...credentials, email: `other-${email}` });
await call("/register", 409, undefined, credentials);
const login = await call<AuthResponse>("/login", 200, undefined, credentials);
assert.equal(login.user.id, owner.user.id);
const org = await call<Organization>("/organizations", 201, owner.token, { name: "Services" });
await call(`/organizations/${org.id}`, 200, owner.token);
await call(`/organizations/${org.id}`, 404, other.token);
const conversation = await call<Conversation>("/conversation", 201, owner.token, { organizationId: org.id, customerEmail: email, subject: "Refund", messages: [] });
await call(`/conversation/${conversation.id}`, 200, owner.token);
await call(`/conversation/${conversation.id}`, 404, other.token);
await call("/conversation", 404, other.token, { organizationId: org.id, customerEmail: email, subject: "Forbidden" });
const document = await call<Document>("/documents", 201, owner.token, { organizationId: org.id, title: "Refund policy", content: "Customers can request a refund within 30 days of purchase." });
await call(`/documents/${document.id}`, 200, owner.token);
await call(`/documents/${document.id}`, 404, other.token);
const form = new FormData();
form.set("organizationId", org.id);
form.set("title", "Multipart policy");
form.set("file", new Blob(["Uploaded policy bytes"], { type: "text/plain" }), "policy.txt");
const uploaded = await fetch(`${base}/documents/upload`, { method: "POST", headers: { Authorization: `Bearer ${owner.token}` }, body: form });
assert.equal(uploaded.status, 201);
const metadata = await uploaded.json() as Document;
const download = await fetch(`${base}/documents/${metadata.id}/download`, { headers: { Authorization: `Bearer ${owner.token}` } });
assert.equal(download.status, 200);
assert.equal(await download.text(), "Uploaded policy bytes");
checks += 2;

if (includeRag) {
  const health = await call("/rag/health/ready", 200);
  await call("/rag/search", 401, undefined, { organizationId: org.id, question: "refund policy" });
  await call(`/rag/documents/${document.id}/index`, 200, owner.token, {});
  await call(`/rag/documents/${document.id}/index`, 200, owner.token, {});
  await call(`/rag/documents/${document.id}/index`, 404, other.token, {});
  const results = await call<{sources: {documentId: string; text: string}[]}>("/rag/search", 200, owner.token, { organizationId: org.id, question: "When can customers request refunds?" });
  assert.equal(results.sources.length, 1, "Repeated indexing must not duplicate chunks");
  assert.equal(results.sources[0]?.documentId, document.id);
  assert.match(results.sources[0]?.text ?? "", /30 days/);
  await call("/rag/search", 404, other.token, { organizationId: org.id, question: "refund policy" });
  const otherOrg = await call<Organization>("/organizations", 201, other.token, { name: "Other tenant" });
  const privateResults = await call("/rag/search", 200, other.token, { organizationId: otherOrg.id, question: "refund policy" });
  assert.deepEqual(privateResults.sources, [], "Vector search must exclude other tenants");
  if (!health.generationConfigured) {
    await call("/rag/query", 503, owner.token, { organizationId: org.id, question: "refund policy" });
  }
}
console.log(`Microservices smoke checks: ${checks} passed. Credentials were kept in memory.`);

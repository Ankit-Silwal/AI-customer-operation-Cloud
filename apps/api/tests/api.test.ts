import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Organization, Conversation, DocumentMetadata } from '@relay/shared';
import { createApiServer } from '../src/http.js';
import { prisma } from '../src/db.js';
import { appOrigin } from '../src/auth.js';

const server = createApiServer();
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
const emails: string[] = [],
  organizationIds: string[] = [];
after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
});

async function request(
  route: string,
  cookie = '',
  body?: Record<string, unknown> | FormData,
  origin = appOrigin,
) {
  return fetch(`${base}/${route}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      cookie,
      origin,
      ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
}
async function signup() {
  const email = `relay-test-${randomUUID()}@example.com`;
  emails.push(email);
  const response = await request('auth/sign-up/email', '', {
    email,
    password: 'Test-password-123!',
    name: 'Test member',
  });
  assert.equal(response.status, 200, await response.clone().text());
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  assert.ok(cookie);
  return { cookie, email };
}

test('email auth, sessions, protected organizations, conversations and uploads', async () => {
  assert.equal((await request('organizations')).status, 401);
  const owner = await signup(),
    stranger = await signup();
  assert.equal(
    (await request('auth/sign-in/email', '', { email: owner.email, password: 'wrong-password' }))
      .status,
    401,
  );
  const login = await request('auth/sign-in/email', '', {
    email: owner.email,
    password: 'Test-password-123!',
  });
  assert.equal(login.status, 200);
  const account = await prisma.account.findFirstOrThrow({
    where: { user: { email: owner.email }, providerId: 'credential' },
  });
  assert.ok(account.password);
  assert.notEqual(account.password, 'Test-password-123!');
  assert.equal((await request('organizations', owner.cookie, { name: ' ' })).status, 400);
  assert.equal(
    (
      await request(
        'organizations',
        owner.cookie,
        { name: 'Wrong origin' },
        'https://other.example',
      )
    ).status,
    403,
  );
  const created = await request('organizations', owner.cookie, { name: 'Test organization' });
  assert.equal(created.status, 201);
  const organization = (await created.json()) as Organization;
  organizationIds.push(organization.id);
  const route = `organizations/${organization.id}`;
  assert.equal((await request(route, stranger.cookie)).status, 404);
  assert.equal((await request(`${route}/conversations`, stranger.cookie, {})).status, 404);
  assert.deepEqual(await (await request('organizations', stranger.cookie)).json(), []);
  const chatResponse = await request(`${route}/conversations`, owner.cookie, {});
  assert.equal(chatResponse.status, 201);
  const chat = (await chatResponse.json()) as Conversation;
  const chatRoute = `${route}/conversations/${chat.id}`;
  assert.equal((await request(`${chatRoute}/messages`, owner.cookie, { text: '' })).status, 400);
  const sent = await request(`${chatRoute}/messages`, owner.cookie, { text: 'Hello there' });
  assert.equal(sent.status, 201);
  const saved = (await sent.json()) as Conversation;
  assert.equal(saved.title, 'Hello there');
  assert.equal(saved.messages.length, 2);
  assert.match(saved.messages[1].text, /demo reply/);
  assert.equal((await request(chatRoute, stranger.cookie)).status, 404);
  assert.equal(
    (await request(`${chatRoute}/messages`, stranger.cookie, { text: 'Intrusion' })).status,
    404,
  );
  const secondCreated = await request('organizations', owner.cookie, {
    name: 'Second organization',
  });
  const second = (await secondCreated.json()) as Organization;
  organizationIds.push(second.id);
  assert.equal(
    (await request(`organizations/${second.id}/conversations/${chat.id}`, owner.cookie)).status,
    404,
  );
  const form = new FormData();
  form.append('file', new Blob(['Customer guide']), 'guide.txt');
  const uploaded = await request(`${route}/documents`, owner.cookie, form);
  assert.equal(uploaded.status, 201);
  const metadata = (await uploaded.json()) as DocumentMetadata;
  assert.equal(metadata.name, 'guide.txt');
  assert.equal('content' in metadata, false);
  assert.equal((await request(`${route}/documents`, stranger.cookie)).status, 404);
  const document = await prisma.document.findUniqueOrThrow({ where: { id: metadata.id } });
  assert.equal(Buffer.from(document.content).toString(), 'Customer guide');
  const badFile = new FormData();
  badFile.append('file', new Blob(['test']), 'app.exe');
  assert.equal((await request(`${route}/documents`, owner.cookie, badFile)).status, 400);
  const oversized = new FormData();
  oversized.append('file', new Blob([new Uint8Array(5 * 1024 * 1024 + 1)]), 'large.pdf');
  assert.equal((await request(`${route}/documents`, owner.cookie, oversized)).status, 413);
  const concurrent = await Promise.all(
    Array.from({ length: 4 }, (_, i) =>
      request(`${chatRoute}/messages`, owner.cookie, { text: `Concurrent ${i}` }),
    ),
  );
  concurrent.forEach((response) => assert.equal(response.status, 201));
  const persisted = (await (await request(chatRoute, owner.cookie)).json()) as Conversation;
  assert.equal(persisted.messages.length, 10);
  for (let i = 0; i < persisted.messages.length; i += 2) {
    assert.equal(persisted.messages[i].role, 'user');
    assert.equal(persisted.messages[i + 1].role, 'assistant');
  }
  assert.equal((await request('auth/sign-out', owner.cookie, {})).status, 200);
  assert.equal((await request('organizations', owner.cookie)).status, 401);
});

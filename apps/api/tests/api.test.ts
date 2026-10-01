import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Organization, Conversation, DocumentMetadata } from '@relay/shared';
import { SMTPServer } from 'smtp-server';

const messages: { to: string; text: string }[] = [];
let rejectMail = false;
const smtp = new SMTPServer({
  disabledCommands: ['AUTH', 'STARTTLS'],
  onData(stream, session, callback) {
    let text = '';
    stream.on('data', (chunk: Buffer) => (text += chunk.toString()));
    stream.on('end', () => {
      if (rejectMail) return callback(new Error('Test delivery failure'));
      messages.push({ to: session.envelope.rcptTo[0].address, text });
      callback();
    });
    stream.on('error', callback);
  },
});
await new Promise<void>((resolve) => smtp.listen(0, '127.0.0.1', resolve));
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_PORT = String((smtp.server.address() as AddressInfo).port);
process.env.SMTP_SECURE = 'false';
process.env.SMTP_USER = '';
process.env.SMTP_PASSWORD = '';
process.env.EMAIL_FROM = 'Relay <verification@example.com>';
const { createApiServer } = await import('../src/http.js');
const { prisma } = await import('../src/db.js');
const { appOrigin, auth } = await import('../src/auth.js');
// Test auth behavior independently of per-IP request limits.
const authContext = await auth.$context;
authContext.rateLimit.enabled = false;

const server = createApiServer();
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const base =
  process.env.TEST_BASE_URL || `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
const emails: string[] = [],
  organizationIds: string[] = [];
after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
  await new Promise<void>((resolve) => smtp.close(resolve));
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
function verificationURL(email: string) {
  const message = [...messages].reverse().find((message) => message.to === email);
  assert.ok(message, 'A verification email must be delivered through SMTP');
  assert.match(message.text, /Subject: Verify your Relay email address/);
  // Undo MIME quoted-printable line wrapping before extracting the link.
  const decoded = message.text
    .replace(/=\r\n/g, '')
    .replace(/=([\da-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  const url = decoded.match(/https?:\/\/[^\s]+\/api\/auth\/verify-email\?[^\s]+/)?.[0];
  assert.ok(url, 'The delivered email must contain a verification link');
  return new URL(url);
}
async function signup(verify = true) {
  const email = `relay-test-${randomUUID()}@example.com`;
  emails.push(email);
  const response = await request('auth/sign-up/email', '', {
    email,
    password: 'Test-password-123!',
    name: 'Test member',
    callbackURL: '/?verified=1',
  });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).token, null);
  assert.equal(await prisma.session.count({ where: { user: { email } } }), 0);
  const url = verificationURL(email);
  assert.equal(url.origin, appOrigin);
  assert.equal(url.searchParams.get('callbackURL'), '/?verified=1');
  if (!verify) return { cookie: '', email };
  const verified = await fetch(`${base}/auth/verify-email${url.search}`, { redirect: 'manual' });
  assert.equal(verified.status, 302);
  assert.equal(verified.headers.get('location'), '/?verified=1');
  const login = await request('auth/sign-in/email', '', {
    email,
    password: 'Test-password-123!',
  });
  assert.equal(login.status, 200, await login.clone().text());
  const cookie = login.headers
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

test('verification blocks sign-in, supports resend, rejects invalid and expired links, and guards old sessions', async () => {
  const member = await signup(false);
  const login = await request('auth/sign-in/email', '', {
    email: member.email,
    password: 'Test-password-123!',
  });
  assert.equal(login.status, 403);
  assert.equal((await login.json()).code, 'EMAIL_NOT_VERIFIED');
  const before = messages.length;
  const resend = await request('auth/send-verification-email', '', {
    email: member.email,
    callbackURL: '/?verified=1',
  });
  assert.equal(resend.status, 200);
  assert.equal(messages.length, before + 1);
  const url = verificationURL(member.email);
  const invalid = await request('auth/verify-email?token=invalid');
  assert.equal(invalid.status, 401);
  const { createEmailVerificationToken } = await import('better-auth/api');
  const expired = await createEmailVerificationToken(
    process.env.BETTER_AUTH_SECRET!,
    member.email,
    undefined,
    -1,
  );
  assert.equal((await request(`auth/verify-email?token=${expired}`)).status, 401);
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { email: member.email } })).emailVerified,
    false,
  );
  // Simulate a session issued before email verification became mandatory.
  const context = await auth.$context;
  const user = await prisma.user.findUniqueOrThrow({ where: { email: member.email } });
  const oldSession = await context.internalAdapter.createSession(user.id);
  assert.ok(oldSession);
  const { makeSignature } = await import('better-auth/crypto');
  const signature = await makeSignature(oldSession.token, process.env.BETTER_AUTH_SECRET!);
  const oldCookie = `${context.authCookies.sessionToken.name}=${encodeURIComponent(`${oldSession.token}.${signature}`)}`;
  assert.equal((await request('organizations', oldCookie)).status, 403);
  const verified = await fetch(`${base}/auth/verify-email${url.search}`, { redirect: 'manual' });
  assert.equal(verified.status, 302);
  assert.equal((await request('organizations', oldCookie)).status, 200);
  assert.equal(
    (await request('auth/sign-in/social', '', { provider: 'google', callbackURL: '/' })).status,
    404,
  );
});

test('SMTP failures are reported and a verification email can be retried', async () => {
  const email = `relay-test-${randomUUID()}@example.com`;
  emails.push(email);
  rejectMail = true;
  try {
    const response = await request('auth/sign-up/email', '', {
      email,
      password: 'Test-password-123!',
      name: 'Test member',
    });
    assert.equal(response.status, 200);
    assert.equal(
      messages.some((message) => message.to === email),
      false,
    );
    assert.equal(await prisma.session.count({ where: { user: { email } } }), 0);
    const resend = await request('auth/send-verification-email', '', { email, callbackURL: '/' });
    assert.equal(resend.status, 500);
  } finally {
    rejectMail = false;
  }
  // A failed delivery may leave an unverified account; resend recovers it.
  const response = await request('auth/send-verification-email', '', {
    email,
    callbackURL: '/?verified=1',
  });
  assert.equal(response.status, 200);
  verificationURL(email);
});

test('verification resend requests are rate limited', async () => {
  authContext.rateLimit.enabled = true;
  try {
    for (let i = 0; i < 3; i++) {
      assert.equal(
        (
          await request('auth/send-verification-email', '', {
            email: 'unknown@example.com',
            callbackURL: '/',
          })
        ).status,
        200,
      );
    }
    assert.equal(
      (
        await request('auth/send-verification-email', '', {
          email: 'unknown@example.com',
          callbackURL: '/',
        })
      ).status,
      429,
    );
  } finally {
    authContext.rateLimit.enabled = false;
  }
});

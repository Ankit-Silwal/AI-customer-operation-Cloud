import { test, expect, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';

config({ path: 'apps/api/.env', quiet: true });
const { prisma } = await import('../apps/api/src/db.js');
test.afterAll(async () => prisma.$disconnect());

type Mail = { ID: string; To: { Address: string }[] };
async function inbox(request: APIRequestContext, email: string): Promise<Mail[]> {
  const response = await request.get('http://localhost:8025/api/v1/messages');
  expect(response.ok()).toBeTruthy();
  const result = (await response.json()) as { messages: Mail[] };
  return result.messages.filter((mail) => mail.To.some((to) => to.Address === email));
}

test('signup, resend, verify through SMTP email, sign in and sign out', async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile',
    'Run delivery once; mobile covers form usability separately.',
  );
  const email = `relay-browser-${randomUUID()}@example.com`;
  try {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /google/i })).toHaveCount(0);
    await page.getByRole('button', { name: 'Create an account', exact: true }).click();
    await page.getByLabel('Your name').fill('Browser test member');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('Browser-password-123!');
    await page.getByRole('button', { name: 'Create account ↗', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Check your inbox.' })).toBeVisible();
    await expect.poll(async () => (await inbox(request, email)).length).toBe(1);
    expect((await page.request.get('/api/organizations')).status()).toBe(401);

    await page.getByRole('button', { name: /I’ve verified my email/ }).click();
    await page.getByLabel('Password', { exact: true }).fill('Browser-password-123!');
    await page.getByRole('button', { name: 'Sign in ↗', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Check your inbox.' })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Verify your email before signing in');
    await expect.poll(async () => (await inbox(request, email)).length).toBe(2);

    await page.getByRole('button', { name: 'Resend verification email', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('a new link has been sent');
    await expect.poll(async () => (await inbox(request, email)).length).toBe(3);
    const mail = (await inbox(request, email))[0];
    const details = await (
      await request.get(`http://localhost:8025/api/v1/message/${mail.ID}`)
    ).json();
    const link = String(details.Text).match(
      /https?:\/\/[^\s]+\/api\/auth\/verify-email\?[^\s]+/,
    )?.[0];
    expect(link).toBeTruthy();
    await page.goto(link!);
    await expect(page.getByRole('status')).toContainText('Your email is verified');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('Browser-password-123!');
    await page.getByRole('button', { name: 'Sign in ↗', exact: true }).click();
    await expect
      .poll(async () => (await page.request.get('/api/organizations')).status())
      .toBe(200);
    await expect(page.getByRole('heading', { name: 'Welcome back.' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  } finally {
    await prisma.user.deleteMany({ where: { email } });
    for (const mail of await inbox(request, email))
      await request.delete(`http://localhost:8025/api/v1/message/${mail.ID}`);
  }
});

test('verification errors and resend forms are usable on desktop and mobile', async ({
  page,
}, testInfo) => {
  await page.goto('/?verified=1&error=TOKEN_EXPIRED');
  await expect(page.getByRole('alert').filter({ hasText: 'This verification link' })).toContainText(
    'invalid or has expired',
  );
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.getByRole('button', { name: 'Need a verification email?', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox.' })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Resend verification email', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('verification-form.png'), fullPage: true });
});

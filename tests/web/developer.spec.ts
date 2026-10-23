import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
const docs = process.env.DOCS_TEST_URL ?? "http://localhost:3040";

test("public docs offer real multi-turn knowledge chat and single-use OTP without a key", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`${docs}/api/demo/status`)).json())
          .ready,
      { timeout: 90000, intervals: [1000, 2000] },
    )
    .toBe(true);
  await page.goto(docs);
  await expect(
    page.getByRole("heading", { name: /Good support/ }),
  ).toBeVisible();
  const desktop = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    desktop.violations.flatMap((v) =>
      v.nodes.map((n) => ({
        id: v.id,
        target: n.target,
        issue: n.failureSummary,
      })),
    ),
  ).toEqual([]);
  await page.screenshot({
    path: ".local-validation/screenshots/developer-desktop.png",
    fullPage: true,
  });
  for (const question of [
    "What is your return policy?",
    "Who pays return postage?",
    "How much is standard shipping?",
  ]) {
    await page.getByLabel("Ask a sandbox question").fill(question);
    await page.getByRole("button", { name: "Send sandbox question" }).click();
    await expect(page.locator(".message.assistant")).toHaveCount(
      [
        "What is your return policy?",
        "Who pays return postage?",
        "How much is standard shipping?",
      ].indexOf(question) + 1,
      { timeout: 60000 },
    );
  }
  await expect(page.locator(".message.assistant").first()).toContainText(
    "30 days",
  );
  const cookie = (await context.cookies()).find(
    (c) => c.name === "hearth_docs_demo",
  );
  expect(cookie?.httpOnly).toBe(true);
  await page.getByRole("tab", { name: "Email OTP" }).click();
  await page
    .getByRole("button", { name: "Generate demo code", exact: true })
    .click();
  const code = await page.locator(".demo-code strong").innerText();
  expect(code).toMatch(/^\d{6}$/);
  await page.getByLabel("Verification code").fill(code);
  await page.getByRole("button", { name: "Verify code", exact: true }).click();
  await expect(
    page.getByText("Email verified.", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: ".local-validation/screenshots/developer-otp.png",
    fullPage: false,
  });
  await page
    .getByRole("button", { name: "API reference", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: /Download OpenAPI/ }),
  ).toBeVisible();
  expect((await page.request.get(`${docs}/openapi.json`)).status()).toBe(200);
  const blocked = await page.request.post(`${docs}/api/demo/otp`, {
    headers: { Origin: "https://untrusted.example" },
    data: { email: "blocked@example.test" },
  });
  expect(blocked.status()).toBe(403);
  expect(errors).toEqual([]);
});

test("developer docs fit mobile and meet automated accessibility checks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(docs);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("button", { name: "Email verification", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Email verification.", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.flatMap((v) =>
      v.nodes.map((n) => ({
        id: v.id,
        target: n.target,
        issue: n.failureSummary,
      })),
    ),
  ).toEqual([]);
  await page.screenshot({
    path: ".local-validation/screenshots/developer-mobile.png",
    fullPage: true,
  });
});

test("forgot-password form reports unavailable SMTP without exposing account status", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.getByLabel("Email address").fill("unknown-browser@example.test");
  await page.getByRole("button", { name: "Send reset code" }).click();
  await expect(page.getByRole("alert")).toContainText(/not configured/);
  await page.getByRole("button", { name: "Back to sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
});

test("workspace owners create free keys, use them externally, and revoke them in Settings", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByLabel("Your name").fill("API owner");
  await page
    .getByLabel("Email address")
    .fill(`key-ui-${randomUUID().slice(0, 8)}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("LocalValidationPassword42!");
  await page
    .getByRole("button", { name: "Create your workspace", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create your first workspace", exact: true })
    .click();
  await page.getByLabel("Workspace name").fill("Free API workspace");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await page.getByRole("link", { name: "Workspace", exact: true }).click();
  await page.getByLabel("Key name").fill("External integration");
  await page
    .getByRole("button", { name: "Create free API key", exact: true })
    .click();
  await expect(
    page.getByText("Copy your API key now.", { exact: true }),
  ).toBeVisible();
  const key = await page.locator(".new-api-key code").innerText();
  expect(key).toMatch(/^hrt_live_[A-Za-z0-9_-]{43}$/);
  expect(
    (
      await page.request.get("http://localhost:3001/v1/documents", {
        headers: { Authorization: `Bearer ${key}` },
      })
    ).status(),
  ).toBe(200);
  await page
    .getByRole("button", { name: "I have saved it", exact: true })
    .click();
  await expect(page.locator(".new-api-key")).toHaveCount(0);
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm revoke", exact: true })
    .click();
  await expect(page.locator(".api-key-list")).toContainText("Revoked");
  expect(
    (
      await page.request.get("http://localhost:3001/v1/documents", {
        headers: { Authorization: `Bearer ${key}` },
      })
    ).status(),
  ).toBe(401);
  await page.reload();
  expect(await page.locator("body").innerText()).not.toContain(key);
  await page
    .getByRole("button", { name: "Email me a verification code", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(/not configured/);
});

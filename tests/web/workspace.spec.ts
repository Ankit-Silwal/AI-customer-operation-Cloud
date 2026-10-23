import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("workspace onboarding, real indexing/search, replies, upload/download and workspace isolation", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const suffix = randomUUID().slice(0, 8);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByLabel("Your name").fill("Alex Morgan");
  await page.getByLabel("Email address").fill(`web-${suffix}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("TestableHearthPassword42!");
  await page
    .getByRole("button", { name: "Create your workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /Make room for/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create your first workspace", exact: true })
    .click();
  await page.getByLabel("Workspace name").fill(`Quiet Goods ${suffix}`);
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /A good day to connect, Alex/ }),
  ).toBeVisible();
  const cookie = (await context.cookies()).find(
    (item) => item.name === "hearth_session",
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Strict");
  expect(await page.evaluate(() => Object.keys(localStorage))).not.toContain(
    "token",
  );

  await page
    .getByRole("link", { name: "Knowledge library", exact: true })
    .click();
  await page.getByRole("button", { name: "Add a source", exact: true }).click();
  await page.getByLabel("Source title").fill("Returns & customer care");
  await page
    .getByLabel("What should your assistant know?")
    .fill(
      "Quiet Goods accepts unused products in original packaging within 30 days of delivery. Email care@quietgoods.example before returning an item. Refunds take 5 business days after inspection. We cover postage for damaged items reported within 48 hours.",
    );
  await page.getByRole("button", { name: "Save source", exact: true }).click();
  await page
    .getByRole("button", { name: "Index this source", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Ready for questions", exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await page.getByRole("button", { name: "Back to the library" }).click();
  await page.getByRole("link", { name: "AI playground", exact: true }).click();
  await page
    .getByLabel("Ask your company knowledge")
    .fill("Can I return an unused product?");
  await page.getByRole("button", { name: "Ask question", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Found in your knowledge/ }),
  ).toBeVisible({ timeout: 60000 });
  await expect(
    page.getByText("Returns & customer care", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".source-result")).toContainText("30 days");

  await page.getByRole("link", { name: "Conversations", exact: true }).click();
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await page.getByLabel("Customer email").fill("customer@example.test");
  await page.getByLabel("Subject", { exact: true }).fill("Help with my return");
  await page
    .getByLabel(/First customer message/)
    .fill('Can I return this? <img src=x onerror="alert(1)">');
  await page
    .getByRole("button", { name: "Create conversation", exact: true })
    .click();
  await expect(page.locator(".conversation-title")).toContainText(
    "Help with my return",
  );
  await page
    .getByLabel("Reply to the customer")
    .fill("Of course. Please email our care team within 30 days.");
  await page.getByRole("button", { name: "Save reply", exact: true }).click();
  await expect(page.locator(".thread")).toContainText(
    "Please email our care team within 30 days.",
  );
  expect(await page.locator(".thread img").count()).toBe(0);
  await page.reload();
  await expect(page.locator(".thread")).toContainText(
    "Please email our care team within 30 days.",
  );
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page.locator(".overview-stats")).toContainText("Conversations");
  await page.screenshot({
    path: ".local-validation/screenshots/hearth-overview.png",
    fullPage: true,
  });
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    accessibility.violations.flatMap((v) =>
      v.nodes.map((n) => ({
        id: v.id,
        target: n.target,
        issue: n.failureSummary,
      })),
    ),
  ).toEqual([]);

  await page
    .getByRole("link", { name: "Knowledge library", exact: true })
    .click();
  await page.getByRole("button", { name: "Add a source", exact: true }).click();
  await page
    .getByRole("button", { name: "Upload a file", exact: true })
    .click();
  await page.getByLabel("Source title").fill("Care guide");
  await page
    .locator('input[type="file"]')
    .setInputFiles({
      name: "care-guide.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("Hand wash ceramics. Air dry linen."),
    });
  await page.getByRole("button", { name: "Save source", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Care guide", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to the library" }).click();
  await page.getByRole("button", { name: "Care guide care-guide.md" }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download original" }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe("care-guide.md");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString()).toBe(
    "Hand wash ceramics. Air dry linen.",
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.screenshot({
    path: ".local-validation/screenshots/hearth-knowledge.png",
    fullPage: true,
  });

  await page
    .getByRole("button", { name: "New workspace", exact: true })
    .click();
  await page.getByLabel("Workspace name").fill(`Empty Studio ${suffix}`);
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Select workspace" }),
  ).toHaveValue(/.+/);
  await expect(
    page
      .getByRole("combobox", { name: "Select workspace" })
      .locator("option:checked"),
  ).toHaveText(`Empty Studio ${suffix}`);
  await expect(
    page.getByRole("heading", { name: "Every good answer has a beginning." }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Select workspace" })
    .selectOption({ label: `Quiet Goods ${suffix}` });
  await expect(
    page.getByRole("button", {
      name: /Returns & customer care Written knowledge/,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back.", exact: true }),
  ).toBeVisible();
  expect(
    (await context.cookies()).some((item) => item.name === "hearth_session"),
  ).toBe(false);
  expect(errors).toEqual([]);
});

test("web write endpoints require the configured Origin and never disclose bearer tokens", async ({
  request,
  baseURL,
}) => {
  const unauthorized = await request.get("/api/session");
  expect(unauthorized.status()).toBe(401);
  const blocked = await request.post("/api/auth/register", {
    headers: { Origin: "https://untrusted.example" },
    data: {
      name: "Untrusted",
      email: "blocked@example.test",
      password: "TestablePassword42!",
    },
  });
  expect(blocked.status()).toBe(403);
  const account = await request.post("/api/auth/register", {
    headers: { Origin: baseURL! },
    data: {
      name: "Security check",
      email: `secure-${randomUUID()}@example.test`,
      password: "TestablePassword42!",
    },
  });
  expect(account.status()).toBe(201);
  const result = await account.json();
  expect(result.token).toBeUndefined();
  expect(result.user.passwordHash).toBeUndefined();
  expect(account.headers()["set-cookie"]).toContain("HttpOnly");
  expect(account.headers()["cache-control"]).toBe("no-store");
  const refused = await request.post("/api/organizations", {
    headers: { Origin: "https://untrusted.example" },
    data: { name: "Must not create" },
  });
  expect(refused.status()).toBe(403);
  const arbitrary = await request.get("/api/http://127.0.0.1:6379");
  expect(arbitrary.status()).toBe(404);
});

test("mobile account screen is usable without horizontal scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome back.", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    accessibility.violations.flatMap((v) =>
      v.nodes.map((n) => ({
        id: v.id,
        target: n.target,
        issue: n.failureSummary,
      })),
    ),
  ).toEqual([]);
  await page.screenshot({
    path: ".local-validation/screenshots/hearth-mobile.png",
    fullPage: true,
  });
});

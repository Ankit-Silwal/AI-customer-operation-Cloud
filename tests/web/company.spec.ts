import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const company = process.env.DEMO_TEST_URL ?? "http://localhost:3035";

test("demo collection, saved pieces, product questions and persistent real policy chat", async ({
  page,
  context,
  request,
}) => {
  await expect
    .poll(
      async () =>
        (await (await request.get(`${company}/api/status`)).json()).ready,
      { timeout: 90000, intervals: [1000, 2000] },
    )
    .toBe(true);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(company);
  await expect(page.getByRole("heading", { name: /For a home/ })).toBeVisible();
  await page
    .getByRole("button", { name: "Save The Solstice Vase", exact: true })
    .click();
  await page
    .getByRole("button", { name: "View saved pieces", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your little favourites." }),
  ).toBeVisible();
  await expect(page.locator(".product")).toHaveCount(1);
  await page
    .getByRole("button", { name: "View The Solstice Vase", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "The Solstice Vase", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ask about this piece", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "A little help from Oak & Ember" }),
  ).toBeVisible();
  await page
    .getByLabel("Your question for Oak and Ember")
    .fill("What is your returns policy?");
  await page
    .getByRole("button", { name: "Send your question", exact: true })
    .click();
  await expect(page.locator(".chat-message.assistant").last()).toContainText(
    /30 days|30-day/,
    { timeout: 60000 },
  );
  const cookie = (await context.cookies()).find(
    (item) => item.name === "oak_visitor",
  );
  expect(cookie?.httpOnly).toBe(true);
  await page.screenshot({
    path: ".local-validation/screenshots/oak-support.png",
    fullPage: false,
  });
  const chatAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    chatAccessibility.violations.flatMap((v) =>
      v.nodes.map((n) => ({
        id: v.id,
        target: n.target,
        issue: n.failureSummary,
      })),
    ),
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Close support assistant", exact: true })
    .click();
  await page.reload();
  await page
    .getByRole("button", {
      name: "Open Oak and Ember support assistant",
      exact: true,
    })
    .click();
  await expect(page.locator(".chat-message.user")).toContainText(
    "What is your returns policy?",
  );
  const publicHistory = await (
    await page.request.get(`${company}/api/support`)
  ).json();
  expect(JSON.stringify(publicHistory)).not.toContain("token");
  expect(JSON.stringify(publicHistory)).not.toContain("password");
  const fresh = await context.browser()!.newContext();
  const other = await fresh.request.get(`${company}/api/support`);
  expect((await other.json()).messages).toEqual([]);
  await fresh.close();
  const forbidden = await page.request.post(`${company}/api/support`, {
    headers: { Origin: "https://untrusted.example" },
    data: { question: "Private policy" },
  });
  expect(forbidden.status()).toBe(403);
  expect(errors).toEqual([]);
});

test("demo storefront and support dialog fit mobile screens and meet automated accessibility checks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(company);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page.getByRole("heading", { name: /For a home/ })).toBeVisible();
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
    path: ".local-validation/screenshots/oak-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", {
      name: "Open Oak and Ember support assistant",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const box = await page.getByRole("dialog").boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

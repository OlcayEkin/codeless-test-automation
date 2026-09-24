import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test, type Page } from "@playwright/test";
import type { TestCaseInput } from "../src/lib/test-cases/format";
import { toCsv } from "../src/lib/test-cases/templates";
import { MEMBER, signIn } from "./helpers";

// Each run includes a blocked test that waits the full 15-second step limit.
test.describe.configure({ timeout: 120_000 });

let server: Server;
let site: string;
test.beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/hello") return res.writeHead(200, { "Content-Type": "text/html" }).end("<title>Hello</title><h1>Hello, tester</h1>");
    res.writeHead(404).end("Not found");
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  site = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
test.afterAll(() => server.close());

/** Creates a plan with one passing, one failing and one blocked test, runs it and waits for the result. */
async function finishedRun(page: Page, name: string) {
  const testCases: TestCaseInput[] = [
    { id: "TC-OK", name: "Greeting", steps: [{ action: "open", target: `${site}/hello` }, { action: "expect_text", target: "h1", value: "Hello" }] },
    { id: "TC-FAIL", name: "Wrong greeting", steps: [{ action: "open", target: `${site}/hello` }, { action: "expect_text", target: "h1", value: "Goodbye" }] },
    { id: "TC-BLOCK", name: "Missing button", steps: [{ action: "open", target: `${site}/hello` }, { action: "click", target: "#no-such-button" }] },
  ];
  await signIn(page, MEMBER.login, MEMBER.password);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/plans/new");
  await page.getByLabel("Plan name").fill(name);
  await page.getByLabel("Test case file").setInputFiles({ name: "p.csv", mimeType: "text/csv", buffer: Buffer.from(toCsv(testCases)) });
  await page.getByRole("button", { name: "Create test plan" }).click();
  await page.getByRole("link", { name: "▶ Run tests" }).click();
  await page.getByRole("button", { name: "▶ Run tests" }).click();
  await expect(page.getByRole("status").first()).toHaveText("Finished", { timeout: 90_000 });
}

test("shows the Pass/Fail/Blocked chart and the failures with their evidence", async ({ page }) => {
  await finishedRun(page, "Chart plan");

  await expect(page.locator(".hero-number")).toHaveText("33% passed");
  await expect(page.locator(".legend")).toHaveText("✓ 1 passed✗ 1 failed■ 1 blockedof 3");
  await expect(page.getByRole("img", { name: "1 passed, 1 failed, 1 blocked" })).toBeVisible();

  const review = page.getByRole("region", { name: "Failures to review" });
  await expect(review.getByRole("article")).toHaveCount(2);
  await expect(review.getByText("2 of 2 still to tag as a bug or a test blockage.")).toBeVisible();

  const failed = review.getByRole("article", { name: "TC-FAIL Wrong greeting" });
  await expect(failed).toContainText('Step 2: Expected h1 to contain "Goodbye", but it showed "Hello, tester".');
  for (const [link, type] of [["Screenshot", "image/png"], ["Video", "video/webm"], ["Trace", "application/zip"]]) {
    const response = await page.request.get((await failed.getByRole("link", { name: link }).getAttribute("href"))!);
    expect(response.status(), link).toBe(200);
    expect(response.headers()["content-type"], link).toBe(type);
  }
});

test("failures can be tagged as bugs or test blockages", async ({ page }) => {
  await finishedRun(page, "Tagging plan");
  const review = page.getByRole("region", { name: "Failures to review" });

  const failed = review.getByRole("article", { name: "TC-FAIL Wrong greeting" });
  await failed.getByRole("button", { name: "Bug" }).click();
  await expect(failed.getByRole("button", { name: "✓ Bug" })).toHaveAttribute("aria-pressed", "true");
  await expect(failed.getByText(/^Tagged by E2E Member on/)).toBeVisible();

  const blocked = review.getByRole("article", { name: "TC-BLOCK Missing button" });
  await blocked.getByRole("button", { name: "Test blockage" }).click();
  await expect(review.getByRole("status")).toHaveText("Test reporting complete: 1 bug and 1 test blockage.");

  // Clicking a selected tag clears it.
  await blocked.getByRole("button", { name: "✓ Test blockage" }).click();
  await expect(review.getByText("1 of 2 still to tag as a bug or a test blockage.")).toBeVisible();
});

test("a follow-up plan holds only the chosen failed tests", async ({ page }) => {
  await finishedRun(page, "Source plan");
  const runUrl = page.url();

  await page.getByLabel("New plan name").fill("Retest failures");
  await page.getByRole("checkbox", { name: /TC-BLOCK/ }).uncheck();
  await page.getByRole("button", { name: "Create follow-up plan" }).click();

  await expect(page.getByRole("heading", { name: "Retest failures" })).toBeVisible();
  await expect(page.getByText(/Version 1 · 1 test cases · 1 failed test from an earlier run · created by E2E Member/)).toBeVisible();
  await expect(page.locator("details.case .case-id")).toHaveText(["TC-FAIL"]);

  await page.goto(runUrl);
  await expect(page.getByText("Already created:")).toContainText("Retest failures");

  await page.goto("/dashboard");
  const lastRun = page.getByRole("row", { name: /Source plan/ }).getByRole("link", { name: "1 passed, 1 failed, 1 blocked" });
  await expect(lastRun).toBeVisible();
  await expect(lastRun).toHaveAttribute("title", "1 passed, 1 failed, 1 blocked");
  await expect(lastRun.locator(".last-run-parts")).toHaveText("✅ 1❌ 1🚧 1");
  await expect(page.getByRole("row", { name: /Retest failures/ })).toContainText("Never run");
});

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test, type Page } from "@playwright/test";
import type { TestCaseInput } from "../src/lib/test-cases/format";
import { toCsv } from "../src/lib/test-cases/templates";
import { MEMBER, OUTSIDER, signIn } from "./helpers";

// A tiny site the worker can test, so these tests do not depend on the internet.
let server: Server;
let site: string;
test.beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/hello") return res.writeHead(200, { "Content-Type": "text/html" }).end("<title>Hello</title><h1>Hello, tester</h1>");
    if (req.url === "/api/health") return res.writeHead(200).end("ok");
    res.writeHead(404).end("Not found");
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  site = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
test.afterAll(() => server.close());

async function createPlan(page: Page, name: string, testCases: TestCaseInput[]) {
  await signIn(page, MEMBER.login, MEMBER.password);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/plans/new");
  await page.getByLabel("Plan name").fill(name);
  await page.getByLabel("Test case file").setInputFiles({ name: "p.csv", mimeType: "text/csv", buffer: Buffer.from(toCsv(testCases)) });
  await page.getByRole("button", { name: "Create test plan" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

test("run a plan and follow it to the results", async ({ page }) => {
  await createPlan(page, "Runnable plan", [
    { id: "TC-1", name: "Greeting is shown", steps: [{ action: "open", target: `${site}/hello` }, { action: "expect_text", target: "h1", value: "Hello, tester" }] },
    { id: "TC-2", name: "Wrong greeting", steps: [{ action: "open", target: `${site}/hello` }, { action: "expect_text", target: "h1", value: "Goodbye" }] },
    { id: "TC-3", name: "Health endpoint", steps: [{ action: "api_request", target: `${site}/api/health` }, { action: "expect_status", value: "200" }] },
  ]);

  await page.getByRole("link", { name: "▶ Run tests" }).click();
  await expect(page.getByLabel("Web · 2 test cases")).toBeChecked();
  await expect(page.getByLabel("API · 1 test case")).toBeChecked();
  await expect(page.getByLabel("Google Chrome")).toBeChecked();
  await expect(page.getByLabel(/Firefox/)).toBeDisabled();
  await expect(page.getByLabel("Show the browser while testing")).not.toBeChecked();
  await page.getByRole("button", { name: "▶ Run tests" }).click();

  await expect(page).toHaveURL(/\/runs\/\w+$/);
  await expect(page.getByRole("status").first()).toHaveText("Finished", { timeout: 60_000 });
  await expect(page.locator(".legend")).toHaveText("✓ 2 passed✗ 1 failed■ 0 blockedof 3");
  await expect(page.locator(".hero-number")).toHaveText("67% passed");

  const results = page.getByRole("table", { name: "Test results" });
  await expect(results.getByRole("row")).toHaveCount(4);
  const failedRow = results.getByRole("row", { name: /TC-2/ });
  await expect(failedRow).toContainText('Step 2: Expected h1 to contain "Goodbye", but it showed "Hello, tester".');

  const failure = page.getByRole("article", { name: "TC-2 Wrong greeting" });
  const screenshot = await page.request.get((await failure.getByRole("link", { name: "Screenshot" }).getAttribute("href"))!);
  expect(screenshot.status()).toBe(200);
  expect(screenshot.headers()["content-type"]).toBe("image/png");

  await page.getByRole("link", { name: "← Runnable plan" }).click();
  await expect(page.getByRole("heading", { name: "Recent runs" })).toBeVisible();
  await expect(page.getByText("version 1 · 2 passed, 1 failed, 0 blocked")).toBeVisible();
});

test("only API tests run when Web is unticked", async ({ page }) => {
  await createPlan(page, "Mixed plan", [
    { id: "TC-W", name: "Web test", steps: [{ action: "open", target: `${site}/hello` }, { action: "expect_title", value: "Hello" }] },
    { id: "TC-A", name: "API test", steps: [{ action: "api_request", target: `${site}/api/health` }, { action: "expect_status", value: "200" }] },
  ]);
  await page.getByRole("link", { name: "▶ Run tests" }).click();
  await page.getByLabel("Web · 1 test case").uncheck();
  await page.getByRole("button", { name: "▶ Run tests" }).click();
  await expect(page.getByRole("status").first()).toHaveText("Finished", { timeout: 60_000 });
  await expect(page.getByRole("table", { name: "Test results" }).getByRole("row")).toHaveCount(2);
  await expect(page.getByText("TC-A")).toBeVisible();
});

test("a run can be cancelled", async ({ page }) => {
  // Each test waits for an element that never appears, so the run is still going when we cancel.
  const slow = (id: string): TestCaseInput => ({ id, name: `Slow ${id}`, steps: [{ action: "open", target: `${site}/hello` }, { action: "wait_for", target: "#never" }] });
  await createPlan(page, "Slow plan", [slow("TC-1"), slow("TC-2"), slow("TC-3")]);
  await page.getByRole("link", { name: "▶ Run tests" }).click();
  await page.getByRole("button", { name: "▶ Run tests" }).click();

  await expect(page.getByRole("status")).toContainText("Running", { timeout: 30_000 });
  await page.getByRole("button", { name: "Cancel run" }).click();
  await expect(page.getByRole("status")).toHaveText("Cancelled", { timeout: 30_000 });
  // Cancelling stops before the next test case, so at most the one in progress finishes (header row + 1).
  expect(await page.getByRole("table", { name: "Test results" }).getByRole("row").count()).toBeLessThanOrEqual(2);
});

test("another team cannot see a run", async ({ page, browser }) => {
  await createPlan(page, "Team-only run", [{ id: "TC-1", name: "Health", steps: [{ action: "api_request", target: `${site}/api/health` }, { action: "expect_status", value: "200" }] }]);
  await page.getByRole("link", { name: "▶ Run tests" }).click();
  await page.getByRole("button", { name: "▶ Run tests" }).click();
  await expect(page.getByRole("status")).toHaveText("Finished", { timeout: 60_000 });

  const outsider = await browser.newPage();
  await signIn(outsider, OUTSIDER.login, OUTSIDER.password);
  await expect(outsider).toHaveURL(/\/dashboard$/);
  expect((await outsider.goto(page.url()))?.status()).toBe(404);
  await outsider.close();
});

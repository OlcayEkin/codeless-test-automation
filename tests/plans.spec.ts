import { expect, test, type Page } from "@playwright/test";
import { SAMPLE_TEST_CASES, toCsv, toJson, toXlsx } from "../src/lib/test-cases/templates";
import { MEMBER, OUTSIDER, formError, signIn } from "./helpers";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function createPlan(page: Page, name: string, file: { name: string; mimeType: string; buffer: Buffer }) {
  await page.goto("/plans/new");
  await page.getByLabel("Plan name").fill(name);
  await page.getByLabel("Test case file").setInputFiles(file);
  await page.getByRole("button", { name: "Create test plan" }).click();
}

test.beforeEach(async ({ page }) => {
  await signIn(page, MEMBER.login, MEMBER.password);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("create a plan from an Excel file and see its test cases", async ({ page }) => {
  await page.getByRole("link", { name: "Create test plan" }).click();
  await createPlan(page, "Login regression", { name: "login.xlsx", mimeType: XLSX_TYPE, buffer: await toXlsx(SAMPLE_TEST_CASES) });

  await expect(page).toHaveURL(/\/plans\/\w+$/);
  await expect(page.getByRole("heading", { name: "Login regression" })).toBeVisible();
  await expect(page.getByText(/Version 1 · 3 test cases · Excel file “login.xlsx”/)).toBeVisible();
  await expect(page.getByText("Quality scoring is turned off in this environment.")).toBeVisible();

  const firstCase = page.locator("details.case").first();
  await firstCase.locator("summary").click();
  await expect(firstCase.getByRole("cell", { name: "expect_text" })).toBeVisible();
  await expect(firstCase.getByRole("cell", { name: "You logged into a secure area!" })).toBeVisible();

  await page.getByRole("link", { name: "← Test plans" }).click();
  const row = page.getByRole("row", { name: /Login regression/ });
  await expect(row.getByRole("cell").nth(1)).toHaveText("3");
});

test("a file with problems shows each one and saves nothing", async ({ page }) => {
  const broken = "test_case_id,test_case_name,step,action,target,value,expected_result\nTC-1,Broken,1,teleport,#x,,\nTC-1,Broken,2,click,,,\n";
  await createPlan(page, "Should not exist", { name: "broken.csv", mimeType: "text/csv", buffer: Buffer.from(broken) });

  await expect(formError(page).getByText("The file has 2 problems. Fix them and upload again.")).toBeVisible();
  const issues = page.getByRole("list", { name: "Problems in the file" });
  await expect(issues.getByRole("listitem")).toHaveText([/^Row 2: Unknown action "teleport"/, 'Row 3: Action "click" needs a target.']);
  await expect(page.getByLabel("Plan name")).toHaveValue("Should not exist");

  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Should not exist" })).toHaveCount(0);
});

test("a file with the wrong type is rejected", async ({ page }) => {
  await createPlan(page, "Wrong type", { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(formError(page).getByRole("listitem")).toHaveText("File: Only Excel (.xlsx), CSV (.csv) and JSON (.json) files are accepted.");
});

test("uploading a new version keeps the old one", async ({ page }) => {
  await createPlan(page, "Versioned plan", { name: "v1.csv", mimeType: "text/csv", buffer: Buffer.from(toCsv(SAMPLE_TEST_CASES)) });
  await expect(page.getByText(/Version 1 · 3 test cases/)).toBeVisible();
  const planUrl = page.url();

  const smaller = SAMPLE_TEST_CASES.slice(0, 1);
  await page.getByLabel("Test case file").setInputFiles({ name: "v2.json", mimeType: "application/json", buffer: Buffer.from(toJson(smaller)) });
  await page.getByRole("button", { name: "Upload new version" }).click();

  await expect(page).toHaveURL(/\?version=2$/);
  await expect(page.getByText(/Version 2 · 1 test cases · JSON file “v2.json”/)).toBeVisible();

  await page.getByRole("link", { name: "Version 1", exact: true }).click();
  await expect(page.getByText(/Version 1 · 3 test cases/)).toBeVisible();
  await expect(page.getByText("You are viewing an older version.")).toBeVisible();

  await page.goto(planUrl);
  await expect(page.getByText(/Version 2 · 1 test cases/)).toBeVisible();
});

test("templates download in all three formats", async ({ page }) => {
  await page.goto("/plans/new");
  for (const [link, file] of [["Excel", "test-cases.xlsx"], ["CSV", "test-cases.csv"], ["JSON", "test-cases.json"]]) {
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: link, exact: true }).click();
    expect((await download).suggestedFilename()).toBe(file);
  }
});

test("another team cannot open the plan", async ({ page, browser }) => {
  await createPlan(page, "Private plan", { name: "p.csv", mimeType: "text/csv", buffer: Buffer.from(toCsv(SAMPLE_TEST_CASES)) });
  await expect(page.getByRole("heading", { name: "Private plan" })).toBeVisible();
  const planUrl = page.url();

  const outsider = await browser.newPage();
  await signIn(outsider, OUTSIDER.login, OUTSIDER.password);
  await expect(outsider).toHaveURL(/\/dashboard$/);
  await expect(outsider.getByRole("link", { name: "Private plan" })).toHaveCount(0);

  const response = await outsider.goto(planUrl);
  expect(response?.status()).toBe(404);
  await outsider.close();
});

test("templates need a signed-in user", async ({ playwright, baseURL }) => {
  const anonymous = await playwright.request.newContext({ baseURL });
  expect((await anonymous.get("/templates/test-cases.csv")).status()).toBe(401);
  await anonymous.dispose();
});

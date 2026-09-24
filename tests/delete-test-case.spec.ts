import { expect, test, type Page } from "@playwright/test";
import { SAMPLE_TEST_CASES, toCsv } from "../src/lib/test-cases/templates";
import { TEAMMATE, MEMBER, signIn } from "./helpers";

async function createPlan(page: Page, name: string, testCases = SAMPLE_TEST_CASES) {
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/plans/new");
  await page.getByLabel("Plan name").fill(name);
  await page.getByLabel("Test case file").setInputFiles({ name: "p.csv", mimeType: "text/csv", buffer: Buffer.from(toCsv(testCases)) });
  await page.getByRole("button", { name: "Create test plan" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

const caseIds = (page: Page) => page.locator("details.case .case-id");

test("deleting a test case creates a new version without it", async ({ page, browser }) => {
  await signIn(page, MEMBER.login, MEMBER.password);
  await createPlan(page, "Case deletion");
  await expect(caseIds(page)).toHaveText(["TC-001", "TC-002", "TC-003"]);

  // Clicking Delete asks first and does not open the test case.
  await page.getByRole("button", { name: "Delete test case TC-002" }).click();
  await expect(page.locator("details.case").nth(1)).not.toHaveAttribute("open");
  await page.getByRole("group", { name: "Confirm deleting TC-002" }).getByRole("button", { name: "Cancel" }).click();
  await expect(caseIds(page)).toHaveCount(3);

  // A teammate can also delete test cases.
  const teammate = await browser.newPage();
  await signIn(teammate, TEAMMATE.login, TEAMMATE.password);
  await expect(teammate).toHaveURL(/\/dashboard$/);
  await teammate.goto(page.url());
  await teammate.getByRole("button", { name: "Delete test case TC-002" }).click();
  await teammate.getByRole("group", { name: "Confirm deleting TC-002" }).getByRole("button", { name: "Yes, delete" }).click();

  await expect(teammate).toHaveURL(/\?version=2$/);
  await expect(teammate.getByText(/Version 2 · 2 test cases · Removed TC-002 from version 1 · changed by Teammate/)).toBeVisible();
  await expect(caseIds(teammate)).toHaveText(["TC-001", "TC-003"]);

  // The steps come along unchanged.
  await teammate.locator("details.case").first().locator("summary").click();
  await expect(teammate.getByRole("cell", { name: "You logged into a secure area!" })).toBeVisible();

  // Version 1 is untouched and read-only.
  await teammate.getByRole("link", { name: "Version 1", exact: true }).click();
  await expect(caseIds(teammate)).toHaveText(["TC-001", "TC-002", "TC-003"]);
  await expect(teammate.getByRole("button", { name: /Delete test case/ })).toHaveCount(0);
  await teammate.close();
});

test("the last test case cannot be deleted", async ({ page }) => {
  await signIn(page, MEMBER.login, MEMBER.password);
  await createPlan(page, "Single case", SAMPLE_TEST_CASES.slice(0, 1));

  await page.getByRole("button", { name: "Delete test case TC-001" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.locator("details.case").getByRole("alert")).toHaveText("A plan needs at least one test case. Delete the whole plan instead.");
  await expect(caseIds(page)).toHaveText(["TC-001"]);
});

test("a stale page cannot delete from an older version", async ({ page, browser }) => {
  await signIn(page, MEMBER.login, MEMBER.password);
  await createPlan(page, "Stale page");

  const other = await browser.newPage();
  await signIn(other, MEMBER.login, MEMBER.password);
  await expect(other).toHaveURL(/\/dashboard$/);
  await other.goto(page.url());
  await other.getByRole("button", { name: "Delete test case TC-003" }).click();
  await other.getByRole("button", { name: "Yes, delete" }).click();
  await expect(other).toHaveURL(/\?version=2$/);
  await other.close();

  // The first tab still shows version 1's test case ids.
  await page.getByRole("button", { name: "Delete test case TC-003" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.locator("details.case").getByRole("alert")).toHaveText("This page is out of date. Reload it and try again.");
});

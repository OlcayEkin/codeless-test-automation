import { expect, test, type Page } from "@playwright/test";
import { SAMPLE_TEST_CASES, toCsv } from "../src/lib/test-cases/templates";
import { MEMBER, signIn } from "./helpers";

async function openNewTestCase(page: Page, planName: string) {
  await signIn(page, MEMBER.login, MEMBER.password);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/plans/new");
  await page.getByLabel("Plan name").fill(planName);
  await page.getByLabel("Test case file").setInputFiles({ name: "p.csv", mimeType: "text/csv", buffer: Buffer.from(toCsv(SAMPLE_TEST_CASES)) });
  await page.getByRole("button", { name: "Create test plan" }).click();
  await expect(page.getByRole("heading", { name: planName })).toBeVisible();
  await page.getByRole("link", { name: "+ Create test case" }).click();
  await expect(page.getByRole("heading", { name: "Create a test case" })).toBeVisible();
}

const step = (page: Page, n: number) => page.getByRole("listitem", { name: `Step ${n}` });

test("build a test case step by step and save it to the plan", async ({ page }) => {
  await openNewTestCase(page, "Hand-made cases");
  await expect(page.getByText("It will be saved as TC-004 in Hand-made cases, as version 2.")).toBeVisible();

  await page.getByLabel("Test case title").fill("Home page has the right title");

  // Step 1: description, action, target.
  await step(page, 1).getByLabel("Description").fill("Go to the home page");
  await step(page, 1).getByLabel("Action").selectOption({ label: "Open a page" });
  await expect(step(page, 1).getByLabel("Page address")).toBeVisible();
  await expect(step(page, 1).getByLabel("Text to type")).toHaveCount(0);
  await step(page, 1).getByLabel("Page address").fill("https://the-internet.herokuapp.com/");
  await step(page, 1).getByLabel("Expected result").fill("The home page is shown");

  // Test case done? No: start the next step.
  await page.getByRole("button", { name: "No, add another step" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Step 1" })).toContainText("Go to the home page · Open a page · https://the-internet.herokuapp.com/");

  // Step 2: a check with a value and no target.
  await step(page, 2).getByLabel("Action").selectOption({ label: "Check: page title contains" });
  await expect(step(page, 2).getByLabel("Element")).toHaveCount(0);
  await step(page, 2).getByLabel("Part of the title").fill("The Internet");

  // Test case done? Yes: save.
  await page.getByRole("button", { name: "Yes, save test case to plan" }).click();
  await expect(page).toHaveURL(/\?version=2&added=TC-004$/);
  await expect(page.getByRole("status")).toHaveText("TC-004 is saved to the plan.");
  await expect(page.getByText(/Version 2 · 4 test cases · Added TC-004 “Home page has the right title” · changed by E2E Member/)).toBeVisible();

  const created = page.locator("details.case").filter({ hasText: "TC-004" });
  await created.locator("summary").click();
  await expect(created.getByRole("cell", { name: "Go to the home page" })).toBeVisible();
  await expect(created.getByRole("cell", { name: "expect_title" })).toBeVisible();

  // Version 1 is unchanged.
  await page.getByRole("link", { name: "Version 1", exact: true }).click();
  await expect(page.locator("details.case .case-id")).toHaveText(["TC-001", "TC-002", "TC-003"]);
  await expect(page.getByRole("link", { name: "+ Create test case" })).toHaveCount(0);
});

test("a step is checked before moving on", async ({ page }) => {
  await openNewTestCase(page, "Checked steps");
  await page.getByLabel("Test case title").fill("Needs a target");

  await page.getByRole("button", { name: "No, add another step" }).click();
  await expect(step(page, 1).getByRole("alert")).toHaveText("Choose an action.");

  await step(page, 1).getByLabel("Action").selectOption({ label: "Click" });
  await page.getByRole("button", { name: "No, add another step" }).click();
  await expect(step(page, 1).getByRole("alert")).toHaveText('Action "click" needs a target.');

  await step(page, 1).getByLabel("Element to click").fill("javascript-free#button");
  await page.getByRole("button", { name: "No, add another step" }).click();
  await expect(step(page, 2)).toBeVisible();

  // Removing the empty second step and saving works; the tip warns there is no check.
  await step(page, 2).getByRole("button", { name: "Remove step" }).click();
  await expect(page.getByText("Tip: add a “Check” step, or this test can never fail.")).toBeVisible();
});

import { expect, test, type Page } from "@playwright/test";
import { SAMPLE_TEST_CASES, toCsv } from "../src/lib/test-cases/templates";
import { ADMIN, MEMBER, TEAMMATE, signIn } from "./helpers";

async function createPlanAs(page: Page, user: { login: string; password: string }, name: string) {
  await signIn(page, user.login, user.password);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/plans/new");
  await page.getByLabel("Plan name").fill(name);
  await page.getByLabel("Test case file").setInputFiles({ name: "p.csv", mimeType: "text/csv", buffer: Buffer.from(toCsv(SAMPLE_TEST_CASES)) });
  await page.getByRole("button", { name: "Create test plan" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  return page.url();
}

test("the creator can cancel, then delete a plan", async ({ page }) => {
  const planUrl = await createPlanAs(page, MEMBER, "Plan to delete");

  await page.getByRole("button", { name: "Delete test plan" }).click();
  await expect(page.getByText("Delete Plan to delete and all 1 version? This cannot be undone.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Yes, delete" })).toHaveCount(0);

  await page.getByRole("button", { name: "Delete test plan" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();

  await expect(page).toHaveURL(/\/dashboard\?deleted=1$/);
  await expect(page.getByRole("status")).toHaveText("The test plan was deleted.");
  await expect(page.getByRole("link", { name: "Plan to delete" })).toHaveCount(0);
  expect((await page.goto(planUrl))?.status()).toBe(404);
});

test("another team member cannot delete someone else's plan", async ({ page, browser }) => {
  const planUrl = await createPlanAs(page, MEMBER, "Member's plan");

  const teammate = await browser.newPage();
  await signIn(teammate, TEAMMATE.login, TEAMMATE.password);
  await expect(teammate).toHaveURL(/\/dashboard$/);
  await teammate.goto(planUrl);
  await expect(teammate.getByRole("heading", { name: "Member's plan" })).toBeVisible();
  await expect(teammate.getByRole("button", { name: "Delete test plan" })).toHaveCount(0);
  await teammate.close();
});

test("a team admin can delete any team plan", async ({ page, browser }) => {
  const planUrl = await createPlanAs(page, MEMBER, "Admin will delete");

  const admin = await browser.newPage();
  await signIn(admin, ADMIN.login, ADMIN.password);
  await expect(admin).toHaveURL(/\/dashboard$/);
  await admin.goto(planUrl);
  await admin.getByRole("button", { name: "Delete test plan" }).click();
  await admin.getByRole("button", { name: "Yes, delete" }).click();
  await expect(admin).toHaveURL(/\/dashboard\?deleted=1$/);
  await admin.close();

  expect((await page.goto(planUrl))?.status()).toBe(404);
});

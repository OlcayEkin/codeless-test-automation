import { expect, test } from "@playwright/test";
import { OUTSIDER, SCHEDULER, signIn } from "./helpers";

test("the demo plan loads with one click and only once", async ({ page }) => {
  await signIn(page, SCHEDULER.login, SCHEDULER.password);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page).toHaveTitle("Test plans · Codeless Test Automation");

  await page.getByRole("button", { name: "Load demo plan" }).click();
  await expect(page.getByRole("heading", { name: "Demo: practice site login" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("The demo plan is ready. Press ▶ Run tests to watch it run.");
  await expect(page.getByText(/Version 1 · 4 test cases · Demo plan: the templates plus one test that fails on purpose/)).toBeVisible();
  await expect(page.locator("details.case .case-id")).toHaveText(["TC-001", "TC-002", "TC-003", "TC-004"]);

  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Demo: practice site login" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Load demo plan" })).toHaveCount(0);
});

test("another team's plan shows a friendly not-found page", async ({ page }) => {
  await signIn(page, OUTSIDER.login, OUTSIDER.password);
  await expect(page).toHaveURL(/\/dashboard$/);
  const response = await page.goto("/plans/does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByText("This page does not exist, or it belongs to another team.")).toBeVisible();
  await page.getByRole("link", { name: "Go to your test plans" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

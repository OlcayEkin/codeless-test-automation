import { expect, test, type Page } from "@playwright/test";
import { E2E_USER } from "../playwright.config";
import { formError, signIn } from "./helpers";

test("visitors are sent to the login page", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Codeless Test Automation" })).toBeVisible();
});

test("wrong password shows an error and stays on login", async ({ page }) => {
  await signIn(page, E2E_USER.email, "wrong-password");
  await expect(formError(page)).toHaveText("Login or password is incorrect.");
  await expect(page).toHaveURL(/\/login$/);
});

test("unknown email shows the same error as a wrong password", async ({ page }) => {
  await signIn(page, "nobody@example.com", "whatever");
  await expect(formError(page)).toHaveText("Login or password is incorrect.");
});

test("user signs in, sees the team dashboard and logs out", async ({ page }) => {
  await signIn(page, E2E_USER.email, E2E_USER.password);

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Test plans", exact: true })).toBeVisible();
  await expect(page.getByText("Admin · Admin · QA Team")).toBeVisible();
  await expect(page.getByRole("heading", { name: "No test plans yet" })).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});

test("five failed attempts lock the account temporarily", async ({ page }) => {
  const email = "lockout@example.com";
  for (let i = 0; i < 5; i++) {
    await signIn(page, email, "wrong");
    await expect(formError(page)).toBeVisible();
  }
  await signIn(page, email, "wrong");
  await expect(formError(page)).toHaveText("Too many failed attempts. Try again in 15 minutes.");
});

async function sessionCookie(page: Page) {
  const cookies = await page.context().cookies();
  const cookie = cookies.find((c) => c.name === "codeless_session");
  expect(cookie, "session cookie should be set").toBeDefined();
  return cookie!;
}

test("without Remember me the login ends when the browser closes", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Remember me for 30 days")).not.toBeChecked();
  await signIn(page, E2E_USER.email, E2E_USER.password);
  await expect(page).toHaveURL(/\/dashboard$/);

  // -1 means a browser-session cookie with no expiry date.
  expect((await sessionCookie(page)).expires).toBe(-1);
});

test("with Remember me the login lasts 30 days", async ({ page }) => {
  await signIn(page, E2E_USER.email, E2E_USER.password, true);
  await expect(page).toHaveURL(/\/dashboard$/);

  const days = ((await sessionCookie(page)).expires * 1000 - Date.now()) / 86_400_000;
  expect(days).toBeGreaterThan(29.9);
  expect(days).toBeLessThanOrEqual(30);
});

test("a member signs in with a username", async ({ page }) => {
  await signIn(page, "E2E-Member", "e2e-Member-123");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("E2E Member · Member · QA Team")).toBeVisible();
});

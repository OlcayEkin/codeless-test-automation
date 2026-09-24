import type { Page } from "@playwright/test";

export const MEMBER = { login: "e2e-member", password: "e2e-Member-123" };
export const TEAMMATE = { login: "e2e-teammate", password: "e2e-Teammate-123" };
export const ADMIN = { login: "e2e@example.com", password: "e2e-Password-123" };
export const SCHEDULER = { login: "e2e-scheduler", password: "e2e-Scheduler-123" };
export const OUTSIDER = { login: "e2e-outsider", password: "e2e-Outsider-123" };

export async function signIn(page: Page, login: string, password: string, remember = false) {
  await page.goto("/login");
  await page.getByLabel("Email or username").fill(login);
  await page.getByLabel("Password").fill(password);
  if (remember) await page.getByLabel("Remember me for 30 days").check();
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Next.js adds its own hidden alert for route changes, so look only inside forms. */
export const formError = (page: Page) => page.locator("form").getByRole("alert");

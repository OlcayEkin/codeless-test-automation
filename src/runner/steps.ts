/**
 * Runs one step of a test case with Playwright. This is the only place where test actions touch a browser,
 * and it only knows the fixed actions from format.ts. Uploaded text is used as data: selectors, URLs and values.
 */
import type { APIRequestContext, APIResponse, Page } from "@playwright/test";
import type { TestStepInput } from "../lib/test-cases/format";

/** A check step whose condition did not hold. Makes the test "failed". */
export class CheckFailed extends Error {}
/** A step that could not run for a reason outside the test's checks. Makes the test "blocked". */
export class StepBlocked extends Error {}

export type StepContext = {
  page: Page;
  api: APIRequestContext;
  baseUrl?: string;
  lastResponse?: APIResponse;
};

export async function runStep(ctx: StepContext, step: TestStepInput, timeout: number): Promise<void> {
  const target = step.target ?? "";
  const value = step.value ?? "";
  const element = () => ctx.page.locator(target).first();

  switch (step.action) {
    case "open":
      await ctx.page.goto(resolveUrl(target, ctx.baseUrl), { timeout });
      return;
    case "click":
      return element().click({ timeout });
    case "hover":
      return element().hover({ timeout });
    case "fill":
      return element().fill(value, { timeout });
    case "select":
      await element().selectOption(value, { timeout });
      return;
    case "check":
      return element().check({ timeout });
    case "uncheck":
      return element().uncheck({ timeout });
    case "press":
      return element().press(value, { timeout });
    case "wait_for":
      return element().waitFor({ state: "visible", timeout });

    case "expect_visible":
      return check(() => element().isVisible(), timeout, `Expected ${target} to be visible, but it was not.`);
    case "expect_hidden":
      return check(async () => !(await element().isVisible()), timeout, `Expected ${target} to be hidden, but it was visible.`);
    case "expect_text": {
      let seen = "";
      return check(
        async () => {
          seen = (await element().count()) ? ((await element().textContent()) ?? "") : "";
          return seen.includes(value);
        },
        timeout,
        () => (seen ? `Expected ${target} to contain "${value}", but it showed "${clip(seen)}".` : `Expected ${target} to contain "${value}", but the element was not found.`),
      );
    }
    case "expect_url":
      return check(async () => ctx.page.url().includes(value), timeout, () => `Expected the URL to contain "${value}", but it was ${ctx.page.url()}.`);
    case "expect_title": {
      let title = "";
      return check(
        async () => (title = await ctx.page.title()).includes(value),
        timeout,
        () => `Expected the page title to contain "${value}", but it was "${clip(title)}".`,
      );
    }

    case "api_request":
      ctx.lastResponse = await ctx.api.fetch(target, { method: (value || "GET").toUpperCase(), timeout, maxRedirects: 5 });
      return;
    case "expect_status": {
      if (!ctx.lastResponse) throw new StepBlocked("There is no API response to check. Add an api_request step before expect_status.");
      const status = ctx.lastResponse.status();
      if (String(status) !== value) throw new CheckFailed(`Expected API status ${value}, but it was ${status}.`);
      return;
    }
  }
}

function resolveUrl(target: string, baseUrl?: string) {
  if (!target.startsWith("/")) return target;
  if (!baseUrl) throw new StepBlocked(`"${target}" is a path, so the run needs a base URL, for example --base-url https://staging.example.com.`);
  return new URL(target, baseUrl).toString();
}

/** Polls a condition until it holds or the time runs out, like Playwright's own web-first assertions. */
async function check(condition: () => Promise<boolean>, timeout: number, message: string | (() => string)) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await condition()) return;
    if (Date.now() >= deadline) throw new CheckFailed(typeof message === "string" ? message : message());
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

const clip = (text: string) => (text.length > 120 ? `${text.slice(0, 117).trim()}…` : text.trim());

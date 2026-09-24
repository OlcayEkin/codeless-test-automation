/**
 * Runs test cases in real browsers and collects results, screenshots and traces.
 * Every test case gets a fresh browser context, so cookies and storage never leak between tests.
 */
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, request, type Browser } from "@playwright/test";
import type { TestCaseInput } from "../lib/test-cases/format";
import { CheckFailed, StepBlocked, runStep, type StepContext } from "./steps";
import type { BrowserName, RunOptions, RunResult, StepResult, TestCaseResult, TestStatus } from "./types";

const DEFAULT_STEP_TIMEOUT_MS = 15_000;
const DEFAULT_TEST_TIMEOUT_MS = 120_000;

const BROWSER_LABEL: Record<BrowserName, string> = { chrome: "Google Chrome", edge: "Microsoft Edge", firefox: "Firefox" };

type Launched = { browser: Browser; cleanup: () => Promise<void> };

async function launch(name: BrowserName, headless: boolean): Promise<Launched> {
  let home: string | undefined;
  try {
    if (name === "firefox") {
      // macOS 27 blocks ~/Library/Application Support/Firefox, which Playwright's Firefox reads at startup.
      // A private home folder avoids it: https://github.com/microsoft/playwright/issues/42768
      const env: Record<string, string | undefined> = { ...process.env };
      if (process.platform === "darwin") env.CFFIXED_USER_HOME = home = await mkdtemp(join(tmpdir(), "codeless-firefox-"));
      const browser = await firefox.launch({ headless, env });
      return { browser, cleanup: () => removeQuietly(home) };
    }
    const browser = await chromium.launch({ headless, channel: name === "edge" ? "msedge" : "chrome" });
    return { browser, cleanup: async () => {} };
  } catch (error) {
    await removeQuietly(home);
    const reason = error instanceof Error ? error.message.split("\n")[0].replace(/^browserType\.launch: /, "") : String(error);
    const fix = name === "firefox" ? "If Firefox is missing, run: npx playwright install firefox" : `Check that ${BROWSER_LABEL[name]} is installed.`;
    throw new StepBlocked(`${BROWSER_LABEL[name]} could not be started (${reason}). ${fix}`);
  }
}

export async function runTestCases(options: RunOptions): Promise<RunResult> {
  const started = Date.now();
  const results: TestCaseResult[] = [];
  let stopped = false;
  await mkdir(options.outputDir, { recursive: true });

  for (const browserName of options.browsers) {
    if (stopped) break;
    let launched: Launched | undefined;
    let launchError: string | undefined;
    try {
      launched = await launch(browserName, options.headless);
    } catch (error) {
      launchError = error instanceof Error ? error.message : String(error);
    }

    try {
      for (const testCase of options.testCases) {
        if (await options.shouldStop?.()) {
          stopped = true;
          break;
        }
        const result = launched
          ? await runOne(launched.browser, browserName, testCase, options).catch((error: unknown) =>
              // A crash outside the steps (for example the browser closing) blocks only this test case.
              blockedWithoutRunning(browserName, testCase, `The test could not run: ${describeError(error)}`),
            )
          : blockedWithoutRunning(browserName, testCase, launchError ?? "The browser could not be started.");
        results.push(result);
        await options.onResult?.(result);
      }
    } finally {
      await launched?.browser.close();
      await launched?.cleanup();
    }
  }

  await removeQuietly(join(options.outputDir, ".videos"));
  const count = (status: TestStatus) => results.filter((r) => r.status === status).length;
  const run: RunResult = {
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    browsers: options.browsers,
    headless: options.headless,
    summary: { total: results.length, passed: count("passed"), failed: count("failed"), blocked: count("blocked") },
    results,
    stopped,
  };
  await writeFile(join(options.outputDir, "results.json"), JSON.stringify(run, null, 2));
  return run;
}

async function runOne(browser: Browser, browserName: BrowserName, testCase: TestCaseInput, options: RunOptions): Promise<TestCaseResult> {
  const stepTimeout = options.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;
  const deadline = Date.now() + (options.testTimeoutMs ?? DEFAULT_TEST_TIMEOUT_MS);
  const started = Date.now();

  const context = await browser.newContext({
    acceptDownloads: false,
    baseURL: options.baseUrl,
    recordVideo: options.recordVideo ? { dir: join(options.outputDir, ".videos"), size: { width: 1280, height: 720 } } : undefined,
  });
  await context.tracing.start({ screenshots: true, snapshots: true });
  const api = await request.newContext({ baseURL: options.baseUrl });
  const page = await context.newPage();
  const ctx: StepContext = { page, api, baseUrl: options.baseUrl };

  const steps: StepResult[] = [];
  let status: TestStatus = "passed";
  let error: string | undefined;
  let failedStep: number | undefined;

  for (const [index, step] of testCase.steps.entries()) {
    const position = index + 1;
    if (status !== "passed") {
      steps.push({ position, action: step.action, status: "skipped", durationMs: 0 });
      continue;
    }
    const stepStarted = Date.now();
    const remaining = deadline - stepStarted;
    try {
      if (remaining <= 0) throw new StepBlocked("The test ran out of time before this step.");
      await runStep(ctx, step, Math.min(stepTimeout, remaining));
      steps.push({ position, action: step.action, status: "passed", durationMs: Date.now() - stepStarted });
    } catch (caught) {
      status = caught instanceof CheckFailed ? "failed" : "blocked";
      error = describeError(caught);
      failedStep = position;
      steps.push({ position, action: step.action, status, durationMs: Date.now() - stepStarted, error });
    }
  }

  const result: TestCaseResult = { testCaseId: testCase.id, name: testCase.name, browser: browserName, status, durationMs: Date.now() - started, steps };
  const folder = join(browserName, safeName(testCase.id));
  if (status !== "passed") {
    result.error = error;
    result.failedStep = failedStep;
    await mkdir(join(options.outputDir, folder), { recursive: true });
    result.screenshot = await page
      .screenshot({ path: join(options.outputDir, folder, "screenshot.png"), fullPage: true, timeout: 10_000 })
      .then(() => join(folder, "screenshot.png"))
      .catch(() => undefined);
    result.trace = join(folder, "trace.zip");
    await context.tracing.stop({ path: join(options.outputDir, result.trace) });
  } else {
    await context.tracing.stop();
  }

  // The video file is only complete once the context is closed.
  const video = page.video();
  await Promise.allSettled([context.close(), api.dispose()]);
  const videoPath = await video?.path().catch(() => undefined);
  if (videoPath) {
    if (status === "passed") {
      await rm(videoPath, { force: true }).catch(() => undefined);
    } else {
      const kept = join(folder, "video.webm");
      result.video = await rename(videoPath, join(options.outputDir, kept))
        .then(() => kept)
        .catch(() => undefined);
    }
  }
  return result;
}

/** Best effort: a leftover temporary folder must never fail a test run. The OS clears its temp folder anyway. */
async function removeQuietly(dir?: string) {
  if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

function blockedWithoutRunning(browser: BrowserName, testCase: TestCaseInput, reason: string): TestCaseResult {
  return {
    testCaseId: testCase.id,
    name: testCase.name,
    browser,
    status: "blocked",
    durationMs: 0,
    error: reason,
    failedStep: 1,
    steps: testCase.steps.map((step, i) => ({ position: i + 1, action: step.action, status: "skipped", durationMs: 0 })),
  };
}

/** Playwright errors are long and technical. Keep the first line and the timeout reason. */
function describeError(error: unknown): string {
  if (error instanceof CheckFailed || error instanceof StepBlocked) return error.message;
  // Playwright may color its messages for terminals; results should hold plain text.
  const message = (error instanceof Error ? error.message : String(error)).replace(/\u001b\[[0-9;]*m/g, "");
  const firstLine = message.split("\n")[0].replace(/^\w+\.\w+: /, "");
  if (/Timeout \d+ms exceeded/.test(firstLine)) {
    const waitingFor = message.match(/waiting for (.+)/)?.[1];
    return waitingFor ? `Timed out waiting for ${waitingFor.trim().replace(/\.first\(\)$/, "")}.` : "The step timed out.";
  }
  return firstLine.slice(0, 300);
}

const safeName = (id: string) => id.replace(/[^\w.-]+/g, "_").slice(0, 80) || "test";

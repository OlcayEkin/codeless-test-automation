import type { TestCaseInput } from "../lib/test-cases/format";

export const BROWSERS = ["chrome", "edge", "firefox"] as const;
export type BrowserName = (typeof BROWSERS)[number];

/** passed: every step ran and every check held. failed: a check did not hold. blocked: a step could not run at all. */
export type TestStatus = "passed" | "failed" | "blocked";
export type StepStatus = TestStatus | "skipped";

export type RunOptions = {
  testCases: TestCaseInput[];
  browsers: BrowserName[];
  headless: boolean;
  /** Where screenshots, traces and results.json are written. */
  outputDir: string;
  /** Used to resolve open steps whose target is a path like /login. */
  baseUrl?: string;
  stepTimeoutMs?: number;
  /** Record a video of each test case; kept only for tests that did not pass. */
  recordVideo?: boolean;
  testTimeoutMs?: number;
  /** Called after each test case, so a caller can show progress. */
  onResult?: (result: TestCaseResult) => void | Promise<void>;
  /** Checked before each test case. Returning true stops the run; remaining test cases are not run. */
  shouldStop?: () => boolean | Promise<boolean>;
};

export type StepResult = { position: number; action: string; status: StepStatus; durationMs: number; error?: string };

export type TestCaseResult = {
  testCaseId: string;
  name: string;
  browser: BrowserName;
  status: TestStatus;
  durationMs: number;
  error?: string;
  failedStep?: number;
  steps: StepResult[];
  /** Paths relative to the output directory. Only kept for tests that did not pass. */
  screenshot?: string;
  trace?: string;
  video?: string;
};

export type RunSummary = { total: number; passed: number; failed: number; blocked: number };
export type RunResult = {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  browsers: BrowserName[];
  headless: boolean;
  summary: RunSummary;
  results: TestCaseResult[];
  /** True when shouldStop ended the run early. */
  stopped: boolean;
};

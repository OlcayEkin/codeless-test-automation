/**
 * The one test case format that Excel, CSV and JSON uploads are all converted into.
 * This file has no server or browser dependencies, so parsers, pages and tests can all share it.
 */

export const IMPORT_LIMITS = {
  maxFileBytes: 5 * 1024 * 1024,
  maxTestCases: 500,
  maxStepsPerCase: 200,
  maxTotalSteps: 5000,
  maxCellLength: 2000,
  maxIssuesShown: 50,
} as const;

/** Column order used by the Excel and CSV formats and their templates. */
export const COLUMNS = ["test_case_id", "test_case_name", "step", "action", "target", "value", "expected_result"] as const;
export type Column = (typeof COLUMNS)[number];
export const REQUIRED_COLUMNS: Column[] = ["test_case_id", "test_case_name", "step", "action"];

type FieldRule = "required" | "optional" | "none";
type TargetKind = "selector" | "url";
type ActionSpec = { target: FieldRule; targetKind?: TargetKind; value: FieldRule; description: string };

/**
 * The only actions a test can perform. Uploaded files can never run code; they can only pick from this list.
 * Adding an action here is the single place to extend what tests can do.
 */
export const ACTIONS = {
  open: { target: "required", targetKind: "url", value: "none", description: "Open a page. Target is a full http(s) URL or a path starting with /." },
  click: { target: "required", targetKind: "selector", value: "none", description: "Click an element." },
  hover: { target: "required", targetKind: "selector", value: "none", description: "Move the mouse over an element." },
  fill: { target: "required", targetKind: "selector", value: "optional", description: "Type the value into a field. An empty value clears it." },
  select: { target: "required", targetKind: "selector", value: "required", description: "Choose an option in a dropdown." },
  check: { target: "required", targetKind: "selector", value: "none", description: "Tick a checkbox." },
  uncheck: { target: "required", targetKind: "selector", value: "none", description: "Untick a checkbox." },
  press: { target: "required", targetKind: "selector", value: "required", description: "Press a key, for example Enter, in an element." },
  wait_for: { target: "required", targetKind: "selector", value: "none", description: "Wait until an element appears." },
  expect_visible: { target: "required", targetKind: "selector", value: "none", description: "Check that an element is visible." },
  expect_hidden: { target: "required", targetKind: "selector", value: "none", description: "Check that an element is hidden." },
  expect_text: { target: "required", targetKind: "selector", value: "required", description: "Check that an element contains the text." },
  expect_url: { target: "none", value: "required", description: "Check that the page URL contains the value." },
  expect_title: { target: "none", value: "required", description: "Check that the page title contains the value." },
  api_request: { target: "required", targetKind: "url", value: "optional", description: "Call an API. Value is the HTTP method, GET by default." },
  expect_status: { target: "none", value: "required", description: "Check the last API response status code, for example 200." },
} as const satisfies Record<string, ActionSpec>;

export type Action = keyof typeof ACTIONS;
export const ACTION_NAMES = Object.keys(ACTIONS) as Action[];
export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export type TestStepInput = { action: Action; target?: string; value?: string; expected?: string };
export type TestCaseInput = { id: string; name: string; steps: TestStepInput[] };

export type Severity = "error" | "warning";
/** A problem found in an upload. `location` points at a row number (Excel, CSV) or a field path (JSON). */
export type ImportIssue = { severity: Severity; location: string; message: string };

export type ImportFormat = "xlsx" | "csv" | "json";
export type ImportResult =
  | { ok: true; format: ImportFormat; testCases: TestCaseInput[]; warnings: ImportIssue[] }
  | { ok: false; format?: ImportFormat; issues: ImportIssue[] };

export function isAction(value: string): value is Action {
  return Object.hasOwn(ACTIONS, value);
}

/** Checks one step against its action's rules. Returns messages without a location. */
export function checkStep(step: { action: string; target?: string; value?: string }): string[] {
  const problems: string[] = [];
  if (!isAction(step.action)) {
    return [`Unknown action "${step.action}". Allowed actions: ${ACTION_NAMES.join(", ")}.`];
  }
  const spec: ActionSpec = ACTIONS[step.action];
  const target = step.target ?? "";
  const value = step.value ?? "";

  if (spec.target === "required" && !target) problems.push(`Action "${step.action}" needs a target.`);
  if (spec.target === "none" && target) problems.push(`Action "${step.action}" does not use a target. Leave it empty.`);
  if (spec.value === "required" && !value) problems.push(`Action "${step.action}" needs a value.`);
  if (spec.value === "none" && value) problems.push(`Action "${step.action}" does not use a value. Leave it empty.`);

  if (target && spec.targetKind === "url" && !isAllowedUrl(target, step.action === "open")) {
    problems.push(
      step.action === "open"
        ? `Target "${target}" must be a full http(s) URL or a path starting with /.`
        : `Target "${target}" must be a full http(s) URL.`,
    );
  }
  if (step.action === "api_request" && value && !HTTP_METHODS.includes(value.toUpperCase())) {
    problems.push(`Value "${value}" is not an HTTP method. Use one of ${HTTP_METHODS.join(", ")}.`);
  }
  if (step.action === "expect_status" && !/^[1-5]\d\d$/.test(value)) {
    problems.push(`Value "${value}" is not an HTTP status code between 100 and 599.`);
  }
  return problems;
}

/** Only web addresses are allowed, which blocks javascript:, file: and data: links. */
function isAllowedUrl(target: string, allowPath: boolean) {
  if (allowPath && target.startsWith("/") && !target.startsWith("//")) return true;
  try {
    const url = new URL(target);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Quality hints that plain code can detect. Jev adds judgment-based ones on the server. */
export function structuralWarnings(testCase: TestCaseInput, location: string): ImportIssue[] {
  const hasCheck = testCase.steps.some((step) => step.action.startsWith("expect_"));
  return hasCheck
    ? []
    : [{ severity: "warning", location, message: `Test case "${testCase.id}" has no check step (an expect_ action), so it can never fail.` }];
}

export type TestType = "web" | "api";
export const TEST_TYPES: TestType[] = ["web", "api"];
const API_ACTIONS = new Set<string>(["api_request", "expect_status"]);

/** A test case is an API test when it only calls APIs and checks their status; otherwise it needs a browser. */
export function testTypeOf(testCase: { steps: { action: string }[] }): TestType {
  return testCase.steps.every((step) => API_ACTIONS.has(step.action)) ? "api" : "web";
}

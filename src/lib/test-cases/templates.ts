/**
 * Downloadable templates. All three formats are generated from the same sample test cases,
 * so they always describe exactly the same tests.
 */
import writeXlsxFile from "write-excel-file/node";
import { COLUMNS, type TestCaseInput } from "./format";

// The practice site publishes this demo login on its own page, so it is not a secret.
const DEMO_SITE = "https://the-internet.herokuapp.com";

export const SAMPLE_TEST_CASES: TestCaseInput[] = [
  {
    id: "TC-001",
    name: "Valid user can log in",
    steps: [
      { description: "Go to the login page", action: "open", target: `${DEMO_SITE}/login`, expected: "Login page is shown" },
      { description: "Enter a valid username", action: "fill", target: "#username", value: "tomsmith" },
      { description: "Enter the matching password", action: "fill", target: "#password", value: "SuperSecretPassword!" },
      { action: "click", target: "button[type=submit]" },
      { action: "expect_text", target: "#flash", value: "You logged into a secure area!", expected: "Success message is shown" },
      { action: "expect_url", value: "/secure", expected: "User lands on the secure page" },
    ],
  },
  {
    id: "TC-002",
    name: "Wrong password shows an error",
    steps: [
      { action: "open", target: `${DEMO_SITE}/login` },
      { action: "fill", target: "#username", value: "tomsmith" },
      { action: "fill", target: "#password", value: "wrong-password" },
      { action: "click", target: "button[type=submit]" },
      { action: "expect_text", target: "#flash", value: "Your password is invalid!", expected: "Error message is shown" },
    ],
  },
  {
    id: "TC-003",
    name: "Status endpoint returns 200",
    steps: [
      { action: "api_request", target: `${DEMO_SITE}/status_codes/200`, value: "GET" },
      { action: "expect_status", value: "200", expected: "API answers with 200 OK" },
    ],
  },
];

export const TEMPLATE_FILES = {
  "test-cases.xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "test-cases.csv": "text/csv; charset=utf-8",
  "test-cases.json": "application/json; charset=utf-8",
} as const;
export type TemplateFile = keyof typeof TEMPLATE_FILES;

function toRows(testCases: TestCaseInput[]): string[][] {
  return testCases.flatMap((testCase) =>
    testCase.steps.map((step, index) => [
      testCase.id,
      testCase.name,
      String(index + 1),
      step.description ?? "",
      step.action,
      step.target ?? "",
      step.value ?? "",
      step.expected ?? "",
    ]),
  );
}

function csvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function toCsv(testCases: TestCaseInput[]): string {
  return [[...COLUMNS], ...toRows(testCases)].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function toJson(testCases: TestCaseInput[]): string {
  const clean = testCases.map(({ id, name, steps }) => ({
    id,
    name,
    steps: steps.map(({ description, action, target, value, expected }) => ({ description, action, target, value, expected })),
  }));
  return JSON.stringify({ testCases: clean }, null, 2) + "\n";
}

export async function toXlsx(testCases: TestCaseInput[]): Promise<Buffer> {
  const header = COLUMNS.map((column) => ({ value: column, fontWeight: "bold" as const }));
  const rows = toRows(testCases).map((row) => row.map((value, i) => (i === 2 ? { type: Number, value: Number(value) } : { value })));
  return writeXlsxFile([header, ...rows], { columns: COLUMNS.map((c) => ({ width: c === "target" || c === "expected_result" || c === "description" ? 40 : 18 })) }).toBuffer();
}

export async function renderTemplate(file: TemplateFile): Promise<Buffer | string> {
  if (file === "test-cases.xlsx") return toXlsx(SAMPLE_TEST_CASES);
  if (file === "test-cases.csv") return toCsv(SAMPLE_TEST_CASES);
  return toJson(SAMPLE_TEST_CASES);
}

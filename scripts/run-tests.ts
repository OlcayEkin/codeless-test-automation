/**
 * Runs test cases from the terminal.
 *
 *   npm run tests:run -- --file tests.csv
 *   npm run tests:run -- --plan "Login regression" --browsers chrome,firefox --headed
 *   npm run tests:run -- --plan <plan id> --version 2 --base-url https://staging.example.com
 *
 * Options:
 *   --file <path>          Excel, CSV or JSON file with test cases
 *   --plan <name or id>    A saved test plan (latest version unless --version is given)
 *   --version <n>          Plan version to run
 *   --browsers <list>      chrome, edge, firefox (comma separated, default chrome)
 *   --headed               Show the browser windows (headless by default)
 *   --base-url <url>       Base for open steps whose target starts with /
 *   --out <dir>            Where results go (default results/<date-time>)
 *   --step-timeout <sec>   Seconds each step may take (default 15)
 *
 * Exit code: 0 when every test passed, 1 when any failed or was blocked, 2 for usage errors.
 */
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";
import { config } from "dotenv";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import type { Action, TestCaseInput } from "../src/lib/test-cases/format";
import { parseUpload } from "../src/lib/test-cases/parse";
import { runTestCases } from "../src/runner/run";
import { BROWSERS, type BrowserName, type TestCaseResult } from "../src/runner/types";

config({ path: ".env.local", quiet: true });

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

const { values } = parseArgs({
  options: {
    file: { type: "string" },
    plan: { type: "string" },
    version: { type: "string" },
    browsers: { type: "string", default: "chrome" },
    headed: { type: "boolean", default: false },
    "base-url": { type: "string" },
    out: { type: "string" },
    "step-timeout": { type: "string", default: "15" },
  },
});

async function loadFromFile(path: string): Promise<{ label: string; testCases: TestCaseInput[] }> {
  const bytes = await readFile(path).catch(() => fail(`Could not read ${path}.`));
  const result = await parseUpload(basename(path), new Uint8Array(bytes));
  if (!result.ok) fail(["The file has problems:", ...result.issues.map((i) => `  ${i.location}: ${i.message}`)].join("\n"));
  return { label: basename(path), testCases: result.testCases };
}

async function loadFromPlan(planRef: string, version?: number): Promise<{ label: string; testCases: TestCaseInput[] }> {
  const url = process.env.DATABASE_URL ?? fail("DATABASE_URL is not set.");
  const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
  try {
    const matches = await db.testPlan.findMany({ where: { OR: [{ id: planRef }, { name: planRef }] }, select: { id: true, name: true } });
    if (!matches.length) fail(`No test plan with the id or name "${planRef}".`);
    if (matches.length > 1) fail(`Several plans are named "${planRef}". Use the plan id instead:\n${matches.map((p) => `  ${p.id}`).join("\n")}`);
    const plan = matches[0];

    const planVersion = await db.testPlanVersion.findFirst({
      where: { planId: plan.id, ...(version ? { version } : {}) },
      orderBy: { version: "desc" },
      select: {
        version: true,
        testCases: {
          orderBy: { position: "asc" },
          select: { externalId: true, name: true, steps: { orderBy: { position: "asc" }, select: { description: true, action: true, target: true, value: true, expected: true } } },
        },
      },
    });
    if (!planVersion) fail(`Plan "${plan.name}" has no version ${version}.`);

    return {
      label: `${plan.name}, version ${planVersion.version}`,
      testCases: planVersion.testCases.map((tc) => ({
        id: tc.externalId,
        name: tc.name,
        steps: tc.steps.map((s) => ({ description: s.description ?? undefined, action: s.action as Action, target: s.target ?? undefined, value: s.value ?? undefined, expected: s.expected ?? undefined })),
      })),
    };
  } finally {
    await db.$disconnect();
  }
}

const ICON = { passed: "✓ PASS   ", failed: "✗ FAIL   ", blocked: "■ BLOCKED" } as const;

function printResult(result: TestCaseResult) {
  const seconds = (result.durationMs / 1000).toFixed(1).padStart(5);
  console.log(`${ICON[result.status]}  ${result.browser.padEnd(7)} ${seconds}s  ${result.testCaseId}  ${result.name}`);
  if (result.error) console.log(`           step ${result.failedStep}: ${result.error}`);
}

async function main() {
  if (!values.file === !values.plan) fail("Give either --file <path> or --plan <name or id>. See the top of scripts/run-tests.ts for all options.");

  const browsers = values.browsers!.split(",").map((b) => b.trim().toLowerCase()).filter(Boolean);
  const unknown = browsers.filter((b) => !BROWSERS.includes(b as BrowserName));
  if (unknown.length || !browsers.length) fail(`Unknown browser(s): ${unknown.join(", ") || "none given"}. Use ${BROWSERS.join(", ")}.`);

  const stepTimeout = Number(values["step-timeout"]);
  if (!Number.isFinite(stepTimeout) || stepTimeout <= 0 || stepTimeout > 300) fail("--step-timeout must be between 1 and 300 seconds.");
  const version = values.version ? Number(values.version) : undefined;
  if (version !== undefined && (!Number.isInteger(version) || version < 1)) fail("--version must be a whole number of 1 or more.");
  if (values["base-url"] && !/^https?:\/\//.test(values["base-url"])) fail("--base-url must start with http:// or https://.");

  const source = values.file ? await loadFromFile(values.file) : await loadFromPlan(values.plan!, version);
  const outputDir = resolve(values.out ?? `results/${new Date().toISOString().replace(/[:.]/g, "-")}`);

  console.log(`Running ${source.testCases.length} test case(s) from ${source.label}`);
  console.log(`Browsers: ${browsers.join(", ")} · ${values.headed ? "headed" : "headless"}\n`);

  const run = await runTestCases({
    testCases: source.testCases,
    browsers: browsers as BrowserName[],
    headless: !values.headed,
    baseUrl: values["base-url"],
    outputDir,
    stepTimeoutMs: stepTimeout * 1000,
    onResult: printResult,
  });

  const { total, passed, failed, blocked } = run.summary;
  console.log(`\n${passed} passed, ${failed} failed, ${blocked} blocked of ${total} in ${(run.durationMs / 1000).toFixed(1)}s`);
  console.log(`Results, screenshots and traces: ${outputDir}`);
  if (failed + blocked) console.log("Open a trace with: npx playwright show-trace <path to trace.zip>");
  process.exitCode = failed + blocked ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
});

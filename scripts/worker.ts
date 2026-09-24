/**
 * Background worker: runs queued test runs one at a time, outside the web server,
 * so a slow or hung browser can never take the app down.
 *
 *   npm run worker
 *
 * Environment: DATABASE_URL, RESULTS_DIR (default "results"), WORKER_POLL_MS (default 1000).
 */
import { resolve } from "node:path";
import { config } from "dotenv";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import { testTypeOf, type Action, type TestCaseInput, type TestType } from "../src/lib/test-cases/format";
import { runNotification, sendEmail } from "../src/lib/notify";
import { isRepeat, nextRunAfter } from "../src/lib/schedule";
import { suggestTriage } from "../src/lib/triage";
import { runTestCases } from "../src/runner/run";
import { BROWSERS, type BrowserName, type TestCaseResult } from "../src/runner/types";

config({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const RESULTS_DIR = resolve(process.env.RESULTS_DIR || "results");
const POLL_MS = Number(process.env.WORKER_POLL_MS) || 1000;
const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

let stopping = false;
let currentRunId: string | undefined;

const log = (message: string) => console.log(`[worker ${new Date().toLocaleTimeString("en-GB")}] ${message}`);

/** Runs left "running" by a crashed or stopped worker can never finish; say so instead of spinning forever. */
async function recoverInterruptedRuns() {
  const { count } = await db.testRun.updateMany({
    where: { status: { in: ["running", "cancelling"] } },
    data: { status: "error", error: "The worker stopped before this run finished. Start it again.", finishedAt: new Date() },
  });
  if (count) log(`Marked ${count} interrupted run(s) as stopped.`);
}

/**
 * Queues a run for every schedule that is due, then moves the schedule to its next time.
 * The conditional update makes sure a schedule fires only once per time, even with several workers.
 */
async function startDueSchedules(now = new Date()) {
  const due = await db.testSchedule.findMany({
    where: { active: true, nextRunAt: { lte: now } },
    select: { id: true, planId: true, createdById: true, testTypes: true, browser: true, headless: true, startAt: true, repeat: true, nextRunAt: true },
  });
  for (const schedule of due) {
    const next = isRepeat(schedule.repeat) ? nextRunAfter(schedule.startAt, schedule.repeat, now) : null;
    const { count } = await db.testSchedule.updateMany({
      where: { id: schedule.id, nextRunAt: schedule.nextRunAt },
      data: { nextRunAt: next, active: next !== null },
    });
    if (count !== 1) continue;

    const version = await db.testPlanVersion.findFirst({
      where: { planId: schedule.planId },
      orderBy: { version: "desc" },
      select: { id: true },
    });
    if (!version) continue;
    await db.testRun.create({
      data: {
        planId: schedule.planId,
        versionId: version.id,
        scheduleId: schedule.id,
        requestedById: schedule.createdById,
        testTypes: schedule.testTypes,
        browser: schedule.browser,
        headless: schedule.headless,
      },
    });
    log(`Schedule ${schedule.id} queued a run.${next ? ` Next: ${next.toLocaleString("en-GB")}.` : " It will not repeat."}`);
  }
}

/** Tells the person who started the run how it went: in the app, and by email when they have an address. */
async function notifyFinished(runId: string) {
  const run = await db.testRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      status: true,
      error: true,
      total: true,
      passed: true,
      failed: true,
      blocked: true,
      scheduleId: true,
      plan: { select: { name: true } },
      requestedBy: { select: { id: true, email: true } },
    },
  });
  if (!run || ["queued", "running", "cancelling"].includes(run.status)) return;
  const message = runNotification({ ...run, planName: run.plan.name, scheduled: !!run.scheduleId });
  await db.notification.create({ data: { userId: run.requestedBy.id, runId: run.id, ...message } });
  if (run.requestedBy.email) {
    const link = `${process.env.APP_URL || "http://localhost:3001"}/runs/${run.id}`;
    await sendEmail({ to: run.requestedBy.email, subject: message.title, text: `${message.body}\n\nOpen the results: ${link}` });
  }
}

/** Takes the oldest queued run. The conditional update makes sure only one worker can claim it. */
async function claimNextRun() {
  const next = await db.testRun.findFirst({ where: { status: "queued" }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!next) return null;
  const { count } = await db.testRun.updateMany({ where: { id: next.id, status: "queued" }, data: { status: "running", startedAt: new Date() } });
  return count === 1 ? next.id : null;
}

async function loadTestCases(versionId: string, types: TestType[]): Promise<TestCaseInput[]> {
  const testCases = await db.testCase.findMany({
    where: { versionId },
    orderBy: { position: "asc" },
    select: { externalId: true, name: true, steps: { orderBy: { position: "asc" }, select: { description: true, action: true, target: true, value: true, expected: true } } },
  });
  return testCases
    .map((tc) => ({
      id: tc.externalId,
      name: tc.name,
      steps: tc.steps.map((s) => ({ description: s.description ?? undefined, action: s.action as Action, target: s.target ?? undefined, value: s.value ?? undefined, expected: s.expected ?? undefined })),
    }))
    .filter((tc) => types.includes(testTypeOf(tc)));
}

async function saveResult(runId: string, position: number, result: TestCaseResult, testCase?: TestCaseInput) {
  const bugLikelihood = result.status !== "passed" && testCase ? await suggestTriage(testCase, result) : null;
  await db.$transaction([
    db.testRunResult.create({
      data: {
        runId,
        position,
        testCaseId: result.testCaseId,
        name: result.name,
        browser: result.browser,
        status: result.status,
        durationMs: result.durationMs,
        error: result.error ?? null,
        failedStep: result.failedStep ?? null,
        screenshot: result.screenshot ?? null,
        trace: result.trace ?? null,
        video: result.video ?? null,
        bugLikelihood,
        steps: result.steps as unknown as Prisma.InputJsonValue,
      },
    }),
    db.testRun.update({ where: { id: runId }, data: { [result.status]: { increment: 1 } } }),
  ]);
}

async function execute(runId: string) {
  const run = await db.testRun.findUniqueOrThrow({ where: { id: runId }, select: { versionId: true, testTypes: true, browser: true, headless: true } });
  const types = run.testTypes.split(",") as TestType[];
  if (!BROWSERS.includes(run.browser as BrowserName)) throw new Error(`Unknown browser "${run.browser}".`);

  const testCases = await loadTestCases(run.versionId, types);
  if (!testCases.length) throw new Error(`This plan version has no ${types.join(" or ").toUpperCase()} test cases.`);
  await db.testRun.update({ where: { id: runId }, data: { total: testCases.length } });
  log(`Run ${runId}: ${testCases.length} test case(s) in ${run.browser}, ${run.headless ? "headless" : "headed"}.`);

  let position = 0;
  const outcome = await runTestCases({
    testCases,
    browsers: [run.browser as BrowserName],
    headless: run.headless,
    outputDir: resolve(RESULTS_DIR, runId),
    recordVideo: true,
    onResult: (result) => saveResult(runId, position++, result, testCases.find((tc) => tc.id === result.testCaseId)),
    shouldStop: async () =>
      stopping || (await db.testRun.findUnique({ where: { id: runId }, select: { status: true } }))?.status === "cancelling",
  });

  const { passed, failed, blocked } = outcome.summary;
  // Stopped early either because someone pressed Cancel, or because the worker itself is shutting down.
  const status = !outcome.stopped ? "completed" : stopping ? "error" : "cancelled";
  await db.testRun.update({
    where: { id: runId },
    data: { status, finishedAt: new Date(), error: status === "error" ? "The worker was stopped during this run." : null },
  });
  log(`Run ${runId}: ${outcome.stopped ? "cancelled" : "done"} · ${passed} passed, ${failed} failed, ${blocked} blocked.`);
}

async function loop() {
  while (!stopping) {
    await startDueSchedules().catch((error: unknown) => log(`Could not start scheduled runs: ${error instanceof Error ? error.message : error}`));
    const runId = await claimNextRun().catch((error: unknown) => {
      log(`Could not read the queue: ${error instanceof Error ? error.message : error}`);
      return null;
    });
    if (!runId) {
      await new Promise((done) => setTimeout(done, POLL_MS));
      continue;
    }
    currentRunId = runId;
    try {
      await execute(runId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`Run ${runId} failed: ${message}`);
      await db.testRun
        .update({ where: { id: runId }, data: { status: "error", error: message.slice(0, 500), finishedAt: new Date() } })
        .catch(() => undefined);
    } finally {
      currentRunId = undefined;
      await notifyFinished(runId).catch((error: unknown) => log(`Could not send the notification: ${error instanceof Error ? error.message : error}`));
    }
  }
}

function shutdown(signal: string) {
  if (stopping) process.exit(1);
  stopping = true;
  log(`${signal} received. ${currentRunId ? "Stopping after the current test case…" : "Stopping."}`);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

async function main() {
  await recoverInterruptedRuns();
  log(`Worker ready. Results go to ${RESULTS_DIR}.`);
  await loop();
  await db.$disconnect();
}

main().catch(async (error: unknown) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});

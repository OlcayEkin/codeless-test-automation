import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { testTypeOf, type TestType } from "./test-cases/format";

/** Browsers offered in the app. Chrome only for the proof of concept; the runner also supports edge and firefox. */
export const ENABLED_BROWSERS = ["chrome"] as const;
export const ACTIVE_STATUSES = ["queued", "running", "cancelling"];

export type RunSettings = { types: TestType[]; browser: string; headless: boolean };

/** Counts the latest version's test cases by type, for the run settings screen. */
export async function getRunSetup(teamId: string, planId: string) {
  const plan = await db.testPlan.findFirst({
    where: { id: planId, teamId },
    select: {
      id: true,
      name: true,
      versions: { orderBy: { version: "desc" }, take: 1, select: { id: true, version: true, testCases: { select: { steps: { select: { action: true } } } } } },
    },
  });
  const version = plan?.versions[0];
  if (!plan || !version) return null;
  const counts = { web: 0, api: 0 };
  for (const testCase of version.testCases) counts[testTypeOf(testCase)]++;
  return { id: plan.id, name: plan.name, versionId: version.id, version: version.version, counts };
}

export type StartResult = { ok: true; runId: string } | { ok: false; error: string };

export async function startRun(user: { id: string; teamId: string }, planId: string, settings: RunSettings): Promise<StartResult> {
  if (!(ENABLED_BROWSERS as readonly string[]).includes(settings.browser)) return { ok: false, error: "Only Chrome is available for now." };
  if (!settings.types.length) return { ok: false, error: "Choose Web, API or both." };

  const setup = await getRunSetup(user.teamId, planId);
  if (!setup) return { ok: false, error: "This test plan was not found in your team." };
  const matching = settings.types.reduce((sum, type) => sum + setup.counts[type], 0);
  if (!matching) return { ok: false, error: "This plan has no test cases of the chosen type." };

  const run = await db.testRun.create({
    data: {
      planId: setup.id,
      versionId: setup.versionId,
      requestedById: user.id,
      testTypes: settings.types.join(","),
      browser: settings.browser,
      headless: settings.headless,
      total: matching,
    },
    select: { id: true },
  });
  return { ok: true, runId: run.id };
}

export async function getRunForTeam(teamId: string, runId: string) {
  return db.testRun.findFirst({
    where: { id: runId, plan: { teamId } },
    select: {
      id: true,
      status: true,
      error: true,
      testTypes: true,
      browser: true,
      headless: true,
      total: true,
      passed: true,
      failed: true,
      blocked: true,
      createdAt: true,
      startedAt: true,
      finishedAt: true,
      requestedBy: { select: { name: true } },
      plan: { select: { id: true, name: true } },
      version: { select: { version: true } },
      results: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          testCaseId: true,
          name: true,
          status: true,
          durationMs: true,
          error: true,
          failedStep: true,
          screenshot: true,
          trace: true,
          video: true,
          bugLikelihood: true,
          triage: true,
          triagedAt: true,
          triagedBy: { select: { name: true } },
        },
      },
      followUpPlans: { select: { id: true, name: true }, orderBy: { createdAt: "desc" } },
    },
  });
}

export async function listRunsForPlan(teamId: string, planId: string, take = 5) {
  return db.testRun.findMany({
    where: { planId, plan: { teamId } },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, status: true, total: true, passed: true, failed: true, blocked: true, createdAt: true, version: { select: { version: true } } },
  });
}

/** Queued runs stop at once; running runs stop after the current test case. */
export async function cancelRun(teamId: string, runId: string) {
  const run = await db.testRun.findFirst({ where: { id: runId, plan: { teamId } }, select: { id: true } });
  if (!run) return false;
  await db.testRun.updateMany({ where: { id: run.id, status: "queued" }, data: { status: "cancelled", finishedAt: new Date() } });
  await db.testRun.updateMany({ where: { id: run.id, status: "running" }, data: { status: "cancelling" } });
  return true;
}

/** Looks up a stored screenshot or trace path. Only paths recorded by the worker can ever be served. */
export async function getRunFile(teamId: string, runId: string, resultId: string, kind: "screenshot" | "trace" | "video") {
  const result = await db.testRunResult.findFirst({
    where: { id: resultId, runId, run: { plan: { teamId } } },
    select: { screenshot: true, trace: true, video: true, testCaseId: true },
  });
  const path = result?.[kind];
  return path ? { path, testCaseId: result.testCaseId } : null;
}

/** Records the team's decision for one failure. `triage` null clears it. */
export async function setTriage(user: { id: string; teamId: string }, runId: string, resultId: string, triage: "bug" | "test_issue" | null) {
  const { count } = await db.testRunResult.updateMany({
    where: { id: resultId, runId, status: { not: "passed" }, run: { plan: { teamId: user.teamId } } },
    data: triage ? { triage, triagedById: user.id, triagedAt: new Date() } : { triage: null, triagedById: null, triagedAt: null },
  });
  return count === 1;
}

export type FollowUpResult = { ok: true; planId: string } | { ok: false; error: string };

/**
 * Creates a new plan holding only the chosen failed or blocked test cases of a finished run,
 * copied from the exact plan version that ran.
 */
export async function createFollowUpPlan(user: { id: string; teamId: string }, runId: string, resultIds: string[], name: string): Promise<FollowUpResult> {
  return db.$transaction(async (tx) => {
    const run = await tx.testRun.findFirst({
      where: { id: runId, plan: { teamId: user.teamId } },
      select: {
        id: true,
        status: true,
        versionId: true,
        version: { select: { qualityStatus: true } },
        results: { where: { id: { in: resultIds }, status: { not: "passed" } }, select: { testCaseId: true } },
      },
    });
    if (!run) return { ok: false, error: "This run was not found in your team." };
    if (ACTIVE_STATUSES.includes(run.status)) return { ok: false, error: "Wait for the run to finish first." };
    const ids = [...new Set(run.results.map((r) => r.testCaseId))];
    if (!ids.length) return { ok: false, error: "Choose at least one failed or blocked test." };

    const testCases = await tx.testCase.findMany({
      where: { versionId: run.versionId, externalId: { in: ids } },
      orderBy: { position: "asc" },
      select: { externalId: true, name: true, quality: true, steps: { orderBy: { position: "asc" }, select: { action: true, target: true, value: true, expected: true } } },
    });
    if (!testCases.length) return { ok: false, error: "The failed test cases could not be found." };

    const plan = await tx.testPlan.create({
      data: {
        name,
        teamId: user.teamId,
        createdById: user.id,
        sourceRunId: run.id,
        versions: {
          create: {
            version: 1,
            fileName: `${testCases.length} failed test${testCases.length === 1 ? "" : "s"} from an earlier run`,
            format: "follow-up",
            uploadedById: user.id,
            qualityStatus: run.version.qualityStatus,
            testCases: {
              create: testCases.map((tc, position) => ({
                position,
                externalId: tc.externalId,
                name: tc.name,
                quality: (tc.quality ?? undefined) as Prisma.InputJsonValue | undefined,
                steps: { create: tc.steps.map((step, stepPosition) => ({ position: stepPosition, ...step })) },
              })),
            },
          },
        },
      },
      select: { id: true },
    });
    return { ok: true, planId: plan.id };
  });
}

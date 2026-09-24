import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import type { ImportFormat, TestCaseInput } from "./test-cases/format";
import type { QualityRun } from "./test-cases/quality";

type Upload = { fileName: string; format: ImportFormat; testCases: TestCaseInput[]; quality: QualityRun };

function versionData(upload: Upload, uploadedById: string) {
  return {
    fileName: upload.fileName.slice(0, 255),
    format: upload.format,
    uploadedById,
    qualityStatus: upload.quality.status,
    testCases: {
      create: upload.testCases.map((testCase, position) => ({
        position,
        externalId: testCase.id,
        name: testCase.name,
        quality: (upload.quality.byId.get(testCase.id) ?? undefined) as Prisma.InputJsonValue | undefined,
        steps: {
          create: testCase.steps.map((step, stepPosition) => ({
            position: stepPosition,
            action: step.action,
            target: step.target ?? null,
            value: step.value ?? null,
            expected: step.expected ?? null,
          })),
        },
      })),
    },
  };
}

export async function createPlan(user: { id: string; teamId: string }, name: string, upload: Upload) {
  return db.testPlan.create({
    data: {
      name,
      teamId: user.teamId,
      createdById: user.id,
      versions: { create: { version: 1, ...versionData(upload, user.id) } },
    },
    select: { id: true },
  });
}

/** Adds the next version to a plan in the user's team. Returns null when the plan is not theirs. */
export async function addPlanVersion(user: { id: string; teamId: string }, planId: string, upload: Upload) {
  return db.$transaction(async (tx) => {
    const plan = await tx.testPlan.findFirst({
      where: { id: planId, teamId: user.teamId },
      select: { id: true, versions: { orderBy: { version: "desc" }, take: 1, select: { version: true } } },
    });
    if (!plan) return null;
    const version = (plan.versions[0]?.version ?? 0) + 1;
    await tx.testPlanVersion.create({ data: { planId: plan.id, version, ...versionData(upload, user.id) } });
    await tx.testPlan.update({ where: { id: plan.id }, data: { updatedAt: new Date() } });
    return { id: plan.id, version };
  });
}

/** Loads a plan for the user's team with one version: the requested one, or the latest. */
export async function getPlanForTeam(teamId: string, planId: string, versionNumber?: number) {
  const plan = await db.testPlan.findFirst({
    where: { id: planId, teamId },
    select: {
      id: true,
      name: true,
      createdAt: true,
      createdById: true,
      createdBy: { select: { name: true } },
      versions: {
        orderBy: { version: "desc" },
        select: { version: true, fileName: true, format: true, createdAt: true, uploadedBy: { select: { name: true } } },
      },
    },
  });
  if (!plan || !plan.versions.length) return null;

  const wanted = versionNumber ?? plan.versions[0].version;
  const version = await db.testPlanVersion.findUnique({
    where: { planId_version: { planId: plan.id, version: wanted } },
    select: {
      version: true,
      fileName: true,
      format: true,
      qualityStatus: true,
      createdAt: true,
      uploadedBy: { select: { name: true } },
      testCases: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          externalId: true,
          name: true,
          quality: true,
          steps: { orderBy: { position: "asc" }, select: { id: true, action: true, target: true, value: true, expected: true } },
        },
      },
    },
  });
  if (!version) return null;
  return { ...plan, latestVersion: plan.versions[0].version, version };
}

export async function listPlansForTeam(teamId: string) {
  const plans = await db.testPlan.findMany({
    where: { teamId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      updatedAt: true,
      createdBy: { select: { name: true } },
      versions: { orderBy: { version: "desc" }, take: 1, select: { version: true, _count: { select: { testCases: true } } } },
      runs: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true, passed: true, failed: true, blocked: true } },
    },
  });
  return plans.map(({ versions, runs, ...plan }) => ({
    ...plan,
    lastRun: runs[0] ?? null,
    version: versions[0]?.version ?? 0,
    testCaseCount: versions[0]?._count.testCases ?? 0,
  }));
}

/** Plan creators and team admins may delete a plan. */
export function canDeletePlan(user: { id: string; role: string }, plan: { createdById: string }) {
  return user.role === "ADMIN" || plan.createdById === user.id;
}

export type DeleteResult = "deleted" | "not_found" | "forbidden";

/** Deletes a plan with all its versions, test cases and steps. Only within the user's team. */
export async function deletePlan(user: { id: string; role: string; teamId: string }, planId: string): Promise<DeleteResult> {
  return db.$transaction(async (tx) => {
    const plan = await tx.testPlan.findFirst({ where: { id: planId, teamId: user.teamId }, select: { id: true, createdById: true } });
    if (!plan) return "not_found";
    if (!canDeletePlan(user, plan)) return "forbidden";
    await tx.testPlan.delete({ where: { id: plan.id } });
    return "deleted";
  });
}

export type RemoveCaseResult =
  | { status: "removed"; version: number }
  | { status: "not_found" | "last_case" | "outdated" };

/**
 * Removes one test case by creating a new version without it. Earlier versions are never changed,
 * so past results keep pointing to the tests that actually ran. Quality scores are copied, not re-scored.
 */
export async function removeTestCase(user: { id: string; teamId: string }, planId: string, testCaseId: string): Promise<RemoveCaseResult> {
  return db.$transaction(async (tx) => {
    const plan = await tx.testPlan.findFirst({
      where: { id: planId, teamId: user.teamId },
      select: {
        id: true,
        versions: {
          orderBy: { version: "desc" },
          take: 1,
          select: {
            version: true,
            qualityStatus: true,
            testCases: {
              orderBy: { position: "asc" },
              select: {
                id: true,
                externalId: true,
                name: true,
                quality: true,
                steps: { orderBy: { position: "asc" }, select: { action: true, target: true, value: true, expected: true } },
              },
            },
          },
        },
      },
    });
    const latest = plan?.versions[0];
    if (!plan || !latest) return { status: "not_found" };

    const removed = latest.testCases.find((testCase) => testCase.id === testCaseId);
    // Only the latest version can be edited; a stale page must reload first.
    if (!removed) return { status: "outdated" };
    if (latest.testCases.length === 1) return { status: "last_case" };

    const version = latest.version + 1;
    await tx.testPlanVersion.create({
      data: {
        planId: plan.id,
        version,
        fileName: `Removed ${removed.externalId} from version ${latest.version}`,
        format: "edit",
        uploadedById: user.id,
        qualityStatus: latest.qualityStatus,
        testCases: {
          create: latest.testCases
            .filter((testCase) => testCase.id !== testCaseId)
            .map((testCase, position) => ({
              position,
              externalId: testCase.externalId,
              name: testCase.name,
              quality: (testCase.quality ?? undefined) as Prisma.InputJsonValue | undefined,
              steps: { create: testCase.steps.map((step, stepPosition) => ({ position: stepPosition, ...step })) },
            })),
        },
      },
    });
    await tx.testPlan.update({ where: { id: plan.id }, data: { updatedAt: new Date() } });
    return { status: "removed", version };
  });
}

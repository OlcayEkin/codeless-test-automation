"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { DEMO_PLAN_NAME, demoPlanData } from "@/lib/demo";
import { addPlanVersion, createPlan, deletePlan, removeTestCase } from "@/lib/plans";
import { openNotification, markAllRead } from "@/lib/notifications";
import { cancelRun, createFollowUpPlan, createSchedule, deleteSchedule, setScheduleActive, setTriage, startRun } from "@/lib/runs";
import { isRepeat } from "@/lib/schedule";
import { requireUser } from "@/lib/session";
import { IMPORT_LIMITS, type ImportIssue, type TestType } from "@/lib/test-cases/format";
import { parseUpload } from "@/lib/test-cases/parse";
import { scoreTestCases } from "@/lib/test-cases/quality";

export type UploadState = { error?: string; issues?: ImportIssue[]; hiddenIssueCount?: number; name?: string };

const planNameSchema = z.string().trim().min(1, "Give the plan a name.").max(100, "Keep the name under 100 characters.");

/** Reads, validates and scores an uploaded file. Returns either the parsed upload or what to show the user. */
async function readUpload(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { state: { error: "Choose an Excel, CSV or JSON file to upload." } };
  if (file.size > IMPORT_LIMITS.maxFileBytes) return { state: { error: "The file is larger than 5 MB." } };

  const result = await parseUpload(file.name, new Uint8Array(await file.arrayBuffer()));
  if (!result.ok) {
    const shown = result.issues.slice(0, IMPORT_LIMITS.maxIssuesShown);
    return {
      state: {
        error: `The file has ${result.issues.length} problem${result.issues.length === 1 ? "" : "s"}. Fix ${result.issues.length === 1 ? "it" : "them"} and upload again.`,
        issues: shown,
        hiddenIssueCount: result.issues.length - shown.length,
      },
    };
  }
  const quality = await scoreTestCases(result.testCases);
  return { upload: { fileName: file.name, format: result.format, testCases: result.testCases, quality } };
}

export async function createPlanAction(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const user = await requireUser();
  const rawName = String(formData.get("name") ?? "");
  const name = planNameSchema.safeParse(rawName);
  if (!name.success) return { error: name.error.issues[0].message, name: rawName };

  const { state, upload } = await readUpload(formData);
  if (!upload) return { ...state, name: rawName };

  let planId: string;
  try {
    planId = (await createPlan({ id: user.id, teamId: user.teamId }, name.data, upload)).id;
  } catch (error) {
    console.error("Saving the test plan failed", error);
    return { error: "The plan could not be saved. Please try again.", name: rawName };
  }
  redirect(`/plans/${planId}`);
}

export async function uploadVersionAction(planId: string, _prev: UploadState, formData: FormData): Promise<UploadState> {
  const user = await requireUser();
  const { state, upload } = await readUpload(formData);
  if (!upload) return state;

  let saved: Awaited<ReturnType<typeof addPlanVersion>>;
  try {
    saved = await addPlanVersion({ id: user.id, teamId: user.teamId }, planId, upload);
  } catch (error) {
    console.error("Saving the new version failed", error);
    return { error: "The new version could not be saved. Please try again." };
  }
  if (!saved) return { error: "This test plan was not found in your team." };
  redirect(`/plans/${saved.id}?version=${saved.version}`);
}

export type DeleteState = { error?: string };

export async function deletePlanAction(planId: string): Promise<DeleteState> {
  const user = await requireUser();
  let result: Awaited<ReturnType<typeof deletePlan>>;
  try {
    result = await deletePlan({ id: user.id, role: user.role, teamId: user.teamId }, planId);
  } catch (error) {
    console.error("Deleting the test plan failed", error);
    return { error: "The plan could not be deleted. Please try again." };
  }
  if (result === "not_found") return { error: "This test plan was not found in your team." };
  if (result === "forbidden") return { error: "Only the person who created this plan or a team admin can delete it." };
  redirect("/dashboard?deleted=1");
}

export async function deleteTestCaseAction(planId: string, testCaseId: string): Promise<DeleteState> {
  const user = await requireUser();
  let result: Awaited<ReturnType<typeof removeTestCase>>;
  try {
    result = await removeTestCase({ id: user.id, teamId: user.teamId }, planId, testCaseId);
  } catch (error) {
    console.error("Deleting the test case failed", error);
    return { error: "The test case could not be deleted. Please try again." };
  }
  switch (result.status) {
    case "not_found":
      return { error: "This test plan was not found in your team." };
    case "outdated":
      return { error: "This page is out of date. Reload it and try again." };
    case "last_case":
      return { error: "A plan needs at least one test case. Delete the whole plan instead." };
  }
  redirect(`/plans/${planId}?version=${result.version}`);
}

export type RunState = { error?: string };

export async function startRunAction(planId: string, _prev: RunState, formData: FormData): Promise<RunState> {
  const user = await requireUser();
  const types = formData.getAll("type").filter((t): t is TestType => t === "web" || t === "api");
  const settings = { types, browser: String(formData.get("browser") ?? ""), headless: formData.get("showBrowser") !== "on" };

  if (formData.get("when") === "schedule") {
    const repeat = String(formData.get("repeat") ?? "");
    if (!isRepeat(repeat)) return { error: "Choose how often to repeat." };
    // The browser converts the chosen local time to an exact moment, so time zones cannot shift it.
    const startAt = new Date(String(formData.get("startAtIso") ?? ""));
    let scheduled: Awaited<ReturnType<typeof createSchedule>>;
    try {
      scheduled = await createSchedule({ id: user.id, teamId: user.teamId }, planId, settings, startAt, repeat);
    } catch (error) {
      console.error("Creating the schedule failed", error);
      return { error: "The schedule could not be saved. Please try again." };
    }
    if (!scheduled.ok) return { error: scheduled.error };
    redirect(`/plans/${planId}?scheduled=1`);
  }

  let result: Awaited<ReturnType<typeof startRun>>;
  try {
    result = await startRun({ id: user.id, teamId: user.teamId }, planId, settings);
  } catch (error) {
    console.error("Starting the run failed", error);
    return { error: "The run could not be started. Please try again." };
  }
  if (!result.ok) return { error: result.error };
  redirect(`/runs/${result.runId}`);
}

export async function cancelRunAction(runId: string): Promise<void> {
  const user = await requireUser();
  await cancelRun(user.teamId, runId);
  revalidatePath(`/runs/${runId}`);
}

export async function setTriageAction(runId: string, resultId: string, triage: "bug" | "test_issue" | null): Promise<void> {
  const user = await requireUser();
  if (triage !== null && triage !== "bug" && triage !== "test_issue") return;
  await setTriage({ id: user.id, teamId: user.teamId }, runId, resultId, triage);
  revalidatePath(`/runs/${runId}`);
}

export type FollowUpState = { error?: string };

export async function createFollowUpAction(runId: string, _prev: FollowUpState, formData: FormData): Promise<FollowUpState> {
  const user = await requireUser();
  const name = planNameSchema.safeParse(String(formData.get("name") ?? ""));
  if (!name.success) return { error: name.error.issues[0].message };
  const resultIds = formData.getAll("result").map(String).slice(0, 1000);

  let result: Awaited<ReturnType<typeof createFollowUpPlan>>;
  try {
    result = await createFollowUpPlan({ id: user.id, teamId: user.teamId }, runId, resultIds, name.data);
  } catch (error) {
    console.error("Creating the follow-up plan failed", error);
    return { error: "The follow-up plan could not be created. Please try again." };
  }
  if (!result.ok) return { error: result.error };
  redirect(`/plans/${result.planId}`);
}

export async function setScheduleActiveAction(planId: string, scheduleId: string, active: boolean): Promise<void> {
  const user = await requireUser();
  const problem = await setScheduleActive(user.teamId, scheduleId, active);
  if (problem) redirect(`/plans/${planId}?scheduleError=${encodeURIComponent(problem)}`);
  revalidatePath(`/plans/${planId}`);
}

export async function deleteScheduleAction(planId: string, scheduleId: string): Promise<void> {
  const user = await requireUser();
  await deleteSchedule(user.teamId, scheduleId);
  revalidatePath(`/plans/${planId}`);
}

export async function openNotificationAction(id: string): Promise<void> {
  const user = await requireUser();
  const notification = await openNotification(user.id, id);
  redirect(notification?.runId ? `/runs/${notification.runId}` : "/notifications");
}

export async function markAllReadAction(): Promise<void> {
  const user = await requireUser();
  await markAllRead(user.id);
  revalidatePath("/notifications");
}

/** Adds the demo plan to the user's team, or opens it when the team already has one. */
export async function loadDemoPlanAction(): Promise<void> {
  const user = await requireUser();
  const existing = await db.testPlan.findFirst({ where: { teamId: user.teamId, name: DEMO_PLAN_NAME }, select: { id: true } });
  const plan = existing ?? (await db.testPlan.create({ data: await demoPlanData({ id: user.id, teamId: user.teamId }), select: { id: true } }));
  redirect(`/plans/${plan.id}${existing ? "" : "?demo=1"}`);
}

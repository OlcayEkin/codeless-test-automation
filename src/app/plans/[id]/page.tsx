import Link from "next/link";
import { TopBar } from "@/components/top-bar";
import { notFound } from "next/navigation";
import { canDeletePlan, getPlanForTeam } from "@/lib/plans";
import { listRunsForPlan, listSchedulesForPlan } from "@/lib/runs";
import { requireUser } from "@/lib/session";
import type { TestCaseQuality } from "@/lib/test-cases/quality";
import { DeletePlanButton } from "./delete-plan-button";
import { QualitySummary } from "./quality-summary";
import { RecentRuns } from "./recent-runs";
import { ScheduleList } from "./schedule-list";
import { TestCaseList } from "./test-case-list";
import { VersionList } from "./version-list";
import { UploadVersionForm } from "./upload-version-form";

export const metadata = { title: "Test plan" };

const FORMAT_LABEL: Record<string, string> = { xlsx: "Excel", csv: "CSV", json: "JSON" };
/** Versions that did not come from an uploaded file; their fileName already describes them. */
const DESCRIBED_FORMATS = new Set(["edit", "follow-up", "demo"]);
const formatDate = (date: Date) => date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

export default async function PlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ version?: string; scheduled?: string; scheduleError?: string; demo?: string; added?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { version: versionParam, scheduled, scheduleError, demo, added } = await searchParams;
  const requested = versionParam && /^\d{1,6}$/.test(versionParam) ? Number(versionParam) : undefined;

  const plan = await getPlanForTeam(user.teamId, id, requested);
  if (!plan) notFound();
  const [runs, schedules] = await Promise.all([listRunsForPlan(user.teamId, plan.id), listSchedulesForPlan(user.teamId, plan.id)]);
  const { version } = plan;
  const isLatest = version.version === plan.latestVersion;
  const flagged = version.testCases.filter((tc) => (tc.quality as TestCaseQuality | null)?.flags.length).length;

  return (
    <>
      <TopBar user={user} />
      <main className="page">
      <p>
        <Link href="/dashboard">← Test plans</Link>
      </p>
      <div className="page-head">
        <div>
          <h1>{plan.name}</h1>
          <p className="muted">
            Version {version.version} · {version.testCases.length} test cases ·{" "}
            {DESCRIBED_FORMATS.has(version.format) ? version.fileName : `${FORMAT_LABEL[version.format] ?? version.format} file “${version.fileName}”`} ·{" "}
            {version.format === "edit" ? "changed" : version.format === "follow-up" ? "created" : "uploaded"} by {version.uploadedBy.name} on {formatDate(version.createdAt)}
          </p>
        </div>
        <div className="head-actions">
          <Link href={`/plans/${plan.id}/run`} className="button">
            ▶ Run tests
          </Link>
          {canDeletePlan(user, plan) && <DeletePlanButton planId={plan.id} planName={plan.name} versionCount={plan.versions.length} />}
        </div>
      </div>

      {added && (
        <p className="notice ok" role="status">
          {added.slice(0, 20)} is saved to the plan.
        </p>
      )}
      {demo === "1" && (
        <p className="notice ok" role="status">
          The demo plan is ready. Press ▶ Run tests to watch it run. One test fails on purpose, so you can try the failure review.
        </p>
      )}
      {scheduled === "1" && (
        <p className="notice ok" role="status">
          The schedule is saved. You will get a notification when each scheduled run finishes.
        </p>
      )}
      {scheduleError && (
        <p className="notice warn" role="alert">
          {scheduleError.slice(0, 200)}
        </p>
      )}

      {!isLatest && (
        <p className="notice" role="status">
          You are viewing an older version. <Link href={`/plans/${plan.id}`}>Go to the latest version ({plan.latestVersion})</Link>.
        </p>
      )}

      <QualitySummary status={version.qualityStatus} flagged={flagged} total={version.testCases.length} />

      {isLatest && (
        <p className="cases-head">
          <Link href={`/plans/${plan.id}/test-cases/new`} className="button secondary-button">
            + Create test case
          </Link>
        </p>
      )}
      <TestCaseList plan={plan} testCases={version.testCases} editable={isLatest} />

      <div className="columns">
        <RecentRuns runs={runs} />

        <ScheduleList planId={plan.id} schedules={schedules} />

        <section className="card">
          <h2>Upload a new version</h2>
          <p className="muted">The new file replaces the test cases. Earlier versions stay available below.</p>
          <UploadVersionForm planId={plan.id} />
        </section>

        <VersionList planId={plan.id} versions={plan.versions} current={version.version} />
      </div>
      </main>
    </>
  );
}

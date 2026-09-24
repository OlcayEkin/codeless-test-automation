import Link from "next/link";
import { TopBar } from "@/components/top-bar";
import { notFound } from "next/navigation";
import { canDeletePlan, getPlanForTeam } from "@/lib/plans";
import { listRunsForPlan, listSchedulesForPlan } from "@/lib/runs";
import { describeSchedule, formatWhen, isRepeat } from "@/lib/schedule";
import { requireUser } from "@/lib/session";
import type { TestCaseQuality } from "@/lib/test-cases/quality";
import { describeQuality } from "@/lib/test-cases/quality-text";
import { deleteScheduleAction, setScheduleActiveAction } from "../actions";
import { DeletePlanButton } from "./delete-plan-button";
import { DeleteTestCaseButton } from "./delete-test-case-button";
import { UploadVersionForm } from "./upload-version-form";

const FORMAT_LABEL: Record<string, string> = { xlsx: "Excel", csv: "CSV", json: "JSON" };
/** Versions that did not come from an uploaded file; their fileName already describes them. */
const DESCRIBED_FORMATS = new Set(["edit", "follow-up"]);
const formatDate = (date: Date) => date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

export default async function PlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ version?: string; scheduled?: string; scheduleError?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { version: versionParam, scheduled, scheduleError } = await searchParams;
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

      <section aria-label="Test cases" className="cases">
        {version.testCases.map((testCase) => {
          const quality = testCase.quality as TestCaseQuality | null;
          return (
            <details key={testCase.id} className="case card">
              <summary>
                <span className="case-id">{testCase.externalId}</span>
                <span className="case-name">{testCase.name}</span>
                <span className="muted">{testCase.steps.length} steps</span>
                {quality?.flags.map((flag) => (
                  <span key={flag} className="badge warn">
                    {flag}
                  </span>
                ))}
                {quality && !quality.flags.length && <span className="badge ok">Looks good</span>}
                {isLatest && <DeleteTestCaseButton planId={plan.id} testCaseId={testCase.id} externalId={testCase.externalId} />}
              </summary>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Action</th>
                      <th>Target</th>
                      <th>Value</th>
                      <th>Expected result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {testCase.steps.map((step, i) => (
                      <tr key={step.id}>
                        <td>{i + 1}</td>
                        <td>
                          <code>{step.action}</code>
                        </td>
                        <td className="wrap">{step.target}</td>
                        <td className="wrap">{step.value}</td>
                        <td className="wrap">{step.expected}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {quality && (
                <div className="review">
                  <p className="review-title">Our first review:</p>
                  <ul>
                    {describeQuality(quality).map((note) => (
                      <li key={note.text} className={`note ${note.tone}`}>
                        <span aria-hidden="true" className="note-icon">
                          {note.tone === "good" ? "✓" : "!"}
                        </span>
                        {note.text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </details>
          );
        })}
      </section>

      <div className="columns">
        <section className="card">
          <h2>Recent runs</h2>
          {runs.length ? (
            <ul className="versions">
              {runs.map((run) => (
                <li key={run.id}>
                  <Link href={`/runs/${run.id}`}>{run.createdAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</Link>{" "}
                  <span className="muted">
                    · version {run.version.version} · {run.status === "completed" ? `${run.passed} passed, ${run.failed} failed, ${run.blocked} blocked` : run.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No runs yet. Press Run tests to start one.</p>
          )}
        </section>

        <section className="card" aria-labelledby="schedules-heading">
          <h2 id="schedules-heading">Schedules</h2>
          {schedules.length ? (
            <ul className="schedules">
              {schedules.map((schedule) => (
                <li key={schedule.id} className="schedule">
                  <div>
                    <strong>{isRepeat(schedule.repeat) ? describeSchedule(schedule.repeat, schedule.startAt) : schedule.repeat}</strong>
                    <span className="muted small">
                      {schedule.testTypes.split(",").map((t) => t.toUpperCase()).join(" + ")} · Chrome · {schedule.headless ? "headless" : "browser shown"} · by{" "}
                      {schedule.createdBy.name}
                    </span>
                    <span className={schedule.active ? "small" : "muted small"}>
                      {schedule.active && schedule.nextRunAt ? `Next run: ${formatWhen(schedule.nextRunAt)}` : "Paused"}
                    </span>
                  </div>
                  <div className="schedule-actions">
                    <form action={setScheduleActiveAction.bind(null, plan.id, schedule.id, !schedule.active)}>
                      <button type="submit" className="secondary small-button">
                        {schedule.active ? "Pause" : "Resume"}
                      </button>
                    </form>
                    <form action={deleteScheduleAction.bind(null, plan.id, schedule.id)}>
                      <button type="submit" className="secondary small-button" aria-label={`Delete schedule: ${isRepeat(schedule.repeat) ? describeSchedule(schedule.repeat, schedule.startAt) : ""}`}>
                        Delete
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No schedules. Choose “Schedule a date and repeat” when you run tests.</p>
          )}
        </section>

        <section className="card">
          <h2>Upload a new version</h2>
          <p className="muted">The new file replaces the test cases. Earlier versions stay available below.</p>
          <UploadVersionForm planId={plan.id} />
        </section>

        <section className="card">
          <h2>Versions</h2>
          <ol className="versions" reversed>
            {plan.versions.map((v) => (
              <li key={v.version}>
                {v.version === version.version ? (
                  <strong>Version {v.version}</strong>
                ) : (
                  <Link href={`/plans/${plan.id}?version=${v.version}`}>Version {v.version}</Link>
                )}{" "}
                <span className="muted">
                  · {v.fileName} · {v.uploadedBy.name} · {formatDate(v.createdAt)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
      </main>
    </>
  );
}

function QualitySummary({ status, flagged, total }: { status: string; flagged: number; total: number }) {
  if (status === "unavailable") {
    return <p className="notice">Jev was not reachable during this upload, so these test cases have no quality scores.</p>;
  }
  if (status === "skipped") return <p className="notice">Quality scoring is turned off in this environment.</p>;
  return (
    <p className={flagged ? "notice warn" : "notice ok"} role="status">
      {flagged
        ? `Jev flagged ${flagged} of ${total} test cases. Open them to see why. Flags are advice; the plan can still run.`
        : `Jev found no quality problems in the ${total} test cases.`}
    </p>
  );
}

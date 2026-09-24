import Link from "next/link";
import { TopBar } from "@/components/top-bar";
import { notFound } from "next/navigation";
import { cancelRunAction, setTriageAction } from "@/app/plans/actions";
import { ACTIVE_STATUSES, getRunForTeam } from "@/lib/runs";
import { requireUser } from "@/lib/session";
import { TRIAGE_LABEL, describeSuggestion, type Triage } from "@/lib/triage";
import { AutoRefresh } from "./auto-refresh";
import { FollowUpForm } from "./follow-up-form";
import { ResultsChart } from "./results-chart";

export const metadata = { title: "Test run" };

const STATUS_TEXT: Record<string, string> = {
  queued: "Waiting for the worker to start…",
  running: "Running",
  cancelling: "Stopping after the current test case…",
  completed: "Finished",
  cancelled: "Cancelled",
  error: "Stopped with an error",
};
const RESULT_LABEL: Record<string, string> = { passed: "Pass", failed: "Fail", blocked: "Blocked" };
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const formatDate = (date: Date) => date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const run = await getRunForTeam(user.teamId, id);
  if (!run) notFound();

  const active = ACTIVE_STATUSES.includes(run.status);
  const done = run.passed + run.failed + run.blocked;
  const types = run.testTypes.split(",").map((t) => t.toUpperCase()).join(" + ");
  const failures = run.results.filter((r) => r.status !== "passed");
  const untagged = failures.filter((r) => !r.triage).length;
  const bugs = failures.filter((r) => r.triage === "bug").length;
  const fileLink = (resultId: string, kind: string) => `/runs/${run.id}/files/${resultId}/${kind}`;

  return (
    <>
      <TopBar user={user} />
      <main className="page">
      {active && <AutoRefresh intervalMs={1500} />}
      <p>
        <Link href={`/plans/${run.plan.id}`}>← {run.plan.name}</Link>
      </p>
      <div className="page-head">
        <div>
          <h1>Test run</h1>
          <p className="muted">
            Version {run.version.version} · {types} · Chrome · {run.headless ? "headless" : "browser shown"} · started by {run.requestedBy.name} on{" "}
            {formatDate(run.createdAt)}
          </p>
        </div>
        {(run.status === "queued" || run.status === "running") && (
          <form action={cancelRunAction.bind(null, run.id)}>
            <button type="submit" className="secondary">
              Cancel run
            </button>
          </form>
        )}
      </div>

      <section className="card run-status" aria-label="Run status">
        <p className={`run-state ${run.status}`} role="status">
          {STATUS_TEXT[run.status] ?? run.status}
          {run.status === "running" && ` · ${done} of ${run.total}`}
        </p>
        <ResultsChart passed={run.passed} failed={run.failed} blocked={run.blocked} total={run.total} finished={!active} />
        {run.error && <p className="error">{run.error}</p>}
      </section>

      {!active && failures.length > 0 && (
        <section aria-labelledby="review-heading" className="review-section">
          <div className="page-head">
            <h2 id="review-heading">Failures to review</h2>
            <p className={untagged ? "muted" : "notice ok"} role={untagged ? undefined : "status"}>
              {untagged
                ? `${untagged} of ${failures.length} still to tag as a bug or a test blockage.`
                : `Test reporting complete: ${bugs} bug${bugs === 1 ? "" : "s"} and ${failures.length - bugs} test blockage${failures.length - bugs === 1 ? "" : "s"}.`}
            </p>
          </div>

          <div className="cases">
            {failures.map((result) => (
              <article key={result.id} className="card failure" aria-label={`${result.testCaseId} ${result.name}`}>
                <header className="failure-head">
                  <span className={`result ${result.status}`}>{RESULT_LABEL[result.status]}</span>
                  <span className="case-id">{result.testCaseId}</span>
                  <strong>{result.name}</strong>
                </header>
                <p>
                  Step {result.failedStep}: {result.error}
                </p>
                <p className="file-links">
                  {result.screenshot && (
                    <a href={fileLink(result.id, "screenshot")} target="_blank" rel="noreferrer">
                      Screenshot
                    </a>
                  )}
                  {result.video && (
                    <a href={fileLink(result.id, "video")} target="_blank" rel="noreferrer">
                      Video
                    </a>
                  )}
                  {result.trace && <a href={fileLink(result.id, "trace")}>Trace</a>}
                </p>
                {result.bugLikelihood !== null && (
                  <p className="suggestion">
                    <strong>Our first review:</strong> {describeSuggestion(result.bugLikelihood)}
                  </p>
                )}
                <div className="triage" role="group" aria-label={`Tag ${result.testCaseId}`}>
                  <span className="muted">This is a</span>
                  {(["bug", "test_issue"] as Triage[]).map((value) => {
                    const selected = result.triage === value;
                    return (
                      <form key={value} action={setTriageAction.bind(null, run.id, result.id, selected ? null : value)}>
                        <button type="submit" className={selected ? `tag selected ${value}` : "tag secondary"} aria-pressed={selected}>
                          {selected ? "✓ " : ""}
                          {TRIAGE_LABEL[value]}
                        </button>
                      </form>
                    );
                  })}
                  {result.triagedBy && result.triagedAt && (
                    <span className="muted small">
                      Tagged by {result.triagedBy.name} on {formatDate(result.triagedAt)}
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>

          <div className="card">
            <h2>Follow-up plan</h2>
            {run.followUpPlans.length > 0 && (
              <p className="muted">
                Already created:{" "}
                {run.followUpPlans.map((plan, i) => (
                  <span key={plan.id}>
                    {i > 0 && ", "}
                    <Link href={`/plans/${plan.id}`}>{plan.name}</Link>
                  </span>
                ))}
              </p>
            )}
            <p className="muted">Put the failed and blocked tests into a new plan, so you can run just those again once they are fixed.</p>
            <FollowUpForm runId={run.id} planName={run.plan.name} failures={failures.map(({ id, testCaseId, name, status }) => ({ id, testCaseId, name, status }))} />
          </div>
        </section>
      )}

      {run.results.length > 0 && (
        <section aria-labelledby="all-results-heading">
          <h2 id="all-results-heading">All results</h2>
          <div className="table-wrap">
            <table className="table" aria-label="Test results">
              <thead>
                <tr>
                  <th>Result</th>
                  <th>Test case</th>
                  <th>Time</th>
                  <th>What happened</th>
                </tr>
              </thead>
              <tbody>
                {run.results.map((result) => (
                  <tr key={result.id}>
                    <td>
                      <span className={`result ${result.status}`}>{RESULT_LABEL[result.status] ?? result.status}</span>
                    </td>
                    <td>
                      <span className="case-id">{result.testCaseId}</span> {result.name}
                    </td>
                    <td>{seconds(result.durationMs)}</td>
                    <td className="wrap">
                      {result.error ? (
                        <>
                          Step {result.failedStep}: {result.error}
                          {result.triage && <span className="badge">{TRIAGE_LABEL[result.triage as Triage]}</span>}
                        </>
                      ) : (
                        <span className="muted">All steps passed.</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {!active && run.results.some((r) => r.trace) && (
        <p className="muted small">
          To replay a trace step by step, download it and run: <code>npx playwright show-trace trace.zip</code>
        </p>
      )}
      </main>
    </>
  );
}

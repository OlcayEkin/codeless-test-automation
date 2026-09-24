import { LastRun } from "@/components/last-run";

type Run = { id: string; status: string; passed: number; failed: number; blocked: number; createdAt: Date; version: { version: number } };

export function RecentRuns({ runs }: { runs: Run[] }) {
  return (
    <section className="card" aria-labelledby="recent-runs-heading">
      <h2 id="recent-runs-heading">Recent runs</h2>
      {runs.length ? (
        <ul className="versions">
          {runs.map((run) => (
            <li key={run.id}>
              <span className="muted">
                {run.createdAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · version {run.version.version} ·
              </span>{" "}
              <LastRun run={run} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No runs yet. Press Run tests to start one.</p>
      )}
    </section>
  );
}

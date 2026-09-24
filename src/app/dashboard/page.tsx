import Link from "next/link";
import { LastRun } from "@/components/last-run";
import { TopBar } from "@/components/top-bar";
import { DEMO_PLAN_NAME } from "@/lib/demo";
import { listPlansForTeam } from "@/lib/plans";
import { loadDemoPlanAction } from "../plans/actions";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Test plans" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const user = await requireUser();
  const plans = await listPlansForTeam(user.teamId);
  const { deleted } = await searchParams;

  return (
    <>
      <TopBar user={user} />

      <main className="page">
        <div className="page-head">
          <h1>Test plans</h1>
          <div className="head-actions">
            {!plans.some((plan) => plan.name === DEMO_PLAN_NAME) && (
              <form action={loadDemoPlanAction}>
                <button type="submit" className="secondary">
                  Load demo plan
                </button>
              </form>
            )}
            <Link href="/plans/new" className="button">
              Create test plan
            </Link>
          </div>
        </div>

        {deleted === "1" && (
          <p className="notice ok" role="status">
            The test plan was deleted.
          </p>
        )}

        {plans.length === 0 ? (
          <section className="card empty">
            <h2>No test plans yet</h2>
            <p className="muted">Upload test cases from Excel, CSV or JSON to create your team&apos;s first plan, or load the demo plan to see a full run first.</p>
          </section>
        ) : (
          <table className="table" aria-label="Test plans">
            <thead>
              <tr>
                <th>Name</th>
                <th>Test cases</th>
                <th>Version</th>
                <th>Last run</th>
                <th>Created by</th>
                <th>Last updated</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id}>
                  <td>
                    <Link href={`/plans/${plan.id}`}>{plan.name}</Link>
                  </td>
                  <td>{plan.testCaseCount}</td>
                  <td>{plan.version}</td>
                  <td>
                    <LastRun run={plan.lastRun} />
                  </td>
                  <td>{plan.createdBy.name}</td>
                  <td>{plan.updatedAt.toLocaleString("en-GB")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </>
  );
}

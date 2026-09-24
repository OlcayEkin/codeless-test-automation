import Link from "next/link";
import { notFound } from "next/navigation";
import { TopBar } from "@/components/top-bar";
import { getPlanForTeam } from "@/lib/plans";
import { requireUser } from "@/lib/session";
import { nextTestCaseId } from "@/lib/test-cases/format";
import { CreateTestCaseForm } from "./create-test-case-form";

export const metadata = { title: "Create a test case" };

export default async function NewTestCasePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const plan = await getPlanForTeam(user.teamId, id);
  if (!plan) notFound();
  const nextId = nextTestCaseId(plan.version.testCases.map((tc) => tc.externalId));

  return (
    <>
      <TopBar user={user} />
      <main className="page narrow">
        <p>
          <Link href={`/plans/${plan.id}`}>← {plan.name}</Link>
        </p>
        <h1>Create a test case</h1>
        <p className="muted">
          It will be saved as {nextId} in {plan.name}, as version {plan.latestVersion + 1}. Earlier versions stay as they are.
        </p>
        <CreateTestCaseForm planId={plan.id} baseVersion={plan.latestVersion} />
      </main>
    </>
  );
}

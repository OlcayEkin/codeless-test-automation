import Link from "next/link";
import { TopBar } from "@/components/top-bar";
import { requireUser } from "@/lib/session";
import { CreatePlanForm } from "./create-plan-form";

export default async function NewPlanPage() {
  const user = await requireUser();
  return (
    <>
      <TopBar user={user} />
      <main className="page narrow">
      <p>
        <Link href="/dashboard">← Test plans</Link>
      </p>
      <h1>Create a test plan</h1>
      <p className="muted">Upload your test cases. Every file is checked before anything is saved, and Jev scores each test case for quality.</p>
      <CreatePlanForm />
      </main>
    </>
  );
}

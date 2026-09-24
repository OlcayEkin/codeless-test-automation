import Link from "next/link";
import { TopBar } from "@/components/top-bar";
import { notFound } from "next/navigation";
import { getRunSetup } from "@/lib/runs";
import { requireUser } from "@/lib/session";
import { RunSettingsForm } from "./run-settings-form";

export const metadata = { title: "Run tests" };

export default async function RunSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const setup = await getRunSetup(user.teamId, id);
  if (!setup) notFound();

  return (
    <>
      <TopBar user={user} />
      <main className="page narrow">
      <p>
        <Link href={`/plans/${setup.id}`}>← {setup.name}</Link>
      </p>
      <h1>Run tests</h1>
      <p className="muted">
        Runs version {setup.version} of {setup.name}. You can follow the progress live.
      </p>
      <RunSettingsForm planId={setup.id} counts={setup.counts} />
      </main>
    </>
  );
}

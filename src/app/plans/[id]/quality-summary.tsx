export function QualitySummary({ status, flagged, total }: { status: string; flagged: number; total: number }) {
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

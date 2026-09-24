import Link from "next/link";

type Run = { id: string; status: string; passed: number; failed: number; blocked: number };

const IN_PROGRESS: Record<string, { emoji: string; text: string }> = {
  queued: { emoji: "⏳", text: "Waiting to start" },
  running: { emoji: "🏃", text: "Running now" },
  cancelling: { emoji: "🏃", text: "Stopping" },
  cancelled: { emoji: "🛑", text: "Cancelled" },
  error: { emoji: "⚠️", text: "Stopped with an error" },
};

/** A plan's latest run at a glance: emoji and counts, with the full wording on hover and for screen readers. */
export function LastRun({ run }: { run: Run | null }) {
  if (!run) return <span className="muted">Never run</span>;

  if (run.status !== "completed") {
    const state = IN_PROGRESS[run.status] ?? { emoji: "•", text: run.status };
    return (
      <Link href={`/runs/${run.id}`} className="last-run">
        <span aria-hidden="true">{state.emoji}</span> {state.text}
      </Link>
    );
  }

  const total = run.passed + run.failed + run.blocked;
  const parts = [
    { emoji: "✅", count: run.passed, word: "passed" },
    { emoji: "❌", count: run.failed, word: "failed" },
    { emoji: "🚧", count: run.blocked, word: "blocked" },
  ].filter((part) => part.count > 0);
  const description = parts.map((part) => `${part.count} ${part.word}`).join(", ");

  return (
    <Link href={`/runs/${run.id}`} className="last-run" title={description}>
      {run.passed === total ? (
        <>
          <span aria-hidden="true">✅</span> All {total} passed
        </>
      ) : (
        <>
          <span aria-hidden="true" className="last-run-parts">
            {parts.map((part) => (
              <span key={part.word}>
                {part.emoji} {part.count}
              </span>
            ))}
          </span>
          <span className="sr-only">{description}</span>
        </>
      )}
    </Link>
  );
}

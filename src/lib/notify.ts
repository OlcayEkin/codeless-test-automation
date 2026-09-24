/**
 * Messages sent when a run finishes. Used by the worker. Email is printed to the worker's console
 * for the local proof of concept; the server version will plug a real email service in here.
 */

export type FinishedRun = {
  id: string;
  status: string;
  planName: string;
  passed: number;
  failed: number;
  blocked: number;
  total: number;
  scheduled: boolean;
  error?: string | null;
};

export function runNotification(run: FinishedRun): { title: string; body: string } {
  const how = run.scheduled ? "Scheduled run" : "Run";
  if (run.status === "cancelled") return { title: `🛑 ${run.planName}: run cancelled`, body: `${how} was cancelled after ${run.passed + run.failed + run.blocked} of ${run.total} tests.` };
  if (run.status === "error") return { title: `⚠️ ${run.planName}: run stopped`, body: `${how} stopped with an error: ${run.error ?? "unknown error"}` };

  if (!run.failed && !run.blocked) return { title: `✅ ${run.planName}: all ${run.total} passed`, body: `${how} finished. Every test passed.` };
  const problems = [run.failed && `${run.failed} failed`, run.blocked && `${run.blocked} blocked`].filter(Boolean).join(", ");
  return {
    title: `❌ ${run.planName}: ${problems}`,
    body: `${how} finished: ${run.passed} passed, ${problems}, of ${run.total}. Review the failures and tag them as bugs or test blockages.`,
  };
}

export type Email = { to: string; subject: string; text: string };

/** Local proof of concept: print the email instead of sending it. */
export async function sendEmail(email: Email): Promise<void> {
  console.log(["", "──── Email (not sent: local mode) ────", `To:      ${email.to}`, `Subject: ${email.subject}`, "", email.text, "──────────────────────────────────────", ""].join("\n"));
}

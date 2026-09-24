/**
 * Our first review of a failed or blocked test: is it more likely a bug in the application,
 * or a problem with the test or its environment? The team always makes the final call.
 */
import { askJev, type NoulAnswer } from "./jev";
import type { TestCaseInput } from "./test-cases/format";

export type Triage = "bug" | "test_issue";
export const TRIAGE_LABEL: Record<Triage, string> = { bug: "Bug", test_issue: "Test blockage" };

const QUESTION = {
  product_bug: {
    type: "noul" as const,
    instructions:
      "Given `test_case` and how it ended in `result`, is the most likely cause a real defect in the application being tested (a bug), " +
      "rather than a problem with the test itself or its environment? Test problems include a wrong or outdated selector, outdated expected text " +
      "or test data, a step in the wrong order, a slow or unreachable server, or a page that is down. " +
      "A 'blocked' result means a step could not run at all; a 'failed' result means a check did not hold.",
  },
};

/** Returns the probability of a real bug, or null when Jev is turned off or unavailable. Never throws. */
export async function suggestTriage(
  testCase: TestCaseInput,
  result: { status: string; failedStep?: number; error?: string },
): Promise<number | null> {
  if (process.env.JEV_DISABLED === "1" || !process.env.TYPESAFE_API_KEY) return null;
  try {
    const answers = await askJev<{ product_bug: NoulAnswer }>(
      { test_case: testCase, result: { status: result.status, failed_step: result.failedStep, error: result.error } },
      QUESTION,
      { timeoutMs: 20_000 },
    );
    return answers.product_bug.noul;
  } catch (error) {
    console.error("Triage suggestion failed; continuing without it.", error instanceof Error ? error.message : error);
    return null;
  }
}

/** Plain words for the suggestion, shown next to the team's own decision. */
export function describeSuggestion(bugLikelihood: number): string {
  if (bugLikelihood >= 0.7) return "This looks like a bug in the application.";
  if (bugLikelihood <= 0.3) return "This looks like a problem with the test or its environment, not the application.";
  return "It is unclear whether this is a bug or a test problem. Check the screenshot or video.";
}

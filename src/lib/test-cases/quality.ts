// Used by the web app and by scripts. The API key is only ever read from server-side environment variables.
import { askJev, type NoulAnswer, type ScoreAnswer } from "../jev";
import type { TestCaseInput } from "./format";

/** Stored on each test case. Scores stay raw so thresholds can change without asking Jev again. */
export type TestCaseQuality = {
  clarity: number; // 0 (unclear) to 3 (very clear)
  verifiesGoal: number; // probability that the checks verify what the name says
  fragileSelectors: number; // probability that selectors are fragile
  flags: string[];
};
export type QualityRun = { status: "scored" | "unavailable" | "skipped"; byId: Map<string, TestCaseQuality> };

const THRESHOLDS = { minClarity: 1.5, minVerifiesGoal: 0.5, maxFragileSelectors: 0.6 };
const CONCURRENCY = 4;

const QUESTIONS = {
  clarity: {
    type: "score" as const,
    instructions:
      "How clearly and specifically do the steps in `test_case` describe what to do, so that a tester could automate and review them without guessing?",
    criteria: [
      "Unclear: steps are vague, missing important details or in a confusing order.",
      "Partly clear: the idea is understandable but some steps need guessing.",
      "Clear: steps are specific and ordered, with minor gaps.",
      "Very clear: every step is specific, ordered and easy to review.",
    ],
  },
  verifies_goal: {
    type: "noul" as const,
    instructions:
      "Do the check steps in `test_case` (actions starting with expect_) actually verify the outcome that `test_case.name` says is being tested?",
  },
  fragile_selectors: {
    type: "noul" as const,
    instructions:
      "Do the `target` selectors in `test_case` rely on fragile locators, such as long CSS paths, nth-child positions or auto-generated class names, rather than stable ones like ids, test ids, labels, roles or names? URLs are not selectors.",
  },
};

type Answers = { clarity: ScoreAnswer; verifies_goal: NoulAnswer; fragile_selectors: NoulAnswer };

function toQuality(answers: Answers): TestCaseQuality {
  const quality = {
    clarity: answers.clarity.score,
    verifiesGoal: answers.verifies_goal.noul,
    fragileSelectors: answers.fragile_selectors.noul,
    flags: [] as string[],
  };
  if (quality.clarity < THRESHOLDS.minClarity) quality.flags.push("Steps are unclear");
  if (quality.verifiesGoal < THRESHOLDS.minVerifiesGoal) quality.flags.push("Checks may not verify the test's goal");
  if (quality.fragileSelectors > THRESHOLDS.maxFragileSelectors) quality.flags.push("Fragile selectors");
  return quality;
}

/**
 * Asks Jev to score every test case. Never throws: if Jev is unavailable the upload still succeeds,
 * and the plan is marked as not scored.
 */
export async function scoreTestCases(testCases: TestCaseInput[]): Promise<QualityRun> {
  if (process.env.JEV_DISABLED === "1") return { status: "skipped", byId: new Map() };

  const byId = new Map<string, TestCaseQuality>();
  const queue = [...testCases];
  try {
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        for (let testCase = queue.shift(); testCase; testCase = queue.shift()) {
          const answers = await askJev<Answers>({ test_case: testCase }, QUESTIONS, { timeoutMs: 30_000 });
          byId.set(testCase.id, toQuality(answers));
        }
      }),
    );
    return { status: "scored", byId };
  } catch (error) {
    console.error("Jev scoring failed; saving the plan without quality scores.", error);
    return { status: "unavailable", byId: new Map() };
  }
}

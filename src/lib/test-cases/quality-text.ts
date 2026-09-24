/**
 * Turns Jev's raw scores into sentences a tester can act on. Pure code, so pages and tests can share it.
 * The bands match the flag thresholds in quality.ts, so a flag and its sentence always agree.
 */

export type QualityScores = { clarity: number; verifiesGoal: number; fragileSelectors: number };
export type QualityNote = { tone: "good" | "fair" | "poor"; text: string };

export function describeQuality({ clarity, verifiesGoal, fragileSelectors }: QualityScores): QualityNote[] {
  return [
    clarity >= 2.5
      ? { tone: "good", text: "The steps are clear and easy to follow." }
      : clarity >= 1.5
        ? { tone: "fair", text: "The steps are mostly clear, but a few could be more specific." }
        : { tone: "poor", text: "The steps are hard to follow. Add more detail so anyone can run them the same way." },
    verifiesGoal >= 0.8
      ? { tone: "good", text: "The checks confirm what this test is meant to prove." }
      : verifiesGoal >= 0.5
        ? { tone: "fair", text: "The checks only partly confirm what this test is meant to prove." }
        : { tone: "poor", text: "The checks don't confirm what the test's name promises. Add a check for the expected outcome." },
    fragileSelectors <= 0.3
      ? { tone: "good", text: "Page elements are located in a stable way." }
      : fragileSelectors <= 0.6
        ? { tone: "fair", text: "Some page elements may be hard to find after a design change." }
        : { tone: "poor", text: "Page elements are located by their position or styling, so the test may break when the page changes. Prefer ids, labels or test ids." },
  ];
}

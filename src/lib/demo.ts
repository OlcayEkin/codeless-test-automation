/**
 * A ready-made plan for demos: the template tests against a public practice site,
 * plus one test that fails on purpose so the failure review has something to show.
 * Shared by the dashboard's "Load demo plan" button and `npm run demo:seed`.
 */
import type { Prisma } from "../generated/prisma/client";
import type { TestCaseInput } from "./test-cases/format";
import { scoreTestCases } from "./test-cases/quality";
import { SAMPLE_TEST_CASES } from "./test-cases/templates";

export const DEMO_PLAN_NAME = "Demo: practice site login";

export const DEMO_TEST_CASES: TestCaseInput[] = [
  ...SAMPLE_TEST_CASES,
  {
    id: "TC-004",
    name: "Login page greets the user by name",
    steps: [
      { action: "open", target: "https://the-internet.herokuapp.com/login", expected: "Login page is shown" },
      // Fails on purpose: the page says "Login Page", not a personal greeting.
      { action: "expect_text", target: "h2", value: "Welcome back", expected: "A personal greeting is shown" },
    ],
  },
];

/** The data for a new demo plan, with Jev quality scores when a key is configured. */
export async function demoPlanData(user: { id: string; teamId: string }): Promise<Prisma.TestPlanCreateInput> {
  const quality = await scoreTestCases(DEMO_TEST_CASES);
  return {
    name: DEMO_PLAN_NAME,
    team: { connect: { id: user.teamId } },
    createdBy: { connect: { id: user.id } },
    versions: {
      create: {
        version: 1,
        fileName: "Demo plan: the templates plus one test that fails on purpose",
        format: "demo",
        uploadedBy: { connect: { id: user.id } },
        qualityStatus: quality.status,
        testCases: {
          create: DEMO_TEST_CASES.map((testCase, position) => ({
            position,
            externalId: testCase.id,
            name: testCase.name,
            quality: (quality.byId.get(testCase.id) ?? undefined) as Prisma.InputJsonValue | undefined,
            steps: {
              create: testCase.steps.map((step, stepPosition) => ({
                position: stepPosition,
                action: step.action,
                target: step.target ?? null,
                value: step.value ?? null,
                expected: step.expected ?? null,
              })),
            },
          })),
        },
      },
    },
  };
}

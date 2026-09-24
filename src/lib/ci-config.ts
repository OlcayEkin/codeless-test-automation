/**
 * Plan configuration for running through CI: validation and the GitHub Actions workflow file.
 * Plain code with no server dependencies, so the form, the server and the tests share it.
 */
import { z } from "zod";

export const RUNNER_REPOSITORY = "OlcayEkin/codeless-test-automation";
export const DEFAULT_WORKFLOW_FILE = "codeless-tests.yml";

const repository = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/, "Enter the repository as owner/name, for example my-org/my-app.");
const workflowFile = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9._-]{1,100}\.ya?ml$/, "Enter the workflow file name, for example codeless-tests.yml.");
const branch = z
  .string()
  .trim()
  .min(1, "Enter a branch, for example main.")
  .max(255)
  .regex(/^(?!\/)(?!.*\.\.)(?!.*\/$)[^\s~^:?*[\\]+$/, "Enter a valid branch name, for example main.");
const baseUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => value === "" || /^https?:\/\/[^\s]+$/.test(value), "The base address must start with http:// or https://.");

export const ciSettingsSchema = z.object({ repository, workflowFile, branch, baseUrl });
export type CiSettings = z.infer<typeof ciSettingsSchema>;

/** The workflow users add to their repository. The app starts it and passes the plan's test cases in. */
export function githubWorkflowYaml(): string {
  return `name: Codeless tests
run-name: Codeless run \${{ inputs.run_id }}

# Started by the Codeless Test Automation app. Add this file to your repository's default branch.
on:
  workflow_dispatch:
    inputs:
      run_id:
        description: Run id from the app
        required: true
      test_cases:
        description: The plan's test cases, as base64 JSON
        required: true
      base_url:
        description: Base address for steps such as open /login
        required: false
        default: ""

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    env:
      DATABASE_URL: file:./ci.db
    steps:
      - uses: actions/checkout@v4
        with:
          repository: ${RUNNER_REPOSITORY}
          path: codeless
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: codeless/package-lock.json
      - run: npm ci
        working-directory: codeless
      - name: Run the test cases
        working-directory: codeless
        env:
          TEST_CASES: \${{ inputs.test_cases }}
          BASE_URL: \${{ inputs.base_url }}
        run: |
          echo "$TEST_CASES" | base64 -d > ../plan.json
          npm run tests:run -- --file ../plan.json --out ../codeless-results \${BASE_URL:+--base-url "$BASE_URL"}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: codeless-results
          path: codeless-results
`;
}

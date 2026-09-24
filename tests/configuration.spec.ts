import { createServer, type Server } from "node:http";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { expect, test, type Page } from "@playwright/test";
import { FAKE_GITHUB_PORT } from "../playwright.config";
import { PrismaClient } from "../src/generated/prisma/client";
import { SAMPLE_TEST_CASES, toCsv } from "../src/lib/test-cases/templates";
import { MEMBER, signIn } from "./helpers";

// A fake GitHub API: one repository, good-org/app, with a main branch and the codeless workflow,
// readable only with the token "good-token".
let github: Server;
test.beforeAll(async () => {
  github = createServer((req, res) => {
    const json = (status: number, body: unknown) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
    if (req.headers.authorization !== "Bearer good-token") return json(401, { message: "Bad credentials" });
    switch (req.url) {
      case "/repos/good-org/app":
        return json(200, { full_name: "good-org/app", permissions: { push: true } });
      case "/repos/good-org/app/branches/main":
        return json(200, { name: "main" });
      case "/repos/good-org/app/actions/workflows/codeless-tests.yml":
        return json(200, { state: "active" });
      default:
        return json(404, { message: "Not Found" });
    }
  });
  await new Promise<void>((done) => github.listen(FAKE_GITHUB_PORT, "127.0.0.1", done));
});
test.afterAll(() => github.close());

async function openPlan(page: Page, name: string) {
  await signIn(page, MEMBER.login, MEMBER.password);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/plans/new");
  await page.getByLabel("Plan name").fill(name);
  await page.getByLabel("Test case file").setInputFiles({ name: "p.csv", mimeType: "text/csv", buffer: Buffer.from(toCsv(SAMPLE_TEST_CASES)) });
  await page.getByRole("button", { name: "Create test plan" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  return page.getByRole("region", { name: "Configuration" });
}

async function fillCi(config: ReturnType<Page["getByRole"]>, values: { repository?: string; branch?: string; token?: string }) {
  await config.getByLabel("CI").check();
  if (values.repository !== undefined) await config.getByLabel("Repository", { exact: true }).fill(values.repository);
  if (values.branch !== undefined) await config.getByLabel("Branch", { exact: true }).fill(values.branch);
  if (values.token !== undefined) await config.getByLabel("Access token").fill(values.token);
  await config.getByRole("button", { name: "Save and test connection" }).click();
}

test("plans run locally by default and need no settings", async ({ page }) => {
  const config = await openPlan(page, "Local plan");
  await expect(config.getByLabel("Local")).toBeChecked();
  await expect(config.getByLabel("Repository", { exact: true })).toHaveCount(0);
  await config.getByRole("button", { name: "Save" }).click();
  await expect(config.getByText("Saved. Tests run on this computer.")).toBeVisible();
});

test("a working GitHub connection shows ACCESS and keeps the token secret", async ({ page }) => {
  const config = await openPlan(page, "CI plan");
  await fillCi(config, { repository: "good-org/app", token: "good-token" });

  const status = config.getByRole("status", { name: "Connection status" });
  await expect(status).toContainText("ACCESS");
  await expect(status).toContainText("Connected to good-org/app: branch main and workflow codeless-tests.yml were found.");
  await expect(config.getByLabel("Access token")).toHaveAttribute("placeholder", "Saved token ending in oken; leave empty to keep it");

  // The token is stored encrypted, never as plain text.
  const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: "file:./data/e2e.db" }) });
  const saved = await db.planConfig.findFirstOrThrow({ where: { plan: { name: "CI plan" } } });
  await db.$disconnect();
  expect(saved.tokenEncrypted).toBeTruthy();
  expect(saved.tokenEncrypted).not.toContain("good-token");

  await config.getByRole("button", { name: "Test connection again" }).click();
  await expect(status).toContainText("ACCESS");
});

test("problems show FAILED TO CONNECT with the reason", async ({ page }) => {
  const config = await openPlan(page, "Broken CI plan");
  const status = config.getByRole("status", { name: "Connection status" });

  await fillCi(config, { repository: "good-org/app", token: "wrong-token" });
  await expect(status).toContainText("FAILED TO CONNECT");
  await expect(status).toContainText("GitHub did not accept the access token.");

  await fillCi(config, { repository: "good-org/missing", token: "good-token" });
  await expect(status).toContainText("The repository good-org/missing was not found, or the token cannot see it.");

  // Leaving the token empty keeps the saved one; only the branch changes here.
  await fillCi(config, { repository: "good-org/app", branch: "develop", token: "" });
  await expect(status).toContainText("The branch develop was not found in good-org/app.");
});

test("invalid settings are refused before connecting", async ({ page }) => {
  const config = await openPlan(page, "Invalid CI plan");
  await fillCi(config, { repository: "not a repository", token: "good-token" });
  await expect(config.getByRole("alert")).toHaveText("Enter the repository as owner/name, for example my-org/my-app.");
  await expect(config.getByRole("status", { name: "Connection status" })).toHaveCount(0);
});

test("after saving, the form still shows the saved choice", async ({ page }) => {
  const config = await openPlan(page, "Saved choice plan");
  await fillCi(config, { repository: "good-org/app", token: "good-token" });
  await expect(config.getByRole("status", { name: "Connection status" })).toContainText("ACCESS");
  await expect(config.getByLabel("CI")).toBeChecked();
  await expect(config.getByLabel("Local")).not.toBeChecked();
  await expect(config.getByLabel("Repository", { exact: true })).toHaveValue("good-org/app");

  await page.reload();
  await expect(config.getByLabel("CI")).toBeChecked();
});

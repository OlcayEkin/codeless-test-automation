import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../src/generated/prisma/client";
import { toCsv } from "../src/lib/test-cases/templates";
import { SCHEDULER, signIn } from "./helpers";

// The test reaches into the e2e database only to make a schedule due now instead of waiting for it.
const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: "file:./data/e2e.db" }) });

let server: Server;
let site: string;
test.beforeAll(async () => {
  server = createServer((req, res) => res.writeHead(req.url === "/api/health" ? 200 : 404).end());
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  site = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
test.afterAll(async () => {
  server.close();
  await db.$disconnect();
});

/** "2026-09-25T09:00" for tomorrow at 09:00 local time, the format a datetime-local input takes. */
function tomorrowAtNine() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`;
}

async function createPlanAndOpenRunSettings(page: Page, name: string) {
  await signIn(page, SCHEDULER.login, SCHEDULER.password);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/plans/new");
  await page.getByLabel("Plan name").fill(name);
  const testCases = [{ id: "TC-1", name: "Health", steps: [{ action: "api_request" as const, target: `${site}/api/health` }, { action: "expect_status" as const, value: "200" }] }];
  await page.getByLabel("Test case file").setInputFiles({ name: "p.csv", mimeType: "text/csv", buffer: Buffer.from(toCsv(testCases)) });
  await page.getByRole("button", { name: "Create test plan" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await page.getByRole("link", { name: "▶ Run tests" }).click();
}

async function schedule(page: Page, when: string, repeat: string) {
  await page.getByLabel("Schedule a date and repeat").check();
  await page.getByLabel("Start date and time").fill(when);
  await page.getByRole("combobox", { name: /^Repeat/ }).selectOption({ label: repeat });
  await page.getByRole("button", { name: "Save schedule" }).click();
}

test("schedule a repeating run, then stop, continue and delete it", async ({ page }) => {
  await createPlanAndOpenRunSettings(page, "Nightly checks");
  await schedule(page, tomorrowAtNine(), "Every weekday (Monday to Friday)");

  await expect(page.getByRole("status")).toHaveText("The schedule is saved. You will get a notification when each scheduled run finishes.");
  const schedules = page.getByRole("region", { name: "Schedules" });
  await expect(schedules).toContainText("Every weekday at 09:00");
  await expect(schedules).toContainText(/Next run: \w{3} \d+ \w+, 09:00/);

  await schedules.getByRole("button", { name: "Stop" }).click();
  await expect(schedules).toContainText("Stopped");
  await schedules.getByRole("button", { name: "Continue" }).click();
  await expect(schedules).toContainText(/Next run: .*09:00/);

  await schedules.getByRole("button", { name: /^Delete schedule/ }).click();
  await expect(schedules).toContainText("No schedules.");
});

test("a start time in the past is refused", async ({ page }) => {
  await createPlanAndOpenRunSettings(page, "Past schedule");
  await schedule(page, "2020-01-01T09:00", "Once");
  await expect(page.locator("form").getByRole("alert")).toHaveText("The start time is in the past. Choose a later time.");
});

test("a due schedule starts a run, and the user is notified when it finishes", async ({ page }) => {
  await createPlanAndOpenRunSettings(page, "Scheduled smoke");
  await schedule(page, tomorrowAtNine(), "Every day");
  await expect(page.getByRole("status")).toContainText("The schedule is saved.");
  const planUrl = page.url().replace(/\?.*$/, "");

  // Pretend tomorrow has come: make the schedule due now.
  const plan = await db.testPlan.findFirstOrThrow({ where: { name: "Scheduled smoke" }, select: { id: true } });
  await db.testSchedule.updateMany({ where: { planId: plan.id }, data: { nextRunAt: new Date(Date.now() - 1000) } });

  // The worker queues and runs it; the plan page then lists the finished run.
  await expect(async () => {
    await page.goto(planUrl);
    await expect(page.getByRole("region", { name: "Schedules" }).locator(".schedule")).toHaveCount(1);
    await expect(page.getByRole("region", { name: "Recent runs" }).getByRole("link", { name: "All 1 passed" })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 60_000 });
  // It repeats daily, so it is still active with a next run in the future.
  await expect(page.getByRole("region", { name: "Schedules" })).toContainText(/Next run: .*09:00/);

  const bell = page.getByRole("link", { name: "Notifications, 1 unread" });
  await expect(bell).toBeVisible();
  await bell.click();
  const item = page.getByRole("list", { name: "Notifications" }).getByRole("listitem").first();
  await expect(item).toContainText("✅ Scheduled smoke: all 1 passed");
  await expect(item).toContainText("Scheduled run finished. Every test passed.");

  await item.getByRole("button").click();
  await expect(page).toHaveURL(/\/runs\/\w+$/);
  await expect(page.getByRole("link", { name: "Notifications", exact: true })).toBeVisible();
});

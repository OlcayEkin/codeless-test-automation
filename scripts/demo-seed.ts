/**
 * Adds the demo plan for the first admin, and optionally starts a run of it.
 *
 *   npm run demo:seed
 *   npm run demo:seed -- --run      # also queue a run; `npm run dev` must be running to execute it
 */
import { parseArgs } from "node:util";
import { config } from "dotenv";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { DEMO_PLAN_NAME, DEMO_TEST_CASES, demoPlanData } from "../src/lib/demo";

config({ path: ".env.local", quiet: true });
const { values } = parseArgs({ options: { run: { type: "boolean", default: false } } });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

async function main() {
  const admin = await db.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, select: { id: true, teamId: true, name: true } });
  if (!admin) throw new Error("No admin user found. Run `npm run db:seed` first.");

  let plan = await db.testPlan.findFirst({ where: { teamId: admin.teamId, name: DEMO_PLAN_NAME }, select: { id: true } });
  if (plan) {
    console.log(`The demo plan already exists.`);
  } else {
    plan = await db.testPlan.create({ data: await demoPlanData(admin), select: { id: true } });
    console.log(`Created "${DEMO_PLAN_NAME}" with ${DEMO_TEST_CASES.length} test cases for ${admin.name}.`);
  }

  if (values.run) {
    const version = await db.testPlanVersion.findFirstOrThrow({ where: { planId: plan.id }, orderBy: { version: "desc" }, select: { id: true } });
    await db.testRun.create({
      data: { planId: plan.id, versionId: version.id, requestedById: admin.id, testTypes: "web,api", browser: "chrome", headless: true, total: DEMO_TEST_CASES.length },
    });
    console.log("Queued a run. It starts as soon as the worker is running (npm run dev).");
  }
  console.log(`Open it at ${process.env.APP_URL || "http://localhost:3001"}/plans/${plan.id}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

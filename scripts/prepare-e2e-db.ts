/**
 * Rebuilds the throwaway end-to-end test database from scratch.
 * Refuses to touch anything except data/e2e.db, so it can never wipe your dev data.
 */
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

const EXPECTED_URL = "file:./data/e2e.db";
const url = process.env.DATABASE_URL;

if (url !== EXPECTED_URL) {
  console.error(`Refusing to prepare e2e database: DATABASE_URL must be ${EXPECTED_URL}, got ${url ?? "nothing"}.`);
  process.exit(1);
}

try {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) rmSync(`data/e2e.db${suffix}`, { force: true });
  rmSync("results-e2e", { recursive: true, force: true });
  execFileSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit" });
  execFileSync("npx", ["tsx", "prisma/seed.ts"], { stdio: "inherit" });
  execFileSync(
    "npx",
    ["tsx", "scripts/create-user.ts", "--username", "e2e-member", "--password", "e2e-Member-123", "--name", "E2E Member"],
    { stdio: "inherit" },
  );
  execFileSync(
    "npx",
    ["tsx", "scripts/create-user.ts", "--username", "e2e-teammate", "--password", "e2e-Teammate-123", "--name", "Teammate"],
    { stdio: "inherit" },
  );
  execFileSync(
    "npx",
    ["tsx", "scripts/create-user.ts", "--username", "e2e-scheduler", "--password", "e2e-Scheduler-123", "--name", "Scheduler"],
    { stdio: "inherit" },
  );
  execFileSync(
    "npx",
    ["tsx", "scripts/create-user.ts", "--username", "e2e-outsider", "--password", "e2e-Outsider-123", "--name", "Outsider", "--team", "Other Team"],
    { stdio: "inherit" },
  );
} catch (error) {
  console.error("Could not prepare the e2e database. See the output above for the failing step.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TestPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "sourceRunId" TEXT,
    CONSTRAINT "TestPlan_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestPlan_sourceRunId_fkey" FOREIGN KEY ("sourceRunId") REFERENCES "TestRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TestPlan" ("createdAt", "createdById", "id", "name", "teamId", "updatedAt") SELECT "createdAt", "createdById", "id", "name", "teamId", "updatedAt" FROM "TestPlan";
DROP TABLE "TestPlan";
ALTER TABLE "new_TestPlan" RENAME TO "TestPlan";
CREATE INDEX "TestPlan_teamId_idx" ON "TestPlan"("teamId");
CREATE TABLE "new_TestRunResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "browser" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "error" TEXT,
    "failedStep" INTEGER,
    "screenshot" TEXT,
    "trace" TEXT,
    "video" TEXT,
    "steps" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bugLikelihood" REAL,
    "triage" TEXT,
    "triagedById" TEXT,
    "triagedAt" DATETIME,
    CONSTRAINT "TestRunResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TestRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TestRunResult_triagedById_fkey" FOREIGN KEY ("triagedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TestRunResult" ("browser", "createdAt", "durationMs", "error", "failedStep", "id", "name", "position", "runId", "screenshot", "status", "steps", "testCaseId", "trace") SELECT "browser", "createdAt", "durationMs", "error", "failedStep", "id", "name", "position", "runId", "screenshot", "status", "steps", "testCaseId", "trace" FROM "TestRunResult";
DROP TABLE "TestRunResult";
ALTER TABLE "new_TestRunResult" RENAME TO "TestRunResult";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

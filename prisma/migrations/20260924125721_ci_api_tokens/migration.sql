-- CreateTable
CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME,
    "revokedAt" DATETIME,
    CONSTRAINT "ApiToken_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApiToken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TestRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "testTypes" TEXT NOT NULL,
    "browser" TEXT NOT NULL,
    "headless" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "total" INTEGER NOT NULL DEFAULT 0,
    "passed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "blocked" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "scheduleId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'app',
    "ciInfo" JSONB,
    CONSTRAINT "TestRun_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TestPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TestRun_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "TestPlanVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TestRun_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestRun_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "TestSchedule" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TestRun" ("blocked", "browser", "createdAt", "error", "failed", "finishedAt", "headless", "id", "passed", "planId", "requestedById", "scheduleId", "startedAt", "status", "testTypes", "total", "versionId") SELECT "blocked", "browser", "createdAt", "error", "failed", "finishedAt", "headless", "id", "passed", "planId", "requestedById", "scheduleId", "startedAt", "status", "testTypes", "total", "versionId" FROM "TestRun";
DROP TABLE "TestRun";
ALTER TABLE "new_TestRun" RENAME TO "TestRun";
CREATE INDEX "TestRun_status_createdAt_idx" ON "TestRun"("status", "createdAt");
CREATE INDEX "TestRun_planId_createdAt_idx" ON "TestRun"("planId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");

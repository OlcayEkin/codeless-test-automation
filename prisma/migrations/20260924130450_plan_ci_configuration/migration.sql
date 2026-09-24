/*
  Warnings:

  - You are about to drop the `ApiToken` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ApiToken";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "PlanConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'local',
    "provider" TEXT NOT NULL DEFAULT 'github',
    "repository" TEXT,
    "workflowFile" TEXT,
    "branch" TEXT,
    "baseUrl" TEXT,
    "tokenEncrypted" TEXT,
    "tokenHint" TEXT,
    "connectionStatus" TEXT,
    "connectionMessage" TEXT,
    "connectionCheckedAt" DATETIME,
    "updatedById" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlanConfig_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TestPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanConfig_planId_key" ON "PlanConfig"("planId");

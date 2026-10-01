-- CreateEnum
CREATE TYPE "PathwayQaRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "PathwayQaWorkbook" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sheetNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "caseCount" INTEGER NOT NULL DEFAULT 0,
    "conditionCount" INTEGER NOT NULL DEFAULT 0,
    "permutationCount" INTEGER NOT NULL DEFAULT 0,
    "parsed" JSONB NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PathwayQaWorkbook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PathwayQaRun" (
    "id" TEXT NOT NULL,
    "workbookId" TEXT NOT NULL,
    "pathwayId" TEXT NOT NULL,
    "status" "PathwayQaRunStatus" NOT NULL DEFAULT 'RUNNING',
    "matchedCondition" TEXT,
    "matchScore" DOUBLE PRECISION,
    "matchSuggestions" JSONB,
    "summary" JSONB,
    "results" JSONB,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "createdById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PathwayQaRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PathwayQaWorkbook_sha256_idx" ON "PathwayQaWorkbook"("sha256");

-- CreateIndex
CREATE INDEX "PathwayQaWorkbook_uploadedById_createdAt_idx" ON "PathwayQaWorkbook"("uploadedById", "createdAt");

-- CreateIndex
CREATE INDEX "PathwayQaWorkbook_createdAt_idx" ON "PathwayQaWorkbook"("createdAt");

-- CreateIndex
CREATE INDEX "PathwayQaRun_pathwayId_createdAt_idx" ON "PathwayQaRun"("pathwayId", "createdAt");

-- CreateIndex
CREATE INDEX "PathwayQaRun_workbookId_idx" ON "PathwayQaRun"("workbookId");

-- CreateIndex
CREATE INDEX "PathwayQaRun_createdById_createdAt_idx" ON "PathwayQaRun"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "PathwayQaRun_status_createdAt_idx" ON "PathwayQaRun"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "PathwayQaWorkbook" ADD CONSTRAINT "PathwayQaWorkbook_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PathwayQaRun" ADD CONSTRAINT "PathwayQaRun_workbookId_fkey" FOREIGN KEY ("workbookId") REFERENCES "PathwayQaWorkbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PathwayQaRun" ADD CONSTRAINT "PathwayQaRun_pathwayId_fkey" FOREIGN KEY ("pathwayId") REFERENCES "ClinicalPathway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PathwayQaRun" ADD CONSTRAINT "PathwayQaRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

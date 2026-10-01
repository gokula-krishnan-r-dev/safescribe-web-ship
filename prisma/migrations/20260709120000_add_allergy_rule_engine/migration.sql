-- CreateEnum
CREATE TYPE "AllergyDatasetStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'FAILED');

-- CreateTable
CREATE TABLE "AllergyRuleDataset" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "status" "AllergyDatasetStatus" NOT NULL DEFAULT 'ACTIVE',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "drugCount" INTEGER NOT NULL DEFAULT 0,
    "classCount" INTEGER NOT NULL DEFAULT 0,
    "validationStatus" TEXT NOT NULL DEFAULT 'pending',
    "parsingStatus" TEXT NOT NULL DEFAULT 'pending',
    "validationErrors" JSONB,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "AllergyRuleDataset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AllergyRuleDataset_isActive_idx" ON "AllergyRuleDataset"("isActive");

-- CreateIndex
CREATE INDEX "AllergyRuleDataset_uploadedAt_idx" ON "AllergyRuleDataset"("uploadedAt");

-- CreateIndex
CREATE INDEX "AllergyRuleDataset_status_idx" ON "AllergyRuleDataset"("status");

-- AddForeignKey
ALTER TABLE "AllergyRuleDataset" ADD CONSTRAINT "AllergyRuleDataset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

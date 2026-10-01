-- CreateEnum
CREATE TYPE "SafetyClinicalAction" AS ENUM ('HARD_STOP', 'PHARMACIST_REVIEW', 'MONITOR', 'INFO_ONLY');

-- CreateEnum
CREATE TYPE "SafetyInteractionSeverity" AS ENUM ('MAJOR', 'MODERATE', 'MINOR');

-- CreateEnum
CREATE TYPE "SafetyPregnancyCategory" AS ENUM ('CONTRAINDICATED', 'CAUTION', 'PREFERRED', 'UNKNOWN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SafetyRuleType" ADD VALUE 'DRUG_INTERACTION';
ALTER TYPE "SafetyRuleType" ADD VALUE 'PREGNANCY';

-- CreateTable
CREATE TABLE "SafetyDdiRuleDetail" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "drugA" TEXT NOT NULL,
    "drugB" TEXT NOT NULL,
    "interactionSeverity" "SafetyInteractionSeverity" NOT NULL,
    "actionRequired" "SafetyClinicalAction" NOT NULL DEFAULT 'PHARMACIST_REVIEW',

    CONSTRAINT "SafetyDdiRuleDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyPregnancyRuleDetail" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "drugName" TEXT NOT NULL,
    "pregnancyCategory" "SafetyPregnancyCategory" NOT NULL,
    "trimester" TEXT NOT NULL DEFAULT 'all',
    "clinicalNote" TEXT,
    "actionRequired" "SafetyClinicalAction" NOT NULL DEFAULT 'HARD_STOP',

    CONSTRAINT "SafetyPregnancyRuleDetail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SafetyDdiRuleDetail_versionId_key" ON "SafetyDdiRuleDetail"("versionId");

-- CreateIndex
CREATE INDEX "SafetyDdiRuleDetail_drugA_idx" ON "SafetyDdiRuleDetail"("drugA");

-- CreateIndex
CREATE INDEX "SafetyDdiRuleDetail_drugB_idx" ON "SafetyDdiRuleDetail"("drugB");

-- CreateIndex
CREATE UNIQUE INDEX "SafetyPregnancyRuleDetail_versionId_key" ON "SafetyPregnancyRuleDetail"("versionId");

-- CreateIndex
CREATE INDEX "SafetyPregnancyRuleDetail_drugName_idx" ON "SafetyPregnancyRuleDetail"("drugName");

-- AddForeignKey
ALTER TABLE "SafetyDdiRuleDetail" ADD CONSTRAINT "SafetyDdiRuleDetail_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SafetyRuleVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyPregnancyRuleDetail" ADD CONSTRAINT "SafetyPregnancyRuleDetail_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SafetyRuleVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

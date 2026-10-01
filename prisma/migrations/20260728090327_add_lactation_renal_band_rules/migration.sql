-- CreateEnum
CREATE TYPE "SafetyRenalBandSeverity" AS ENUM ('BLOCK', 'CAUTION', 'SAFE');

-- CreateEnum
CREATE TYPE "SafetyLactationRisk" AS ENUM ('HIGH_RISK', 'MODERATE_RISK', 'LOW_RISK', 'UNKNOWN');

-- AlterEnum
ALTER TYPE "SafetyClinicalAction" ADD VALUE 'NONE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SafetyRuleType" ADD VALUE 'LACTATION';
ALTER TYPE "SafetyRuleType" ADD VALUE 'RENAL_EGFR_BAND';

-- CreateTable
CREATE TABLE "SafetyLactationRuleDetail" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "drugName" TEXT NOT NULL,
    "lactationRisk" "SafetyLactationRisk" NOT NULL,
    "bandSeverity" "SafetyRenalBandSeverity" NOT NULL DEFAULT 'BLOCK',
    "clinicalNote" TEXT,
    "actionRequired" "SafetyClinicalAction" NOT NULL DEFAULT 'HARD_STOP',

    CONSTRAINT "SafetyLactationRuleDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyRenalRuleDetail" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "drugName" TEXT NOT NULL,
    "egfrMin" DOUBLE PRECISION NOT NULL,
    "egfrMax" DOUBLE PRECISION NOT NULL,
    "bandSeverity" "SafetyRenalBandSeverity" NOT NULL,
    "clinicalNote" TEXT,
    "actionRequired" "SafetyClinicalAction" NOT NULL DEFAULT 'PHARMACIST_REVIEW',

    CONSTRAINT "SafetyRenalRuleDetail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SafetyLactationRuleDetail_versionId_key" ON "SafetyLactationRuleDetail"("versionId");

-- CreateIndex
CREATE INDEX "SafetyLactationRuleDetail_drugName_idx" ON "SafetyLactationRuleDetail"("drugName");

-- CreateIndex
CREATE UNIQUE INDEX "SafetyRenalRuleDetail_versionId_key" ON "SafetyRenalRuleDetail"("versionId");

-- CreateIndex
CREATE INDEX "SafetyRenalRuleDetail_drugName_idx" ON "SafetyRenalRuleDetail"("drugName");

-- CreateIndex
CREATE INDEX "SafetyRenalRuleDetail_egfrMin_egfrMax_idx" ON "SafetyRenalRuleDetail"("egfrMin", "egfrMax");

-- AddForeignKey
ALTER TABLE "SafetyLactationRuleDetail" ADD CONSTRAINT "SafetyLactationRuleDetail_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SafetyRuleVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyRenalRuleDetail" ADD CONSTRAINT "SafetyRenalRuleDetail_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SafetyRuleVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "SafetyLabComparator" AS ENUM ('LT', 'LTE', 'GT', 'GTE', 'EQ', 'BETWEEN');

-- CreateEnum
CREATE TYPE "SafetyMissingLabAction" AS ENUM ('REQUIRE_REVIEW', 'SKIP_RULE');

-- AlterEnum
ALTER TYPE "SafetyRuleType" ADD VALUE 'LAB_THRESHOLD';

-- CreateTable
CREATE TABLE "SafetyLabRuleDetail" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "drugIngredient" TEXT NOT NULL,
    "observationKey" TEXT NOT NULL,
    "observationDisplay" TEXT,
    "loincCode" TEXT,
    "comparator" "SafetyLabComparator" NOT NULL,
    "thresholdLow" DOUBLE PRECISION,
    "thresholdHigh" DOUBLE PRECISION,
    "expectedUnit" TEXT,
    "maxAgeDays" INTEGER NOT NULL DEFAULT 365,
    "missingLabAction" "SafetyMissingLabAction" NOT NULL DEFAULT 'REQUIRE_REVIEW',

    CONSTRAINT "SafetyLabRuleDetail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SafetyLabRuleDetail_versionId_key" ON "SafetyLabRuleDetail"("versionId");

-- CreateIndex
CREATE INDEX "SafetyLabRuleDetail_observationKey_idx" ON "SafetyLabRuleDetail"("observationKey");

-- CreateIndex
CREATE INDEX "SafetyLabRuleDetail_drugIngredient_idx" ON "SafetyLabRuleDetail"("drugIngredient");

-- AddForeignKey
ALTER TABLE "SafetyLabRuleDetail" ADD CONSTRAINT "SafetyLabRuleDetail_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SafetyRuleVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

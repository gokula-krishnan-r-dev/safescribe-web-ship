-- AlterTable RenewMedicationIndicationMap
ALTER TABLE "RenewMedicationIndicationMap" ADD COLUMN IF NOT EXISTS "ingredientId" TEXT;
ALTER TABLE "RenewMedicationIndicationMap" ADD COLUMN IF NOT EXISTS "drugName" TEXT;
ALTER TABLE "RenewMedicationIndicationMap" ADD COLUMN IF NOT EXISTS "suggestionRank" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "RenewMedicationIndicationMap" ADD COLUMN IF NOT EXISTS "commonIndication" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "RenewMedicationIndicationMap" ADD COLUMN IF NOT EXISTS "ruleSetVersion" TEXT NOT NULL DEFAULT 'live';
ALTER TABLE "RenewMedicationIndicationMap" ADD COLUMN IF NOT EXISTS "sourceBatchId" TEXT;

CREATE INDEX IF NOT EXISTS "RenewMedicationIndicationMap_ingredientId_active_idx"
  ON "RenewMedicationIndicationMap"("ingredientId", "active");
CREATE INDEX IF NOT EXISTS "RenewMedicationIndicationMap_sourceBatchId_idx"
  ON "RenewMedicationIndicationMap"("sourceBatchId");

-- AlterTable RenewMonitoringInput
ALTER TABLE "RenewMonitoringInput" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "RenewMonitoringInput" ADD COLUMN IF NOT EXISTS "dataType" TEXT;
ALTER TABLE "RenewMonitoringInput" ADD COLUMN IF NOT EXISTS "uiComponent" TEXT;
ALTER TABLE "RenewMonitoringInput" ADD COLUMN IF NOT EXISTS "allowDate" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "RenewMonitoringInput" ADD COLUMN IF NOT EXISTS "allowNotAvailable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "RenewMonitoringInput" ADD COLUMN IF NOT EXISTS "normalRangeDisplay" TEXT;
ALTER TABLE "RenewMonitoringInput" ADD COLUMN IF NOT EXISTS "ruleSetVersion" TEXT NOT NULL DEFAULT 'live';
ALTER TABLE "RenewMonitoringInput" ADD COLUMN IF NOT EXISTS "sourceBatchId" TEXT;

CREATE INDEX IF NOT EXISTS "RenewMonitoringInput_sourceBatchId_idx"
  ON "RenewMonitoringInput"("sourceBatchId");

-- AlterTable RenewMonitoringRule
ALTER TABLE "RenewMonitoringRule" ADD COLUMN IF NOT EXISTS "ruleCode" TEXT;
ALTER TABLE "RenewMonitoringRule" ADD COLUMN IF NOT EXISTS "appliesToType" TEXT;
ALTER TABLE "RenewMonitoringRule" ADD COLUMN IF NOT EXISTS "appliesToId" TEXT;
ALTER TABLE "RenewMonitoringRule" ADD COLUMN IF NOT EXISTS "indicationId" TEXT;
ALTER TABLE "RenewMonitoringRule" ADD COLUMN IF NOT EXISTS "inputType" TEXT;
ALTER TABLE "RenewMonitoringRule" ADD COLUMN IF NOT EXISTS "freshnessDays" INTEGER;
ALTER TABLE "RenewMonitoringRule" ADD COLUMN IF NOT EXISTS "actionIfMissing" TEXT NOT NULL DEFAULT 'REVIEW';
ALTER TABLE "RenewMonitoringRule" ADD COLUMN IF NOT EXISTS "ruleSetVersion" TEXT NOT NULL DEFAULT 'live';
ALTER TABLE "RenewMonitoringRule" ADD COLUMN IF NOT EXISTS "sourceBatchId" TEXT;

CREATE INDEX IF NOT EXISTS "RenewMonitoringRule_ruleCode_ruleSetVersion_idx"
  ON "RenewMonitoringRule"("ruleCode", "ruleSetVersion");
CREATE INDEX IF NOT EXISTS "RenewMonitoringRule_appliesToType_appliesToId_active_idx"
  ON "RenewMonitoringRule"("appliesToType", "appliesToId", "active");
CREATE INDEX IF NOT EXISTS "RenewMonitoringRule_sourceBatchId_idx"
  ON "RenewMonitoringRule"("sourceBatchId");

-- CreateTable RenewConditionalQuestion
CREATE TABLE IF NOT EXISTS "RenewConditionalQuestion" (
    "id" TEXT NOT NULL,
    "questionRuleId" TEXT NOT NULL,
    "appliesToType" TEXT NOT NULL,
    "appliesToId" TEXT NOT NULL,
    "indicationId" TEXT NOT NULL,
    "questionCode" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "responseType" TEXT NOT NULL,
    "triggerAnswer" TEXT NOT NULL,
    "actionOnTrigger" TEXT NOT NULL,
    "followupPrompt" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "ruleSetVersion" TEXT NOT NULL DEFAULT 'live',
    "sourceBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RenewConditionalQuestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RenewConditionalQuestion_questionRuleId_ruleSetVersion_key"
  ON "RenewConditionalQuestion"("questionRuleId", "ruleSetVersion");
CREATE INDEX IF NOT EXISTS "RenewConditionalQuestion_questionCode_active_idx"
  ON "RenewConditionalQuestion"("questionCode", "active");
CREATE INDEX IF NOT EXISTS "RenewConditionalQuestion_appliesToType_appliesToId_active_idx"
  ON "RenewConditionalQuestion"("appliesToType", "appliesToId", "active");
CREATE INDEX IF NOT EXISTS "RenewConditionalQuestion_sourceBatchId_idx"
  ON "RenewConditionalQuestion"("sourceBatchId");

-- CreateTable RenewConfigRelease
CREATE TABLE IF NOT EXISTS "RenewConfigRelease" (
    "id" TEXT NOT NULL,
    "releaseCode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RenewConfigRelease_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RenewConfigRelease_releaseCode_key" ON "RenewConfigRelease"("releaseCode");
CREATE INDEX IF NOT EXISTS "RenewConfigRelease_status_idx" ON "RenewConfigRelease"("status");

ALTER TABLE "RenewMedicationIndicationMap"
  ADD CONSTRAINT "RenewMedicationIndicationMap_sourceBatchId_fkey"
  FOREIGN KEY ("sourceBatchId") REFERENCES "ClinicalImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RenewMonitoringInput"
  ADD CONSTRAINT "RenewMonitoringInput_sourceBatchId_fkey"
  FOREIGN KEY ("sourceBatchId") REFERENCES "ClinicalImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RenewMonitoringRule"
  ADD CONSTRAINT "RenewMonitoringRule_sourceBatchId_fkey"
  FOREIGN KEY ("sourceBatchId") REFERENCES "ClinicalImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RenewConditionalQuestion"
  ADD CONSTRAINT "RenewConditionalQuestion_sourceBatchId_fkey"
  FOREIGN KEY ("sourceBatchId") REFERENCES "ClinicalImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RenewConfigRelease"
  ADD CONSTRAINT "RenewConfigRelease_publishedById_fkey"
  FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

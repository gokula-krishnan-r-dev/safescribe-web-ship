-- Prescribing Readiness v1.0 — extend ClinicalJudgmentAssessment with decision fields
ALTER TABLE "ClinicalJudgmentAssessment"
  ADD COLUMN IF NOT EXISTS "readinessStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "insufficiencyReasonCodes" JSONB,
  ADD COLUMN IF NOT EXISTS "insufficiencyDetail" TEXT,
  ADD COLUMN IF NOT EXISTS "readinessNextAction" TEXT,
  ADD COLUMN IF NOT EXISTS "readinessReturnTarget" TEXT,
  ADD COLUMN IF NOT EXISTS "readinessSourceSnapshotHash" TEXT,
  ADD COLUMN IF NOT EXISTS "redFlagCheckId" TEXT;

CREATE INDEX IF NOT EXISTS "ClinicalJudgmentAssessment_readinessStatus_idx"
  ON "ClinicalJudgmentAssessment"("readinessStatus");

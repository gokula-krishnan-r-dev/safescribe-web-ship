-- Guided-pathway clinical judgement continuation (Diagnosis Confirmation /
-- Treatment Eligibility). Stored as consultation JSON so the published
-- pathway version remains reconstructable with the consultation.

ALTER TABLE "Consultation"
  ADD COLUMN IF NOT EXISTS "pathwayClinicalJudgement" JSONB;

-- Add authoritative renal source basis (distinct from operational dosing basis).
ALTER TABLE "ClinicalTreatment" ADD COLUMN IF NOT EXISTS "renalSourceBasis" TEXT;

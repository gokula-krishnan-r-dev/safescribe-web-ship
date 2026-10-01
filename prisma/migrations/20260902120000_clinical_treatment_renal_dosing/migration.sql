-- AlterTable
ALTER TABLE "ClinicalTreatment" ADD COLUMN IF NOT EXISTS "renalDosingBasis" TEXT;
ALTER TABLE "ClinicalTreatment" ADD COLUMN IF NOT EXISTS "renalDosingRules" JSONB;

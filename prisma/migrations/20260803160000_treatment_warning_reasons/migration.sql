-- AlterTable
ALTER TABLE "ClinicalTreatment" ADD COLUMN IF NOT EXISTS "pregnancyReason" TEXT;
ALTER TABLE "ClinicalTreatment" ADD COLUMN IF NOT EXISTS "renalAdjustmentReason" TEXT;
ALTER TABLE "ClinicalTreatment" ADD COLUMN IF NOT EXISTS "hepaticAdjustmentReason" TEXT;
ALTER TABLE "ClinicalTreatment" ADD COLUMN IF NOT EXISTS "monitoringReason" TEXT;

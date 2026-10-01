-- Remove static pathway product-note contraindications.
-- Patient-specific blocking remains via Safety Engine (allergy / CDS), not this field.
ALTER TABLE "ClinicalTreatment" DROP COLUMN IF EXISTS "contraindications";

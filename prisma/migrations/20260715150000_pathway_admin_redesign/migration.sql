-- CreateEnum
CREATE TYPE "RequirementLevel" AS ENUM ('NEVER', 'OPTIONAL', 'REQUIRED');

-- CreateEnum
CREATE TYPE "TreatmentCategory" AS ENUM ('PRESCRIPTION', 'OTC', 'NON_DRUG');

-- AlterTable: ClinicalPathway metadata
ALTER TABLE "ClinicalPathway"
  ADD COLUMN IF NOT EXISTS "provinceAvailability" TEXT,
  ADD COLUMN IF NOT EXISTS "ageMin" INTEGER,
  ADD COLUMN IF NOT EXISTS "ageMax" INTEGER,
  ADD COLUMN IF NOT EXISTS "pharmacistPrescribingEligible" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "requiresPhysicalExam" "RequirementLevel" NOT NULL DEFAULT 'NEVER',
  ADD COLUMN IF NOT EXISTS "requiresLabResults" "RequirementLevel" NOT NULL DEFAULT 'NEVER',
  ADD COLUMN IF NOT EXISTS "requiresFollowUp" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "guidelineSource" TEXT,
  ADD COLUMN IF NOT EXISTS "lastClinicalReview" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "assessmentSectionsEnabled" JSONB;

-- AlterTable: ClinicalTreatment taxonomy + counselling fields
ALTER TABLE "ClinicalTreatment"
  ADD COLUMN IF NOT EXISTS "category" "TreatmentCategory" NOT NULL DEFAULT 'PRESCRIPTION',
  ADD COLUMN IF NOT EXISTS "directions" TEXT,
  ADD COLUMN IF NOT EXISTS "counsellingNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "ageRestriction" TEXT,
  ADD COLUMN IF NOT EXISTS "provinceAvailability" TEXT;

-- Index for treatment category filtering
CREATE INDEX IF NOT EXISTS "ClinicalTreatment_pathwayId_category_idx" ON "ClinicalTreatment"("pathwayId", "category");

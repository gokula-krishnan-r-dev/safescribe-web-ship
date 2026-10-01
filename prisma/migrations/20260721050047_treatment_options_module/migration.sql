-- CreateEnum
CREATE TYPE "RecommendationLevel" AS ENUM ('FIRST_LINE', 'SECOND_LINE', 'ALTERNATIVE', 'ADJUNCTIVE', 'SUPPORTIVE_CARE', 'SPECIALIST');

-- AlterEnum
ALTER TYPE "TreatmentCategory" ADD VALUE 'SUPPLEMENT';

-- DropIndex
DROP INDEX "ClinicalTreatment_pathwayId_category_idx";

-- AlterTable
ALTER TABLE "ClinicalTreatment" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "brandName" TEXT,
ADD COLUMN     "clinicalIndication" TEXT,
ADD COLUMN     "clinicalNotes" TEXT,
ADD COLUMN     "evidenceStrength" TEXT,
ADD COLUMN     "followUpAdvice" TEXT,
ADD COLUMN     "guidelineReference" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "quantity" TEXT,
ADD COLUMN     "recommendationLevel" "RecommendationLevel" NOT NULL DEFAULT 'FIRST_LINE';

-- CreateIndex
CREATE INDEX "ClinicalTreatment_pathwayId_category_displayOrder_idx" ON "ClinicalTreatment"("pathwayId", "category", "displayOrder");

-- CreateIndex
CREATE INDEX "ClinicalTreatment_pathwayId_isActive_idx" ON "ClinicalTreatment"("pathwayId", "isActive");

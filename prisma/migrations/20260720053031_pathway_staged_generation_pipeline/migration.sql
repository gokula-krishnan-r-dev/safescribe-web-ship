-- CreateEnum
CREATE TYPE "PathwayPipelineStage" AS ENUM ('IDLE', 'CLASSIFYING', 'DOCUMENT_REVIEW', 'EXTRACTING_CONCEPTS', 'CONCEPTS_READY', 'GENERATING', 'CLINICAL_REVIEW', 'COMPLETE');

-- CreateEnum
CREATE TYPE "DocumentRole" AS ENUM ('PRIMARY', 'SUPPORTING', 'REFERENCE_ONLY');

-- CreateEnum
CREATE TYPE "ClinicalDocumentType" AS ENUM ('CLINICAL_GUIDELINE', 'NATIONAL_GUIDELINE', 'PROVINCIAL_GUIDELINE', 'CLINICAL_ALGORITHM', 'ASSESSMENT_FORM', 'DRUG_MONOGRAPH', 'REVIEW_ARTICLE', 'PATIENT_HANDOUT', 'LOCAL_POLICY', 'EDUCATIONAL_MATERIAL', 'RESEARCH_ARTICLE', 'OTHER');

-- CreateEnum
CREATE TYPE "ClinicalConceptCategory" AS ENUM ('DIAGNOSIS', 'HISTORY', 'SYMPTOM', 'RED_FLAG', 'DIFFERENTIAL', 'TREATMENT', 'ELIGIBILITY', 'COUNSELLING', 'FOLLOW_UP', 'LAB', 'PHYSICAL_EXAM', 'OTHER');

-- AlterTable
ALTER TABLE "ClinicalDocument" ADD COLUMN     "aiSuggestedRole" "DocumentRole",
ADD COLUMN     "authority" TEXT,
ADD COLUMN     "classificationConfidence" DOUBLE PRECISION,
ADD COLUMN     "classificationMeta" JSONB,
ADD COLUMN     "documentFamily" TEXT,
ADD COLUMN     "documentType" "ClinicalDocumentType",
ADD COLUMN     "evidenceLevel" TEXT,
ADD COLUMN     "publicationYear" INTEGER,
ADD COLUMN     "purpose" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "role" "DocumentRole",
ADD COLUMN     "roleConfirmed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ClinicalPathway" ADD COLUMN     "clinicallyReviewedAt" TIMESTAMP(3),
ADD COLUMN     "clinicallyReviewedById" TEXT,
ADD COLUMN     "pipelineStage" "PathwayPipelineStage" NOT NULL DEFAULT 'IDLE';

-- CreateTable
CREATE TABLE "ClinicalDocumentOverlap" (
    "id" TEXT NOT NULL,
    "pathwayId" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "targetDocumentId" TEXT NOT NULL,
    "overlapPercent" DOUBLE PRECISION NOT NULL,
    "recommendedRole" "DocumentRole" NOT NULL,
    "rationale" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalDocumentOverlap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalConcept" (
    "id" TEXT NOT NULL,
    "pathwayId" TEXT NOT NULL,
    "tenantId" TEXT,
    "category" "ClinicalConceptCategory" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "importance" TEXT,
    "confidence" DOUBLE PRECISION,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isAiGenerated" BOOLEAN NOT NULL DEFAULT true,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalConcept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalConceptSource" (
    "id" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "sourceExcerpt" TEXT,
    "sourcePage" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalConceptSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicalDocumentOverlap_pathwayId_idx" ON "ClinicalDocumentOverlap"("pathwayId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalDocumentOverlap_pathwayId_sourceDocumentId_targetDo_key" ON "ClinicalDocumentOverlap"("pathwayId", "sourceDocumentId", "targetDocumentId");

-- CreateIndex
CREATE INDEX "ClinicalConcept_pathwayId_category_idx" ON "ClinicalConcept"("pathwayId", "category");

-- CreateIndex
CREATE INDEX "ClinicalConcept_pathwayId_displayOrder_idx" ON "ClinicalConcept"("pathwayId", "displayOrder");

-- CreateIndex
CREATE INDEX "ClinicalConcept_tenantId_idx" ON "ClinicalConcept"("tenantId");

-- CreateIndex
CREATE INDEX "ClinicalConceptSource_documentId_idx" ON "ClinicalConceptSource"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalConceptSource_conceptId_documentId_key" ON "ClinicalConceptSource"("conceptId", "documentId");

-- CreateIndex
CREATE INDEX "ClinicalDocument_pathwayId_role_idx" ON "ClinicalDocument"("pathwayId", "role");

-- CreateIndex
CREATE INDEX "ClinicalPathway_pipelineStage_idx" ON "ClinicalPathway"("pipelineStage");

-- AddForeignKey
ALTER TABLE "ClinicalDocumentOverlap" ADD CONSTRAINT "ClinicalDocumentOverlap_pathwayId_fkey" FOREIGN KEY ("pathwayId") REFERENCES "ClinicalPathway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalDocumentOverlap" ADD CONSTRAINT "ClinicalDocumentOverlap_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "ClinicalDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalDocumentOverlap" ADD CONSTRAINT "ClinicalDocumentOverlap_targetDocumentId_fkey" FOREIGN KEY ("targetDocumentId") REFERENCES "ClinicalDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalConcept" ADD CONSTRAINT "ClinicalConcept_pathwayId_fkey" FOREIGN KEY ("pathwayId") REFERENCES "ClinicalPathway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalConceptSource" ADD CONSTRAINT "ClinicalConceptSource_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "ClinicalConcept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalConceptSource" ADD CONSTRAINT "ClinicalConceptSource_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ClinicalDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

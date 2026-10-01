-- CreateEnum
CREATE TYPE "ConsultationMode" AS ENUM ('GUIDED_PATHWAY', 'CLINICAL_JUDGMENT', 'DOCUMENTATION_REFERRAL');

-- CreateEnum
CREATE TYPE "DiagnosticCertainty" AS ENUM ('CONFIRMED', 'PROBABLE', 'UNCERTAIN');

-- CreateEnum
CREATE TYPE "TreatmentSource" AS ENUM ('PATHWAY_RECOMMENDED', 'PHARMACIST_SELECTED');

-- CreateEnum
CREATE TYPE "RationaleStatus" AS ENUM ('DRAFT', 'REVIEW_REQUIRED', 'CONFIRMED', 'STALE', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "AiContentSource" AS ENUM ('PHARMACIST', 'AI_DRAFT', 'AI_EDITED', 'AI_ACCEPTED', 'SYSTEM');

-- CreateEnum
CREATE TYPE "CjWorkflowVersionStatus" AS ENUM ('DRAFT', 'APPROVED', 'RETIRED');

-- CreateEnum
CREATE TYPE "AlternativeCategory" AS ENUM ('WATCHFUL_WAITING', 'OTC_MODIFICATION', 'ALTERNATIVE_PRESCRIPTION', 'NON_DRUG', 'INVESTIGATION', 'REFERRAL', 'OTHER');

-- CreateEnum
CREATE TYPE "AiArtifactType" AS ENUM ('ASSESSMENT_SUMMARY', 'REASON_FOR_PRESCRIBING', 'TREATMENT_RATIONALE', 'ALTERNATIVE_SUGGESTIONS', 'SAFETY_MITIGATION_SUMMARY', 'DOCUMENT_DRAFT');

-- AlterEnum
ALTER TYPE "ConsultationStep" ADD VALUE IF NOT EXISTS 'CLINICAL_IMPRESSION';
ALTER TYPE "ConsultationStep" ADD VALUE IF NOT EXISTS 'PRESCRIBING_READINESS';
ALTER TYPE "ConsultationStep" ADD VALUE IF NOT EXISTS 'TREATMENT_RATIONALE';

-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN IF NOT EXISTS "consultationMode" "ConsultationMode",
ADD COLUMN IF NOT EXISTS "originMode" "ConsultationMode",
ADD COLUMN IF NOT EXISTS "clinicalJudgmentWorkflowVersionId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ClinicalJudgmentWorkflowVersion" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" "CjWorkflowVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "configuration" JSONB,
    "promptBundleVersion" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalJudgmentWorkflowVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ClinicalJudgmentAssessment" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "workingDiagnosisText" VARCHAR(250) NOT NULL,
    "workingDiagnosisCode" TEXT,
    "workingDiagnosisSystem" TEXT,
    "diagnosticCertainty" "DiagnosticCertainty",
    "assessmentSummary" TEXT,
    "assessmentSummarySource" "AiContentSource",
    "assessmentSufficient" BOOLEAN,
    "unresolvedRedFlags" BOOLEAN,
    "readinessReason" TEXT,
    "impressionConfirmedById" TEXT,
    "impressionConfirmedAt" TIMESTAMP(3),
    "readinessConfirmedById" TEXT,
    "readinessConfirmedAt" TIMESTAMP(3),
    "sourceSnapshotHash" TEXT,
    "rowVersion" INTEGER NOT NULL DEFAULT 1,
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalJudgmentAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TreatmentRationale" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "status" "RationaleStatus" NOT NULL DEFAULT 'DRAFT',
    "reasonForPrescribing" TEXT,
    "reasonSource" "AiContentSource",
    "selectionRationale" TEXT,
    "rationaleSource" "AiContentSource",
    "safetyMitigationSummary" TEXT,
    "safetySummarySource" "AiContentSource",
    "reasonConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "selectionConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "alternativesConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "safetyConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "noAlternativesDocumented" BOOLEAN NOT NULL DEFAULT false,
    "inputSnapshotHash" TEXT,
    "safetyRunId" TEXT,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "rowVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreatmentRationale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TreatmentAlternative" (
    "id" TEXT NOT NULL,
    "rationaleId" TEXT NOT NULL,
    "category" "AlternativeCategory" NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "details" TEXT,
    "notSelectedReason" TEXT,
    "suggestionSource" "AiContentSource",
    "selectedById" TEXT,
    "selectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreatmentAlternative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AiArtifact" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "artifactType" "AiArtifactType" NOT NULL,
    "promptKey" TEXT,
    "promptVersion" TEXT,
    "modelId" TEXT,
    "inputManifest" JSONB,
    "inputSnapshotHash" TEXT,
    "rawOutput" TEXT,
    "validatedOutput" TEXT,
    "validationStatus" TEXT,
    "reviewStatus" TEXT,
    "disposition" TEXT,
    "latencyMs" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ClinicalJudgmentWorkflowVersion_version_key" ON "ClinicalJudgmentWorkflowVersion"("version");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ClinicalJudgmentAssessment_consultationId_key" ON "ClinicalJudgmentAssessment"("consultationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClinicalJudgmentAssessment_consultationId_idx" ON "ClinicalJudgmentAssessment"("consultationId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TreatmentRationale_consultationId_key" ON "TreatmentRationale"("consultationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TreatmentRationale_consultationId_idx" ON "TreatmentRationale"("consultationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TreatmentRationale_status_idx" ON "TreatmentRationale"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TreatmentAlternative_rationaleId_idx" ON "TreatmentAlternative"("rationaleId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TreatmentAlternative_rationaleId_category_key" ON "TreatmentAlternative"("rationaleId", "category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiArtifact_consultationId_idx" ON "AiArtifact"("consultationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiArtifact_artifactType_idx" ON "AiArtifact"("artifactType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Consultation_consultationMode_idx" ON "Consultation"("consultationMode");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_clinicalJudgmentWorkflowVersionId_fkey" FOREIGN KEY ("clinicalJudgmentWorkflowVersionId") REFERENCES "ClinicalJudgmentWorkflowVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ClinicalJudgmentAssessment" ADD CONSTRAINT "ClinicalJudgmentAssessment_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TreatmentRationale" ADD CONSTRAINT "TreatmentRationale_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TreatmentAlternative" ADD CONSTRAINT "TreatmentAlternative_rationaleId_fkey" FOREIGN KEY ("rationaleId") REFERENCES "TreatmentRationale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AiArtifact" ADD CONSTRAINT "AiArtifact_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
CREATE TYPE "ConsultationStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConsultationStep" AS ENUM ('PRESENTING_COMPLAINT', 'PATHWAY_SELECTION', 'DEMOGRAPHICS', 'CLINICAL_QUESTIONS', 'RED_FLAGS', 'ELIGIBILITY', 'TREATMENT', 'COUNSELLING', 'DOCUMENTATION', 'REVIEW');

-- DropForeignKey
ALTER TABLE "ClinicalPathway" DROP CONSTRAINT "ClinicalPathway_tenantId_fkey";

-- CreateTable
CREATE TABLE "Consultation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "pharmacistId" TEXT NOT NULL,
    "consultationRef" TEXT,
    "status" "ConsultationStatus" NOT NULL DEFAULT 'DRAFT',
    "currentStep" "ConsultationStep" NOT NULL DEFAULT 'PRESENTING_COMPLAINT',
    "stepIndex" INTEGER NOT NULL DEFAULT 0,
    "transcript" TEXT,
    "chiefComplaint" TEXT,
    "aiEntities" JSONB,
    "aiAnalysis" JSONB,
    "selectedPathwayId" TEXT,
    "aiPathwaySuggestions" JSONB,
    "demographics" JSONB,
    "questionResponses" JSONB,
    "redFlags" JSONB,
    "eligibility" JSONB,
    "treatmentPlan" JSONB,
    "counsellingNotes" JSONB,
    "documentation" JSONB,
    "submittedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationAuditLog" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "step" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultationAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Consultation_consultationRef_key" ON "Consultation"("consultationRef");

-- CreateIndex
CREATE INDEX "Consultation_tenantId_idx" ON "Consultation"("tenantId");

-- CreateIndex
CREATE INDEX "Consultation_pharmacistId_idx" ON "Consultation"("pharmacistId");

-- CreateIndex
CREATE INDEX "Consultation_status_idx" ON "Consultation"("status");

-- CreateIndex
CREATE INDEX "Consultation_createdAt_idx" ON "Consultation"("createdAt");

-- CreateIndex
CREATE INDEX "ConsultationAuditLog_consultationId_idx" ON "ConsultationAuditLog"("consultationId");

-- CreateIndex
CREATE INDEX "ConsultationAuditLog_createdAt_idx" ON "ConsultationAuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "ClinicalPathway" ADD CONSTRAINT "ClinicalPathway_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_pharmacistId_fkey" FOREIGN KEY ("pharmacistId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_selectedPathwayId_fkey" FOREIGN KEY ("selectedPathwayId") REFERENCES "ClinicalPathway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationAuditLog" ADD CONSTRAINT "ConsultationAuditLog_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

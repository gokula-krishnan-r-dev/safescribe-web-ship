-- CreateEnum
CREATE TYPE "PathwayStatus" AS ENUM ('DRAFT', 'AI_PROCESSING', 'AI_GENERATED', 'UNDER_REVIEW', 'APPROVED', 'PUBLISHED', 'SUSPENDED', 'ARCHIVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('TEXT', 'TEXTAREA', 'YES_NO', 'DATE', 'NUMBER', 'SELECT', 'MULTI_SELECT', 'SCALE');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('AI_GENERATED', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RuleSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL', 'STOP');

-- CreateEnum
CREATE TYPE "RuleAction" AS ENUM ('URGENT_REFERRAL', 'STOP_PRESCRIBING', 'SHOW_WARNING', 'REQUIRE_DOCUMENTATION', 'ADJUST_DOSE', 'CONTRAINDICATED');

-- CreateEnum
CREATE TYPE "ContentCreatedBy" AS ENUM ('AI', 'USER');

-- CreateTable
CREATE TABLE "ClinicalPathway" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "PathwayStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "notes" TEXT,
    "processingLog" JSONB,
    "aiSummary" TEXT,
    "createdById" TEXT NOT NULL,
    "rejectionReason" TEXT,
    "publishedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalPathway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalDocument" (
    "id" TEXT NOT NULL,
    "pathwayId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "extractedText" TEXT,
    "pageCount" INTEGER,
    "processingStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "processingError" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "ClinicalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalDocumentChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "pageNumber" INTEGER,
    "section" TEXT,
    "tokenCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalDocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalSection" (
    "id" TEXT NOT NULL,
    "pathwayId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isAiGenerated" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalQuestion" (
    "id" TEXT NOT NULL,
    "pathwayId" TEXT NOT NULL,
    "sectionId" TEXT,
    "tenantId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "description" TEXT,
    "helpText" TEXT,
    "type" "QuestionType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "options" JSONB,
    "validation" JSONB,
    "sourceDocument" TEXT,
    "sourcePage" INTEGER,
    "sourceReference" TEXT,
    "confidence" DOUBLE PRECISION,
    "status" "QuestionStatus" NOT NULL DEFAULT 'AI_GENERATED',
    "createdBy" "ContentCreatedBy" NOT NULL DEFAULT 'AI',
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalRule" (
    "id" TEXT NOT NULL,
    "pathwayId" TEXT NOT NULL,
    "questionId" TEXT,
    "tenantId" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "action" "RuleAction" NOT NULL,
    "severity" "RuleSeverity" NOT NULL DEFAULT 'WARNING',
    "message" TEXT NOT NULL,
    "details" TEXT,
    "isAiGenerated" BOOLEAN NOT NULL DEFAULT true,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalTreatment" (
    "id" TEXT NOT NULL,
    "pathwayId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "medicationName" TEXT NOT NULL,
    "genericName" TEXT,
    "dose" TEXT,
    "route" TEXT,
    "frequency" TEXT,
    "duration" TEXT,
    "maxDose" TEXT,
    "eligibility" TEXT,
    "contraindications" TEXT,
    "renalAdjustment" TEXT,
    "hepaticAdjustment" TEXT,
    "pregnancyNotes" TEXT,
    "breastfeedingNotes" TEXT,
    "warnings" TEXT[],
    "interactions" TEXT[],
    "monitoring" TEXT,
    "isAiGenerated" BOOLEAN NOT NULL DEFAULT true,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalTreatment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalCounselling" (
    "id" TEXT NOT NULL,
    "pathwayId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "point" TEXT NOT NULL,
    "detail" TEXT,
    "isAiGenerated" BOOLEAN NOT NULL DEFAULT true,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalCounselling_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalFollowup" (
    "id" TEXT NOT NULL,
    "pathwayId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "urgency" TEXT NOT NULL DEFAULT 'ROUTINE',
    "isAiGenerated" BOOLEAN NOT NULL DEFAULT true,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalFollowup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalVersion" (
    "id" TEXT NOT NULL,
    "pathwayId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "publishedById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalPublication" (
    "id" TEXT NOT NULL,
    "pathwayId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedById" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,

    CONSTRAINT "ClinicalPublication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicalPathway_tenantId_status_idx" ON "ClinicalPathway"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ClinicalPathway_tenantId_createdAt_idx" ON "ClinicalPathway"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ClinicalPathway_status_idx" ON "ClinicalPathway"("status");

-- CreateIndex
CREATE INDEX "ClinicalDocument_pathwayId_idx" ON "ClinicalDocument"("pathwayId");

-- CreateIndex
CREATE INDEX "ClinicalDocument_tenantId_idx" ON "ClinicalDocument"("tenantId");

-- CreateIndex
CREATE INDEX "ClinicalDocumentChunk_documentId_chunkIndex_idx" ON "ClinicalDocumentChunk"("documentId", "chunkIndex");

-- CreateIndex
CREATE INDEX "ClinicalSection_pathwayId_displayOrder_idx" ON "ClinicalSection"("pathwayId", "displayOrder");

-- CreateIndex
CREATE INDEX "ClinicalQuestion_pathwayId_sectionId_displayOrder_idx" ON "ClinicalQuestion"("pathwayId", "sectionId", "displayOrder");

-- CreateIndex
CREATE INDEX "ClinicalQuestion_pathwayId_status_idx" ON "ClinicalQuestion"("pathwayId", "status");

-- CreateIndex
CREATE INDEX "ClinicalQuestion_tenantId_idx" ON "ClinicalQuestion"("tenantId");

-- CreateIndex
CREATE INDEX "ClinicalRule_pathwayId_idx" ON "ClinicalRule"("pathwayId");

-- CreateIndex
CREATE INDEX "ClinicalRule_questionId_idx" ON "ClinicalRule"("questionId");

-- CreateIndex
CREATE INDEX "ClinicalRule_tenantId_idx" ON "ClinicalRule"("tenantId");

-- CreateIndex
CREATE INDEX "ClinicalTreatment_pathwayId_idx" ON "ClinicalTreatment"("pathwayId");

-- CreateIndex
CREATE INDEX "ClinicalTreatment_tenantId_idx" ON "ClinicalTreatment"("tenantId");

-- CreateIndex
CREATE INDEX "ClinicalCounselling_pathwayId_idx" ON "ClinicalCounselling"("pathwayId");

-- CreateIndex
CREATE INDEX "ClinicalCounselling_tenantId_idx" ON "ClinicalCounselling"("tenantId");

-- CreateIndex
CREATE INDEX "ClinicalFollowup_pathwayId_idx" ON "ClinicalFollowup"("pathwayId");

-- CreateIndex
CREATE INDEX "ClinicalFollowup_tenantId_idx" ON "ClinicalFollowup"("tenantId");

-- CreateIndex
CREATE INDEX "ClinicalVersion_pathwayId_idx" ON "ClinicalVersion"("pathwayId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalVersion_pathwayId_version_key" ON "ClinicalVersion"("pathwayId", "version");

-- CreateIndex
CREATE INDEX "ClinicalPublication_pathwayId_isActive_idx" ON "ClinicalPublication"("pathwayId", "isActive");

-- AddForeignKey
ALTER TABLE "ClinicalPathway" ADD CONSTRAINT "ClinicalPathway_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalPathway" ADD CONSTRAINT "ClinicalPathway_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalDocument" ADD CONSTRAINT "ClinicalDocument_pathwayId_fkey" FOREIGN KEY ("pathwayId") REFERENCES "ClinicalPathway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalDocumentChunk" ADD CONSTRAINT "ClinicalDocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ClinicalDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalSection" ADD CONSTRAINT "ClinicalSection_pathwayId_fkey" FOREIGN KEY ("pathwayId") REFERENCES "ClinicalPathway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalQuestion" ADD CONSTRAINT "ClinicalQuestion_pathwayId_fkey" FOREIGN KEY ("pathwayId") REFERENCES "ClinicalPathway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalQuestion" ADD CONSTRAINT "ClinicalQuestion_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ClinicalSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalRule" ADD CONSTRAINT "ClinicalRule_pathwayId_fkey" FOREIGN KEY ("pathwayId") REFERENCES "ClinicalPathway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalRule" ADD CONSTRAINT "ClinicalRule_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ClinicalQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalTreatment" ADD CONSTRAINT "ClinicalTreatment_pathwayId_fkey" FOREIGN KEY ("pathwayId") REFERENCES "ClinicalPathway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalCounselling" ADD CONSTRAINT "ClinicalCounselling_pathwayId_fkey" FOREIGN KEY ("pathwayId") REFERENCES "ClinicalPathway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalFollowup" ADD CONSTRAINT "ClinicalFollowup_pathwayId_fkey" FOREIGN KEY ("pathwayId") REFERENCES "ClinicalPathway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalVersion" ADD CONSTRAINT "ClinicalVersion_pathwayId_fkey" FOREIGN KEY ("pathwayId") REFERENCES "ClinicalPathway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalPublication" ADD CONSTRAINT "ClinicalPublication_pathwayId_fkey" FOREIGN KEY ("pathwayId") REFERENCES "ClinicalPathway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

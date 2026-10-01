-- CreateEnum
CREATE TYPE "ReferralLetterRecordStatus" AS ENUM ('NOT_CREATED', 'DRAFT', 'APPROVED', 'STALE', 'FINALIZED', 'VOID');

-- AlterTable
ALTER TABLE "ConsultationReferralOutcome"
ADD COLUMN "sourceRevision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "sourceFingerprint" TEXT,
ADD COLUMN "letterStatus" "ReferralLetterRecordStatus" NOT NULL DEFAULT 'NOT_CREATED',
ADD COLUMN "letterApprovedAt" TIMESTAMP(3),
ADD COLUMN "letterApprovedById" TEXT,
ADD COLUMN "letterApprovedSourceRevision" INTEGER,
ADD COLUMN "letterClientRequestId" TEXT,
ADD COLUMN "letterExternalSendConfirmed" BOOLEAN;

-- Backfill: existing drafts with letter content become DRAFT letters
UPDATE "ConsultationReferralOutcome"
SET "letterStatus" = 'DRAFT'
WHERE "referralLetterDraft" IS NOT NULL AND TRIM("referralLetterDraft") <> '';

-- CreateIndex
CREATE INDEX "ConsultationReferralOutcome_letterStatus_idx" ON "ConsultationReferralOutcome"("letterStatus");

-- CreateIndex
CREATE INDEX "ConsultationReferralOutcome_letterClientRequestId_idx" ON "ConsultationReferralOutcome"("letterClientRequestId");

-- CreateTable
CREATE TABLE "ConsultationReferralLetterVersion" (
    "id" TEXT NOT NULL,
    "letterOutcomeId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "sourceRevision" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "renderedText" TEXT,
    "contentHash" TEXT,
    "factsSnapshot" JSONB,
    "clientRequestId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultationReferralLetterVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsultationReferralLetterVersion_letterOutcomeId_idx" ON "ConsultationReferralLetterVersion"("letterOutcomeId");

-- CreateIndex
CREATE INDEX "ConsultationReferralLetterVersion_clientRequestId_idx" ON "ConsultationReferralLetterVersion"("clientRequestId");

-- CreateIndex
CREATE INDEX "ConsultationReferralLetterVersion_createdAt_idx" ON "ConsultationReferralLetterVersion"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultationReferralLetterVersion_letterOutcomeId_versionNumber_key" ON "ConsultationReferralLetterVersion"("letterOutcomeId", "versionNumber");

-- AddForeignKey
ALTER TABLE "ConsultationReferralLetterVersion" ADD CONSTRAINT "ConsultationReferralLetterVersion_letterOutcomeId_fkey" FOREIGN KEY ("letterOutcomeId") REFERENCES "ConsultationReferralOutcome"("id") ON DELETE CASCADE ON UPDATE CASCADE;

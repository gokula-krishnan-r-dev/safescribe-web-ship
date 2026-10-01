-- CreateEnum
CREATE TYPE "ReferralOutcomeRecordStatus" AS ENUM ('DRAFT', 'COMPLETED');

-- CreateTable
CREATE TABLE "ConsultationReferralOutcome" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "pathwayId" TEXT NOT NULL,
    "pathwayVersion" INTEGER NOT NULL,
    "urgencyCode" TEXT NOT NULL,
    "urgencyDisplaySnapshot" TEXT NOT NULL,
    "triggerSnapshot" JSONB NOT NULL,
    "destination" TEXT NOT NULL,
    "destinationOtherText" TEXT,
    "actionTaken" TEXT NOT NULL,
    "patientResponse" TEXT NOT NULL,
    "additionalNote" TEXT,
    "providerId" TEXT,
    "providerFacilitySnapshot" TEXT,
    "contactMethod" TEXT,
    "contactMethodOtherText" TEXT,
    "confirmationReceived" BOOLEAN,
    "handoffAt" TIMESTAMP(3),
    "status" "ReferralOutcomeRecordStatus" NOT NULL DEFAULT 'DRAFT',
    "derivedOutcomeCode" TEXT,
    "documentationText" TEXT,
    "referralLetterDraft" TEXT,
    "clientRequestId" TEXT,
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultationReferralOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsultationReferralOutcome_consultationId_key" ON "ConsultationReferralOutcome"("consultationId");

-- CreateIndex
CREATE INDEX "ConsultationReferralOutcome_pathwayId_idx" ON "ConsultationReferralOutcome"("pathwayId");

-- CreateIndex
CREATE INDEX "ConsultationReferralOutcome_status_idx" ON "ConsultationReferralOutcome"("status");

-- CreateIndex
CREATE INDEX "ConsultationReferralOutcome_clientRequestId_idx" ON "ConsultationReferralOutcome"("clientRequestId");

-- CreateIndex
CREATE INDEX "ConsultationReferralOutcome_createdAt_idx" ON "ConsultationReferralOutcome"("createdAt");

-- AddForeignKey
ALTER TABLE "ConsultationReferralOutcome" ADD CONSTRAINT "ConsultationReferralOutcome_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

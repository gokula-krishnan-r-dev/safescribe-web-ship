-- AlterEnum
ALTER TYPE "ConsultationStep" ADD VALUE IF NOT EXISTS 'RENEW_MEDICATIONS';
ALTER TYPE "ConsultationStep" ADD VALUE IF NOT EXISTS 'RENEW_THERAPY_REVIEW';
ALTER TYPE "ConsultationStep" ADD VALUE IF NOT EXISTS 'RENEW_CLINICAL_ASSESSMENT';
ALTER TYPE "ConsultationStep" ADD VALUE IF NOT EXISTS 'RENEW_DECISION';
ALTER TYPE "ConsultationStep" ADD VALUE IF NOT EXISTS 'RENEW_DOCUMENTATION';
ALTER TYPE "ConsultationStep" ADD VALUE IF NOT EXISTS 'RENEW_SUMMARY';

-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN IF NOT EXISTS "module" TEXT NOT NULL DEFAULT 'prescribe';
ALTER TABLE "Consultation" ADD COLUMN IF NOT EXISTS "renewPayload" JSONB;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Consultation_tenantId_module_status_idx" ON "Consultation"("tenantId", "module", "status");
CREATE INDEX IF NOT EXISTS "Consultation_module_status_idx" ON "Consultation"("module", "status");

-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN IF NOT EXISTS "attachments" JSONB;

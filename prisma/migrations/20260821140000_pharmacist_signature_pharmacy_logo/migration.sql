-- Pharmacist signature (per user) and pharmacy logo (per tenant) for Step 6 documents.
ALTER TABLE "User" ADD COLUMN "signatureStorageKey" TEXT;
ALTER TABLE "User" ADD COLUMN "signatureStorageProvider" TEXT;
ALTER TABLE "User" ADD COLUMN "signatureMimeType" TEXT;

ALTER TABLE "Tenant" ADD COLUMN "logoStorageKey" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "logoStorageProvider" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "logoMimeType" TEXT;

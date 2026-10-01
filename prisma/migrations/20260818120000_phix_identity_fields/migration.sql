-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "phixPharmacyId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "pharmacyLicenseNumber" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "phixCustomer" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_phixPharmacyId_key" ON "Tenant"("phixPharmacyId");

-- AlterTable
ALTER TABLE "User" ADD COLUMN "phixUserId" TEXT;

-- CreateIndex
CREATE INDEX "User_phixUserId_idx" ON "User"("phixUserId");

-- Partial unique: native SafeScribe users keep phixUserId NULL (Postgres allows duplicate NULLs).
CREATE UNIQUE INDEX "User_tenantId_phixUserId_key" ON "User"("tenantId", "phixUserId");

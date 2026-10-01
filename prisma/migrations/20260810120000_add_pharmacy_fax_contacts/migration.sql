-- Pharmacy fax directory for Send Fax autofill (tenant-scoped).
-- Multiple names may share one fax number.
CREATE TABLE "PharmacyFaxContact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "faxNumber" TEXT NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacyFaxContact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PharmacyFaxContact_tenantId_isActive_displayOrder_idx" ON "PharmacyFaxContact"("tenantId", "isActive", "displayOrder");
CREATE INDEX "PharmacyFaxContact_tenantId_faxNumber_idx" ON "PharmacyFaxContact"("tenantId", "faxNumber");
CREATE INDEX "PharmacyFaxContact_tenantId_name_idx" ON "PharmacyFaxContact"("tenantId", "name");

ALTER TABLE "PharmacyFaxContact" ADD CONSTRAINT "PharmacyFaxContact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

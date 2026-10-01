-- Quick-add ranking: completed pharmacist medication additions (identity only).
CREATE TABLE "TreatmentQuickAddUsage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "pharmacistId" TEXT NOT NULL,
    "consultationId" TEXT,
    "pathwayId" TEXT,
    "medicationId" TEXT NOT NULL,
    "clinicalDrugConceptId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "strengthLabel" TEXT,
    "dosageFormLabel" TEXT,
    "genericName" TEXT,
    "terminologySource" TEXT NOT NULL DEFAULT 'ccdd',
    "rxcui" TEXT,
    "ndc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreatmentQuickAddUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TreatmentQuickAddUsage_pharmacistId_createdAt_idx" ON "TreatmentQuickAddUsage"("pharmacistId", "createdAt");
CREATE INDEX "TreatmentQuickAddUsage_tenantId_pathwayId_createdAt_idx" ON "TreatmentQuickAddUsage"("tenantId", "pathwayId", "createdAt");
CREATE INDEX "TreatmentQuickAddUsage_clinicalDrugConceptId_idx" ON "TreatmentQuickAddUsage"("clinicalDrugConceptId");
CREATE INDEX "TreatmentQuickAddUsage_medicationId_idx" ON "TreatmentQuickAddUsage"("medicationId");

ALTER TABLE "TreatmentQuickAddUsage" ADD CONSTRAINT "TreatmentQuickAddUsage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TreatmentQuickAddUsage" ADD CONSTRAINT "TreatmentQuickAddUsage_pharmacistId_fkey" FOREIGN KEY ("pharmacistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

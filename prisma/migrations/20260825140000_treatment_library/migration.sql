-- Treatment Library: versioned reusable regimens with indexed list/search columns.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE "TreatmentLibraryVersionStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'CHANGES_REQUESTED', 'RETIRED');
CREATE TYPE "TreatmentLibraryMatchStatus" AS ENUM ('MATCHED', 'INCOMPLETE', 'UNMATCHED');
CREATE TYPE "TreatmentLibraryPopulation" AS ENUM ('ADULT', 'PEDIATRIC', 'WEIGHT_BASED', 'OTHER');
CREATE TYPE "TreatmentLibraryLinkStatus" AS ENUM ('LINKED', 'DETACHED', 'MANUAL');

CREATE TABLE "TreatmentLibraryItem" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "stableKey" TEXT NOT NULL,
  "currentApprovedVersionId" TEXT,
  "isRetired" BOOLEAN NOT NULL DEFAULT false,
  "displayName" TEXT NOT NULL,
  "genericName" TEXT NOT NULL DEFAULT '',
  "brandName" TEXT NOT NULL DEFAULT '',
  "strength" TEXT NOT NULL DEFAULT '',
  "productFormDisplay" TEXT NOT NULL DEFAULT '',
  "routeDisplay" TEXT NOT NULL DEFAULT '',
  "regimenLabel" TEXT NOT NULL DEFAULT '',
  "population" "TreatmentLibraryPopulation" NOT NULL DEFAULT 'ADULT',
  "matchStatus" "TreatmentLibraryMatchStatus" NOT NULL DEFAULT 'UNMATCHED',
  "listStatus" "TreatmentLibraryVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "approvedVersionNumber" INTEGER,
  "searchText" TEXT NOT NULL DEFAULT '',
  "identifierText" TEXT NOT NULL DEFAULT '',
  "pathwayUsageCount" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TreatmentLibraryItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TreatmentLibraryVersion" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "status" "TreatmentLibraryVersionStatus" NOT NULL,
  "payload" JSONB NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "changeSummary" TEXT,
  "submittedById" TEXT,
  "submittedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNotes" TEXT,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TreatmentLibraryVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TreatmentLibraryItem_stableKey_key" ON "TreatmentLibraryItem"("stableKey");
CREATE INDEX "TreatmentLibraryItem_isRetired_listStatus_updatedAt_idx" ON "TreatmentLibraryItem"("isRetired", "listStatus", "updatedAt");
CREATE INDEX "TreatmentLibraryItem_listStatus_updatedAt_idx" ON "TreatmentLibraryItem"("listStatus", "updatedAt");
CREATE INDEX "TreatmentLibraryItem_population_idx" ON "TreatmentLibraryItem"("population");
CREATE INDEX "TreatmentLibraryItem_matchStatus_idx" ON "TreatmentLibraryItem"("matchStatus");
CREATE INDEX "TreatmentLibraryItem_productFormDisplay_idx" ON "TreatmentLibraryItem"("productFormDisplay");
CREATE INDEX "TreatmentLibraryItem_routeDisplay_idx" ON "TreatmentLibraryItem"("routeDisplay");
CREATE INDEX "TreatmentLibraryItem_tenantId_isRetired_idx" ON "TreatmentLibraryItem"("tenantId", "isRetired");
CREATE INDEX "TreatmentLibraryItem_updatedAt_idx" ON "TreatmentLibraryItem"("updatedAt");
CREATE INDEX "TreatmentLibraryItem_currentApprovedVersionId_idx" ON "TreatmentLibraryItem"("currentApprovedVersionId");
CREATE INDEX "TreatmentLibraryItem_searchText_trgm_idx" ON "TreatmentLibraryItem" USING gin ("searchText" gin_trgm_ops);
CREATE INDEX "TreatmentLibraryItem_identifierText_trgm_idx" ON "TreatmentLibraryItem" USING gin ("identifierText" gin_trgm_ops);
CREATE INDEX "TreatmentLibraryItem_displayName_trgm_idx" ON "TreatmentLibraryItem" USING gin ("displayName" gin_trgm_ops);

CREATE UNIQUE INDEX "TreatmentLibraryVersion_itemId_versionNumber_key" ON "TreatmentLibraryVersion"("itemId", "versionNumber");
CREATE INDEX "TreatmentLibraryVersion_itemId_status_idx" ON "TreatmentLibraryVersion"("itemId", "status");
CREATE INDEX "TreatmentLibraryVersion_status_idx" ON "TreatmentLibraryVersion"("status");
CREATE INDEX "TreatmentLibraryVersion_payloadHash_idx" ON "TreatmentLibraryVersion"("payloadHash");

ALTER TABLE "TreatmentLibraryItem"
  ADD CONSTRAINT "TreatmentLibraryItem_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TreatmentLibraryVersion"
  ADD CONSTRAINT "TreatmentLibraryVersion_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "TreatmentLibraryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClinicalTreatment"
  ADD COLUMN IF NOT EXISTS "treatmentLibraryItemId" TEXT,
  ADD COLUMN IF NOT EXISTS "treatmentLibraryVersionId" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceVersionNumber" INTEGER,
  ADD COLUMN IF NOT EXISTS "sourcePayloadHash" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceSnapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "pathwayOverrides" JSONB,
  ADD COLUMN IF NOT EXISTS "libraryLinkStatus" "TreatmentLibraryLinkStatus" NOT NULL DEFAULT 'MANUAL';

CREATE INDEX IF NOT EXISTS "ClinicalTreatment_treatmentLibraryItemId_idx" ON "ClinicalTreatment"("treatmentLibraryItemId");
CREATE INDEX IF NOT EXISTS "ClinicalTreatment_treatmentLibraryVersionId_idx" ON "ClinicalTreatment"("treatmentLibraryVersionId");

ALTER TABLE "ClinicalTreatment"
  ADD CONSTRAINT "ClinicalTreatment_treatmentLibraryItemId_fkey"
  FOREIGN KEY ("treatmentLibraryItemId") REFERENCES "TreatmentLibraryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClinicalTreatment"
  ADD CONSTRAINT "ClinicalTreatment_treatmentLibraryVersionId_fkey"
  FOREIGN KEY ("treatmentLibraryVersionId") REFERENCES "TreatmentLibraryVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

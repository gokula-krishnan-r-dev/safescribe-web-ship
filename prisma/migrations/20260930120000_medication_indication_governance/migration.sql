-- Governed CCDD ↔ SNOMED Approved Indications Repository

CREATE TABLE IF NOT EXISTS "medication_indication_mappings" (
    "id" TEXT NOT NULL,
    "medicationConceptId" TEXT NOT NULL,
    "medicationDisplayName" TEXT NOT NULL,
    "medicationMappingLevel" TEXT NOT NULL DEFAULT 'ingredient',
    "indicationConceptId" TEXT NOT NULL,
    "indicationDisplayName" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL DEFAULT 'approved_indication',
    "jurisdiction" TEXT NOT NULL DEFAULT 'CA',
    "sourceReferenceId" TEXT,
    "sourceLabel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "mappingVersion" INTEGER NOT NULL DEFAULT 1,
    "notes" VARCHAR(1000),
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "approvedById" TEXT,
    "retiredById" TEXT,
    "retiredAt" TIMESTAMP(3),
    "legacyConditionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medication_indication_mappings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "medication_indication_mappings_status_jurisdiction_idx"
  ON "medication_indication_mappings"("status", "jurisdiction");
CREATE INDEX IF NOT EXISTS "medication_indication_mappings_medicationConceptId_status_idx"
  ON "medication_indication_mappings"("medicationConceptId", "status");
CREATE INDEX IF NOT EXISTS "medication_indication_mappings_indicationConceptId_status_idx"
  ON "medication_indication_mappings"("indicationConceptId", "status");
CREATE INDEX IF NOT EXISTS "medication_indication_mappings_relationshipType_status_idx"
  ON "medication_indication_mappings"("relationshipType", "status");
CREATE INDEX IF NOT EXISTS "medication_indication_mappings_medicationMappingLevel_status_idx"
  ON "medication_indication_mappings"("medicationMappingLevel", "status");
CREATE INDEX IF NOT EXISTS "medication_indication_mappings_updatedAt_idx"
  ON "medication_indication_mappings"("updatedAt");
CREATE INDEX IF NOT EXISTS "medication_indication_mappings_legacyConditionId_idx"
  ON "medication_indication_mappings"("legacyConditionId");

CREATE TABLE IF NOT EXISTS "medication_indication_candidates" (
    "id" TEXT NOT NULL,
    "medicationConceptId" TEXT NOT NULL,
    "medicationDisplayName" TEXT,
    "medicationMappingLevel" TEXT NOT NULL DEFAULT 'ingredient',
    "indicationConceptId" TEXT NOT NULL,
    "indicationDisplayName" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceReferenceId" TEXT,
    "jurisdiction" TEXT NOT NULL DEFAULT 'CA',
    "relationshipTypeSuggested" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "promotedMappingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medication_indication_candidates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "medication_indication_candidates_med_level_ind_jur_key"
  ON "medication_indication_candidates"("medicationConceptId", "medicationMappingLevel", "indicationConceptId", "jurisdiction");
CREATE INDEX IF NOT EXISTS "medication_indication_candidates_status_lastSeenAt_idx"
  ON "medication_indication_candidates"("status", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "medication_indication_candidates_medicationConceptId_status_idx"
  ON "medication_indication_candidates"("medicationConceptId", "status");
CREATE INDEX IF NOT EXISTS "medication_indication_candidates_indicationConceptId_status_idx"
  ON "medication_indication_candidates"("indicationConceptId", "status");

CREATE TABLE IF NOT EXISTS "medication_indication_repository_versions" (
    "id" TEXT NOT NULL,
    "versionCode" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedById" TEXT,
    "changeSummary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'published',
    "mappingsAdded" INTEGER NOT NULL DEFAULT 0,
    "mappingsUpdated" INTEGER NOT NULL DEFAULT 0,
    "mappingsRetired" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medication_indication_repository_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "medication_indication_repository_versions_versionCode_key"
  ON "medication_indication_repository_versions"("versionCode");
CREATE INDEX IF NOT EXISTS "medication_indication_repository_versions_publishedAt_idx"
  ON "medication_indication_repository_versions"("publishedAt");

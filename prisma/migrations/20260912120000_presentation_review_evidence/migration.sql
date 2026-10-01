-- Presentation Review evidence library and question-level evidence mappings

ALTER TABLE "ClinicalQuestion"
ADD COLUMN "evidenceRefIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "visibilityRule" JSONB;

ALTER TABLE "ClinicalPathway"
ADD COLUMN "presentationReview" JSONB;

CREATE TABLE "PathwayEvidenceReference" (
    "id" TEXT NOT NULL,
    "pathwayId" TEXT NOT NULL,
    "tenantId" TEXT,
    "citationTitle" TEXT NOT NULL,
    "organization" TEXT,
    "edition" TEXT,
    "publicationYear" INTEGER,
    "url" TEXT,
    "documentType" TEXT,
    "jurisdiction" TEXT,
    "referenceType" TEXT NOT NULL DEFAULT 'source',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PathwayEvidenceReference_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PathwayEvidenceReference_pathwayId_createdAt_idx" ON "PathwayEvidenceReference"("pathwayId", "createdAt");
CREATE INDEX "PathwayEvidenceReference_tenantId_idx" ON "PathwayEvidenceReference"("tenantId");

ALTER TABLE "PathwayEvidenceReference"
ADD CONSTRAINT "PathwayEvidenceReference_pathwayId_fkey"
FOREIGN KEY ("pathwayId") REFERENCES "ClinicalPathway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

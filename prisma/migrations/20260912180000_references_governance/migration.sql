-- References & Governance: extend evidence library, mappings, reviewers, content links

ALTER TABLE "ClinicalPathway"
ADD COLUMN "primaryDocumentationReferenceId" TEXT,
ADD COLUMN "governance" JSONB;

ALTER TABLE "PathwayEvidenceReference"
ADD COLUMN "doi" TEXT,
ADD COLUMN "verifiedBy" TEXT,
ADD COLUMN "verificationDate" TIMESTAMP(3),
ADD COLUMN "importSource" TEXT NOT NULL DEFAULT 'manual';

-- Migrate legacy "active" status → "verified"; keep unknown statuses as needs_review
UPDATE "PathwayEvidenceReference"
SET "status" = CASE
  WHEN "status" = 'active' THEN 'verified'
  WHEN "status" IN ('verified', 'needs_review', 'verification_required', 'archived') THEN "status"
  ELSE 'needs_review'
END;

ALTER TABLE "PathwayEvidenceReference"
ALTER COLUMN "status" SET DEFAULT 'needs_review';

CREATE INDEX "PathwayEvidenceReference_pathwayId_status_idx"
ON "PathwayEvidenceReference"("pathwayId", "status");

ALTER TABLE "ClinicalTreatment"
ADD COLUMN "evidenceRefIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "documentationReferenceId" TEXT;

ALTER TABLE "ClinicalCounselling"
ADD COLUMN "evidenceRefIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "PathwayEvidenceMapping" (
    "id" TEXT NOT NULL,
    "pathwayId" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "mappingType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL DEFAULT '',
    "suggested" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PathwayEvidenceMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PathwayEvidenceMapping_pathwayId_referenceId_section_mappingType_targetId_key"
ON "PathwayEvidenceMapping"("pathwayId", "referenceId", "section", "mappingType", "targetId");

CREATE INDEX "PathwayEvidenceMapping_pathwayId_referenceId_idx"
ON "PathwayEvidenceMapping"("pathwayId", "referenceId");

CREATE INDEX "PathwayEvidenceMapping_pathwayId_section_idx"
ON "PathwayEvidenceMapping"("pathwayId", "section");

CREATE INDEX "PathwayEvidenceMapping_referenceId_idx"
ON "PathwayEvidenceMapping"("referenceId");

ALTER TABLE "PathwayEvidenceMapping"
ADD CONSTRAINT "PathwayEvidenceMapping_pathwayId_fkey"
FOREIGN KEY ("pathwayId") REFERENCES "ClinicalPathway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PathwayEvidenceMapping"
ADD CONSTRAINT "PathwayEvidenceMapping_referenceId_fkey"
FOREIGN KEY ("referenceId") REFERENCES "PathwayEvidenceReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PathwayReviewer" (
    "id" TEXT NOT NULL,
    "pathwayId" TEXT NOT NULL,
    "reviewerType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "credentials" TEXT NOT NULL,
    "organization" TEXT,
    "role" TEXT NOT NULL,
    "reviewedAreas" TEXT[],
    "reviewDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PathwayReviewer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PathwayReviewer_pathwayId_reviewerType_idx"
ON "PathwayReviewer"("pathwayId", "reviewerType");

ALTER TABLE "PathwayReviewer"
ADD CONSTRAINT "PathwayReviewer_pathwayId_fkey"
FOREIGN KEY ("pathwayId") REFERENCES "ClinicalPathway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Master citation + reviewer libraries for Super Admin; pathway attach + secondary documentation citation.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "ClinicalPathway"
ADD COLUMN IF NOT EXISTS "secondaryDocumentationReferenceId" TEXT;

CREATE TABLE "EvidenceReferenceLibraryItem" (
    "id" TEXT NOT NULL,
    "citationTitle" TEXT NOT NULL,
    "organization" TEXT,
    "edition" TEXT,
    "publicationYear" INTEGER,
    "url" TEXT,
    "doi" TEXT,
    "documentType" TEXT,
    "jurisdiction" TEXT,
    "referenceType" TEXT NOT NULL DEFAULT 'source',
    "status" TEXT NOT NULL DEFAULT 'needs_review',
    "verifiedBy" TEXT,
    "verificationDate" TIMESTAMP(3),
    "importSource" TEXT NOT NULL DEFAULT 'manual',
    "isRetired" BOOLEAN NOT NULL DEFAULT false,
    "searchText" TEXT NOT NULL DEFAULT '',
    "stableKey" TEXT NOT NULL,
    "pathwayUsageCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenceReferenceLibraryItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EvidenceReferenceLibraryItem_stableKey_key"
ON "EvidenceReferenceLibraryItem"("stableKey");

CREATE INDEX "EvidenceReferenceLibraryItem_isRetired_status_updatedAt_idx"
ON "EvidenceReferenceLibraryItem"("isRetired", "status", "updatedAt");

CREATE INDEX "EvidenceReferenceLibraryItem_documentType_idx"
ON "EvidenceReferenceLibraryItem"("documentType");

CREATE INDEX "EvidenceReferenceLibraryItem_updatedAt_idx"
ON "EvidenceReferenceLibraryItem"("updatedAt");

CREATE INDEX "EvidenceReferenceLibraryItem_searchText_trgm_idx"
ON "EvidenceReferenceLibraryItem" USING gin ("searchText" gin_trgm_ops);

CREATE TABLE "ReviewerLibraryItem" (
    "id" TEXT NOT NULL,
    "reviewerType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "credentials" TEXT NOT NULL,
    "organization" TEXT,
    "role" TEXT NOT NULL,
    "isRetired" BOOLEAN NOT NULL DEFAULT false,
    "searchText" TEXT NOT NULL DEFAULT '',
    "stableKey" TEXT NOT NULL,
    "pathwayUsageCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewerLibraryItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReviewerLibraryItem_stableKey_key"
ON "ReviewerLibraryItem"("stableKey");

CREATE INDEX "ReviewerLibraryItem_isRetired_reviewerType_updatedAt_idx"
ON "ReviewerLibraryItem"("isRetired", "reviewerType", "updatedAt");

CREATE INDEX "ReviewerLibraryItem_updatedAt_idx"
ON "ReviewerLibraryItem"("updatedAt");

CREATE INDEX "ReviewerLibraryItem_searchText_trgm_idx"
ON "ReviewerLibraryItem" USING gin ("searchText" gin_trgm_ops);

ALTER TABLE "PathwayEvidenceReference"
ADD COLUMN "libraryItemId" TEXT;

ALTER TABLE "PathwayReviewer"
ADD COLUMN "libraryReviewerId" TEXT;

CREATE INDEX "PathwayEvidenceReference_libraryItemId_idx"
ON "PathwayEvidenceReference"("libraryItemId");

CREATE INDEX "PathwayReviewer_libraryReviewerId_idx"
ON "PathwayReviewer"("libraryReviewerId");

ALTER TABLE "PathwayEvidenceReference"
ADD CONSTRAINT "PathwayEvidenceReference_libraryItemId_fkey"
FOREIGN KEY ("libraryItemId") REFERENCES "EvidenceReferenceLibraryItem"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PathwayReviewer"
ADD CONSTRAINT "PathwayReviewer_libraryReviewerId_fkey"
FOREIGN KEY ("libraryReviewerId") REFERENCES "ReviewerLibraryItem"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill master citations from existing pathway-local rows (dedupe title + org + year).
WITH keyed AS (
  SELECT
    r.*,
    lower(regexp_replace(btrim(r."citationTitle"), '\s+', ' ', 'g'))
      || '|' ||
    lower(regexp_replace(btrim(coalesce(r."organization", '')), '\s+', ' ', 'g'))
      || '|' ||
    coalesce(r."publicationYear"::text, '') AS stable_key,
    lower(concat_ws(' ',
      r."citationTitle",
      coalesce(r."organization", ''),
      coalesce(r."edition", ''),
      coalesce(r."publicationYear"::text, ''),
      coalesce(r."documentType", ''),
      coalesce(r."jurisdiction", ''),
      coalesce(r."doi", ''),
      coalesce(r."url", '')
    )) AS search_text
  FROM "PathwayEvidenceReference" r
),
ranked AS (
  SELECT
    keyed.*,
    p."createdById" AS pathway_created_by,
    row_number() OVER (PARTITION BY keyed.stable_key ORDER BY keyed."createdAt" ASC, keyed.id ASC) AS rn
  FROM keyed
  JOIN "ClinicalPathway" p ON p.id = keyed."pathwayId"
)
INSERT INTO "EvidenceReferenceLibraryItem" (
  "id",
  "citationTitle",
  "organization",
  "edition",
  "publicationYear",
  "url",
  "doi",
  "documentType",
  "jurisdiction",
  "referenceType",
  "status",
  "verifiedBy",
  "verificationDate",
  "importSource",
  "isRetired",
  "searchText",
  "stableKey",
  "pathwayUsageCount",
  "createdById",
  "updatedById",
  "createdAt",
  "updatedAt"
)
SELECT
  'erl_' || substr(md5(ranked.stable_key), 1, 24),
  ranked."citationTitle",
  ranked."organization",
  ranked."edition",
  ranked."publicationYear",
  ranked."url",
  ranked."doi",
  ranked."documentType",
  ranked."jurisdiction",
  ranked."referenceType",
  ranked."status",
  ranked."verifiedBy",
  ranked."verificationDate",
  CASE WHEN ranked."importSource" IN ('manual', 'chatgpt', 'excel', 'migration', 'library')
    THEN ranked."importSource"
    ELSE 'migration'
  END,
  false,
  ranked.search_text,
  ranked.stable_key,
  0,
  coalesce(ranked."createdById", ranked.pathway_created_by),
  coalesce(ranked."createdById", ranked.pathway_created_by),
  ranked."createdAt",
  CURRENT_TIMESTAMP
FROM ranked
WHERE ranked.rn = 1
ON CONFLICT ("stableKey") DO NOTHING;

UPDATE "PathwayEvidenceReference" r
SET "libraryItemId" = m.id
FROM "EvidenceReferenceLibraryItem" m
WHERE r."libraryItemId" IS NULL
  AND m."stableKey" = (
    lower(regexp_replace(btrim(r."citationTitle"), '\s+', ' ', 'g'))
    || '|' ||
    lower(regexp_replace(btrim(coalesce(r."organization", '')), '\s+', ' ', 'g'))
    || '|' ||
    coalesce(r."publicationYear"::text, '')
  );

WITH dups AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY "pathwayId", "libraryItemId"
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn
  FROM "PathwayEvidenceReference"
  WHERE "libraryItemId" IS NOT NULL
)
UPDATE "PathwayEvidenceReference" r
SET "libraryItemId" = NULL
FROM dups
WHERE r.id = dups.id AND dups.rn > 1;

UPDATE "EvidenceReferenceLibraryItem" m
SET "pathwayUsageCount" = (
  SELECT count(*)::int FROM "PathwayEvidenceReference" r WHERE r."libraryItemId" = m.id
);

-- Backfill master reviewers (dedupe name + credentials + organization).
WITH keyed AS (
  SELECT
    r.*,
    lower(regexp_replace(btrim(r."name"), '\s+', ' ', 'g'))
      || '|' ||
    lower(regexp_replace(btrim(coalesce(r."credentials", '')), '\s+', ' ', 'g'))
      || '|' ||
    lower(regexp_replace(btrim(coalesce(r."organization", '')), '\s+', ' ', 'g')) AS stable_key,
    lower(concat_ws(' ',
      r."name",
      coalesce(r."credentials", ''),
      coalesce(r."organization", ''),
      coalesce(r."role", ''),
      coalesce(r."reviewerType", '')
    )) AS search_text
  FROM "PathwayReviewer" r
),
ranked AS (
  SELECT
    keyed.*,
    p."createdById" AS pathway_created_by,
    row_number() OVER (PARTITION BY keyed.stable_key ORDER BY keyed."createdAt" ASC, keyed.id ASC) AS rn
  FROM keyed
  JOIN "ClinicalPathway" p ON p.id = keyed."pathwayId"
)
INSERT INTO "ReviewerLibraryItem" (
  "id",
  "reviewerType",
  "name",
  "credentials",
  "organization",
  "role",
  "isRetired",
  "searchText",
  "stableKey",
  "pathwayUsageCount",
  "createdById",
  "updatedById",
  "createdAt",
  "updatedAt"
)
SELECT
  'rvl_' || substr(md5(ranked.stable_key), 1, 24),
  ranked."reviewerType",
  ranked."name",
  ranked."credentials",
  ranked."organization",
  ranked."role",
  false,
  ranked.search_text,
  ranked.stable_key,
  0,
  ranked.pathway_created_by,
  ranked.pathway_created_by,
  ranked."createdAt",
  CURRENT_TIMESTAMP
FROM ranked
WHERE ranked.rn = 1
ON CONFLICT ("stableKey") DO NOTHING;

UPDATE "PathwayReviewer" r
SET "libraryReviewerId" = m.id
FROM "ReviewerLibraryItem" m
WHERE r."libraryReviewerId" IS NULL
  AND m."stableKey" = (
    lower(regexp_replace(btrim(r."name"), '\s+', ' ', 'g'))
    || '|' ||
    lower(regexp_replace(btrim(coalesce(r."credentials", '')), '\s+', ' ', 'g'))
    || '|' ||
    lower(regexp_replace(btrim(coalesce(r."organization", '')), '\s+', ' ', 'g'))
  );

WITH dups AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY "pathwayId", "libraryReviewerId", "reviewerType"
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn
  FROM "PathwayReviewer"
  WHERE "libraryReviewerId" IS NOT NULL
)
UPDATE "PathwayReviewer" r
SET "libraryReviewerId" = NULL
FROM dups
WHERE r.id = dups.id AND dups.rn > 1;

UPDATE "ReviewerLibraryItem" m
SET "pathwayUsageCount" = (
  SELECT count(*)::int FROM "PathwayReviewer" r WHERE r."libraryReviewerId" = m.id
);

CREATE UNIQUE INDEX "PathwayEvidenceReference_pathwayId_libraryItemId_uidx"
ON "PathwayEvidenceReference"("pathwayId", "libraryItemId")
WHERE "libraryItemId" IS NOT NULL;

CREATE UNIQUE INDEX "PathwayReviewer_pathwayId_libraryReviewerId_type_uidx"
ON "PathwayReviewer"("pathwayId", "libraryReviewerId", "reviewerType")
WHERE "libraryReviewerId" IS NOT NULL;

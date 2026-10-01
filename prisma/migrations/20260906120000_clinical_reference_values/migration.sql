-- Clinical Safety — Reference & Target Values (governed shared layer)

CREATE TYPE "ClinicalReferenceRecordStatus" AS ENUM (
  'DRAFT',
  'IN_REVIEW',
  'PUBLISHED',
  'SUPERSEDED',
  'ARCHIVED'
);

CREATE TYPE "ClinicalReferenceSourceStatus" AS ENUM (
  'DRAFT',
  'IN_REVIEW',
  'ACTIVE',
  'SUPERSEDED',
  'ARCHIVED'
);

CREATE TABLE "ClinicalReferenceRelease" (
  "id" TEXT NOT NULL,
  "releaseId" TEXT NOT NULL,
  "versionLabel" TEXT NOT NULL,
  "status" "ClinicalReferenceRecordStatus" NOT NULL DEFAULT 'DRAFT',
  "publishedAt" TIMESTAMP(3),
  "publishedById" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClinicalReferenceRelease_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClinicalReferenceRelease_releaseId_key" ON "ClinicalReferenceRelease"("releaseId");
CREATE INDEX "ClinicalReferenceRelease_status_idx" ON "ClinicalReferenceRelease"("status");

CREATE TABLE "ClinicalReferencePointer" (
  "id" TEXT NOT NULL DEFAULT 'active',
  "releaseId" TEXT NOT NULL,

  CONSTRAINT "ClinicalReferencePointer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClinicalReferencePointer_releaseId_key" ON "ClinicalReferencePointer"("releaseId");

CREATE TABLE "ClinicalReferenceSource" (
  "id" TEXT NOT NULL,
  "sourceCode" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL DEFAULT 1,
  "sourceName" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL DEFAULT 'OTHER',
  "publisher" TEXT,
  "jurisdiction" TEXT,
  "version" TEXT,
  "publicationDate" TIMESTAMP(3),
  "effectiveDate" TIMESTAMP(3),
  "sourceUrl" TEXT,
  "lastReviewedAt" TIMESTAMP(3),
  "nextReviewDueAt" TIMESTAMP(3),
  "useCase" TEXT,
  "notes" TEXT,
  "status" "ClinicalReferenceSourceStatus" NOT NULL DEFAULT 'DRAFT',
  "reviewApprovedAt" TIMESTAMP(3),
  "releaseId" TEXT,
  "supersededById" TEXT,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClinicalReferenceSource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClinicalReferenceSource_sourceCode_versionNumber_key"
  ON "ClinicalReferenceSource"("sourceCode", "versionNumber");
CREATE INDEX "ClinicalReferenceSource_sourceCode_status_idx" ON "ClinicalReferenceSource"("sourceCode", "status");
CREATE INDEX "ClinicalReferenceSource_status_idx" ON "ClinicalReferenceSource"("status");
CREATE INDEX "ClinicalReferenceSource_releaseId_idx" ON "ClinicalReferenceSource"("releaseId");

CREATE TABLE "ClinicalReferenceValue" (
  "id" TEXT NOT NULL,
  "referenceId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL DEFAULT 1,
  "inputCode" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "category" TEXT,
  "population" TEXT NOT NULL DEFAULT 'ALL',
  "sex" TEXT NOT NULL DEFAULT 'ALL',
  "context" TEXT,
  "referenceStrategy" TEXT NOT NULL,
  "referenceKind" TEXT NOT NULL,
  "uiUse" TEXT,
  "lowerNumeric" DOUBLE PRECISION,
  "upperNumeric" DOUBLE PRECISION,
  "operator" TEXT,
  "targetValue" TEXT,
  "unit" TEXT,
  "displayText" TEXT,
  "sourceCode" TEXT,
  "sourcePriority" INTEGER,
  "notes" TEXT,
  "status" "ClinicalReferenceRecordStatus" NOT NULL DEFAULT 'DRAFT',
  "reviewApprovedAt" TIMESTAMP(3),
  "effectiveDate" TIMESTAMP(3),
  "releaseId" TEXT,
  "supersededById" TEXT,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClinicalReferenceValue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClinicalReferenceValue_referenceId_versionNumber_key"
  ON "ClinicalReferenceValue"("referenceId", "versionNumber");
CREATE INDEX "ClinicalReferenceValue_inputCode_status_idx" ON "ClinicalReferenceValue"("inputCode", "status");
CREATE INDEX "ClinicalReferenceValue_status_idx" ON "ClinicalReferenceValue"("status");
CREATE INDEX "ClinicalReferenceValue_sourceCode_idx" ON "ClinicalReferenceValue"("sourceCode");
CREATE INDEX "ClinicalReferenceValue_releaseId_idx" ON "ClinicalReferenceValue"("releaseId");

CREATE TABLE "ClinicalTreatmentTarget" (
  "id" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL DEFAULT 1,
  "inputCode" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "population" TEXT NOT NULL DEFAULT 'ADULT',
  "clinicalContext" TEXT NOT NULL,
  "parameter" TEXT NOT NULL,
  "operator" TEXT,
  "targetValue" TEXT,
  "unit" TEXT,
  "displayText" TEXT NOT NULL,
  "sourceCode" TEXT NOT NULL,
  "targetType" TEXT NOT NULL DEFAULT 'TREATMENT_TARGET',
  "notes" TEXT,
  "status" "ClinicalReferenceRecordStatus" NOT NULL DEFAULT 'DRAFT',
  "reviewApprovedAt" TIMESTAMP(3),
  "effectiveDate" TIMESTAMP(3),
  "releaseId" TEXT,
  "supersededById" TEXT,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClinicalTreatmentTarget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClinicalTreatmentTarget_targetId_versionNumber_key"
  ON "ClinicalTreatmentTarget"("targetId", "versionNumber");
CREATE INDEX "ClinicalTreatmentTarget_inputCode_status_idx" ON "ClinicalTreatmentTarget"("inputCode", "status");
CREATE INDEX "ClinicalTreatmentTarget_status_idx" ON "ClinicalTreatmentTarget"("status");
CREATE INDEX "ClinicalTreatmentTarget_sourceCode_idx" ON "ClinicalTreatmentTarget"("sourceCode");
CREATE INDEX "ClinicalTreatmentTarget_releaseId_idx" ON "ClinicalTreatmentTarget"("releaseId");

CREATE TABLE "ClinicalPediatricReferencePolicy" (
  "id" TEXT NOT NULL,
  "inputCode" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL DEFAULT 1,
  "label" TEXT,
  "category" TEXT,
  "strategy" TEXT NOT NULL,
  "preferredSource" TEXT,
  "fallbackAllowed" BOOLEAN NOT NULL DEFAULT false,
  "adultFallbackAllowed" BOOLEAN NOT NULL DEFAULT false,
  "implementationNote" TEXT,
  "sourceUrl" TEXT,
  "status" "ClinicalReferenceRecordStatus" NOT NULL DEFAULT 'DRAFT',
  "reviewApprovedAt" TIMESTAMP(3),
  "releaseId" TEXT,
  "supersededById" TEXT,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClinicalPediatricReferencePolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClinicalPediatricReferencePolicy_inputCode_versionNumber_key"
  ON "ClinicalPediatricReferencePolicy"("inputCode", "versionNumber");
CREATE INDEX "ClinicalPediatricReferencePolicy_inputCode_status_idx"
  ON "ClinicalPediatricReferencePolicy"("inputCode", "status");
CREATE INDEX "ClinicalPediatricReferencePolicy_status_idx" ON "ClinicalPediatricReferencePolicy"("status");
CREATE INDEX "ClinicalPediatricReferencePolicy_releaseId_idx" ON "ClinicalPediatricReferencePolicy"("releaseId");

ALTER TABLE "ClinicalReferencePointer"
  ADD CONSTRAINT "ClinicalReferencePointer_releaseId_fkey"
  FOREIGN KEY ("releaseId") REFERENCES "ClinicalReferenceRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClinicalReferenceSource"
  ADD CONSTRAINT "ClinicalReferenceSource_releaseId_fkey"
  FOREIGN KEY ("releaseId") REFERENCES "ClinicalReferenceRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClinicalReferenceSource"
  ADD CONSTRAINT "ClinicalReferenceSource_supersededById_fkey"
  FOREIGN KEY ("supersededById") REFERENCES "ClinicalReferenceSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClinicalReferenceValue"
  ADD CONSTRAINT "ClinicalReferenceValue_releaseId_fkey"
  FOREIGN KEY ("releaseId") REFERENCES "ClinicalReferenceRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClinicalReferenceValue"
  ADD CONSTRAINT "ClinicalReferenceValue_supersededById_fkey"
  FOREIGN KEY ("supersededById") REFERENCES "ClinicalReferenceValue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClinicalTreatmentTarget"
  ADD CONSTRAINT "ClinicalTreatmentTarget_releaseId_fkey"
  FOREIGN KEY ("releaseId") REFERENCES "ClinicalReferenceRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClinicalTreatmentTarget"
  ADD CONSTRAINT "ClinicalTreatmentTarget_supersededById_fkey"
  FOREIGN KEY ("supersededById") REFERENCES "ClinicalTreatmentTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClinicalPediatricReferencePolicy"
  ADD CONSTRAINT "ClinicalPediatricReferencePolicy_releaseId_fkey"
  FOREIGN KEY ("releaseId") REFERENCES "ClinicalReferenceRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClinicalPediatricReferencePolicy"
  ADD CONSTRAINT "ClinicalPediatricReferencePolicy_supersededById_fkey"
  FOREIGN KEY ("supersededById") REFERENCES "ClinicalPediatricReferencePolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Clinical Judgment AI Red-Flag Check v1.0
CREATE TABLE IF NOT EXISTS "ClinicalRedFlagCheck" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "consultationId" TEXT NOT NULL,
  "clinicalJudgmentAssessmentId" TEXT NOT NULL,
  "patientProfileSnapshotId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "generationMode" TEXT NOT NULL,
  "sourceSnapshotHash" TEXT NOT NULL,
  "evidenceCollectionVersion" TEXT,
  "deterministicRuleSetVersion" TEXT NOT NULL DEFAULT 'cj-rules-v1',
  "promptKey" TEXT,
  "promptVersion" TEXT,
  "model" TEXT,
  "modelConfiguration" JSONB,
  "inputManifest" JSONB NOT NULL,
  "candidateManifest" JSONB,
  "validationResult" JSONB,
  "otherUnresolvedConcern" BOOLEAN,
  "otherConcernDetails" TEXT,
  "finalDecision" TEXT,
  "regenerationReason" TEXT,
  "regenerationReasonDetail" TEXT,
  "confirmedById" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "supersededById" TEXT,
  "rowVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClinicalRedFlagCheck_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ClinicalRedFlagQuestion" (
  "id" TEXT NOT NULL,
  "redFlagCheckId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "candidateId" TEXT NOT NULL,
  "canonicalLabel" TEXT NOT NULL,
  "questionText" TEXT NOT NULL,
  "whyItMatters" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "referralAction" TEXT NOT NULL,
  "ruleId" TEXT,
  "sourceReferences" JSONB NOT NULL,
  "selectionReasonCode" TEXT NOT NULL,
  "answer" TEXT,
  "answerNotes" TEXT,
  "answeredById" TEXT,
  "answeredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClinicalRedFlagQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ClinicalRedFlagManualConcern" (
  "id" TEXT NOT NULL,
  "redFlagCheckId" TEXT NOT NULL,
  "concernText" TEXT NOT NULL,
  "whyItMatters" TEXT,
  "responseStatus" TEXT NOT NULL,
  "referralAction" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClinicalRedFlagManualConcern_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ClinicalRedFlagCheck_consultationId_status_idx"
  ON "ClinicalRedFlagCheck"("consultationId", "status");
CREATE INDEX IF NOT EXISTS "ClinicalRedFlagCheck_tenantId_idx"
  ON "ClinicalRedFlagCheck"("tenantId");
CREATE INDEX IF NOT EXISTS "ClinicalRedFlagCheck_sourceSnapshotHash_idx"
  ON "ClinicalRedFlagCheck"("sourceSnapshotHash");
CREATE INDEX IF NOT EXISTS "ClinicalRedFlagQuestion_redFlagCheckId_idx"
  ON "ClinicalRedFlagQuestion"("redFlagCheckId");
CREATE INDEX IF NOT EXISTS "ClinicalRedFlagManualConcern_redFlagCheckId_idx"
  ON "ClinicalRedFlagManualConcern"("redFlagCheckId");

CREATE UNIQUE INDEX IF NOT EXISTS "ClinicalRedFlagQuestion_redFlagCheckId_sequence_key"
  ON "ClinicalRedFlagQuestion"("redFlagCheckId", "sequence");
CREATE UNIQUE INDEX IF NOT EXISTS "ClinicalRedFlagQuestion_redFlagCheckId_candidateId_key"
  ON "ClinicalRedFlagQuestion"("redFlagCheckId", "candidateId");

DO $$ BEGIN
  ALTER TABLE "ClinicalRedFlagCheck"
    ADD CONSTRAINT "ClinicalRedFlagCheck_consultationId_fkey"
    FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ClinicalRedFlagCheck"
    ADD CONSTRAINT "ClinicalRedFlagCheck_clinicalJudgmentAssessmentId_fkey"
    FOREIGN KEY ("clinicalJudgmentAssessmentId") REFERENCES "ClinicalJudgmentAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ClinicalRedFlagQuestion"
    ADD CONSTRAINT "ClinicalRedFlagQuestion_redFlagCheckId_fkey"
    FOREIGN KEY ("redFlagCheckId") REFERENCES "ClinicalRedFlagCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ClinicalRedFlagManualConcern"
    ADD CONSTRAINT "ClinicalRedFlagManualConcern_redFlagCheckId_fkey"
    FOREIGN KEY ("redFlagCheckId") REFERENCES "ClinicalRedFlagCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterEnum
ALTER TYPE "SafetyRuleType" ADD VALUE 'DRUG_DISEASE';

-- AlterEnum
ALTER TYPE "SafetySelectorType" ADD VALUE 'VALUE_SET';
ALTER TYPE "SafetySelectorType" ADD VALUE 'INGREDIENT_SELECTOR';
ALTER TYPE "SafetySelectorType" ADD VALUE 'PRODUCT_SELECTOR';

-- CreateEnum
CREATE TYPE "ClinicalImportBatchStatus" AS ENUM (
  'UPLOADED', 'PARSING', 'VALIDATING', 'REQUIRES_CORRECTION',
  'READY_TO_IMPORT', 'IMPORTED', 'FAILED', 'CANCELLED'
);

CREATE TYPE "ClinicalImportRowStatus" AS ENUM (
  'PENDING', 'VALID', 'WARNING', 'ERROR', 'IMPORTED', 'SKIPPED'
);

CREATE TYPE "TerminologyReleaseStatus" AS ENUM (
  'DISCOVERED', 'DOWNLOADED', 'STAGED', 'VALIDATED',
  'READY', 'ACTIVE', 'FAILED', 'RETIRED'
);

CREATE TYPE "ValueSetMembershipAction" AS ENUM ('INCLUDE', 'EXCLUDE');

-- AlterTable SafetyRuleVersion
ALTER TABLE "SafetyRuleVersion"
  ADD COLUMN IF NOT EXISTS "ruleVersionLabel" TEXT,
  ADD COLUMN IF NOT EXISTS "acknowledgementRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "deduplicationGroup" TEXT,
  ADD COLUMN IF NOT EXISTS "specificityRank" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ruleEffect" TEXT,
  ADD COLUMN IF NOT EXISTS "effectiveStartDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "effectiveEndDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "importBatchId" TEXT,
  ADD COLUMN IF NOT EXISTS "importRowId" TEXT,
  ADD COLUMN IF NOT EXISTS "payload" JSONB;

CREATE INDEX IF NOT EXISTS "SafetyRuleVersion_deduplicationGroup_idx" ON "SafetyRuleVersion"("deduplicationGroup");

-- AlterTable SafetyRuleParticipant
ALTER TABLE "SafetyRuleParticipant"
  ADD COLUMN IF NOT EXISTS "selectorVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "terminologySystem" TEXT,
  ADD COLUMN IF NOT EXISTS "resolvedConceptIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "routeScope" TEXT,
  ADD COLUMN IF NOT EXISTS "doseFormScope" TEXT,
  ADD COLUMN IF NOT EXISTS "resolutionStatus" TEXT;

CREATE INDEX IF NOT EXISTS "SafetyRuleParticipant_conceptCode_idx" ON "SafetyRuleParticipant"("conceptCode");

-- AlterTable SafetyRuleEvidence (extend governance)
ALTER TABLE "SafetyRuleEvidence"
  ALTER COLUMN "versionId" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "evidenceLinkId" TEXT,
  ADD COLUMN IF NOT EXISTS "ruleCode" TEXT,
  ADD COLUMN IF NOT EXISTS "ruleVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "clinicalDomain" TEXT,
  ADD COLUMN IF NOT EXISTS "evidenceRole" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceType" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceOrganization" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceJurisdiction" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceIdentifier" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceVersionOrDate" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceLocator" TEXT,
  ADD COLUMN IF NOT EXISTS "evidenceSummary" TEXT,
  ADD COLUMN IF NOT EXISTS "applicabilityToRule" TEXT,
  ADD COLUMN IF NOT EXISTS "limitationsOrUncertainty" TEXT,
  ADD COLUMN IF NOT EXISTS "evidenceQuality" TEXT,
  ADD COLUMN IF NOT EXISTS "recommendationStrength" TEXT,
  ADD COLUMN IF NOT EXISTS "supportsRuleOutcome" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceStatus" TEXT DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "recordStatus" "SafetyRuleStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS "approvalStatus" TEXT DEFAULT 'NOT_REVIEWED',
  ADD COLUMN IF NOT EXISTS "clinicalReviewer" TEXT,
  ADD COLUMN IF NOT EXISTS "clinicalReviewDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "nextReviewDue" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "effectiveFrom" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "effectiveTo" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "importBatchId" TEXT,
  ADD COLUMN IF NOT EXISTS "extractedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "extractionDate" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "SafetyRuleEvidence_evidenceLinkId_idx" ON "SafetyRuleEvidence"("evidenceLinkId");
CREATE INDEX IF NOT EXISTS "SafetyRuleEvidence_ruleCode_ruleVersion_idx" ON "SafetyRuleEvidence"("ruleCode", "ruleVersion");
CREATE INDEX IF NOT EXISTS "SafetyRuleEvidence_importBatchId_idx" ON "SafetyRuleEvidence"("importBatchId");

-- AlterTable SafetyDdiRuleDetail
ALTER TABLE "SafetyDdiRuleDetail"
  ADD COLUMN IF NOT EXISTS "drugASelectorType" TEXT,
  ADD COLUMN IF NOT EXISTS "drugASelectorCode" TEXT,
  ADD COLUMN IF NOT EXISTS "drugASelectorVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "drugBSelectorType" TEXT,
  ADD COLUMN IF NOT EXISTS "drugBSelectorCode" TEXT,
  ADD COLUMN IF NOT EXISTS "drugBSelectorVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "pairMatchMode" TEXT,
  ADD COLUMN IF NOT EXISTS "exposureWindowCode" TEXT,
  ADD COLUMN IF NOT EXISTS "interactionMechanismCode" TEXT,
  ADD COLUMN IF NOT EXISTS "clinicalEffectCode" TEXT,
  ADD COLUMN IF NOT EXISTS "applicabilityConditionCode" TEXT,
  ADD COLUMN IF NOT EXISTS "monitoringCode" TEXT,
  ADD COLUMN IF NOT EXISTS "monitoringDetail" TEXT;

CREATE INDEX IF NOT EXISTS "SafetyDdiRuleDetail_drugASelectorCode_idx" ON "SafetyDdiRuleDetail"("drugASelectorCode");
CREATE INDEX IF NOT EXISTS "SafetyDdiRuleDetail_drugBSelectorCode_idx" ON "SafetyDdiRuleDetail"("drugBSelectorCode");

-- CreateTable SafetyDrugDiseaseRuleDetail
CREATE TABLE IF NOT EXISTS "SafetyDrugDiseaseRuleDetail" (
  "id" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "drugSelectorType" TEXT NOT NULL,
  "drugSelectorCode" TEXT NOT NULL,
  "drugSelectorVersion" TEXT,
  "drugDisplayName" TEXT,
  "drugRouteScopeCode" TEXT,
  "conditionCodeSystemUri" TEXT,
  "conditionConceptCode" TEXT,
  "conditionTerminologyVersion" TEXT,
  "conditionDisplayName" TEXT,
  "conditionMatchMode" TEXT,
  "conditionClinicalStatusRequired" TEXT,
  "conditionTemporalityCode" TEXT,
  "conditionSeverityRequirement" TEXT,
  "conditionVerificationRequirement" TEXT,
  "applicabilityConditionCode" TEXT,
  "clinicalRationaleCode" TEXT,
  "monitoringCode" TEXT,
  "monitoringDetail" TEXT,
  "actionRequired" "SafetyClinicalAction" NOT NULL DEFAULT 'PHARMACIST_REVIEW',
  CONSTRAINT "SafetyDrugDiseaseRuleDetail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SafetyDrugDiseaseRuleDetail_versionId_key" ON "SafetyDrugDiseaseRuleDetail"("versionId");
CREATE INDEX IF NOT EXISTS "SafetyDrugDiseaseRuleDetail_drugSelectorCode_idx" ON "SafetyDrugDiseaseRuleDetail"("drugSelectorCode");
CREATE INDEX IF NOT EXISTS "SafetyDrugDiseaseRuleDetail_conditionConceptCode_idx" ON "SafetyDrugDiseaseRuleDetail"("conditionConceptCode");

-- AlterTable SafetyKnowledgeRelease
ALTER TABLE "SafetyKnowledgeRelease"
  ADD COLUMN IF NOT EXISTS "jurisdiction" TEXT NOT NULL DEFAULT 'CA',
  ADD COLUMN IF NOT EXISTS "terminologyReleaseId" TEXT,
  ADD COLUMN IF NOT EXISTS "releaseNotes" TEXT;

CREATE INDEX IF NOT EXISTS "SafetyKnowledgeRelease_terminologyReleaseId_idx" ON "SafetyKnowledgeRelease"("terminologyReleaseId");

-- AlterTable SafetyEvaluation
ALTER TABLE "SafetyEvaluation"
  ADD COLUMN IF NOT EXISTS "terminologyReleaseId" TEXT,
  ADD COLUMN IF NOT EXISTS "terminologyVersion" TEXT;

CREATE INDEX IF NOT EXISTS "SafetyEvaluation_terminologyReleaseId_idx" ON "SafetyEvaluation"("terminologyReleaseId");

-- TerminologyRelease
CREATE TABLE IF NOT EXISTS "TerminologyRelease" (
  "id" TEXT NOT NULL,
  "releaseKey" TEXT NOT NULL,
  "status" "TerminologyReleaseStatus" NOT NULL DEFAULT 'DISCOVERED',
  "ccddVersion" TEXT NOT NULL,
  "ccddCanonicalUrl" TEXT NOT NULL,
  "snomedVersion" TEXT,
  "dpdReleaseDate" TIMESTAMP(3),
  "sourceMetadata" JSONB NOT NULL DEFAULT '{}',
  "sourceChecksums" JSONB NOT NULL DEFAULT '{}',
  "validationSummary" JSONB NOT NULL DEFAULT '{}',
  "downloadedAt" TIMESTAMP(3),
  "validatedAt" TIMESTAMP(3),
  "activatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  CONSTRAINT "TerminologyRelease_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TerminologyRelease_releaseKey_key" ON "TerminologyRelease"("releaseKey");
CREATE INDEX IF NOT EXISTS "TerminologyRelease_status_idx" ON "TerminologyRelease"("status");
CREATE INDEX IF NOT EXISTS "TerminologyRelease_ccddVersion_idx" ON "TerminologyRelease"("ccddVersion");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_active_terminology_release"
  ON "TerminologyRelease" (("status"))
  WHERE "status" = 'ACTIVE';

-- TerminologyDrugConcept
CREATE TABLE IF NOT EXISTS "TerminologyDrugConcept" (
  "id" TEXT NOT NULL,
  "terminologyReleaseId" TEXT NOT NULL,
  "sourceSystem" TEXT NOT NULL,
  "sourceCode" TEXT NOT NULL,
  "sourceVersion" TEXT NOT NULL,
  "conceptKey" TEXT NOT NULL,
  "conceptType" TEXT NOT NULL,
  "preferredNameEn" TEXT NOT NULL,
  "preferredNameFr" TEXT,
  "normalizedSearchName" TEXT NOT NULL,
  "synonyms" JSONB NOT NULL DEFAULT '[]',
  "clinicalDrugCode" TEXT,
  "genericProductCode" TEXT,
  "packagedProductCode" TEXT,
  "snomedCode" TEXT,
  "brandName" TEXT,
  "strengthNumeratorValue" DOUBLE PRECISION,
  "strengthNumeratorUnit" TEXT,
  "strengthDenominatorValue" DOUBLE PRECISION,
  "strengthDenominatorUnit" TEXT,
  "doseFormCode" TEXT,
  "doseFormDisplay" TEXT,
  "routeCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "routeDisplays" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "atcCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "dinCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "dpdDrugCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "marketStatus" TEXT,
  "manufacturerNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "effectiveStart" TIMESTAMP(3),
  "effectiveEnd" TIMESTAMP(3),
  "replacedBySourceCode" TEXT,
  "rawSource" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TerminologyDrugConcept_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TerminologyDrugConcept_release_system_code_key"
  ON "TerminologyDrugConcept"("terminologyReleaseId", "sourceSystem", "sourceCode");
CREATE INDEX IF NOT EXISTS "TerminologyDrugConcept_normalizedSearchName_idx" ON "TerminologyDrugConcept"("normalizedSearchName");
CREATE INDEX IF NOT EXISTS "TerminologyDrugConcept_snomedCode_idx" ON "TerminologyDrugConcept"("snomedCode");
CREATE INDEX IF NOT EXISTS "TerminologyDrugConcept_conceptType_idx" ON "TerminologyDrugConcept"("conceptType");
CREATE INDEX IF NOT EXISTS "TerminologyDrugConcept_isActive_idx" ON "TerminologyDrugConcept"("isActive");

-- TerminologyIngredientEdge
CREATE TABLE IF NOT EXISTS "TerminologyIngredientEdge" (
  "id" TEXT NOT NULL,
  "terminologyReleaseId" TEXT NOT NULL,
  "medicationId" TEXT NOT NULL,
  "ingredientId" TEXT NOT NULL,
  "relationshipType" TEXT NOT NULL,
  "sourceRelationshipCode" TEXT,
  "ingredientRole" TEXT NOT NULL DEFAULT 'ACTIVE',
  "basisOfStrength" BOOLEAN,
  "strengthNumeratorValue" DOUBLE PRECISION,
  "strengthNumeratorUnit" TEXT,
  "strengthDenominatorValue" DOUBLE PRECISION,
  "strengthDenominatorUnit" TEXT,
  "relationshipGroup" INTEGER,
  "provenanceSource" TEXT NOT NULL,
  "provenanceVersion" TEXT NOT NULL,
  "derivationMethod" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "rawSource" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TerminologyIngredientEdge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TerminologyIngredientEdge_unique"
  ON "TerminologyIngredientEdge"("terminologyReleaseId", "medicationId", "ingredientId", "relationshipType", "ingredientRole");
CREATE INDEX IF NOT EXISTS "TerminologyIngredientEdge_med_idx"
  ON "TerminologyIngredientEdge"("terminologyReleaseId", "medicationId");
CREATE INDEX IF NOT EXISTS "TerminologyIngredientEdge_ing_idx"
  ON "TerminologyIngredientEdge"("terminologyReleaseId", "ingredientId");

-- ClinicalImportBatch
CREATE TABLE IF NOT EXISTS "ClinicalImportBatch" (
  "id" TEXT NOT NULL,
  "fileTypeKey" TEXT,
  "originalFilename" TEXT NOT NULL,
  "storagePath" TEXT,
  "sha256" TEXT NOT NULL,
  "workbookSheetName" TEXT,
  "headerFingerprint" TEXT,
  "schemaVersion" TEXT,
  "status" "ClinicalImportBatchStatus" NOT NULL DEFAULT 'UPLOADED',
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "validRows" INTEGER NOT NULL DEFAULT 0,
  "warningRows" INTEGER NOT NULL DEFAULT 0,
  "errorRows" INTEGER NOT NULL DEFAULT 0,
  "targetReleaseId" TEXT,
  "jurisdiction" TEXT NOT NULL DEFAULT 'CA',
  "terminologyReleaseId" TEXT,
  "failureSummary" TEXT,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploadedById" TEXT NOT NULL,
  "importedAt" TIMESTAMP(3),
  "importedById" TEXT,
  CONSTRAINT "ClinicalImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClinicalImportBatch_sha256_targetReleaseId_key"
  ON "ClinicalImportBatch"("sha256", "targetReleaseId");
CREATE INDEX IF NOT EXISTS "ClinicalImportBatch_status_idx" ON "ClinicalImportBatch"("status");
CREATE INDEX IF NOT EXISTS "ClinicalImportBatch_fileTypeKey_idx" ON "ClinicalImportBatch"("fileTypeKey");
CREATE INDEX IF NOT EXISTS "ClinicalImportBatch_uploadedAt_idx" ON "ClinicalImportBatch"("uploadedAt");

-- ClinicalImportRow
CREATE TABLE IF NOT EXISTS "ClinicalImportRow" (
  "id" TEXT NOT NULL,
  "importBatchId" TEXT NOT NULL,
  "sourceRowNumber" INTEGER NOT NULL,
  "businessKey" TEXT,
  "rawPayload" JSONB NOT NULL,
  "normalizedPayload" JSONB,
  "rowStatus" "ClinicalImportRowStatus" NOT NULL DEFAULT 'PENDING',
  "errors" JSONB NOT NULL DEFAULT '[]',
  "warnings" JSONB NOT NULL DEFAULT '[]',
  "promotedRecordType" TEXT,
  "promotedRecordId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClinicalImportRow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClinicalImportRow_batch_row_key"
  ON "ClinicalImportRow"("importBatchId", "sourceRowNumber");
CREATE INDEX IF NOT EXISTS "ClinicalImportRow_rowStatus_idx" ON "ClinicalImportRow"("rowStatus");
CREATE INDEX IF NOT EXISTS "ClinicalImportRow_businessKey_idx" ON "ClinicalImportRow"("businessKey");

-- ClinicalValueSet
CREATE TABLE IF NOT EXISTS "ClinicalValueSet" (
  "id" TEXT NOT NULL,
  "releaseId" TEXT,
  "valueSetCode" TEXT NOT NULL,
  "valueSetVersion" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "description" TEXT,
  "clinicalDomain" TEXT NOT NULL,
  "intendedUse" TEXT NOT NULL,
  "memberConceptType" TEXT NOT NULL,
  "terminologyBasis" TEXT,
  "candidateGenerationMethod" TEXT,
  "membershipMode" TEXT NOT NULL,
  "routeScope" TEXT,
  "doseFormScope" TEXT,
  "inclusionDefinition" TEXT NOT NULL,
  "exclusionDefinition" TEXT,
  "clinicalSteward" TEXT,
  "reviewFrequencyMonths" INTEGER,
  "terminologyReleaseSnapshot" TEXT,
  "recordStatus" "SafetyRuleStatus" NOT NULL DEFAULT 'DRAFT',
  "approvalStatus" TEXT NOT NULL DEFAULT 'NOT_REVIEWED',
  "effectiveFrom" TIMESTAMP(3),
  "effectiveTo" TIMESTAMP(3),
  "changeSummary" TEXT,
  "importBatchId" TEXT,
  "sourceRowId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClinicalValueSet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClinicalValueSet_code_version_release_key"
  ON "ClinicalValueSet"("valueSetCode", "valueSetVersion", "releaseId");
CREATE INDEX IF NOT EXISTS "ClinicalValueSet_valueSetCode_idx" ON "ClinicalValueSet"("valueSetCode");
CREATE INDEX IF NOT EXISTS "ClinicalValueSet_recordStatus_idx" ON "ClinicalValueSet"("recordStatus");
CREATE INDEX IF NOT EXISTS "ClinicalValueSet_importBatchId_idx" ON "ClinicalValueSet"("importBatchId");

-- ClinicalValueSetMember
CREATE TABLE IF NOT EXISTS "ClinicalValueSetMember" (
  "id" TEXT NOT NULL,
  "valueSetId" TEXT NOT NULL,
  "memberSequence" INTEGER NOT NULL,
  "membershipAction" "ValueSetMembershipAction" NOT NULL,
  "memberSelectorType" TEXT NOT NULL,
  "memberLocalCode" TEXT,
  "memberDisplayName" TEXT NOT NULL,
  "conceptDomain" TEXT NOT NULL,
  "terminologySystem" TEXT,
  "terminologyConceptCode" TEXT,
  "terminologyDisplayName" TEXT,
  "terminologyVersion" TEXT,
  "routeScope" TEXT,
  "doseFormScope" TEXT,
  "candidateSource" TEXT,
  "candidateQueryReference" TEXT,
  "mappingMethod" TEXT,
  "mappingConfidence" TEXT,
  "clinicalRationale" TEXT,
  "clinicalReviewStatus" TEXT NOT NULL,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "recordStatus" "SafetyRuleStatus" NOT NULL DEFAULT 'DRAFT',
  "effectiveFrom" TIMESTAMP(3),
  "effectiveTo" TIMESTAMP(3),
  "changeSummary" TEXT,
  "importBatchId" TEXT,
  "sourceRowId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClinicalValueSetMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClinicalValueSetMember_set_seq_key"
  ON "ClinicalValueSetMember"("valueSetId", "memberSequence");
CREATE INDEX IF NOT EXISTS "ClinicalValueSetMember_terminologyConceptCode_idx" ON "ClinicalValueSetMember"("terminologyConceptCode");
CREATE INDEX IF NOT EXISTS "ClinicalValueSetMember_membershipAction_idx" ON "ClinicalValueSetMember"("membershipAction");
CREATE INDEX IF NOT EXISTS "ClinicalValueSetMember_importBatchId_idx" ON "ClinicalValueSetMember"("importBatchId");

-- ClinicalTestCase
CREATE TABLE IF NOT EXISTS "ClinicalTestCase" (
  "id" TEXT NOT NULL,
  "releaseId" TEXT,
  "testCaseId" TEXT NOT NULL,
  "suiteVersion" TEXT NOT NULL,
  "testCaseName" TEXT NOT NULL,
  "safetyDomain" TEXT NOT NULL,
  "testType" TEXT NOT NULL,
  "priority" TEXT NOT NULL,
  "jurisdiction" TEXT NOT NULL,
  "scenarioSummary" TEXT NOT NULL,
  "ruleCodeUnderTest" TEXT,
  "ruleVersionUnderTest" TEXT,
  "inputBundleKey" TEXT NOT NULL,
  "requiredRepositoryRelease" TEXT,
  "requiredTerminologyRelease" TEXT,
  "expectedRawMatchCount" INTEGER NOT NULL,
  "expectedPrimaryRuleCode" TEXT,
  "expectedRuleEffect" TEXT,
  "expectedAlertSeverity" TEXT,
  "expectedActionCode" TEXT,
  "expectedDeduplicatedFindingCount" INTEGER NOT NULL,
  "expectedNoMatchReason" TEXT,
  "passCriteria" TEXT NOT NULL,
  "executionMode" TEXT NOT NULL,
  "contentStatus" "SafetyRuleStatus" NOT NULL DEFAULT 'DRAFT',
  "testOwnerRole" TEXT,
  "implementationNotes" TEXT,
  "importBatchId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClinicalTestCase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClinicalTestCase_id_suite_release_key"
  ON "ClinicalTestCase"("testCaseId", "suiteVersion", "releaseId");
CREATE INDEX IF NOT EXISTS "ClinicalTestCase_inputBundleKey_idx" ON "ClinicalTestCase"("inputBundleKey");
CREATE INDEX IF NOT EXISTS "ClinicalTestCase_safetyDomain_idx" ON "ClinicalTestCase"("safetyDomain");
CREATE INDEX IF NOT EXISTS "ClinicalTestCase_priority_idx" ON "ClinicalTestCase"("priority");
CREATE INDEX IF NOT EXISTS "ClinicalTestCase_importBatchId_idx" ON "ClinicalTestCase"("importBatchId");

-- ClinicalTestInput
CREATE TABLE IF NOT EXISTS "ClinicalTestInput" (
  "id" TEXT NOT NULL,
  "releaseId" TEXT,
  "recordId" TEXT NOT NULL,
  "inputBundleKey" TEXT NOT NULL,
  "inputSequence" INTEGER NOT NULL,
  "inputType" TEXT NOT NULL,
  "entityRole" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "terminologyRelease" TEXT,
  "resolutionStatus" TEXT NOT NULL,
  "contentStatus" "SafetyRuleStatus" NOT NULL DEFAULT 'DRAFT',
  "implementationNotes" TEXT,
  "importBatchId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClinicalTestInput_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClinicalTestInput_record_release_key"
  ON "ClinicalTestInput"("recordId", "releaseId");
CREATE UNIQUE INDEX IF NOT EXISTS "ClinicalTestInput_bundle_seq_release_key"
  ON "ClinicalTestInput"("inputBundleKey", "inputSequence", "releaseId");
CREATE INDEX IF NOT EXISTS "ClinicalTestInput_inputBundleKey_idx" ON "ClinicalTestInput"("inputBundleKey");
CREATE INDEX IF NOT EXISTS "ClinicalTestInput_importBatchId_idx" ON "ClinicalTestInput"("importBatchId");

-- Foreign keys
ALTER TABLE "SafetyDrugDiseaseRuleDetail"
  ADD CONSTRAINT "SafetyDrugDiseaseRuleDetail_versionId_fkey"
  FOREIGN KEY ("versionId") REFERENCES "SafetyRuleVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TerminologyRelease"
  ADD CONSTRAINT "TerminologyRelease_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TerminologyDrugConcept"
  ADD CONSTRAINT "TerminologyDrugConcept_terminologyReleaseId_fkey"
  FOREIGN KEY ("terminologyReleaseId") REFERENCES "TerminologyRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TerminologyIngredientEdge"
  ADD CONSTRAINT "TerminologyIngredientEdge_terminologyReleaseId_fkey"
  FOREIGN KEY ("terminologyReleaseId") REFERENCES "TerminologyRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TerminologyIngredientEdge"
  ADD CONSTRAINT "TerminologyIngredientEdge_medicationId_fkey"
  FOREIGN KEY ("medicationId") REFERENCES "TerminologyDrugConcept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TerminologyIngredientEdge"
  ADD CONSTRAINT "TerminologyIngredientEdge_ingredientId_fkey"
  FOREIGN KEY ("ingredientId") REFERENCES "TerminologyDrugConcept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClinicalImportBatch"
  ADD CONSTRAINT "ClinicalImportBatch_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClinicalImportBatch"
  ADD CONSTRAINT "ClinicalImportBatch_importedById_fkey"
  FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClinicalImportBatch"
  ADD CONSTRAINT "ClinicalImportBatch_targetReleaseId_fkey"
  FOREIGN KEY ("targetReleaseId") REFERENCES "SafetyKnowledgeRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClinicalImportBatch"
  ADD CONSTRAINT "ClinicalImportBatch_terminologyReleaseId_fkey"
  FOREIGN KEY ("terminologyReleaseId") REFERENCES "TerminologyRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClinicalImportRow"
  ADD CONSTRAINT "ClinicalImportRow_importBatchId_fkey"
  FOREIGN KEY ("importBatchId") REFERENCES "ClinicalImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClinicalValueSet"
  ADD CONSTRAINT "ClinicalValueSet_releaseId_fkey"
  FOREIGN KEY ("releaseId") REFERENCES "SafetyKnowledgeRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClinicalValueSet"
  ADD CONSTRAINT "ClinicalValueSet_importBatchId_fkey"
  FOREIGN KEY ("importBatchId") REFERENCES "ClinicalImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClinicalValueSetMember"
  ADD CONSTRAINT "ClinicalValueSetMember_valueSetId_fkey"
  FOREIGN KEY ("valueSetId") REFERENCES "ClinicalValueSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClinicalValueSetMember"
  ADD CONSTRAINT "ClinicalValueSetMember_importBatchId_fkey"
  FOREIGN KEY ("importBatchId") REFERENCES "ClinicalImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClinicalTestCase"
  ADD CONSTRAINT "ClinicalTestCase_releaseId_fkey"
  FOREIGN KEY ("releaseId") REFERENCES "SafetyKnowledgeRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClinicalTestCase"
  ADD CONSTRAINT "ClinicalTestCase_importBatchId_fkey"
  FOREIGN KEY ("importBatchId") REFERENCES "ClinicalImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClinicalTestInput"
  ADD CONSTRAINT "ClinicalTestInput_releaseId_fkey"
  FOREIGN KEY ("releaseId") REFERENCES "SafetyKnowledgeRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClinicalTestInput"
  ADD CONSTRAINT "ClinicalTestInput_importBatchId_fkey"
  FOREIGN KEY ("importBatchId") REFERENCES "ClinicalImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SafetyRuleVersion"
  ADD CONSTRAINT "SafetyRuleVersion_importBatchId_fkey"
  FOREIGN KEY ("importBatchId") REFERENCES "ClinicalImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SafetyRuleVersion"
  ADD CONSTRAINT "SafetyRuleVersion_importRowId_fkey"
  FOREIGN KEY ("importRowId") REFERENCES "ClinicalImportRow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SafetyRuleEvidence"
  ADD CONSTRAINT "SafetyRuleEvidence_importBatchId_fkey"
  FOREIGN KEY ("importBatchId") REFERENCES "ClinicalImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SafetyKnowledgeRelease"
  ADD CONSTRAINT "SafetyKnowledgeRelease_terminologyReleaseId_fkey"
  FOREIGN KEY ("terminologyReleaseId") REFERENCES "TerminologyRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SafetyEvaluation"
  ADD CONSTRAINT "SafetyEvaluation_terminologyReleaseId_fkey"
  FOREIGN KEY ("terminologyReleaseId") REFERENCES "TerminologyRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

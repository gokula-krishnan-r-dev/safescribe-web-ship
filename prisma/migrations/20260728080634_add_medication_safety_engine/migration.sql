-- CreateEnum
CREATE TYPE "SafetyRuleType" AS ENUM ('ALLERGY_DIRECT', 'CROSS_REACTIVITY');

-- CreateEnum
CREATE TYPE "SafetyRuleStatus" AS ENUM ('DRAFT', 'APPROVED', 'PUBLISHED', 'SUPERSEDED', 'RETIRED');

-- CreateEnum
CREATE TYPE "SafetySelectorType" AS ENUM ('EXACT_INGREDIENT', 'HAS_INGREDIENT', 'MEMBER_OF_CLASS', 'STRUCTURAL_RELATIONSHIP');

-- CreateEnum
CREATE TYPE "SafetyClinicalSeverity" AS ENUM ('INFO', 'LOW', 'MODERATE', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "SafetyEvalStatus" AS ENUM ('COMPLETE_NO_FINDINGS', 'COMPLETE_WITH_FINDINGS', 'VERIFICATION_INCOMPLETE', 'INPUT_INCOMPLETE', 'SERVICE_UNAVAILABLE');

-- CreateEnum
CREATE TYPE "SafetyMatchType" AS ENUM ('exact_ingredient', 'combination_product_contains_exact_ingredient', 'same_class', 'side_chain_structural');

-- CreateTable
CREATE TABLE "SafetyKnowledgeRule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "ruleType" "SafetyRuleType" NOT NULL,
    "jurisdiction" TEXT NOT NULL DEFAULT 'ALL',
    "operationalState" TEXT NOT NULL DEFAULT 'active',
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafetyKnowledgeRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyRuleVersion" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "SafetyRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "changeSummary" TEXT,
    "summary" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "clinicalSeverity" "SafetyClinicalSeverity" NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "overrideAllowed" BOOLEAN NOT NULL DEFAULT true,
    "overrideReasonRequired" BOOLEAN NOT NULL DEFAULT true,
    "matchType" "SafetyMatchType",
    "relationshipType" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafetyRuleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyRuleParticipant" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "participantKey" TEXT NOT NULL,
    "selectorType" "SafetySelectorType" NOT NULL,
    "conceptText" TEXT NOT NULL,
    "conceptCode" TEXT,

    CONSTRAINT "SafetyRuleParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyRuleEvidence" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "section" TEXT,
    "accessDate" TIMESTAMP(3),
    "relevanceNote" TEXT,

    CONSTRAINT "SafetyRuleEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyKnowledgeRelease" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL DEFAULT 'safety-engine-1.0.0',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedById" TEXT NOT NULL,
    "priorReleaseId" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafetyKnowledgeRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyReleaseItem" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,

    CONSTRAINT "SafetyReleaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyReleasePointer" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "releaseId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafetyReleasePointer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationIngredient" (
    "id" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "genericName" TEXT,
    "ingredients" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicationIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrugClassMembership" (
    "id" TEXT NOT NULL,
    "drugName" TEXT NOT NULL,
    "className" TEXT NOT NULL,

    CONSTRAINT "DrugClassMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyEvaluation" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT,
    "tenantId" TEXT,
    "status" "SafetyEvalStatus" NOT NULL,
    "knowledgeRelease" TEXT,
    "engineVersion" TEXT,
    "requestPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafetyEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyEvaluationFinding" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "findingType" TEXT NOT NULL,
    "matchType" TEXT,
    "summary" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "clinicalSeverity" "SafetyClinicalSeverity" NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "ruleVersionId" TEXT,
    "ruleCode" TEXT,
    "displayed" BOOLEAN NOT NULL DEFAULT true,
    "suppressedReason" TEXT,

    CONSTRAINT "SafetyEvaluationFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyEvaluationOverride" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "reasonComment" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafetyEvaluationOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SafetyKnowledgeRule_code_key" ON "SafetyKnowledgeRule"("code");

-- CreateIndex
CREATE INDEX "SafetyKnowledgeRule_ruleType_idx" ON "SafetyKnowledgeRule"("ruleType");

-- CreateIndex
CREATE INDEX "SafetyKnowledgeRule_operationalState_idx" ON "SafetyKnowledgeRule"("operationalState");

-- CreateIndex
CREATE INDEX "SafetyRuleVersion_status_idx" ON "SafetyRuleVersion"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SafetyRuleVersion_ruleId_versionNumber_key" ON "SafetyRuleVersion"("ruleId", "versionNumber");

-- CreateIndex
CREATE INDEX "SafetyRuleParticipant_versionId_idx" ON "SafetyRuleParticipant"("versionId");

-- CreateIndex
CREATE INDEX "SafetyRuleEvidence_versionId_idx" ON "SafetyRuleEvidence"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "SafetyKnowledgeRelease_version_key" ON "SafetyKnowledgeRelease"("version");

-- CreateIndex
CREATE INDEX "SafetyKnowledgeRelease_publishedAt_idx" ON "SafetyKnowledgeRelease"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SafetyReleaseItem_releaseId_versionId_key" ON "SafetyReleaseItem"("releaseId", "versionId");

-- CreateIndex
CREATE UNIQUE INDEX "SafetyReleasePointer_releaseId_key" ON "SafetyReleasePointer"("releaseId");

-- CreateIndex
CREATE UNIQUE INDEX "MedicationIngredient_productName_key" ON "MedicationIngredient"("productName");

-- CreateIndex
CREATE INDEX "MedicationIngredient_genericName_idx" ON "MedicationIngredient"("genericName");

-- CreateIndex
CREATE INDEX "DrugClassMembership_className_idx" ON "DrugClassMembership"("className");

-- CreateIndex
CREATE INDEX "DrugClassMembership_drugName_idx" ON "DrugClassMembership"("drugName");

-- CreateIndex
CREATE UNIQUE INDEX "DrugClassMembership_drugName_className_key" ON "DrugClassMembership"("drugName", "className");

-- CreateIndex
CREATE INDEX "SafetyEvaluation_consultationId_idx" ON "SafetyEvaluation"("consultationId");

-- CreateIndex
CREATE INDEX "SafetyEvaluation_tenantId_idx" ON "SafetyEvaluation"("tenantId");

-- CreateIndex
CREATE INDEX "SafetyEvaluation_createdAt_idx" ON "SafetyEvaluation"("createdAt");

-- CreateIndex
CREATE INDEX "SafetyEvaluationFinding_evaluationId_idx" ON "SafetyEvaluationFinding"("evaluationId");

-- CreateIndex
CREATE UNIQUE INDEX "SafetyEvaluationOverride_evaluationId_key" ON "SafetyEvaluationOverride"("evaluationId");

-- CreateIndex
CREATE INDEX "SafetyEvaluationOverride_userId_idx" ON "SafetyEvaluationOverride"("userId");

-- AddForeignKey
ALTER TABLE "SafetyKnowledgeRule" ADD CONSTRAINT "SafetyKnowledgeRule_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyRuleVersion" ADD CONSTRAINT "SafetyRuleVersion_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "SafetyKnowledgeRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyRuleVersion" ADD CONSTRAINT "SafetyRuleVersion_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyRuleParticipant" ADD CONSTRAINT "SafetyRuleParticipant_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SafetyRuleVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyRuleEvidence" ADD CONSTRAINT "SafetyRuleEvidence_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SafetyRuleVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyKnowledgeRelease" ADD CONSTRAINT "SafetyKnowledgeRelease_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyKnowledgeRelease" ADD CONSTRAINT "SafetyKnowledgeRelease_priorReleaseId_fkey" FOREIGN KEY ("priorReleaseId") REFERENCES "SafetyKnowledgeRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyReleaseItem" ADD CONSTRAINT "SafetyReleaseItem_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "SafetyKnowledgeRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyReleaseItem" ADD CONSTRAINT "SafetyReleaseItem_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SafetyRuleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyReleasePointer" ADD CONSTRAINT "SafetyReleasePointer_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "SafetyKnowledgeRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyEvaluation" ADD CONSTRAINT "SafetyEvaluation_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyEvaluationFinding" ADD CONSTRAINT "SafetyEvaluationFinding_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "SafetyEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyEvaluationOverride" ADD CONSTRAINT "SafetyEvaluationOverride_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "SafetyEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyEvaluationOverride" ADD CONSTRAINT "SafetyEvaluationOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

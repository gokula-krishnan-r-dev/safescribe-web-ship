-- CreateTable
CREATE TABLE IF NOT EXISTS "RenewCondition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "codeSystem" TEXT,
    "externalCode" TEXT,
    "defaultEffectivenessQuestion" TEXT,
    "commonForRenewal" BOOLEAN NOT NULL DEFAULT true,
    "displayPriority" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "effectiveDate" TIMESTAMP(3),
    "retiredDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RenewCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RenewConditionAlias" (
    "id" TEXT NOT NULL,
    "conditionId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "normalizedAlias" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RenewConditionAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RenewMedicationIndicationMap" (
    "id" TEXT NOT NULL,
    "medicationConceptId" TEXT NOT NULL,
    "conditionId" TEXT NOT NULL,
    "mappingStrength" TEXT NOT NULL,
    "rankingWeight" DECIMAL(6,2),
    "autoGroupAllowed" BOOLEAN NOT NULL DEFAULT false,
    "alwaysRequireConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RenewMedicationIndicationMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RenewCondition_code_key" ON "RenewCondition"("code");
CREATE INDEX IF NOT EXISTS "RenewCondition_active_displayPriority_idx" ON "RenewCondition"("active", "displayPriority");
CREATE INDEX IF NOT EXISTS "RenewCondition_displayName_idx" ON "RenewCondition"("displayName");
CREATE UNIQUE INDEX IF NOT EXISTS "RenewConditionAlias_conditionId_normalizedAlias_key" ON "RenewConditionAlias"("conditionId", "normalizedAlias");
CREATE INDEX IF NOT EXISTS "RenewConditionAlias_normalizedAlias_idx" ON "RenewConditionAlias"("normalizedAlias");
CREATE UNIQUE INDEX IF NOT EXISTS "RenewMedicationIndicationMap_medicationConceptId_conditionId_key" ON "RenewMedicationIndicationMap"("medicationConceptId", "conditionId");
CREATE INDEX IF NOT EXISTS "RenewMedicationIndicationMap_medicationConceptId_active_idx" ON "RenewMedicationIndicationMap"("medicationConceptId", "active");

-- AddForeignKey
ALTER TABLE "RenewConditionAlias" ADD CONSTRAINT "RenewConditionAlias_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "RenewCondition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RenewMedicationIndicationMap" ADD CONSTRAINT "RenewMedicationIndicationMap_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "RenewCondition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

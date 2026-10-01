-- CreateTable
CREATE TABLE IF NOT EXISTS "RenewMonitoringInput" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "inputType" TEXT NOT NULL,
    "valueShape" TEXT NOT NULL,
    "unit" TEXT,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "displayPriority" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RenewMonitoringInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RenewMonitoringRule" (
    "id" TEXT NOT NULL,
    "inputId" TEXT NOT NULL,
    "matchType" TEXT NOT NULL,
    "ingredientKey" TEXT,
    "conditionCode" TEXT,
    "requirementLevel" TEXT NOT NULL DEFAULT 'RECOMMENDED',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "displayPriority" INTEGER NOT NULL DEFAULT 100,
    "triggerSourceCode" TEXT,
    "triggerValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RenewMonitoringRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RenewMonitoringInput_code_key" ON "RenewMonitoringInput"("code");
CREATE INDEX IF NOT EXISTS "RenewMonitoringInput_active_displayPriority_idx" ON "RenewMonitoringInput"("active", "displayPriority");
CREATE INDEX IF NOT EXISTS "RenewMonitoringInput_inputType_active_idx" ON "RenewMonitoringInput"("inputType", "active");
CREATE INDEX IF NOT EXISTS "RenewMonitoringRule_ingredientKey_active_idx" ON "RenewMonitoringRule"("ingredientKey", "active");
CREATE INDEX IF NOT EXISTS "RenewMonitoringRule_conditionCode_active_idx" ON "RenewMonitoringRule"("conditionCode", "active");
CREATE INDEX IF NOT EXISTS "RenewMonitoringRule_inputId_active_idx" ON "RenewMonitoringRule"("inputId", "active");

ALTER TABLE "RenewMonitoringRule" ADD CONSTRAINT "RenewMonitoringRule_inputId_fkey" FOREIGN KEY ("inputId") REFERENCES "RenewMonitoringInput"("id") ON DELETE CASCADE ON UPDATE CASCADE;

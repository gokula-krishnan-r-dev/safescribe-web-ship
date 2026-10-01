-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/Edmonton';

-- CreateTable
CREATE TABLE "SafeScribeEntitlement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "includedQuantity" INTEGER,
    "period" TEXT NOT NULL DEFAULT 'daily',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafeScribeEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafeScribeUsageEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "consultationId" TEXT,
    "eventType" TEXT NOT NULL,
    "counted" BOOLEAN NOT NULL DEFAULT true,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafeScribeUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SafeScribeEntitlement_tenantId_module_key" ON "SafeScribeEntitlement"("tenantId", "module");

-- CreateIndex
CREATE INDEX "SafeScribeEntitlement_tenantId_active_idx" ON "SafeScribeEntitlement"("tenantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "SafeScribeUsageEvent_consultationId_eventType_key" ON "SafeScribeUsageEvent"("consultationId", "eventType");

-- CreateIndex
CREATE INDEX "SafeScribeUsageEvent_tenantId_module_counted_occurredAt_idx" ON "SafeScribeUsageEvent"("tenantId", "module", "counted", "occurredAt");

-- CreateIndex
CREATE INDEX "SafeScribeUsageEvent_userId_idx" ON "SafeScribeUsageEvent"("userId");

-- AddForeignKey
ALTER TABLE "SafeScribeEntitlement" ADD CONSTRAINT "SafeScribeEntitlement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafeScribeUsageEvent" ADD CONSTRAINT "SafeScribeUsageEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafeScribeUsageEvent" ADD CONSTRAINT "SafeScribeUsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafeScribeUsageEvent" ADD CONSTRAINT "SafeScribeUsageEvent_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Complimentary PhIX Prescribe: 10 assessments / pharmacy / local day.
INSERT INTO "SafeScribeEntitlement" ("id", "tenantId", "module", "includedQuantity", "period", "active", "createdAt", "updatedAt")
SELECT
  'ent_' || t."id",
  t."id",
  'prescribe',
  10,
  'daily',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE NOT EXISTS (
  SELECT 1 FROM "SafeScribeEntitlement" e
  WHERE e."tenantId" = t."id" AND e."module" = 'prescribe'
);

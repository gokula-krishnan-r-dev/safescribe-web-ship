-- CreateEnum
CREATE TYPE "PharmacyNetworkStatus" AS ENUM ('PENDING', 'APPROVED', 'DISABLED');

-- CreateEnum
CREATE TYPE "PharmacyNetworkSource" AS ENUM ('MANUAL', 'VERIFICATION_LINK');

-- CreateEnum
CREATE TYPE "PharmacyNetworkVerificationStatus" AS ENUM ('SENT', 'OPENED', 'CONFIRMED', 'APPROVED', 'EXPIRED', 'CANCELLED', 'REJECTED');

-- CreateTable
CREATE TABLE "PharmacyNetworkVerification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "PharmacyNetworkVerificationStatus" NOT NULL DEFAULT 'SENT',
    "detectedIp" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "openedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "rejectedAt" TIMESTAMP(3),

    CONSTRAINT "PharmacyNetworkVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyNetwork" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "cidr" TEXT NOT NULL,
    "label" TEXT,
    "status" "PharmacyNetworkStatus" NOT NULL DEFAULT 'APPROVED',
    "source" "PharmacyNetworkSource" NOT NULL DEFAULT 'MANUAL',
    "createdById" TEXT,
    "approvedById" TEXT,
    "verificationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3),

    CONSTRAINT "PharmacyNetwork_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyNetworkVerification_tokenHash_key" ON "PharmacyNetworkVerification"("tokenHash");

-- CreateIndex
CREATE INDEX "PharmacyNetworkVerification_tenantId_status_idx" ON "PharmacyNetworkVerification"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PharmacyNetworkVerification_expiresAt_idx" ON "PharmacyNetworkVerification"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyNetwork_verificationId_key" ON "PharmacyNetwork"("verificationId");

-- CreateIndex
CREATE INDEX "PharmacyNetwork_tenantId_status_idx" ON "PharmacyNetwork"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PharmacyNetwork_tenantId_idx" ON "PharmacyNetwork"("tenantId");

-- AddForeignKey
ALTER TABLE "PharmacyNetworkVerification" ADD CONSTRAINT "PharmacyNetworkVerification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyNetwork" ADD CONSTRAINT "PharmacyNetwork_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyNetwork" ADD CONSTRAINT "PharmacyNetwork_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "PharmacyNetworkVerification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve existing pharmacy-wide allowlist entries as approved networks
INSERT INTO "PharmacyNetwork" (
  "id",
  "tenantId",
  "ipAddress",
  "cidr",
  "label",
  "status",
  "source",
  "createdAt",
  "updatedAt",
  "approvedAt",
  "lastVerifiedAt"
)
SELECT
  "id",
  "tenantId",
  split_part("cidr", '/', 1),
  "cidr",
  "label",
  'APPROVED',
  'MANUAL',
  "createdAt",
  "updatedAt",
  "createdAt",
  "updatedAt"
FROM "IpAllowlistEntry"
WHERE "userId" IS NULL
ON CONFLICT ("id") DO NOTHING;

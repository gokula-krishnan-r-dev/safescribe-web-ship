-- CreateEnum
CREATE TYPE "IpAccessMode" AS ENUM ('GLOBAL', 'PER_USER');

-- CreateTable
CREATE TABLE "TenantIpAccess" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "mode" "IpAccessMode" NOT NULL DEFAULT 'GLOBAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantIpAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IpAllowlistEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "cidr" TEXT NOT NULL,
    "label" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IpAllowlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantIpAccess_tenantId_key" ON "TenantIpAccess"("tenantId");

-- CreateIndex
CREATE INDEX "IpAllowlistEntry_tenantId_idx" ON "IpAllowlistEntry"("tenantId");

-- CreateIndex
CREATE INDEX "IpAllowlistEntry_tenantId_userId_idx" ON "IpAllowlistEntry"("tenantId", "userId");

-- AddForeignKey
ALTER TABLE "TenantIpAccess" ADD CONSTRAINT "TenantIpAccess_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IpAllowlistEntry" ADD CONSTRAINT "IpAllowlistEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IpAllowlistEntry" ADD CONSTRAINT "IpAllowlistEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

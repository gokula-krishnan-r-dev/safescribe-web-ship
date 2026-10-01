-- AlterTable
CREATE TYPE "FaxStatus" AS ENUM ('QUEUED', 'SENDING', 'DELIVERED', 'FAILED', 'CANCELED');

-- CreateTable
CREATE TABLE "FaxLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "consultationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentTypeId" TEXT NOT NULL,
    "documentName" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "faxNumber" TEXT NOT NULL,
    "status" "FaxStatus" NOT NULL DEFAULT 'QUEUED',
    "ifaxJobId" TEXT,
    "errorMessage" TEXT,
    "pdfBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "FaxLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FaxLog_tenantId_createdAt_idx" ON "FaxLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "FaxLog_consultationId_createdAt_idx" ON "FaxLog"("consultationId", "createdAt");

-- CreateIndex
CREATE INDEX "FaxLog_ifaxJobId_idx" ON "FaxLog"("ifaxJobId");

-- CreateIndex
CREATE INDEX "FaxLog_status_idx" ON "FaxLog"("status");

-- AddForeignKey
ALTER TABLE "FaxLog" ADD CONSTRAINT "FaxLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaxLog" ADD CONSTRAINT "FaxLog_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaxLog" ADD CONSTRAINT "FaxLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

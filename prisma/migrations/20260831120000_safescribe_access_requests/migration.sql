-- Alberta launch complimentary-access requests (platform-level, not tenant-scoped)
ALTER TYPE "PharmacyNetworkSource" ADD VALUE 'ALBERTA_LAUNCH';

CREATE TABLE "SafescribeAccessRequest" (
    "id" TEXT NOT NULL,
    "pharmacyName" TEXT NOT NULL,
    "licenceNumber" TEXT NOT NULL,
    "province" TEXT NOT NULL DEFAULT 'AB',
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "capturedPublicIp" TEXT NOT NULL,
    "submissionPublicIp" TEXT,
    "ipDiscrepancy" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT NOT NULL DEFAULT 'alberta_qr_launch',
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "userAgent" TEXT,
    "notes" TEXT,
    "matchedPharmacyId" TEXT,
    "pharmacyId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafescribeAccessRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SafescribeAccessRequest_status_submittedAt_idx" ON "SafescribeAccessRequest"("status", "submittedAt");
CREATE INDEX "SafescribeAccessRequest_email_idx" ON "SafescribeAccessRequest"("email");
CREATE INDEX "SafescribeAccessRequest_licenceNumber_idx" ON "SafescribeAccessRequest"("licenceNumber");
CREATE INDEX "SafescribeAccessRequest_capturedPublicIp_idx" ON "SafescribeAccessRequest"("capturedPublicIp");
CREATE INDEX "SafescribeAccessRequest_pharmacyId_idx" ON "SafescribeAccessRequest"("pharmacyId");
CREATE INDEX "SafescribeAccessRequest_matchedPharmacyId_idx" ON "SafescribeAccessRequest"("matchedPharmacyId");
CREATE INDEX "SafescribeAccessRequest_reviewedById_idx" ON "SafescribeAccessRequest"("reviewedById");

ALTER TABLE "SafescribeAccessRequest" ADD CONSTRAINT "SafescribeAccessRequest_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SafescribeAccessRequest" ADD CONSTRAINT "SafescribeAccessRequest_matchedPharmacyId_fkey" FOREIGN KEY ("matchedPharmacyId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SafescribeAccessRequest" ADD CONSTRAINT "SafescribeAccessRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

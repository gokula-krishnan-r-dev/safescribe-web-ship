-- Super Admin handling fields for public Contact Us inquiries
ALTER TABLE "ContactInquiry" ADD COLUMN "internalNote" TEXT;
ALTER TABLE "ContactInquiry" ADD COLUMN "handledByUserId" TEXT;
ALTER TABLE "ContactInquiry" ADD COLUMN "handledAt" TIMESTAMP(3);

CREATE INDEX "ContactInquiry_handledByUserId_idx" ON "ContactInquiry"("handledByUserId");

ALTER TABLE "ContactInquiry" ADD CONSTRAINT "ContactInquiry_handledByUserId_fkey" FOREIGN KEY ("handledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

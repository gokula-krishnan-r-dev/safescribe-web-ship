-- CreateTable
CREATE TABLE "ProfessionalUseAcknowledgement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acknowledgementVersion" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'post_login_gate',
    "copySha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfessionalUseAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionalUseAcknowledgement_userId_acknowledgementVersion_key" ON "ProfessionalUseAcknowledgement"("userId", "acknowledgementVersion");

-- CreateIndex
CREATE INDEX "ProfessionalUseAcknowledgement_userId_acknowledgedAt_idx" ON "ProfessionalUseAcknowledgement"("userId", "acknowledgedAt" DESC);

-- AddForeignKey
ALTER TABLE "ProfessionalUseAcknowledgement" ADD CONSTRAINT "ProfessionalUseAcknowledgement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

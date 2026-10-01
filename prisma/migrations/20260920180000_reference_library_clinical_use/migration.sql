-- AlterTable EvidenceReferenceLibraryItem
ALTER TABLE "EvidenceReferenceLibraryItem" ADD COLUMN IF NOT EXISTS "clinicalUseTags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "EvidenceReferenceLibraryItem" ADD COLUMN IF NOT EXISTS "suggestedSections" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "EvidenceReferenceLibraryItem" ADD COLUMN IF NOT EXISTS "documentationCandidate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EvidenceReferenceLibraryItem" ADD COLUMN IF NOT EXISTS "verificationRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EvidenceReferenceLibraryItem" ADD COLUMN IF NOT EXISTS "notes" VARCHAR(500);

-- AlterTable PathwayEvidenceReference
ALTER TABLE "PathwayEvidenceReference" ADD COLUMN IF NOT EXISTS "clinicalUseTags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "PathwayEvidenceReference" ADD COLUMN IF NOT EXISTS "documentationCandidate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PathwayEvidenceReference" ADD COLUMN IF NOT EXISTS "verificationRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PathwayEvidenceReference" ADD COLUMN IF NOT EXISTS "notes" VARCHAR(500);

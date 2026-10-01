-- Pathway Matching / Routing metadata on clinical pathways (versioned via ClinicalVersion snapshot).

ALTER TABLE "ClinicalPathway"
  ADD COLUMN IF NOT EXISTS "routingAliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "routingPresentingComplaints" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "routingContextTerms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "routingDescription" TEXT,
  ADD COLUMN IF NOT EXISTS "routingMetadataUpdatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "routingMetadataUpdatedById" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ClinicalPathway_routingMetadataUpdatedById_fkey'
  ) THEN
    ALTER TABLE "ClinicalPathway"
      ADD CONSTRAINT "ClinicalPathway_routingMetadataUpdatedById_fkey"
      FOREIGN KEY ("routingMetadataUpdatedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

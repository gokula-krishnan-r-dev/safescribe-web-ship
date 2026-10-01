-- Denormalize treatment type for pathway-library search filters.
ALTER TABLE "TreatmentLibraryItem"
  ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'PRESCRIPTION';

CREATE INDEX IF NOT EXISTS "TreatmentLibraryItem_category_isRetired_listStatus_idx"
  ON "TreatmentLibraryItem"("category", "isRetired", "listStatus");

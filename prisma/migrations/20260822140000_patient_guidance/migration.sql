-- Patient Guidance fields on ClinicalCounselling + idempotent backfill
-- from Patient Education, Follow-up, and Non-pharmacological treatments.

ALTER TABLE "ClinicalCounselling" ADD COLUMN IF NOT EXISTS "outputSection" TEXT;
ALTER TABLE "ClinicalCounselling" ADD COLUMN IF NOT EXISTS "guidanceType" TEXT;
ALTER TABLE "ClinicalCounselling" ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'alternative';
ALTER TABLE "ClinicalCounselling" ADD COLUMN IF NOT EXISTS "descriptor" TEXT;
ALTER TABLE "ClinicalCounselling" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "ClinicalCounselling" ADD COLUMN IF NOT EXISTS "itemVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ClinicalCounselling" ADD COLUMN IF NOT EXISTS "legacySource" TEXT;
ALTER TABLE "ClinicalCounselling" ADD COLUMN IF NOT EXISTS "legacyId" TEXT;
ALTER TABLE "ClinicalCounselling" ADD COLUMN IF NOT EXISTS "timing" JSONB;

CREATE INDEX IF NOT EXISTS "ClinicalCounselling_pathwayId_outputSection_displayOrder_idx"
  ON "ClinicalCounselling"("pathwayId", "outputSection", "displayOrder");
CREATE INDEX IF NOT EXISTS "ClinicalCounselling_pathwayId_archivedAt_idx"
  ON "ClinicalCounselling"("pathwayId", "archivedAt");
CREATE INDEX IF NOT EXISTS "ClinicalCounselling_legacyId_idx"
  ON "ClinicalCounselling"("legacyId");

-- Classify existing Patient Education rows.
UPDATE "ClinicalCounselling"
SET
  "legacySource" = COALESCE("legacySource", 'patient_education'),
  "outputSection" = CASE
    WHEN lower(coalesce("category", '')) ~ 'follow|reassess|seek care|urgent|emergency|worsen|escalat'
      THEN 'follow_up'
    WHEN lower(coalesce("category", '')) ~ 'non[- ]?drug|self[- ]?care|hygiene|lifestyle|diet|exercise|prevention|transmission|sitz|behaviour|behavior'
      THEN 'self_care'
    ELSE 'what_to_expect'
  END,
  "guidanceType" = CASE
    WHEN lower(coalesce("category", '')) ~ 'follow|reassess|seek care|urgent|emergency|worsen|escalat' THEN
      CASE
        WHEN lower(coalesce("category", '')) ~ 'urgent|emergency' THEN 'urgent_care'
        WHEN lower(coalesce("category", '')) ~ 'worsen|failure' THEN 'treatment_failure'
        ELSE 'routine_reassessment'
      END
    WHEN lower(coalesce("category", '')) ~ 'non[- ]?drug|self[- ]?care|hygiene|lifestyle|diet|exercise|prevention|transmission|sitz|behaviour|behavior' THEN
      CASE
        WHEN lower(coalesce("category", '')) ~ 'hygiene' THEN 'hygiene'
        WHEN lower(coalesce("category", '')) ~ 'prevention' THEN 'prevention'
        WHEN lower(coalesce("category", '')) ~ 'transmission|abstinen|condom|barrier' THEN 'transmission_reduction'
        WHEN lower(coalesce("category", '')) ~ 'sitz|relief|bath' THEN 'symptom_relief'
        ELSE 'lifestyle'
      END
    WHEN lower(coalesce("category", '')) ~ 'response|expect' THEN 'expected_treatment_response'
    WHEN lower(coalesce("category", '')) ~ 'course|typical' THEN 'expected_course'
    ELSE 'condition_education'
  END
WHERE "outputSection" IS NULL;

-- Copy ClinicalFollowup rows that have not already been migrated.
INSERT INTO "ClinicalCounselling" (
  "id", "pathwayId", "tenantId", "category", "point", "detail",
  "outputSection", "guidanceType", "priority", "legacySource", "legacyId",
  "isAiGenerated", "approved", "displayOrder", "createdAt", "updatedAt"
)
SELECT
  'fu_' || f."id",
  f."pathwayId",
  f."tenantId",
  'Follow-up',
  CASE
    WHEN length(trim(f."condition")) > 0 THEN f."condition"
    ELSE coalesce(nullif(trim(f."action"), ''), 'Follow-up')
  END,
  trim(concat_ws(' ', nullif(trim(f."action"), ''), CASE WHEN nullif(trim(f."timeframe"), '') IS NULL THEN NULL ELSE '(' || trim(f."timeframe") || ')' END)),
  'follow_up',
  CASE
    WHEN upper(f."urgency") IN ('EMERGENCY', 'URGENT') THEN 'urgent_care'
    ELSE 'routine_reassessment'
  END,
  'alternative',
  'follow_up',
  f."id",
  f."isAiGenerated",
  f."approved",
  f."displayOrder",
  f."createdAt",
  f."updatedAt"
FROM "ClinicalFollowup" f
WHERE NOT EXISTS (
  SELECT 1 FROM "ClinicalCounselling" c WHERE c."legacyId" = f."id"
);

-- Copy Non-pharmacological treatments that have not already been migrated.
INSERT INTO "ClinicalCounselling" (
  "id", "pathwayId", "tenantId", "category", "point", "detail",
  "outputSection", "guidanceType", "priority", "descriptor",
  "legacySource", "legacyId", "isAiGenerated", "approved", "displayOrder",
  "createdAt", "updatedAt"
)
SELECT
  'nd_' || t."id",
  t."pathwayId",
  t."tenantId",
  'Non-drug advice',
  t."medicationName",
  coalesce(nullif(trim(t."counsellingNotes"), ''), nullif(trim(t."directions"), ''), nullif(trim(t."clinicalNotes"), ''), t."medicationName"),
  'self_care',
  CASE
    WHEN lower(t."medicationName") ~ 'sitz|bath|compress|relief' THEN 'symptom_relief'
    WHEN lower(t."medicationName") ~ 'abstinen|condom|barrier|transmission|dental.?dam' THEN 'transmission_reduction'
    WHEN lower(t."medicationName") ~ 'hygiene|wash' THEN 'hygiene'
    WHEN lower(t."medicationName") ~ 'prevent' THEN 'prevention'
    ELSE 'lifestyle'
  END,
  CASE
    WHEN t."recommendationLevel"::text = 'FIRST_LINE' THEN 'first_line'
    WHEN t."recommendationLevel"::text IN ('SUPPORTIVE_CARE', 'ADJUNCTIVE') THEN 'optional'
    ELSE 'alternative'
  END,
  t."genericName",
  'non_pharmacological',
  t."id",
  t."isAiGenerated",
  t."approved",
  t."displayOrder",
  t."createdAt",
  t."updatedAt"
FROM "ClinicalTreatment" t
WHERE t."category" = 'NON_DRUG'
  AND NOT EXISTS (
    SELECT 1 FROM "ClinicalCounselling" c WHERE c."legacyId" = t."id"
  );

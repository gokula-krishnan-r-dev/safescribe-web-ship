-- Simplify PathwayStatus: remove review workflow, add UNPUBLISHED
CREATE TYPE "PathwayStatus_new" AS ENUM (
  'DRAFT',
  'AI_PROCESSING',
  'AI_GENERATED',
  'UNPUBLISHED',
  'PUBLISHED',
  'ARCHIVED'
);

ALTER TABLE "ClinicalPathway"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "ClinicalPathway"
  ALTER COLUMN "status" TYPE "PathwayStatus_new"
  USING (
    CASE "status"::text
      WHEN 'UNDER_REVIEW' THEN 'UNPUBLISHED'
      WHEN 'APPROVED' THEN 'UNPUBLISHED'
      WHEN 'SUSPENDED' THEN 'UNPUBLISHED'
      WHEN 'REJECTED' THEN 'UNPUBLISHED'
      ELSE "status"::text
    END
  )::"PathwayStatus_new";

DROP TYPE "PathwayStatus";
ALTER TYPE "PathwayStatus_new" RENAME TO "PathwayStatus";

ALTER TABLE "ClinicalPathway"
  ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"PathwayStatus";

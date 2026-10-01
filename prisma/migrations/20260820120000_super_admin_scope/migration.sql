-- Super Admin platform functions (FULL / PHARMACY / CLINICAL).
-- Existing SUPER_ADMIN rows default to FULL so current operators keep both portals.
CREATE TYPE "SuperAdminScope" AS ENUM ('FULL', 'PHARMACY', 'CLINICAL');

ALTER TABLE "User" ADD COLUMN "superAdminScope" "SuperAdminScope";

UPDATE "User" AS u
SET "superAdminScope" = 'FULL'
FROM "Role" AS r
WHERE u."roleId" = r."id"
  AND r."name" = 'SUPER_ADMIN'
  AND u."tenantId" IS NULL
  AND u."deletedAt" IS NULL
  AND u."superAdminScope" IS NULL;

CREATE INDEX "User_superAdminScope_idx" ON "User"("superAdminScope");

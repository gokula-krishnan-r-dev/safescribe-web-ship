-- AlterTable: allow platform-level (Super Admin) clinical pathways without a tenant
ALTER TABLE "ClinicalPathway" ALTER COLUMN "tenantId" DROP NOT NULL;
ALTER TABLE "ClinicalDocument" ALTER COLUMN "tenantId" DROP NOT NULL;
ALTER TABLE "ClinicalQuestion" ALTER COLUMN "tenantId" DROP NOT NULL;
ALTER TABLE "ClinicalRule" ALTER COLUMN "tenantId" DROP NOT NULL;
ALTER TABLE "ClinicalTreatment" ALTER COLUMN "tenantId" DROP NOT NULL;
ALTER TABLE "ClinicalCounselling" ALTER COLUMN "tenantId" DROP NOT NULL;
ALTER TABLE "ClinicalFollowup" ALTER COLUMN "tenantId" DROP NOT NULL;

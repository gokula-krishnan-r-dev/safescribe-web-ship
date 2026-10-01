-- Access request review metadata, match classification, and friendly request numbers
ALTER TABLE "SafescribeAccessRequest" ADD COLUMN IF NOT EXISTS "requestNumber" INTEGER;
ALTER TABLE "SafescribeAccessRequest" ADD COLUMN IF NOT EXISTS "matchType" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "SafescribeAccessRequest" ADD COLUMN IF NOT EXISTS "matchConfidence" TEXT;
ALTER TABLE "SafescribeAccessRequest" ADD COLUMN IF NOT EXISTS "matchReasons" JSONB;
ALTER TABLE "SafescribeAccessRequest" ADD COLUMN IF NOT EXISTS "rejectReason" TEXT;
ALTER TABLE "SafescribeAccessRequest" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "SafescribeAccessRequest" ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'SafescribeAccessRequest_requestNumber_seq'
  ) THEN
    CREATE SEQUENCE "SafescribeAccessRequest_requestNumber_seq";
  END IF;
END $$;

UPDATE "SafescribeAccessRequest"
SET "requestNumber" = nextval('"SafescribeAccessRequest_requestNumber_seq"')
WHERE "requestNumber" IS NULL;

ALTER TABLE "SafescribeAccessRequest" ALTER COLUMN "requestNumber" SET NOT NULL;
ALTER TABLE "SafescribeAccessRequest" ALTER COLUMN "requestNumber" SET DEFAULT nextval('"SafescribeAccessRequest_requestNumber_seq"');
ALTER SEQUENCE "SafescribeAccessRequest_requestNumber_seq" OWNED BY "SafescribeAccessRequest"."requestNumber";

CREATE UNIQUE INDEX IF NOT EXISTS "SafescribeAccessRequest_requestNumber_key" ON "SafescribeAccessRequest"("requestNumber");
CREATE INDEX IF NOT EXISTS "SafescribeAccessRequest_matchType_status_idx" ON "SafescribeAccessRequest"("matchType", "status");

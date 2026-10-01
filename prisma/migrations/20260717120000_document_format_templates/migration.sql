-- Platform-wide document format templates (Super Admin Doc Format module)

CREATE TABLE "DocumentFormatTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "categoryLabel" TEXT NOT NULL,
    "bullets" JSONB NOT NULL,
    "fileName" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "actions" JSONB NOT NULL,
    "aiPrompt" TEXT NOT NULL,
    "styleNotes" TEXT,
    "exampleOutput" TEXT NOT NULL,
    "defaultName" TEXT NOT NULL,
    "defaultShortName" TEXT,
    "defaultDescription" TEXT NOT NULL,
    "defaultCategoryLabel" TEXT NOT NULL,
    "defaultBullets" JSONB NOT NULL,
    "defaultAiPrompt" TEXT NOT NULL,
    "defaultStyleNotes" TEXT,
    "defaultExampleOutput" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentFormatTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentFormatTemplate_key_key" ON "DocumentFormatTemplate"("key");
CREATE INDEX "DocumentFormatTemplate_category_idx" ON "DocumentFormatTemplate"("category");
CREATE INDEX "DocumentFormatTemplate_sortOrder_idx" ON "DocumentFormatTemplate"("sortOrder");
CREATE INDEX "DocumentFormatTemplate_published_idx" ON "DocumentFormatTemplate"("published");

ALTER TABLE "DocumentFormatTemplate" ADD CONSTRAINT "DocumentFormatTemplate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

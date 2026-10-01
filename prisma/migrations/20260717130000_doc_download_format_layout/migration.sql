-- Doc Download Format: editable PDF layout + AI response schema

ALTER TABLE "DocumentFormatTemplate"
ADD COLUMN "pdfLayout" JSONB,
ADD COLUMN "responseSchema" JSONB,
ADD COLUMN "defaultPdfLayout" JSONB,
ADD COLUMN "defaultResponseSchema" JSONB;

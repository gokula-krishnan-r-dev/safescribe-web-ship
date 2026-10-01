-- Spoken-language + translate-to-English settings for SafeScribe Mic sessions
ALTER TABLE "MicSession" ADD COLUMN "sourceLanguage" TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE "MicSession" ADD COLUMN "translateToEnglish" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MicSession" ADD COLUMN "detectedLanguage" TEXT;

-- Platform-wide AI system prompts + OpenAI settings (Super Admin)

CREATE TABLE "AiSystemPrompt" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "defaultContent" TEXT NOT NULL,
    "modelHint" TEXT,
    "sourceFile" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSystemPrompt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiPlatformSettings" (
    "id" TEXT NOT NULL,
    "openaiModel" TEXT NOT NULL DEFAULT 'gpt-4o',
    "openaiFastModel" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "openaiEmbeddingModel" TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    "temperatureDefault" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "timeoutSeconds" INTEGER NOT NULL DEFAULT 90,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiPlatformSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiSystemPrompt_key_key" ON "AiSystemPrompt"("key");
CREATE INDEX "AiSystemPrompt_category_idx" ON "AiSystemPrompt"("category");
CREATE INDEX "AiSystemPrompt_sortOrder_idx" ON "AiSystemPrompt"("sortOrder");

ALTER TABLE "AiSystemPrompt" ADD CONSTRAINT "AiSystemPrompt_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiPlatformSettings" ADD CONSTRAINT "AiPlatformSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

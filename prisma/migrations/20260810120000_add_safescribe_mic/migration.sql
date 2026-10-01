-- SafeScribe Mic: pairing, sessions, audio parts, transcription jobs

-- CreateEnum
CREATE TYPE "TranscriptSource" AS ENUM ('DESKTOP', 'SAFESCRIBE_MIC', 'MANUAL');
CREATE TYPE "MicPairingStatus" AS ENUM ('WAITING', 'CLAIMED', 'EXPIRED', 'REVOKED');
CREATE TYPE "MicSessionState" AS ENUM (
  'WAITING', 'CLAIMED', 'CONSENT_REQUIRED', 'READY', 'RECORDING', 'PAUSED',
  'FINALIZING', 'TRANSCRIBING', 'TRANSCRIPT_READY', 'COMPLETED',
  'RECOVERABLE_ERROR', 'FAILED', 'EXPIRED', 'CANCELLED'
);
CREATE TYPE "MicConsentStatus" AS ENUM ('GRANTED', 'WITHDRAWN');
CREATE TYPE "MicSegmentStatus" AS ENUM ('OPEN', 'UPLOADING', 'COMPLETE', 'INVALID');
CREATE TYPE "MicAudioAssetStatus" AS ENUM ('ASSEMBLING', 'NORMALIZING', 'READY', 'DELETED', 'FAILED');
CREATE TYPE "MicTranscriptionJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'RETRYABLE_ERROR', 'FAILED');

-- AlterTable Consultation
ALTER TABLE "Consultation" ADD COLUMN "rawTranscript" TEXT;
ALTER TABLE "Consultation" ADD COLUMN "transcriptSource" "TranscriptSource";

-- CreateTable
CREATE TABLE "MicPairing" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "consultationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "MicPairingStatus" NOT NULL DEFAULT 'WAITING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MicPairing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MicSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "consultationId" TEXT NOT NULL,
    "pairingId" TEXT NOT NULL,
    "state" "MicSessionState" NOT NULL DEFAULT 'WAITING',
    "stateVersion" INTEGER NOT NULL DEFAULT 0,
    "credentialHash" TEXT,
    "credentialExpiresAt" TIMESTAMP(3),
    "clientMimeType" TEXT,
    "recordingStartedAt" TIMESTAMP(3),
    "recordingEndedAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "lastPartReceivedAt" TIMESTAMP(3),
    "totalParts" INTEGER NOT NULL DEFAULT 0,
    "totalBytes" BIGINT NOT NULL DEFAULT 0,
    "failureCode" TEXT,
    "currentSegmentNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MicSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MicConsentRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "consultationId" TEXT NOT NULL,
    "micSessionId" TEXT NOT NULL,
    "consentType" TEXT NOT NULL DEFAULT 'AUDIO_TRANSCRIPTION',
    "status" "MicConsentStatus" NOT NULL DEFAULT 'GRANTED',
    "method" TEXT NOT NULL DEFAULT 'VERBAL_PHARMACIST_ATTESTATION',
    "noticeVersion" TEXT NOT NULL,
    "attestedById" TEXT NOT NULL,
    "attestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),

    CONSTRAINT "MicConsentRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MicAudioSegment" (
    "id" TEXT NOT NULL,
    "micSessionId" TEXT NOT NULL,
    "segmentNumber" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "status" "MicSegmentStatus" NOT NULL DEFAULT 'OPEN',

    CONSTRAINT "MicAudioSegment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MicAudioPart" (
    "id" TEXT NOT NULL,
    "micSessionId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "checksumSha256" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MicAudioPart_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MicAudioAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "consultationId" TEXT NOT NULL,
    "micSessionId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'SAFESCRIBE_MIC',
    "status" "MicAudioAssetStatus" NOT NULL DEFAULT 'ASSEMBLING',
    "originalContentType" TEXT,
    "normalizedContentType" TEXT,
    "storagePath" TEXT,
    "byteSize" INTEGER,
    "durationSeconds" DOUBLE PRECISION,
    "checksumSha256" TEXT,
    "retentionMode" TEXT NOT NULL DEFAULT 'DELETE_AFTER_SUCCESS',
    "deleteAfter" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MicAudioAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MicTranscriptionJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "consultationId" TEXT NOT NULL,
    "audioAssetId" TEXT NOT NULL,
    "micSessionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'OPENAI',
    "model" TEXT NOT NULL DEFAULT 'whisper-1',
    "status" "MicTranscriptionJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT NOT NULL,
    "responseFormat" TEXT NOT NULL DEFAULT 'verbose_json',
    "languageHint" TEXT,
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MicTranscriptionJob_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "MicPairing_tokenHash_key" ON "MicPairing"("tokenHash");
CREATE INDEX "MicPairing_consultationId_createdAt_idx" ON "MicPairing"("consultationId", "createdAt" DESC);
CREATE INDEX "MicPairing_status_expiresAt_idx" ON "MicPairing"("status", "expiresAt");
CREATE INDEX "MicPairing_tenantId_idx" ON "MicPairing"("tenantId");

CREATE UNIQUE INDEX "MicSession_pairingId_key" ON "MicSession"("pairingId");
CREATE UNIQUE INDEX "MicSession_credentialHash_key" ON "MicSession"("credentialHash");
CREATE INDEX "MicSession_consultationId_createdAt_idx" ON "MicSession"("consultationId", "createdAt" DESC);
CREATE INDEX "MicSession_state_lastHeartbeatAt_idx" ON "MicSession"("state", "lastHeartbeatAt");
CREATE INDEX "MicSession_tenantId_idx" ON "MicSession"("tenantId");

CREATE INDEX "MicConsentRecord_consultationId_idx" ON "MicConsentRecord"("consultationId");
CREATE INDEX "MicConsentRecord_micSessionId_idx" ON "MicConsentRecord"("micSessionId");

CREATE UNIQUE INDEX "MicAudioSegment_micSessionId_segmentNumber_key" ON "MicAudioSegment"("micSessionId", "segmentNumber");
CREATE INDEX "MicAudioSegment_micSessionId_idx" ON "MicAudioSegment"("micSessionId");

CREATE UNIQUE INDEX "MicAudioPart_segmentId_sequenceNumber_key" ON "MicAudioPart"("segmentId", "sequenceNumber");
CREATE INDEX "MicAudioPart_micSessionId_idx" ON "MicAudioPart"("micSessionId");

CREATE INDEX "MicAudioAsset_consultationId_idx" ON "MicAudioAsset"("consultationId");
CREATE INDEX "MicAudioAsset_micSessionId_idx" ON "MicAudioAsset"("micSessionId");
CREATE INDEX "MicAudioAsset_status_deleteAfter_idx" ON "MicAudioAsset"("status", "deleteAfter");

CREATE UNIQUE INDEX "MicTranscriptionJob_idempotencyKey_key" ON "MicTranscriptionJob"("idempotencyKey");
CREATE INDEX "MicTranscriptionJob_status_createdAt_idx" ON "MicTranscriptionJob"("status", "createdAt");
CREATE INDEX "MicTranscriptionJob_consultationId_idx" ON "MicTranscriptionJob"("consultationId");

-- At most one active Mic session per consultation
CREATE UNIQUE INDEX "MicSession_one_active_per_consultation"
  ON "MicSession" ("consultationId")
  WHERE "state" IN (
    'WAITING', 'CLAIMED', 'CONSENT_REQUIRED', 'READY',
    'RECORDING', 'PAUSED', 'FINALIZING', 'TRANSCRIBING'
  );

-- FKs
ALTER TABLE "MicPairing" ADD CONSTRAINT "MicPairing_consultationId_fkey"
  FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MicSession" ADD CONSTRAINT "MicSession_consultationId_fkey"
  FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MicSession" ADD CONSTRAINT "MicSession_pairingId_fkey"
  FOREIGN KEY ("pairingId") REFERENCES "MicPairing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MicConsentRecord" ADD CONSTRAINT "MicConsentRecord_consultationId_fkey"
  FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MicConsentRecord" ADD CONSTRAINT "MicConsentRecord_micSessionId_fkey"
  FOREIGN KEY ("micSessionId") REFERENCES "MicSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MicAudioSegment" ADD CONSTRAINT "MicAudioSegment_micSessionId_fkey"
  FOREIGN KEY ("micSessionId") REFERENCES "MicSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MicAudioPart" ADD CONSTRAINT "MicAudioPart_segmentId_fkey"
  FOREIGN KEY ("segmentId") REFERENCES "MicAudioSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MicAudioAsset" ADD CONSTRAINT "MicAudioAsset_consultationId_fkey"
  FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MicAudioAsset" ADD CONSTRAINT "MicAudioAsset_micSessionId_fkey"
  FOREIGN KEY ("micSessionId") REFERENCES "MicSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MicTranscriptionJob" ADD CONSTRAINT "MicTranscriptionJob_consultationId_fkey"
  FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MicTranscriptionJob" ADD CONSTRAINT "MicTranscriptionJob_audioAssetId_fkey"
  FOREIGN KEY ("audioAssetId") REFERENCES "MicAudioAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MicTranscriptionJob" ADD CONSTRAINT "MicTranscriptionJob_micSessionId_fkey"
  FOREIGN KEY ("micSessionId") REFERENCES "MicSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

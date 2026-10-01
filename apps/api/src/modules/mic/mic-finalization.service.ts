import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { ObjectStorageService } from '@/modules/storage/object-storage.service';
import { BatchTranscribeService } from '@/modules/stt/batch-transcribe.service';
import { MicEventsService } from './mic-events.service';
import type { MicSanitizedState, MicSessionState } from './mic.types';

@Injectable()
export class MicFinalizationService {
  private readonly logger = new Logger(MicFinalizationService.name);
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: ObjectStorageService,
    private readonly batch: BatchTranscribeService,
    private readonly events: MicEventsService,
    private readonly audit: AuditService,
  ) {}

  private toSanitized(session: {
    id: string;
    pairingId: string;
    state: string;
    stateVersion: number;
    recordingStartedAt: Date | null;
    lastHeartbeatAt: Date | null;
    totalParts: number;
    totalBytes: bigint | number;
    failureCode: string | null;
    sourceLanguage?: string | null;
    translateToEnglish?: boolean | null;
    detectedLanguage?: string | null;
  }): MicSanitizedState {
    return {
      micSessionId: session.id,
      pairingId: session.pairingId,
      state: session.state as MicSessionState,
      stateVersion: session.stateVersion,
      recordingStartedAt: session.recordingStartedAt?.toISOString() ?? null,
      lastHeartbeatAt: session.lastHeartbeatAt?.toISOString() ?? null,
      upload: {
        partsReceived: session.totalParts,
        bytesReceived: Number(session.totalBytes),
      },
      failureCode: session.failureCode,
      sourceLanguage: session.sourceLanguage || 'auto',
      translateToEnglish: Boolean(session.translateToEnglish),
      detectedLanguage: session.detectedLanguage ?? null,
    };
  }

  async finalizeAndTranscribe(micSessionId: string) {
    if (this.running.has(micSessionId)) return;
    this.running.add(micSessionId);
    try {
      await this.runPipeline(micSessionId);
    } catch (err) {
      this.logger.error(
        `Mic finalization failed for ${micSessionId}: ${(err as Error).message}`,
      );
      await this.markError(micSessionId, 'FINALIZATION_FAILED');
    } finally {
      this.running.delete(micSessionId);
    }
  }

  async retryTranscription(micSessionId: string) {
    return this.finalizeAndTranscribe(micSessionId);
  }

  private async runPipeline(micSessionId: string) {
    const session = await this.prisma.micSession.findUnique({
      where: { id: micSessionId },
      include: {
        pairing: true,
        segments: {
          orderBy: { segmentNumber: 'asc' },
          include: { parts: { orderBy: { sequenceNumber: 'asc' } } },
        },
      },
    });
    if (!session) return;

    if (session.state === 'TRANSCRIPT_READY' || session.state === 'COMPLETED') {
      this.logger.log(`Mic session ${micSessionId} already ${session.state}`);
      return;
    }

    const partCount = session.segments.reduce((n, s) => n + s.parts.length, 0);
    if (partCount === 0 || Number(session.totalParts) === 0) {
      const ageMs = Date.now() - new Date(session.updatedAt).getTime();
      // END often arrives before the phone’s last part upload — wait, then retry.
      if (
        (session.state === 'FINALIZING' || session.state === 'TRANSCRIBING') &&
        ageMs < 50_000
      ) {
        this.logger.warn(
          `Mic session ${micSessionId}: 0 audio parts yet (ageMs=${ageMs}) — retry finalize in 8s`,
        );
        setTimeout(() => {
          void this.finalizeAndTranscribe(micSessionId);
        }, 8_000);
        return;
      }
      this.logger.warn(
        `Mic session ${micSessionId} finalize with 0 audio parts (totalParts=${session.totalParts})`,
      );
      await this.markError(micSessionId, 'NO_AUDIO_PARTS');
      return;
    }

    // Reuse latest assembling asset when re-trying to avoid clutter
    let asset = await this.prisma.micAudioAsset.findFirst({
      where: { micSessionId, status: { in: ['ASSEMBLING', 'NORMALIZING', 'FAILED', 'READY'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!asset || asset.status === 'READY' || asset.status === 'FAILED') {
      asset = await this.prisma.micAudioAsset.create({
        data: {
          tenantId: session.tenantId,
          consultationId: session.consultationId,
          micSessionId: session.id,
          status: 'ASSEMBLING',
          originalContentType: session.clientMimeType || 'audio/webm',
          retentionMode: this.config.get('MIC_AUDIO_RETENTION_MODE', 'DELETE_AFTER_SUCCESS'),
        },
      });
    } else {
      await this.prisma.micAudioAsset.update({
        where: { id: asset.id },
        data: { status: 'ASSEMBLING', failureCode: null },
      });
    }

    const chunks: Buffer[] = [];
    for (const segment of session.segments) {
      for (const part of segment.parts) {
        try {
          const buf = await this.readStorage(part.storagePath, part.contentType);
          chunks.push(buf);
        } catch (err) {
          this.logger.warn(
            `Missing mic part ${part.id} path=${part.storagePath}: ${(err as Error).message}`,
          );
        }
      }
    }

    if (!chunks.length) {
      await this.prisma.micAudioAsset.update({
        where: { id: asset.id },
        data: { status: 'FAILED', failureCode: 'NO_AUDIO_PARTS' },
      });
      await this.markError(micSessionId, 'NO_AUDIO_PARTS');
      return;
    }

    let assembled: Buffer = Buffer.concat(chunks);
    // crude size check — Whisper needs some speech
    if (assembled.length < 500) {
      await this.prisma.micAudioAsset.update({
        where: { id: asset.id },
        data: { status: 'FAILED', failureCode: 'AUDIO_TOO_SHORT' },
      });
      await this.markError(micSessionId, 'AUDIO_TOO_SHORT');
      return;
    }

    await this.audit.log({
      userId: session.pairing.createdById,
      tenantId: session.tenantId,
      action: 'MIC_AUDIO_VALIDATED',
      module: 'mic',
      metadata: {
        consultationId: session.consultationId,
        micSessionId,
        byteSize: assembled.length,
        parts: partCount,
      },
    });

    // Normalize when ffmpeg available
    await this.prisma.micAudioAsset.update({
      where: { id: asset.id },
      data: { status: 'NORMALIZING' },
    });

    let contentType = session.clientMimeType || 'audio/webm';
    let filename = 'mic-recording.webm';
    const normalized = await this.tryNormalize(assembled, contentType);
    if (normalized) {
      assembled = Buffer.from(normalized);
      contentType = 'audio/mpeg';
      filename = 'mic-recording.mp3';
    }

    const checksum = createHash('sha256').update(assembled).digest('hex');
    const objectKey = [
      'mic',
      session.tenantId || 'platform',
      session.consultationId,
      micSessionId,
      `final_${Date.now()}.mp3`,
    ].join('/');

    const stored = await this.storage.upload({
      buffer: assembled,
      contentType,
      objectKey,
      preferLocal:
        this.config.get<string>('MIC_USE_LOCAL_STORAGE', 'true') !== 'false',
    });

    const graceSec = Number(this.config.get('MIC_AUDIO_DELETE_GRACE_SECONDS', 3600));
    await this.prisma.micAudioAsset.update({
      where: { id: asset.id },
      data: {
        status: 'READY',
        storagePath: stored.storageKey,
        normalizedContentType: contentType,
        byteSize: assembled.length,
        checksumSha256: checksum,
        deleteAfter: new Date(Date.now() + graceSec * 1000),
        failureCode: null,
      },
    });

    // Transition to TRANSCRIBING
    let updated = await this.prisma.micSession.update({
      where: { id: micSessionId },
      data: {
        state: 'TRANSCRIBING',
        stateVersion: { increment: 1 },
        failureCode: null,
      },
      include: { pairing: true },
    });
    await this.events.publish(session.consultationId, {
      type: 'MIC_STATE_CHANGED',
      ...this.toSanitized(updated),
    } as never);

    const jobKey = `mic-transcribe-${micSessionId}`;
    let job = await this.prisma.micTranscriptionJob.findUnique({
      where: { idempotencyKey: jobKey },
    });
    if (!job) {
      job = await this.prisma.micTranscriptionJob.create({
        data: {
          tenantId: session.tenantId,
          consultationId: session.consultationId,
          audioAssetId: asset.id,
          micSessionId: session.id,
          provider: 'OPENAI',
          model: this.config.get('TRANSCRIPTION_MODEL', 'whisper-1'),
          status: 'RUNNING',
          attemptCount: 1,
          idempotencyKey: jobKey,
          startedAt: new Date(),
        },
      });
    } else {
      job = await this.prisma.micTranscriptionJob.update({
        where: { id: job.id },
        data: {
          status: 'RUNNING',
          attemptCount: { increment: 1 },
          errorCode: null,
          startedAt: new Date(),
          audioAssetId: asset.id,
        },
      });
    }

    await this.audit.log({
      userId: session.pairing.createdById,
      tenantId: session.tenantId,
      action: 'MIC_TRANSCRIPTION_STARTED',
      module: 'mic',
      metadata: { consultationId: session.consultationId, micSessionId, jobId: job.id },
    });

    try {
      const result = await this.batch.transcribe({
        audio: assembled,
        filename,
        mimeType: contentType,
        provider: 'whisper',
        languageCode: session.sourceLanguage || 'auto',
        translateToEnglish: Boolean(session.translateToEnglish),
      });

      const text = (result.rawTranscript || '').trim();
      if (!text) {
        await this.prisma.micTranscriptionJob.update({
          where: { id: job.id },
          data: {
            status: 'RETRYABLE_ERROR',
            errorCode: 'EMPTY_TRANSCRIPT',
            completedAt: new Date(),
          },
        });
        await this.markError(micSessionId, 'EMPTY_TRANSCRIPT');
        return;
      }

      await this.prisma.consultation.update({
        where: { id: session.consultationId },
        data: {
          rawTranscript: text,
          transcript: text,
          transcriptSource: 'SAFESCRIBE_MIC',
        },
      });

      await this.prisma.micTranscriptionJob.update({
        where: { id: job.id },
        data: {
          status: 'SUCCEEDED',
          completedAt: new Date(),
          model: result.model || job.model,
        },
      });

      updated = await this.prisma.micSession.update({
        where: { id: micSessionId },
        data: {
          state: 'TRANSCRIPT_READY',
          stateVersion: { increment: 1 },
          failureCode: null,
          // revoke phone credential after success
          credentialHash: null,
          credentialExpiresAt: null,
          detectedLanguage: result.detectedLanguage || session.sourceLanguage || null,
        },
        include: { pairing: true },
      });

      await this.audit.log({
        userId: session.pairing.createdById,
        tenantId: session.tenantId,
        action: 'MIC_TRANSCRIPTION_COMPLETED',
        module: 'mic',
        metadata: {
          consultationId: session.consultationId,
          micSessionId,
          jobId: job.id,
        },
      });

      await this.events.publish(session.consultationId, {
        type: 'MIC_STATE_CHANGED',
        ...this.toSanitized(updated),
      } as never);

      // Schedule retention cleanup of transport parts
      void this.scheduleDeletion(session.id, asset.id, graceSec * 1000);
    } catch (err) {
      this.logger.warn(`Whisper failed: ${(err as Error).message}`);
      await this.prisma.micTranscriptionJob.update({
        where: { id: job.id },
        data: {
          status: 'RETRYABLE_ERROR',
          errorCode: 'WHISPER_FAILED',
          completedAt: new Date(),
        },
      });
      await this.audit.log({
        userId: session.pairing.createdById,
        tenantId: session.tenantId,
        action: 'MIC_TRANSCRIPTION_FAILED',
        module: 'mic',
        metadata: {
          consultationId: session.consultationId,
          micSessionId,
          errorCode: 'WHISPER_FAILED',
        },
      });
      await this.markError(micSessionId, 'WHISPER_FAILED');
    }
  }

  private async scheduleDeletion(micSessionId: string, assetId: string, delayMs: number) {
    setTimeout(() => {
      void this.deleteAudio(micSessionId, assetId);
    }, Math.min(delayMs, 24 * 60 * 60 * 1000));
  }

  private async deleteAudio(micSessionId: string, assetId: string) {
    try {
      const parts = await this.prisma.micAudioPart.findMany({
        where: { micSessionId },
      });
      for (const p of parts) {
        await this.storage.delete(p.storagePath);
      }
      const asset = await this.prisma.micAudioAsset.findUnique({ where: { id: assetId } });
      if (asset?.storagePath) {
        await this.storage.delete(asset.storagePath);
      }
      await this.prisma.micAudioAsset.update({
        where: { id: assetId },
        data: { status: 'DELETED', deletedAt: new Date() },
      });
      const session = await this.prisma.micSession.findUnique({
        where: { id: micSessionId },
        include: { pairing: true },
      });
      if (session) {
        await this.audit.log({
          userId: session.pairing.createdById,
          tenantId: session.tenantId,
          action: 'MIC_AUDIO_DELETED',
          module: 'mic',
          metadata: {
            consultationId: session.consultationId,
            micSessionId,
            assetId,
          },
        });
      }
    } catch (err) {
      this.logger.warn(`Audio deletion failed: ${(err as Error).message}`);
    }
  }

  private async markError(micSessionId: string, failureCode: string) {
    const updated = await this.prisma.micSession.update({
      where: { id: micSessionId },
      data: {
        state: 'RECOVERABLE_ERROR',
        failureCode,
        stateVersion: { increment: 1 },
      },
    });
    await this.events.publish(updated.consultationId, {
      type: 'MIC_STATE_CHANGED',
      ...this.toSanitized(updated),
    } as never);
  }

  private async readStorage(storagePath: string, contentType: string): Promise<Buffer> {
    const result = await this.storage.open(storagePath, contentType);
    const chunks: Buffer[] = [];
    for await (const chunk of result.stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private tryNormalize(input: Buffer, contentType: string): Promise<Buffer | null> {
    return new Promise((resolve) => {
      const workDir = tmpdir();
      const inPath = join(workDir, `mic-in-${Date.now()}`);
      const outPath = join(workDir, `mic-out-${Date.now()}.mp3`);
      const ext = contentType.includes('mp4')
        ? '.mp4'
        : contentType.includes('mpeg') || contentType.includes('mp3')
          ? '.mp3'
          : contentType.includes('wav')
            ? '.wav'
            : '.webm';
      const inputPath = inPath + ext;

      void (async () => {
        try {
          await fs.writeFile(inputPath, input);
          const proc = spawn(
            'ffmpeg',
            [
              '-hide_banner',
              '-loglevel',
              'error',
              '-i',
              inputPath,
              '-vn',
              '-ac',
              '1',
              '-ar',
              '16000',
              '-c:a',
              'libmp3lame',
              '-b:a',
              '48k',
              outPath,
            ],
            { stdio: ['ignore', 'ignore', 'pipe'] },
          );

          let stderr = '';
          proc.stderr?.on('data', (d: Buffer) => {
            stderr += d.toString();
          });

          proc.on('error', () => {
            void fs.unlink(inputPath).catch(() => undefined);
            resolve(null);
          });

          proc.on('close', (code) => {
            void (async () => {
              try {
                if (code === 0) {
                  const out = await fs.readFile(outPath);
                  await fs.unlink(outPath).catch(() => undefined);
                  await fs.unlink(inputPath).catch(() => undefined);
                  resolve(out);
                } else {
                  this.logger.debug(`ffmpeg failed: ${stderr}`);
                  await fs.unlink(inputPath).catch(() => undefined);
                  resolve(null);
                }
              } catch {
                resolve(null);
              }
            })();
          });
        } catch {
          resolve(null);
        }
      })();
    });
  }
}

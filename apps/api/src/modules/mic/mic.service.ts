import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConsultationStatus,
  MicPairingStatus,
  MicSessionState as PrismaMicState,
  Prisma,
} from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { ObjectStorageService } from '@/modules/storage/object-storage.service';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import { MicAuthService } from './mic-auth.service';
import { MicEventsService } from './mic-events.service';
import { nextState, canTransition } from './mic-state-machine';
import {
  ACTIVE_MIC_STATES,
  MIC_CONSENT_NOTICE_VERSION,
  type MicCommand,
  type MicSanitizedState,
  type MicSessionState,
} from './mic.types';
import { MicFinalizationService } from './mic-finalization.service';
import { MicLiveTranslateService } from './mic-live-translate.service';
import { normalizeSttLanguageSettings, whisperLocaleId } from '@safescript/shared';

@Injectable()
export class MicService {
  private readonly logger = new Logger(MicService.name);
  /** In-memory idempotency for short-lived command responses */
  private readonly commandDedupe = new Map<string, { at: number; result: MicSanitizedState }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly micAuth: MicAuthService,
    private readonly events: MicEventsService,
    private readonly storage: ObjectStorageService,
    private readonly finalization: MicFinalizationService,
    private readonly liveTranslate: MicLiveTranslateService,
  ) {}

  isEnabled(tenantId?: string | null): boolean {
    const flag = this.config.get<string>('SAFESCRIBE_MIC_ENABLED', 'true');
    if (flag === 'false' || flag === '0') return false;
    const pilot = (this.config.get<string>('SAFESCRIBE_MIC_PILOT_TENANT_IDS', '') || '').trim();
    if (!pilot) return true;
    if (!tenantId) return false;
    const allowed = pilot.split(',').map((s) => s.trim()).filter(Boolean);
    return allowed.includes(tenantId);
  }

  private pairingTtlSeconds(): number {
    return Number(this.config.get('MIC_PAIRING_TTL_SECONDS', 300));
  }

  private sessionMaxSeconds(): number {
    return Number(this.config.get('MIC_SESSION_MAX_SECONDS', 5400));
  }

  private webBaseUrl(): string {
    return (this.config.get<string>('WEB_URL') || 'http://localhost:3000').replace(/\/$/, '');
  }

  private assertFeature(tenantId?: string | null) {
    if (!this.isEnabled(tenantId)) {
      throw new ServiceUnavailableException({
        error: {
          code: 'MIC_DISABLED',
          message: 'SafeScribe Mic is not enabled for this organization.',
          retryable: false,
        },
      });
    }
  }

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
    pairing?: { expiresAt: Date } | null;
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
      pairingExpiresAt: session.pairing?.expiresAt?.toISOString() ?? null,
      sourceLanguage: session.sourceLanguage || 'auto',
      translateToEnglish: Boolean(session.translateToEnglish),
      detectedLanguage: session.detectedLanguage ?? null,
      speechLocaleId: whisperLocaleId(session.sourceLanguage) ?? null,
    };
  }

  private async publishState(consultationId: string, state: MicSanitizedState) {
    await this.events.publish(consultationId, {
      type: 'MIC_STATE_CHANGED',
      micSessionId: state.micSessionId,
      state: state.state,
      stateVersion: state.stateVersion,
      recordingStartedAt: state.recordingStartedAt,
      lastHeartbeatAt: state.lastHeartbeatAt,
      upload: state.upload,
      failureCode: state.failureCode,
    });
  }

  async assertConsultationAccess(consultationId: string, user: RequestUser) {
    const c = await this.prisma.consultation.findUnique({ where: { id: consultationId } });
    if (!c) throw new NotFoundException('Consultation not found');
    if (user.role !== 'SUPER_ADMIN') {
      if (user.tenantId && c.tenantId && c.tenantId !== user.tenantId) {
        throw new ForbiddenException('Cross-tenant access denied');
      }
      if (user.role === 'PHARMACIST' && c.pharmacistId && c.pharmacistId !== user.id) {
        throw new ForbiddenException('You do not have access to this consultation');
      }
    }
    if (
      c.status === ConsultationStatus.COMPLETED ||
      c.status === ConsultationStatus.CANCELLED ||
      c.lockedAt
    ) {
      throw new BadRequestException({
        error: {
          code: 'CONSULTATION_LOCKED',
          message: 'This consultation is no longer available for recording.',
          retryable: false,
        },
      });
    }
    return c;
  }

  async createPairing(
    consultationId: string,
    user: RequestUser,
    stt?: { sourceLanguage?: string; translateToEnglish?: boolean },
  ) {
    this.assertFeature(user.tenantId);
    const consultation = await this.assertConsultationAccess(consultationId, user);

    // Expire stale pairings
    await this.prisma.micPairing.updateMany({
      where: {
        consultationId,
        status: MicPairingStatus.WAITING,
        expiresAt: { lt: new Date() },
      },
      data: { status: MicPairingStatus.EXPIRED },
    });

    // Supersede any non-recording session so QR can always be refreshed.
    // Recording / finalizing sessions stay protected (must Cancel / End first).
    const replaceable = await this.prisma.micSession.findMany({
      where: {
        consultationId,
        state: {
          in: [
            'WAITING',
            'CLAIMED',
            'CONSENT_REQUIRED',
            'READY',
            'FAILED',
            'CANCELLED',
            'EXPIRED',
            'RECOVERABLE_ERROR',
            'TRANSCRIPT_READY',
          ] as PrismaMicState[],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    for (const s of replaceable) {
      if (s.state === 'WAITING' || s.state === 'CLAIMED' || s.state === 'CONSENT_REQUIRED' || s.state === 'READY') {
        await this.prisma.micSession.update({
          where: { id: s.id },
          data: { state: 'CANCELLED', stateVersion: { increment: 1 } },
        });
        await this.prisma.micPairing.update({
          where: { id: s.pairingId },
          data: { status: MicPairingStatus.REVOKED, revokedAt: new Date() },
        });
      }
    }

    const active = await this.prisma.micSession.findFirst({
      where: {
        consultationId,
        state: {
          in: ['RECORDING', 'PAUSED', 'FINALIZING', 'TRANSCRIBING'] as PrismaMicState[],
        },
      },
    });
    if (active) {
      throw new ConflictException({
        error: {
          code: 'MIC_SESSION_ACTIVE',
          message:
            'A SafeScribe Mic session is recording or finalizing. End or cancel it before starting a new one.',
          retryable: false,
        },
      });
    }

    // Revoke other waiting pairings
    await this.prisma.micPairing.updateMany({
      where: { consultationId, status: MicPairingStatus.WAITING },
      data: { status: MicPairingStatus.REVOKED, revokedAt: new Date() },
    });

    const rawToken = this.micAuth.generateOpaqueToken(32);
    const tokenHash = this.micAuth.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + this.pairingTtlSeconds() * 1000);

    const pairing = await this.prisma.micPairing.create({
      data: {
        tenantId: consultation.tenantId,
        consultationId,
        createdById: user.id,
        tokenHash,
        status: MicPairingStatus.WAITING,
        expiresAt,
      },
    });

    const lang = normalizeSttLanguageSettings(stt);

    const session = await this.prisma.micSession.create({
      data: {
        tenantId: consultation.tenantId,
        consultationId,
        pairingId: pairing.id,
        state: 'WAITING',
        stateVersion: 0,
        sourceLanguage: lang.sourceLanguage,
        translateToEnglish: lang.translateToEnglish,
      },
      include: { pairing: true },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: consultation.tenantId,
      action: 'MIC_PAIRING_CREATED',
      module: 'mic',
      metadata: {
        consultationId,
        micSessionId: session.id,
        pairingId: pairing.id,
      },
    });

    const sanitized = this.toSanitized(session);
    await this.publishState(consultationId, sanitized);

    return {
      pairingId: pairing.id,
      micSessionId: session.id,
      pairingUrl: `${this.webBaseUrl()}/mic/${rawToken}`,
      pairToken: rawToken,
      expiresAt: expiresAt.toISOString(),
      state: sanitized.state,
      stateVersion: sanitized.stateVersion,
    };
  }

  async getSessionForDesktop(consultationId: string, user: RequestUser) {
    this.assertFeature(user.tenantId);
    await this.assertConsultationAccess(consultationId, user);
    const session = await this.prisma.micSession.findFirst({
      where: { consultationId },
      orderBy: { createdAt: 'desc' },
      include: { pairing: true },
    });
    if (!session) return null;
    return this.toSanitized(session);
  }

  async updateSttSettings(
    consultationId: string,
    user: RequestUser,
    stt: { sourceLanguage?: string; translateToEnglish?: boolean },
  ) {
    this.assertFeature(user.tenantId);
    await this.assertConsultationAccess(consultationId, user);
    const session = await this.prisma.micSession.findFirst({
      where: { consultationId },
      orderBy: { createdAt: 'desc' },
      include: { pairing: true },
    });
    if (!session) {
      throw new NotFoundException('Mic session not found');
    }
    const locked: MicSessionState[] = [
      'RECORDING',
      'PAUSED',
      'FINALIZING',
      'TRANSCRIBING',
      'TRANSCRIPT_READY',
    ];
    if (locked.includes(session.state as MicSessionState)) {
      throw new BadRequestException({
        error: {
          code: 'MIC_STT_LOCKED',
          message: 'Spoken language cannot be changed while recording.',
          retryable: false,
        },
      });
    }
    const lang = normalizeSttLanguageSettings({
      sourceLanguage: stt.sourceLanguage ?? session.sourceLanguage,
      translateToEnglish:
        stt.translateToEnglish ?? session.translateToEnglish,
    });
    const updated = await this.prisma.micSession.update({
      where: { id: session.id },
      data: {
        sourceLanguage: lang.sourceLanguage,
        translateToEnglish: lang.translateToEnglish,
      },
      include: { pairing: true },
    });
    const sanitized = this.toSanitized(updated);
    await this.publishState(consultationId, sanitized);
    return sanitized;
  }

  async claimPairing(pairToken: string) {
    const tokenHash = this.micAuth.hashToken(pairToken);
    const pairing = await this.prisma.micPairing.findUnique({
      where: { tokenHash },
      include: { session: true },
    });

    if (!pairing || !pairing.session) {
      throw new NotFoundException({
        error: {
          code: 'PAIRING_NOT_FOUND',
          message: 'This SafeScribe Mic link is no longer active.',
          retryable: false,
        },
      });
    }

    this.assertFeature(pairing.tenantId);

    if (pairing.status === MicPairingStatus.CLAIMED) {
      throw new ConflictException({
        error: {
          code: 'PAIRING_ALREADY_USED',
          message: 'This SafeScribe Mic link is no longer active.',
          retryable: false,
        },
      });
    }
    if (
      pairing.status === MicPairingStatus.EXPIRED ||
      pairing.status === MicPairingStatus.REVOKED ||
      pairing.expiresAt < new Date()
    ) {
      if (pairing.status === MicPairingStatus.WAITING) {
        await this.prisma.micPairing.update({
          where: { id: pairing.id },
          data: { status: MicPairingStatus.EXPIRED },
        });
        await this.prisma.micSession.update({
          where: { id: pairing.session.id },
          data: { state: 'EXPIRED', stateVersion: { increment: 1 } },
        });
      }
      throw new BadRequestException({
        error: {
          code: 'PAIRING_EXPIRED',
          message: 'This SafeScribe Mic link is no longer active.',
          retryable: false,
        },
      });
    }

    if (pairing.session.state !== 'WAITING') {
      throw new ConflictException({
        error: {
          code: 'PAIRING_ALREADY_USED',
          message: 'This SafeScribe Mic link is no longer active.',
          retryable: false,
        },
      });
    }

    const sessionCredential = this.micAuth.generateOpaqueToken(32);
    const credentialHash = this.micAuth.hashToken(sessionCredential);
    const credentialExpiresAt = new Date(Date.now() + this.sessionMaxSeconds() * 1000);

    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.micPairing.updateMany({
        where: { id: pairing.id, status: MicPairingStatus.WAITING },
        data: {
          status: MicPairingStatus.CLAIMED,
          claimedAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException({
          error: {
            code: 'PAIRING_ALREADY_USED',
            message: 'This SafeScribe Mic link is no longer active.',
            retryable: false,
          },
        });
      }
      return tx.micSession.update({
        where: { id: pairing.session!.id },
        data: {
          state: 'CLAIMED',
          stateVersion: { increment: 1 },
          credentialHash,
          credentialExpiresAt,
          lastHeartbeatAt: new Date(),
        },
        include: { pairing: true },
      });
    });

    await this.audit.log({
      userId: pairing.createdById,
      tenantId: pairing.tenantId,
      action: 'MIC_PAIRING_CLAIMED',
      module: 'mic',
      metadata: {
        consultationId: pairing.consultationId,
        micSessionId: updated.id,
        pairingId: pairing.id,
      },
    });
    await this.audit.log({
      userId: pairing.createdById,
      tenantId: pairing.tenantId,
      action: 'MIC_PHONE_CONNECTED',
      module: 'mic',
      metadata: {
        consultationId: pairing.consultationId,
        micSessionId: updated.id,
      },
    });

    const sanitized = this.toSanitized(updated);
    await this.publishState(pairing.consultationId, sanitized);

    return {
      ...sanitized,
      sessionToken: sessionCredential,
      consentNoticeVersion: MIC_CONSENT_NOTICE_VERSION,
      message:
        'This phone is being used only as a microphone. No patient information is shown here.',
    };
  }

  private async loadSession(micSessionId: string) {
    const session = await this.prisma.micSession.findUnique({
      where: { id: micSessionId },
      include: { pairing: true },
    });
    if (!session) throw new NotFoundException('Mic session not found');
    return session;
  }

  private commandKey(sessionId: string, key: string) {
    return `${sessionId}:${key}`;
  }

  private getDedupe(sessionId: string, key: string): MicSanitizedState | null {
    const hit = this.commandDedupe.get(this.commandKey(sessionId, key));
    if (!hit) return null;
    if (Date.now() - hit.at > 10 * 60 * 1000) {
      this.commandDedupe.delete(this.commandKey(sessionId, key));
      return null;
    }
    return hit.result;
  }

  private setDedupe(sessionId: string, key: string, result: MicSanitizedState) {
    this.commandDedupe.set(this.commandKey(sessionId, key), {
      at: Date.now(),
      result,
    });
  }

  async applyCommand(params: {
    micSessionId: string;
    command: MicCommand;
    expectedStateVersion: number;
    idempotencyKey: string;
    actorUserId?: string;
  }) {
    const deduped = this.getDedupe(params.micSessionId, params.idempotencyKey);
    if (deduped) return deduped;

    const session = await this.loadSession(params.micSessionId);
    if (session.stateVersion !== params.expectedStateVersion) {
      throw new ConflictException({
        error: {
          code: 'STATE_VERSION_CONFLICT',
          message: 'Session state changed. Refresh and try again.',
          retryable: true,
          current: this.toSanitized(session),
        },
      });
    }

    const from = session.state as MicSessionState;
    let event: Parameters<typeof nextState>[1] = params.command;

    if (params.command === 'MIC_READY') {
      if (from === 'CLAIMED') {
        event = 'MIC_READY';
      } else if (from === 'CONSENT_REQUIRED' || from === 'READY') {
        // idempotent
        const s = this.toSanitized(session);
        this.setDedupe(params.micSessionId, params.idempotencyKey, s);
        return s;
      }
    }

    if (!canTransition(from, event) && params.command !== 'MIC_READY') {
      // idempotent if already in target for some commands
      if (
        (params.command === 'START' && from === 'RECORDING') ||
        (params.command === 'PAUSE' && from === 'PAUSED') ||
        (params.command === 'END' &&
          ['FINALIZING', 'TRANSCRIBING', 'TRANSCRIPT_READY'].includes(from))
      ) {
        const s = this.toSanitized(session);
        this.setDedupe(params.micSessionId, params.idempotencyKey, s);
        return s;
      }
      throw new BadRequestException({
        error: {
          code: 'INVALID_STATE_TRANSITION',
          message: `Cannot ${params.command} while ${from}.`,
          retryable: false,
        },
      });
    }

    let to: MicSessionState;
    try {
      to = nextState(from, event);
    } catch {
      throw new BadRequestException({
        error: {
          code: 'INVALID_STATE_TRANSITION',
          message: `Cannot ${params.command} while ${from}.`,
          retryable: false,
        },
      });
    }

    const data: Prisma.MicSessionUpdateInput = {
      state: to as PrismaMicState,
      stateVersion: { increment: 1 },
    };

    if (params.command === 'START') {
      data.recordingStartedAt = session.recordingStartedAt ?? new Date();
      // open segment 0 if first start, or next if after resume handled separately
    }
    if (params.command === 'END') {
      data.recordingEndedAt = new Date();
    }
    if (params.command === 'CANCEL') {
      data.credentialHash = null;
      data.credentialExpiresAt = null;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.micSession.updateMany({
        where: {
          id: params.micSessionId,
          stateVersion: params.expectedStateVersion,
        },
        data: {
          state: to as PrismaMicState,
          stateVersion: { increment: 1 },
          ...(params.command === 'START'
            ? { recordingStartedAt: session.recordingStartedAt ?? new Date() }
            : {}),
          ...(params.command === 'END' ? { recordingEndedAt: new Date() } : {}),
          ...(params.command === 'CANCEL'
            ? { credentialHash: null, credentialExpiresAt: null }
            : {}),
        },
      });
      if (result.count !== 1) {
        throw new ConflictException({
          error: {
            code: 'STATE_VERSION_CONFLICT',
            message: 'Session state changed. Refresh and try again.',
            retryable: true,
          },
        });
      }

      if (params.command === 'START' || params.command === 'RESUME') {
        const segmentNumber =
          params.command === 'START' && !session.recordingStartedAt
            ? 0
            : params.command === 'RESUME'
              ? session.currentSegmentNumber + 1
              : session.currentSegmentNumber;
        await tx.micAudioSegment.create({
          data: {
            micSessionId: params.micSessionId,
            segmentNumber,
            status: 'OPEN',
          },
        });
        if (params.command === 'RESUME' || (params.command === 'START' && session.recordingStartedAt)) {
          await tx.micSession.update({
            where: { id: params.micSessionId },
            data: { currentSegmentNumber: segmentNumber },
          });
        }
      }

      if (params.command === 'PAUSE' || params.command === 'END') {
        await tx.micAudioSegment.updateMany({
          where: {
            micSessionId: params.micSessionId,
            segmentNumber: session.currentSegmentNumber,
            status: 'OPEN',
          },
          data: { status: 'COMPLETE', endedAt: new Date() },
        });
      }

      if (params.command === 'CANCEL') {
        await tx.micPairing.update({
          where: { id: session.pairingId },
          data: { status: MicPairingStatus.REVOKED, revokedAt: new Date() },
        });
      }

      return tx.micSession.findUniqueOrThrow({
        where: { id: params.micSessionId },
        include: { pairing: true },
      });
    });

    const actionMap: Partial<Record<MicCommand, string>> = {
      START: 'MIC_RECORDING_STARTED',
      PAUSE: 'MIC_RECORDING_PAUSED',
      RESUME: 'MIC_RECORDING_RESUMED',
      END: 'MIC_RECORDING_ENDED',
      CANCEL: 'MIC_SESSION_CANCELLED',
      RETRY_TRANSCRIPTION: 'MIC_TRANSCRIPTION_RETRIED',
    };
    const action = actionMap[params.command];
    if (action) {
      await this.audit.log({
        userId: params.actorUserId ?? session.pairing.createdById,
        tenantId: session.tenantId,
        action,
        module: 'mic',
        metadata: {
          consultationId: session.consultationId,
          micSessionId: session.id,
          from,
          to,
        },
      });
    }

    const sanitized = this.toSanitized(updated);
    this.setDedupe(params.micSessionId, params.idempotencyKey, sanitized);
    await this.publishState(session.consultationId, sanitized);

    if (params.command === 'END') {
      this.liveTranslate.clear(params.micSessionId);
      // Prefer finalize after phone Complete (parts flushed). Safety-net only.
      setTimeout(() => {
        void this.finalization.finalizeAndTranscribe(params.micSessionId);
      }, 45_000);
    }

    if (params.command === 'RETRY_TRANSCRIPTION') {
      void this.finalization.retryTranscription(params.micSessionId);
    }

    return sanitized;
  }

  async recordConsent(params: {
    micSessionId: string;
    consentObtained: boolean;
    method: string;
    noticeVersion: string;
    expectedStateVersion: number;
    idempotencyKey: string;
  }) {
    const deduped = this.getDedupe(params.micSessionId, params.idempotencyKey);
    if (deduped) return deduped;

    if (!params.consentObtained) {
      throw new BadRequestException({
        error: {
          code: 'CONSENT_REQUIRED',
          message: 'Consent attestation is required before recording.',
          retryable: false,
        },
      });
    }

    const session = await this.loadSession(params.micSessionId);
    if (session.stateVersion !== params.expectedStateVersion) {
      throw new ConflictException({
        error: {
          code: 'STATE_VERSION_CONFLICT',
          message: 'Session state changed. Refresh and try again.',
          retryable: true,
          current: this.toSanitized(session),
        },
      });
    }

    const from = session.state as MicSessionState;
    if (from === 'READY') {
      const s = this.toSanitized(session);
      this.setDedupe(params.micSessionId, params.idempotencyKey, s);
      return s;
    }
    if (from !== 'CLAIMED' && from !== 'CONSENT_REQUIRED') {
      throw new BadRequestException({
        error: {
          code: 'INVALID_STATE_TRANSITION',
          message: 'Cannot record consent in the current state.',
          retryable: false,
        },
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.micConsentRecord.create({
        data: {
          tenantId: session.tenantId,
          consultationId: session.consultationId,
          micSessionId: session.id,
          status: 'GRANTED',
          method: 'VERBAL_PHARMACIST_ATTESTATION',
          noticeVersion: params.noticeVersion || MIC_CONSENT_NOTICE_VERSION,
          attestedById: session.pairing.createdById,
        },
      });
      const result = await tx.micSession.updateMany({
        where: {
          id: session.id,
          stateVersion: params.expectedStateVersion,
          state: { in: ['CLAIMED', 'CONSENT_REQUIRED', 'READY'] },
        },
        data: {
          state: 'READY',
          stateVersion: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw new ConflictException({
          error: {
            code: 'STATE_VERSION_CONFLICT',
            message: 'Session state changed. Refresh and try again.',
            retryable: true,
          },
        });
      }
      return tx.micSession.findUniqueOrThrow({
        where: { id: session.id },
        include: { pairing: true },
      });
    });

    await this.audit.log({
      userId: session.pairing.createdById,
      tenantId: session.tenantId,
      action: 'MIC_CONSENT_ATTESTED',
      module: 'mic',
      metadata: {
        consultationId: session.consultationId,
        micSessionId: session.id,
        noticeVersion: params.noticeVersion,
      },
    });

    const sanitized = this.toSanitized(updated);
    this.setDedupe(params.micSessionId, params.idempotencyKey, sanitized);
    await this.publishState(session.consultationId, sanitized);
    return sanitized;
  }

  async heartbeat(micSessionId: string) {
    const session = await this.prisma.micSession.update({
      where: { id: micSessionId },
      data: { lastHeartbeatAt: new Date() },
      include: { pairing: true },
    });
    const sanitized = this.toSanitized(session);
    await this.publishState(session.consultationId, sanitized);
    return { ok: true, state: sanitized.state, stateVersion: sanitized.stateVersion };
  }

  async livePreview(micSessionId: string, text: string, isFinal?: boolean) {
    const session = await this.loadSession(micSessionId);
    // Whisper live translation owns the desktop preview when translate is on.
    if (session.translateToEnglish) {
      return { ok: true, suppressed: true };
    }
    const trimmed = text.slice(0, 4000);
    await this.events.publish(session.consultationId, {
      type: 'LIVE_PREVIEW',
      micSessionId,
      text: trimmed,
      isFinal,
    });
    return { ok: true };
  }

  async uploadPart(params: {
    micSessionId: string;
    segmentNumber: number;
    sequenceNumber: number;
    contentType: string;
    buffer: Buffer;
    checksumSha256?: string;
  }) {
    const session = await this.loadSession(params.micSessionId);
    const state = session.state as MicSessionState;
    if (state !== 'RECORDING' && state !== 'PAUSED' && state !== 'FINALIZING') {
      throw new BadRequestException({
        error: {
          code: 'UPLOAD_NOT_ALLOWED',
          message: 'Audio cannot be uploaded in the current state.',
          retryable: false,
        },
      });
    }

    const maxBytes = Number(this.config.get('MIC_MAX_UPLOAD_BYTES', 262144000));
    if (Number(session.totalBytes) + params.buffer.length > maxBytes) {
      throw new BadRequestException({
        error: {
          code: 'UPLOAD_LIMIT',
          message: 'Recording size limit reached.',
          retryable: false,
        },
      });
    }

    let segment = await this.prisma.micAudioSegment.findUnique({
      where: {
        micSessionId_segmentNumber: {
          micSessionId: params.micSessionId,
          segmentNumber: params.segmentNumber,
        },
      },
    });
    if (!segment) {
      segment = await this.prisma.micAudioSegment.create({
        data: {
          micSessionId: params.micSessionId,
          segmentNumber: params.segmentNumber,
          status: 'UPLOADING',
        },
      });
    }

    const existing = await this.prisma.micAudioPart.findUnique({
      where: {
        segmentId_sequenceNumber: {
          segmentId: segment.id,
          sequenceNumber: params.sequenceNumber,
        },
      },
    });
    const checksum =
      params.checksumSha256 ||
      createHash('sha256').update(params.buffer).digest('hex');

    if (existing) {
      if (existing.checksumSha256 && existing.checksumSha256 !== checksum) {
        throw new ConflictException({
          error: {
            code: 'PART_CHECKSUM_MISMATCH',
            message: 'The recording could not be verified.',
            retryable: false,
          },
        });
      }
      return {
        partId: existing.id,
        sequenceNumber: existing.sequenceNumber,
        byteSize: existing.byteSize,
        duplicate: true,
      };
    }

    const objectKey = [
      'mic',
      session.tenantId || 'platform',
      session.consultationId,
      params.micSessionId,
      `s${params.segmentNumber}_p${params.sequenceNumber}_${Date.now()}.webm`,
    ].join('/');

    let stored: { storageKey: string; provider: string };
    try {
      // Prefer local disk for mic chunks: lower latency, resilient on single-node
      // staging/prod when GCS object ACLs block create.
      stored = await this.storage.upload({
        buffer: params.buffer,
        contentType: params.contentType || 'audio/webm',
        objectKey,
        preferLocal:
          this.config.get<string>('MIC_USE_LOCAL_STORAGE', 'true') !== 'false',
      });
    } catch (err) {
      this.logger.error(
        `Mic part upload failed session=${params.micSessionId} seq=${params.sequenceNumber}: ${(err as Error).message}`,
      );
      throw new BadRequestException({
        error: {
          code: 'UPLOAD_FAILED',
          message: 'Could not store the audio part. Check network and try again.',
          retryable: true,
        },
      });
    }

    const part = await this.prisma.micAudioPart.create({
      data: {
        micSessionId: params.micSessionId,
        segmentId: segment.id,
        sequenceNumber: params.sequenceNumber,
        storagePath: stored.storageKey,
        contentType: params.contentType,
        byteSize: params.buffer.length,
        checksumSha256: checksum,
      },
    });

    const updated = await this.prisma.micSession.update({
      where: { id: params.micSessionId },
      data: {
        totalParts: { increment: 1 },
        totalBytes: { increment: params.buffer.length },
        lastPartReceivedAt: new Date(),
        lastHeartbeatAt: new Date(),
        clientMimeType: session.clientMimeType || params.contentType,
      },
      include: { pairing: true },
    });

    await this.publishState(session.consultationId, this.toSanitized(updated));

    this.liveTranslate.enqueuePart({
      micSessionId: params.micSessionId,
      consultationId: session.consultationId,
      buffer: params.buffer,
      contentType: params.contentType,
      sequenceNumber: params.sequenceNumber,
      sourceLanguage: session.sourceLanguage,
      translateToEnglish: session.translateToEnglish,
    });

    return {
      partId: part.id,
      sequenceNumber: part.sequenceNumber,
      byteSize: part.byteSize,
      duplicate: false,
    };
  }

  async completeUpload(params: {
    micSessionId: string;
    expectedStateVersion: number;
    idempotencyKey: string;
    clientMimeType?: string;
    durationSeconds?: number;
  }) {
    const deduped = this.getDedupe(params.micSessionId, `complete:${params.idempotencyKey}`);
    if (deduped) return deduped;

    // Ensure END has happened
    let session = await this.loadSession(params.micSessionId);
    if (session.state === 'RECORDING' || session.state === 'PAUSED') {
      session = await this.prisma.micSession
        .update({
          where: { id: params.micSessionId },
          data: {
            state: 'FINALIZING',
            stateVersion: { increment: 1 },
            recordingEndedAt: new Date(),
            clientMimeType: params.clientMimeType || session.clientMimeType,
          },
          include: { pairing: true },
        })
        .then((s) => s);
    } else if (session.state !== 'FINALIZING' && session.state !== 'TRANSCRIBING') {
      // already past finalization
      return this.toSanitized(session);
    }

    if (params.clientMimeType) {
      await this.prisma.micSession.update({
        where: { id: params.micSessionId },
        data: { clientMimeType: params.clientMimeType },
      });
    }

    await this.audit.log({
      userId: session.pairing.createdById,
      tenantId: session.tenantId,
      action: 'MIC_UPLOAD_COMPLETED',
      module: 'mic',
      metadata: {
        consultationId: session.consultationId,
        micSessionId: session.id,
        parts: session.totalParts,
      },
    });

    const sanitized = this.toSanitized(
      await this.loadSession(params.micSessionId),
    );
    this.setDedupe(params.micSessionId, `complete:${params.idempotencyKey}`, sanitized);
    await this.publishState(session.consultationId, sanitized);

    // Brief grace for the last in-flight multipart PUT, then Whisper.
    setTimeout(() => {
      void this.finalization.finalizeAndTranscribe(params.micSessionId);
    }, 2_500);

    return sanitized;
  }

  async getPhoneSession(micSessionId: string) {
    const session = await this.loadSession(micSessionId);
    return this.toSanitized(session);
  }
}

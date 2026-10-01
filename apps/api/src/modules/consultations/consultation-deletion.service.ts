import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConsultationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { ObjectStorageService } from '@/modules/storage/object-storage.service';

const MT_TZ = 'America/Edmonton';
const STORAGE_DELETE_CONCURRENCY = 8;
const PURGE_DELETE_CONCURRENCY = 5;

type AttachmentLike = {
  id?: string;
  storageKey?: string;
  fileUrl?: string;
  storageProvider?: 'gcs' | 'local';
};

/**
 * Shared consultation deletion for:
 * 1) pharmacist Complete & Delete on Documents (last step)
 * 2) automatic midnight Mountain Time cleanup of unfinished sessions
 *
 * Permanently removes temporary consultation clinical content, files, and
 * linked safety evaluations. Does not touch user accounts, org config,
 * or subscription data.
 */
@Injectable()
export class ConsultationDeletionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConsultationDeletionService.name);
  private sweepTimer: NodeJS.Timeout | null = null;
  private sweeping = false;
  private lastSweepDayKey: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly objectStorage: ObjectStorageService,
  ) {}

  onModuleInit() {
    this.sweepTimer = setInterval(() => {
      void this.maybeRunMidnightSweep();
    }, 60_000);
    this.sweepTimer.unref?.();
    void this.purgeUnfinishedBeforeCutoff(this.startOfTodayMountainTime());
  }

  onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  /** Next automatic deletion deadline (tonight midnight MT) as ISO string. */
  getDeletionDeadlineIso(now = new Date()): string {
    return this.nextMidnightMountainTime(now).toISOString();
  }

  startOfTodayMountainTime(now = new Date()): Date {
    const parts = this.zonedParts(now, MT_TZ);
    return this.zonedLocalToUtc(parts.year, parts.month, parts.day, 0, 0, 0);
  }

  nextMidnightMountainTime(now = new Date()): Date {
    const start = this.startOfTodayMountainTime(now);
    return new Date(start.getTime() + 24 * 60 * 60 * 1000);
  }

  /**
   * Idempotent permanent deletion of a consultation and linked temporary artifacts.
   * Returns whether a row was deleted.
   */
  async deleteConsultationData(consultationId: string): Promise<{ deleted: boolean }> {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      select: {
        id: true,
        attachments: true,
        micAudioAssets: { select: { storagePath: true } },
        micSessions: {
          select: {
            segments: {
              select: {
                parts: { select: { storagePath: true } },
              },
            },
          },
        },
      },
    });

    if (!consultation) {
      return { deleted: false };
    }

    const keys = this.collectStorageKeys(consultation);
    await this.deleteStorageKeys(keys);

    try {
      await this.prisma.$transaction(async (tx) => {
        // Safety evaluations SetNull on consult delete and keep clinical findings.
        // Remove them first so Complete leaves no patient/drug safety payload.
        await tx.safetyEvaluation.deleteMany({ where: { consultationId } });
        await tx.consultation.delete({ where: { id: consultationId } });
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        return { deleted: false };
      }
      throw err;
    }

    return { deleted: true };
  }

  async purgeUnfinishedBeforeCutoff(cutoff: Date): Promise<number> {
    if (this.sweeping) return 0;
    this.sweeping = true;
    try {
      const stale = await this.prisma.consultation.findMany({
        where: {
          status: { in: [ConsultationStatus.DRAFT, ConsultationStatus.IN_PROGRESS] },
          createdAt: { lt: cutoff },
        },
        select: { id: true },
        take: 200,
      });

      let deleted = 0;
      for (let i = 0; i < stale.length; i += PURGE_DELETE_CONCURRENCY) {
        const batch = stale.slice(i, i + PURGE_DELETE_CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map((row) => this.deleteConsultationData(row.id)),
        );
        for (let j = 0; j < results.length; j += 1) {
          const result = results[j];
          if (result.status === 'fulfilled' && result.value.deleted) {
            deleted += 1;
          } else if (result.status === 'rejected') {
            this.logger.error(
              `Midnight purge failed for ${batch[j].id}: ${(result.reason as Error)?.message ?? result.reason}`,
            );
          }
        }
      }

      if (deleted > 0) {
        this.logger.log(
          `Purged ${deleted} unfinished consultation(s) before ${cutoff.toISOString()} (${MT_TZ})`,
        );
      }
      return deleted;
    } finally {
      this.sweeping = false;
    }
  }

  private collectStorageKeys(consultation: {
    attachments: unknown;
    micAudioAssets: Array<{ storagePath: string | null }>;
    micSessions: Array<{
      segments: Array<{ parts: Array<{ storagePath: string }>; }>;
    }>;
  }): string[] {
    const keys = new Set<string>();

    for (const attachment of this.readAttachments(consultation.attachments)) {
      const key =
        attachment.storageKey ||
        (attachment.fileUrl?.startsWith('/uploads/')
          ? attachment.fileUrl.replace(/^\/uploads\//, '')
          : '');
      if (key) keys.add(key);
    }

    for (const asset of consultation.micAudioAssets) {
      if (asset.storagePath) keys.add(asset.storagePath);
    }

    for (const session of consultation.micSessions) {
      for (const segment of session.segments) {
        for (const part of segment.parts) {
          if (part.storagePath) keys.add(part.storagePath);
        }
      }
    }

    return [...keys];
  }

  private async deleteStorageKeys(keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += STORAGE_DELETE_CONCURRENCY) {
      const batch = keys.slice(i, i + STORAGE_DELETE_CONCURRENCY);
      await Promise.all(
        batch.map(async (key) => {
          try {
            await this.objectStorage.delete(key);
          } catch (err) {
            this.logger.warn(
              `Storage delete failed for ${key}: ${(err as Error).message}`,
            );
          }
        }),
      );
    }
  }

  private async maybeRunMidnightSweep() {
    const now = new Date();
    const dayKey = this.dayKeyMountainTime(now);
    const startToday = this.startOfTodayMountainTime(now);

    if (this.lastSweepDayKey === dayKey) return;

    const deleted = await this.purgeUnfinishedBeforeCutoff(startToday);
    this.lastSweepDayKey = dayKey;
    if (deleted === 0) {
      this.logger.debug(`Midnight sweep idle for ${dayKey}`);
    }
  }

  private dayKeyMountainTime(now: Date): string {
    const p = this.zonedParts(now, MT_TZ);
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  }

  private zonedParts(date: Date, timeZone: string) {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    const parts = Object.fromEntries(
      fmt.formatToParts(date).map((p) => [p.type, p.value]),
    ) as Record<string, string>;
    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: Number(parts.hour),
      minute: Number(parts.minute),
      second: Number(parts.second),
    };
  }

  /** Convert a wall-clock datetime in America/Edmonton to a UTC Date. */
  private zonedLocalToUtc(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
  ): Date {
    let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    for (let i = 0; i < 3; i += 1) {
      const parts = this.zonedParts(guess, MT_TZ);
      const asUtc = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
      );
      const desired = Date.UTC(year, month - 1, day, hour, minute, second);
      guess = new Date(guess.getTime() + (desired - asUtc));
    }
    return guess;
  }

  private readAttachments(raw: unknown): AttachmentLike[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((a) => a && typeof a === 'object') as AttachmentLike[];
  }
}

import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/redis/redis.service';
import { AuditService } from '@/modules/audit/audit.service';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import {
  PROFESSIONAL_ACK_AUDIT_MODULE,
  PROFESSIONAL_ACK_BODY,
  PROFESSIONAL_ACK_EVENTS,
  PROFESSIONAL_ACK_HEADING,
  PROFESSIONAL_ACK_SESSION_TTL_SECONDS,
  PROFESSIONAL_ACK_SOURCE,
  PROFESSIONAL_ACK_VERSION,
  isProfessionalAckRole,
  type ProfessionalAcknowledgementStatus,
} from '@safescript/shared';
import { professionalAckCopySha256 } from './copy-hash';

@Injectable()
export class ProfessionalAcknowledgementService {
  private readonly logger = new Logger(ProfessionalAcknowledgementService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private audit: AuditService,
  ) {}

  currentStatus(acknowledged: boolean): ProfessionalAcknowledgementStatus {
    return {
      required: !acknowledged,
      acknowledged,
      version: PROFESSIONAL_ACK_VERSION,
      heading: PROFESSIONAL_ACK_HEADING,
      body: PROFESSIONAL_ACK_BODY,
    };
  }

  async getStatusForUser(user: Pick<RequestUser, 'id' | 'role'>): Promise<ProfessionalAcknowledgementStatus> {
    if (!isProfessionalAckRole(user.role)) {
      return this.currentStatus(true);
    }
    const acknowledged = await this.hasCurrentAcknowledgement(user.id);
    return this.currentStatus(acknowledged);
  }

  /**
   * True when this login session has already acknowledged professional use.
   * Historical Postgres rows are audit only and do not skip the gate.
   */
  async hasCurrentAcknowledgement(userId: string): Promise<boolean> {
    try {
      return await this.redis.exists(this.sessionKey(userId));
    } catch (error) {
      this.logger.error('Failed to read professional-use acknowledgement session flag', error);
      return false;
    }
  }

  /** Call on every successful login and logout so the next sign-in must re-acknowledge. */
  async clearSessionAcknowledgement(userId: string): Promise<void> {
    try {
      await this.redis.del(this.sessionKey(userId));
    } catch (error) {
      this.logger.error('Failed to clear professional-use acknowledgement session flag', error);
    }
  }

  async recordRequired(user: RequestUser, req?: { ipAddress?: string; userAgent?: string }) {
    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId,
      action: PROFESSIONAL_ACK_EVENTS.REQUIRED,
      module: PROFESSIONAL_ACK_AUDIT_MODULE,
      ipAddress: req?.ipAddress,
      userAgent: req?.userAgent,
      metadata: { version: PROFESSIONAL_ACK_VERSION },
    });
  }

  async acknowledge(user: RequestUser, req?: { ipAddress?: string; userAgent?: string }) {
    if (!isProfessionalAckRole(user.role)) {
      throw new ForbiddenException(
        'Only pharmacists and pharmacy administrators can acknowledge professional use of SafeScribe.',
      );
    }

    const key = this.sessionKey(user.id);
    let claimedThisSession = false;
    try {
      claimedThisSession = await this.redis.setNx(
        key,
        PROFESSIONAL_ACK_VERSION,
        PROFESSIONAL_ACK_SESSION_TTL_SECONDS,
      );
    } catch (error) {
      this.logger.error('Failed to claim professional-use acknowledgement session flag', error);
      throw new InternalServerErrorException('Acknowledgement could not be saved');
    }
    if (!claimedThisSession) {
      try {
        await this.redis.set(key, PROFESSIONAL_ACK_VERSION, PROFESSIONAL_ACK_SESSION_TTL_SECONDS);
      } catch {
        // Already gated for this login; TTL refresh is best-effort.
      }
      return this.currentStatus(true);
    }

    const copySha256 = professionalAckCopySha256();
    try {
      await this.prisma.professionalUseAcknowledgement.create({
        data: {
          userId: user.id,
          acknowledgementVersion: PROFESSIONAL_ACK_VERSION,
          source: PROFESSIONAL_ACK_SOURCE,
          copySha256,
        },
      });
      await this.audit.log({
        userId: user.id,
        tenantId: user.tenantId,
        action: PROFESSIONAL_ACK_EVENTS.ACCEPTED,
        module: PROFESSIONAL_ACK_AUDIT_MODULE,
        ipAddress: req?.ipAddress,
        userAgent: req?.userAgent,
        metadata: { version: PROFESSIONAL_ACK_VERSION, source: PROFESSIONAL_ACK_SOURCE },
      });
    } catch (error) {
      await this.redis.del(key);
      await this.audit.log({
        userId: user.id,
        tenantId: user.tenantId,
        action: PROFESSIONAL_ACK_EVENTS.SAVE_FAILED,
        module: PROFESSIONAL_ACK_AUDIT_MODULE,
        ipAddress: req?.ipAddress,
        userAgent: req?.userAgent,
        metadata: { version: PROFESSIONAL_ACK_VERSION, code: 'save_failed' },
      });
      this.logger.error('Failed to save professional-use acknowledgement', error);
      throw new InternalServerErrorException('Acknowledgement could not be saved');
    }

    return this.currentStatus(true);
  }

  private sessionKey(userId: string): string {
    return `professional_ack:session:${userId}`;
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { FaxStatus, ReferralLetterRecordStatus } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import { ROLES, calendarDateInTimeZone, unresolvedOptionalDobMessage } from '@safescript/shared';
import { ConfigService } from '@nestjs/config';
import { IfaxClient } from './ifax.client';
import { SendConsultationFaxDto } from './dto/send-fax.dto';
import { decodePdfBase64, MAX_FAX_PDF_BYTES, normalizeFaxNumber } from './fax.util';

@Injectable()
export class FaxService {
  private readonly logger = new Logger(FaxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ifax: IfaxClient,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async sendConsultationDocument(
    consultationId: string,
    dto: SendConsultationFaxDto,
    user: RequestUser,
    req?: Request,
  ) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      select: {
        id: true,
        tenantId: true,
        pharmacistId: true,
        consultationRef: true,
        demographics: true,
        documentation: true,
        createdAt: true,
        tenant: { select: { timezone: true } },
      },
    });
    if (!consultation) throw new NotFoundException('Consultation not found');
    this.checkConsultationAccess(consultation, user);

    const asOf = calendarDateInTimeZone(
      consultation.createdAt,
      consultation.tenant?.timezone,
    );
    const unresolved = unresolvedOptionalDobMessage(
      (consultation.documentation as Record<string, unknown> | null) ?? {},
      {
        age: (consultation.demographics as { age?: string } | null)?.age,
        ageUnit: (consultation.demographics as { ageUnit?: string } | null)?.ageUnit,
        dateOfBirth: (consultation.demographics as { dateOfBirth?: string } | null)
          ?.dateOfBirth,
        dateOfBirthUnavailable: (consultation.demographics as {
          dateOfBirthUnavailable?: boolean;
        } | null)?.dateOfBirthUnavailable,
      },
      asOf,
    );
    if (unresolved) {
      throw new BadRequestException(unresolved);
    }

    const faxNumber = normalizeFaxNumber(dto.faxNumber);
    if (faxNumber.replace(/\D/g, '').length < 10) {
      throw new BadRequestException('Enter a valid fax number');
    }

    let pdf: Buffer;
    try {
      pdf = decodePdfBase64(dto.pdfBase64);
    } catch {
      throw new BadRequestException('Invalid PDF — regenerate the document and try again');
    }
    if (pdf.byteLength > MAX_FAX_PDF_BYTES) {
      throw new BadRequestException('PDF is too large to fax (max 15MB)');
    }

    const documentName = (dto.documentName?.trim() || dto.documentTypeId).slice(0, 200);
    const recipientName = dto.recipientName.trim();
    const fileName = `${slugify(documentName)}.pdf`;

    const log = await this.prisma.faxLog.create({
      data: {
        tenantId: consultation.tenantId,
        consultationId: consultation.id,
        userId: user.id,
        documentTypeId: dto.documentTypeId,
        documentName,
        recipientName,
        faxNumber,
        status: FaxStatus.QUEUED,
        pdfBytes: pdf.byteLength,
      },
    });

    if (!this.ifax.isEnabled()) {
      await this.prisma.faxLog.update({
        where: { id: log.id },
        data: {
          status: FaxStatus.FAILED,
          errorMessage: 'SKIPPED:IFAX_DISABLED',
        },
      });
      await this.audit.log({
        userId: user.id,
        tenantId: user.tenantId ?? consultation.tenantId,
        action: 'FAX_SKIPPED',
        module: 'fax',
        ipAddress: req?.ip,
        userAgent: req?.headers['user-agent'],
        newValue: {
          faxLogId: log.id,
          consultationId,
          documentTypeId: dto.documentTypeId,
          faxNumber,
          reason: 'IFAX_DISABLED',
        },
      });
      throw new ServiceUnavailableException(
        'Fax sending is temporarily disabled. Try again later or contact support.',
      );
    }

    try {
      const result = await this.ifax.sendFax({
        faxNumber,
        attachment: { fileName, pdfBuffer: pdf },
      });

      const updated = await this.prisma.faxLog.update({
        where: { id: log.id },
        data: {
          status: FaxStatus.SENDING,
          ifaxJobId: result.jobId,
          errorMessage: null,
        },
      });

      await this.audit.log({
        userId: user.id,
        tenantId: user.tenantId ?? consultation.tenantId,
        action: 'FAX_SENT',
        module: 'fax',
        ipAddress: req?.ip,
        userAgent: req?.headers['user-agent'],
        newValue: {
          faxLogId: updated.id,
          consultationId,
          consultationRef: consultation.consultationRef,
          documentTypeId: dto.documentTypeId,
          documentName,
          recipientName,
          faxNumber,
          ifaxJobId: result.jobId,
        },
      });

      return {
        id: updated.id,
        status: updated.status,
        ifaxJobId: updated.ifaxJobId,
        recipientName: updated.recipientName,
        faxNumber: updated.faxNumber,
        documentTypeId: updated.documentTypeId,
        documentName: updated.documentName,
        createdAt: updated.createdAt,
      };
    } catch (err) {
      const message =
        err instanceof ServiceUnavailableException
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Fax send failed';

      await this.prisma.faxLog.update({
        where: { id: log.id },
        data: {
          status: FaxStatus.FAILED,
          errorMessage: message.slice(0, 500),
        },
      });

      await this.audit.log({
        userId: user.id,
        tenantId: user.tenantId ?? consultation.tenantId,
        action: 'FAX_FAILED',
        module: 'fax',
        ipAddress: req?.ip,
        userAgent: req?.headers['user-agent'],
        newValue: {
          faxLogId: log.id,
          consultationId,
          documentTypeId: dto.documentTypeId,
          faxNumber,
          error: message.slice(0, 300),
        },
      });

      throw err instanceof ServiceUnavailableException
        ? err
        : new ServiceUnavailableException(message);
    }
  }

  async handleIfaxWebhook(rawBody: Buffer | string, signatureHeader: string | undefined) {
    const secret = (this.config.get<string>('IFAX_WEBHOOK_SECRET') ?? '').trim();
    if (secret) {
      if (!signatureHeader) {
        throw new BadRequestException('Missing webhook signature');
      }
      const bodyBuf = typeof rawBody === 'string' ? Buffer.from(rawBody) : rawBody;
      const expected = createHmac('sha256', secret).update(bodyBuf).digest('hex');
      const provided = signatureHeader.replace(/^sha256=/i, '').trim();
      const a = Buffer.from(expected);
      const b = Buffer.from(provided);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        throw new BadRequestException('Invalid webhook signature');
      }
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(
        typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'),
      ) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Invalid webhook JSON');
    }

    const data = (payload.data ?? payload) as Record<string, unknown>;
    const jobId = data.jobId != null ? String(data.jobId) : '';
    if (!jobId) {
      this.logger.warn('iFax webhook without jobId — ignored');
      return { ok: true, updated: false };
    }

    const faxStatusRaw = String(data.faxStatus ?? data.status ?? '').toLowerCase();
    let status: FaxStatus | null = null;
    if (faxStatusRaw === 'delivered') status = FaxStatus.DELIVERED;
    else if (faxStatusRaw === 'failed') status = FaxStatus.FAILED;
    else if (faxStatusRaw === 'canceled' || faxStatusRaw === 'cancelled') {
      status = FaxStatus.CANCELED;
    } else if (faxStatusRaw === 'sending') status = FaxStatus.SENDING;

    if (!status) {
      return { ok: true, updated: false };
    }

    const existing = await this.prisma.faxLog.findFirst({
      where: { ifaxJobId: jobId },
    });
    if (!existing) {
      this.logger.warn(`iFax webhook for unknown jobId=${jobId}`);
      return { ok: true, updated: false };
    }

    await this.prisma.faxLog.update({
      where: { id: existing.id },
      data: {
        status,
        errorMessage:
          status === FaxStatus.FAILED
            ? String(data.message ?? data.code ?? 'Fax failed').slice(0, 500)
            : existing.errorMessage,
        deliveredAt: status === FaxStatus.DELIVERED ? new Date() : existing.deliveredAt,
      },
    });

    if (status === FaxStatus.DELIVERED && existing.documentTypeId === 'referral_letter') {
      const outcome = await this.prisma.consultationReferralOutcome.findUnique({
        where: { consultationId: existing.consultationId },
        select: { id: true, letterStatus: true },
      });
      if (outcome) {
        await this.prisma.consultationReferralOutcome.update({
          where: { id: outcome.id },
          data: {
            letterExternalSendConfirmed: true,
            ...(outcome.letterStatus === ReferralLetterRecordStatus.APPROVED ||
            outcome.letterStatus === ReferralLetterRecordStatus.FINALIZED
              ? { contactMethod: 'secure_fax' }
              : {}),
          },
        });
      }
    }

    return { ok: true, updated: true, id: existing.id, status };
  }

  private checkConsultationAccess(
    consultation: { tenantId: string | null; pharmacistId: string },
    user: RequestUser,
  ) {
    if (user.role === ROLES.SUPER_ADMIN) return;
    if (
      user.role === ROLES.PHARMACIST_ADMIN &&
      user.tenantId &&
      consultation.tenantId === user.tenantId
    ) {
      return;
    }
    if (consultation.pharmacistId === user.id) return;
    throw new ForbiddenException('You do not have access to this consultation');
  }
}

function slugify(input: string): string {
  const s = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return s || 'document';
}

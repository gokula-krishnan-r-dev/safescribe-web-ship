import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ObjectStorageService } from '@/modules/storage/object-storage.service';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import { ROLES } from '@safescript/shared';
import {
  BRANDING_MAX_BYTES,
  BRANDING_MIME,
  detectImageMime,
  extensionForMime,
  logoObjectKey,
  signatureObjectKey,
} from './branding.util';

@Injectable()
export class BrandingService {
  private readonly logger = new Logger(BrandingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly objectStorage: ObjectStorageService,
    private readonly audit: AuditService,
  ) {}

  async uploadSignature(
    user: RequestUser,
    file: Express.Multer.File | undefined,
    client?: { ipAddress?: string; userAgent?: string },
  ) {
    this.assertPharmacist(user);
    const mime = this.validateUpload(file);
    const ext = extensionForMime(mime);
    const objectKey = signatureObjectKey(user.tenantId, user.id, ext);

    const existing = await this.prisma.user.findFirst({
      where: { id: user.id, deletedAt: null },
      select: { signatureStorageKey: true, signatureStorageProvider: true },
    });
    if (!existing) throw new NotFoundException('User not found');

    const stored = await this.objectStorage.upload({
      buffer: file!.buffer,
      contentType: mime,
      objectKey,
    });

    if (
      existing.signatureStorageKey &&
      existing.signatureStorageKey !== stored.storageKey
    ) {
      await this.objectStorage.delete(
        existing.signatureStorageKey,
        existing.signatureStorageProvider === 'gcs' ? 'gcs' : 'local',
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        signatureStorageKey: stored.storageKey,
        signatureStorageProvider: stored.provider,
        signatureMimeType: mime,
      },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'UPDATE',
      module: 'BRANDING',
      newValue: { asset: 'signature', mimeType: mime },
      ipAddress: client?.ipAddress,
      userAgent: client?.userAgent,
    });

    return { hasSignature: true, mimeType: mime };
  }

  async deleteSignature(
    user: RequestUser,
    client?: { ipAddress?: string; userAgent?: string },
  ) {
    this.assertPharmacist(user);
    const existing = await this.prisma.user.findFirst({
      where: { id: user.id, deletedAt: null },
      select: { signatureStorageKey: true, signatureStorageProvider: true },
    });
    if (!existing) throw new NotFoundException('User not found');
    if (!existing.signatureStorageKey) {
      return { hasSignature: false };
    }

    await this.objectStorage.delete(
      existing.signatureStorageKey,
      existing.signatureStorageProvider === 'gcs' ? 'gcs' : 'local',
    );
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        signatureStorageKey: null,
        signatureStorageProvider: null,
        signatureMimeType: null,
      },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'DELETE',
      module: 'BRANDING',
      previousValue: { asset: 'signature' },
      ipAddress: client?.ipAddress,
      userAgent: client?.userAgent,
    });

    return { hasSignature: false };
  }

  async streamOwnSignature(user: RequestUser, res: Response) {
    this.assertPharmacist(user);
    const row = await this.prisma.user.findFirst({
      where: { id: user.id, deletedAt: null },
      select: {
        signatureStorageKey: true,
        signatureStorageProvider: true,
        signatureMimeType: true,
      },
    });
    if (!row?.signatureStorageKey) throw new NotFoundException('No signature uploaded');
    return this.pipeFile(
      res,
      row.signatureStorageKey,
      row.signatureMimeType || 'image/png',
      row.signatureStorageProvider,
      'signature',
    );
  }

  async uploadTenantLogo(
    tenantId: string,
    user: RequestUser,
    file: Express.Multer.File | undefined,
    client?: { ipAddress?: string; userAgent?: string },
  ) {
    this.assertSuperAdmin(user);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, logoStorageKey: true, logoStorageProvider: true },
    });
    if (!tenant) throw new NotFoundException('Pharmacy not found');

    const mime = this.validateUpload(file);
    const ext = extensionForMime(mime);
    const objectKey = logoObjectKey(tenantId, ext);
    const stored = await this.objectStorage.upload({
      buffer: file!.buffer,
      contentType: mime,
      objectKey,
    });

    if (tenant.logoStorageKey && tenant.logoStorageKey !== stored.storageKey) {
      await this.objectStorage.delete(
        tenant.logoStorageKey,
        tenant.logoStorageProvider === 'gcs' ? 'gcs' : 'local',
      );
    }

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        logoStorageKey: stored.storageKey,
        logoStorageProvider: stored.provider,
        logoMimeType: mime,
      },
    });

    await this.audit.log({
      userId: user.id,
      tenantId,
      action: 'UPDATE',
      module: 'BRANDING',
      newValue: { asset: 'pharmacy_logo', mimeType: mime },
      ipAddress: client?.ipAddress,
      userAgent: client?.userAgent,
    });

    return { hasLogo: true, mimeType: mime };
  }

  async deleteTenantLogo(
    tenantId: string,
    user: RequestUser,
    client?: { ipAddress?: string; userAgent?: string },
  ) {
    this.assertSuperAdmin(user);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, logoStorageKey: true, logoStorageProvider: true },
    });
    if (!tenant) throw new NotFoundException('Pharmacy not found');
    if (!tenant.logoStorageKey) return { hasLogo: false };

    await this.objectStorage.delete(
      tenant.logoStorageKey,
      tenant.logoStorageProvider === 'gcs' ? 'gcs' : 'local',
    );
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        logoStorageKey: null,
        logoStorageProvider: null,
        logoMimeType: null,
      },
    });

    await this.audit.log({
      userId: user.id,
      tenantId,
      action: 'DELETE',
      module: 'BRANDING',
      previousValue: { asset: 'pharmacy_logo' },
      ipAddress: client?.ipAddress,
      userAgent: client?.userAgent,
    });

    return { hasLogo: false };
  }

  async streamTenantLogo(tenantId: string, user: RequestUser, res: Response) {
    this.assertCanReadTenantLogo(tenantId, user);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        logoStorageKey: true,
        logoStorageProvider: true,
        logoMimeType: true,
      },
    });
    if (!tenant?.logoStorageKey) throw new NotFoundException('No pharmacy logo uploaded');
    return this.pipeFile(
      res,
      tenant.logoStorageKey,
      tenant.logoMimeType || 'image/png',
      tenant.logoStorageProvider,
      'pharmacy-logo',
    );
  }

  async streamConsultationSignature(consultationId: string, user: RequestUser, res: Response) {
    const consultation = await this.loadConsultationForBranding(consultationId, user);
    const key = consultation.pharmacist.signatureStorageKey;
    if (!key) throw new NotFoundException('No signature uploaded');
    return this.pipeFile(
      res,
      key,
      consultation.pharmacist.signatureMimeType || 'image/png',
      consultation.pharmacist.signatureStorageProvider,
      'signature',
    );
  }

  async streamConsultationLogo(consultationId: string, user: RequestUser, res: Response) {
    const consultation = await this.loadConsultationForBranding(consultationId, user);
    const tenant = consultation.tenant;
    if (!tenant?.logoStorageKey) throw new NotFoundException('No pharmacy logo uploaded');
    return this.pipeFile(
      res,
      tenant.logoStorageKey,
      tenant.logoMimeType || 'image/png',
      tenant.logoStorageProvider,
      'pharmacy-logo',
    );
  }

  private async loadConsultationForBranding(consultationId: string, user: RequestUser) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      select: {
        tenantId: true,
        pharmacistId: true,
        pharmacist: {
          select: {
            signatureStorageKey: true,
            signatureStorageProvider: true,
            signatureMimeType: true,
          },
        },
        tenant: {
          select: {
            logoStorageKey: true,
            logoStorageProvider: true,
            logoMimeType: true,
          },
        },
      },
    });
    if (!consultation) throw new NotFoundException('Consultation not found');
    this.checkConsultationAccess(consultation, user);
    return consultation;
  }

  private checkConsultationAccess(
    consultation: { tenantId: string | null; pharmacistId: string },
    user: RequestUser,
  ) {
    if (user.role === ROLES.SUPER_ADMIN) return;
    if (user.role === ROLES.PHARMACIST_ADMIN && user.tenantId && consultation.tenantId === user.tenantId) {
      return;
    }
    if (consultation.pharmacistId === user.id) return;
    throw new ForbiddenException('You do not have access to this consultation');
  }

  private assertPharmacist(user: RequestUser) {
    if (user.role !== ROLES.PHARMACIST && user.role !== ROLES.PHARMACIST_ADMIN) {
      throw new ForbiddenException('Only pharmacy users can manage a signature');
    }
  }

  private assertSuperAdmin(user: RequestUser) {
    if (user.role !== ROLES.SUPER_ADMIN) {
      throw new ForbiddenException('Only a Super Admin can manage a pharmacy logo');
    }
  }

  private assertCanReadTenantLogo(tenantId: string, user: RequestUser) {
    if (user.role === ROLES.SUPER_ADMIN) return;
    if (user.tenantId === tenantId) return;
    throw new ForbiddenException('You do not have access to this pharmacy logo');
  }

  private validateUpload(file: Express.Multer.File | undefined): string {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Please choose a PNG or JPEG image');
    }
    if (file.size > BRANDING_MAX_BYTES || file.buffer.length > BRANDING_MAX_BYTES) {
      throw new BadRequestException('Please use an image smaller than 2 MB');
    }
    const declared = (file.mimetype || '').toLowerCase();
    if (!BRANDING_MIME.has(declared)) {
      throw new BadRequestException('Use a PNG or JPEG image');
    }
    const detected = detectImageMime(file.buffer);
    if (!detected) {
      throw new BadRequestException('That file does not look like a PNG or JPEG image');
    }
    return detected;
  }

  private async pipeFile(
    res: Response,
    storageKey: string,
    mimeType: string,
    provider: string | null | undefined,
    downloadName: string,
  ) {
    try {
      const { stream, contentType, contentLength } = await this.objectStorage.open(
        storageKey,
        mimeType,
        provider === 'gcs' ? 'gcs' : provider === 'local' ? 'local' : undefined,
      );
      res.setHeader('Content-Type', contentType || mimeType || 'application/octet-stream');
      res.setHeader('Cache-Control', 'private, max-age=60, no-transform');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${downloadName}${mimeType.includes('png') ? '.png' : '.jpg'}"`,
      );
      if (contentLength != null) res.setHeader('Content-Length', String(contentLength));
      stream.on('error', (err) => {
        this.logger.error(`Branding stream error for ${storageKey}: ${err.message}`);
        if (!res.headersSent) res.status(404).end();
        else res.end();
      });
      stream.pipe(res);
    } catch (err) {
      this.logger.warn(`Could not open branding file ${storageKey}: ${(err as Error).message}`);
      throw new NotFoundException('Image file not found');
    }
  }
}

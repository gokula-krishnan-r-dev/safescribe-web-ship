import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/redis/redis.service';
import { AuditService } from '@/modules/audit/audit.service';
import { RequestUser } from '@/common/decorators/auth.decorator';
import { ROLES } from '@safescript/shared';
import { getClientInfo } from '@/common/utils/client-info';
import { normalizeFaxNumber } from './fax.util';
import {
  CreatePharmacyFaxContactDto,
  UpdatePharmacyFaxContactDto,
} from './dto/fax-contacts.dto';

export type PharmacyFaxContactDto = {
  id: string;
  name: string;
  faxNumber: string;
  notes: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class FaxContactsService {
  private readonly cacheTtlSeconds = 120;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  private cacheKey(tenantId: string) {
    return `fax-contacts:${tenantId}:active`;
  }

  private requireTenant(user: RequestUser): string {
    if (!user.tenantId) {
      throw new ForbiddenException('Pharmacy context is required');
    }
    return user.tenantId;
  }

  private assertPharmacyAdmin(user: RequestUser) {
    if (user.role !== ROLES.PHARMACIST_ADMIN || !user.tenantId) {
      throw new ForbiddenException('Only pharmacy admins can manage fax contacts');
    }
  }

  private assertCanRead(user: RequestUser) {
    if (
      user.role !== ROLES.PHARMACIST_ADMIN &&
      user.role !== ROLES.PHARMACIST
    ) {
      throw new ForbiddenException('Not allowed to view fax contacts');
    }
    this.requireTenant(user);
  }

  private toDto(row: {
    id: string;
    name: string;
    faxNumber: string;
    notes: string | null;
    isActive: boolean;
    displayOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }): PharmacyFaxContactDto {
    return {
      id: row.id,
      name: row.name,
      faxNumber: row.faxNumber,
      notes: row.notes,
      isActive: row.isActive,
      displayOrder: row.displayOrder,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private validateAndNormalize(nameRaw: string, faxRaw: string) {
    const name = nameRaw.trim().replace(/\s+/g, ' ');
    if (name.length < 2) {
      throw new BadRequestException('Enter a recipient name (at least 2 characters)');
    }
    const digits = faxRaw.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) {
      throw new BadRequestException('Enter a valid fax number (10–15 digits)');
    }
    const faxNumber = normalizeFaxNumber(faxRaw);
    if (!faxNumber || faxNumber.replace(/\D/g, '').length < 10) {
      throw new BadRequestException('Enter a valid fax number');
    }
    return { name, faxNumber };
  }

  private async invalidateCache(tenantId: string) {
    await this.redis.del(this.cacheKey(tenantId));
  }

  /** Active contacts for Send Fax autofill (cached). */
  async listActiveForTenant(user: RequestUser): Promise<PharmacyFaxContactDto[]> {
    this.assertCanRead(user);
    const tenantId = user.tenantId!;

    const cached = await this.redis.get(this.cacheKey(tenantId));
    if (cached) {
      try {
        return JSON.parse(cached) as PharmacyFaxContactDto[];
      } catch {
        // fall through to DB
      }
    }

    const rows = await this.prisma.pharmacyFaxContact.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
    const items = rows.map((r) => this.toDto(r));
    await this.redis.set(
      this.cacheKey(tenantId),
      JSON.stringify(items),
      this.cacheTtlSeconds,
    );
    return items;
  }

  /** Full directory for pharmacy admin (includes inactive). */
  async listAll(user: RequestUser): Promise<PharmacyFaxContactDto[]> {
    this.assertPharmacyAdmin(user);
    const tenantId = user.tenantId!;
    const rows = await this.prisma.pharmacyFaxContact.findMany({
      where: { tenantId },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((r) => this.toDto(r));
  }

  async create(
    dto: CreatePharmacyFaxContactDto,
    user: RequestUser,
    req: Request,
  ): Promise<PharmacyFaxContactDto> {
    this.assertPharmacyAdmin(user);
    const tenantId = user.tenantId!;
    const { ipAddress, userAgent } = getClientInfo(req);
    const { name, faxNumber } = this.validateAndNormalize(dto.name, dto.faxNumber);

    const duplicate = await this.prisma.pharmacyFaxContact.findFirst({
      where: {
        tenantId,
        name: { equals: name, mode: 'insensitive' },
        faxNumber,
      },
    });
    if (duplicate) {
      throw new BadRequestException(
        'This name and fax number are already saved for your pharmacy',
      );
    }

    const maxOrder = await this.prisma.pharmacyFaxContact.aggregate({
      where: { tenantId },
      _max: { displayOrder: true },
    });

    const created = await this.prisma.pharmacyFaxContact.create({
      data: {
        tenantId,
        name,
        faxNumber,
        notes: dto.notes?.trim() || null,
        isActive: dto.isActive ?? true,
        displayOrder: dto.displayOrder ?? (maxOrder._max.displayOrder ?? -1) + 1,
      },
    });

    await this.invalidateCache(tenantId);
    await this.audit.log({
      userId: user.id,
      tenantId,
      action: 'FAX_CONTACT_CREATE',
      module: 'FAX',
      ipAddress: ipAddress ?? undefined,
      userAgent,
      newValue: created as unknown as Record<string, unknown>,
    });

    return this.toDto(created);
  }

  async update(
    id: string,
    dto: UpdatePharmacyFaxContactDto,
    user: RequestUser,
    req: Request,
  ): Promise<PharmacyFaxContactDto> {
    this.assertPharmacyAdmin(user);
    const tenantId = user.tenantId!;
    const { ipAddress, userAgent } = getClientInfo(req);

    const existing = await this.prisma.pharmacyFaxContact.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Fax contact not found');

    const nextName = dto.name !== undefined ? dto.name : existing.name;
    const nextFax = dto.faxNumber !== undefined ? dto.faxNumber : existing.faxNumber;
    const { name, faxNumber } = this.validateAndNormalize(nextName, nextFax);

    const duplicate = await this.prisma.pharmacyFaxContact.findFirst({
      where: {
        tenantId,
        id: { not: id },
        name: { equals: name, mode: 'insensitive' },
        faxNumber,
      },
    });
    if (duplicate) {
      throw new BadRequestException(
        'This name and fax number are already saved for your pharmacy',
      );
    }

    const updated = await this.prisma.pharmacyFaxContact.update({
      where: { id },
      data: {
        name,
        faxNumber,
        ...(dto.notes !== undefined && {
          notes: dto.notes === null ? null : dto.notes.trim() || null,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.displayOrder !== undefined && { displayOrder: dto.displayOrder }),
      },
    });

    await this.invalidateCache(tenantId);
    await this.audit.log({
      userId: user.id,
      tenantId,
      action: 'FAX_CONTACT_UPDATE',
      module: 'FAX',
      ipAddress: ipAddress ?? undefined,
      userAgent,
      previousValue: existing as unknown as Record<string, unknown>,
      newValue: updated as unknown as Record<string, unknown>,
    });

    return this.toDto(updated);
  }

  async remove(id: string, user: RequestUser, req: Request) {
    this.assertPharmacyAdmin(user);
    const tenantId = user.tenantId!;
    const { ipAddress, userAgent } = getClientInfo(req);

    const existing = await this.prisma.pharmacyFaxContact.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Fax contact not found');

    await this.prisma.pharmacyFaxContact.delete({ where: { id } });
    await this.invalidateCache(tenantId);

    await this.audit.log({
      userId: user.id,
      tenantId,
      action: 'FAX_CONTACT_DELETE',
      module: 'FAX',
      ipAddress: ipAddress ?? undefined,
      userAgent,
      previousValue: existing as unknown as Record<string, unknown>,
    });

    return { message: 'Fax contact removed' };
  }
}

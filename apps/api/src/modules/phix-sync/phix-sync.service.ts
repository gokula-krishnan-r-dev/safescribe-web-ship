import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantStatus, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { Request } from 'express';
import {
  DEFAULT_PRESCRIBE_DAILY_INCLUDED,
  ROLES,
  SAFESCRIBE_MODULES,
} from '@safescript/shared';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/redis/redis.service';
import { AuditService } from '@/modules/audit/audit.service';
import { looksLikePasswordHash } from '@/modules/auth/password-hash.util';
import { PhixSyncEventDto, PhixUserPayloadDto } from './dto/phix-sync.dto';
import {
  bearerToken,
  PHIX_SYNC_NONCE_TTL_SECONDS,
  secretsEqual,
  verifyPhixHmac,
} from './phix-hmac';
import { mapPhixRolesToSafescribe, slugifyPharmacyName, splitDisplayName } from './phix-mapping';

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

@Injectable()
export class PhixSyncService {
  private readonly logger = new Logger(PhixSyncService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private config: ConfigService,
    private audit: AuditService,
  ) {}

  async handleEvent(dto: PhixSyncEventDto, req: Request) {
    this.assertConfigured();
    await this.authenticate(req);

    const idempotencyKey = dto.idempotencyKey?.trim();
    if (idempotencyKey) {
      const cached = await this.redis.get(`phix-sync:idem:${idempotencyKey}`);
      if (cached) {
        return JSON.parse(cached) as { ok: true; duplicate: true; event: string };
      }
    }

    const result = await this.dispatch(dto);

    await this.audit.log({
      action: `PHIX_SYNC_${dto.event.replace('.', '_').toUpperCase()}`,
      module: 'phix_sync',
      metadata: {
        event: dto.event,
        phixPharmacyId: dto.pharmacy?.phixPharmacyId ?? dto.user?.phixPharmacyId ?? null,
        phixUserId: dto.user?.phixUserId ?? null,
        userCount: dto.users?.length ?? (dto.user ? 1 : 0),
      },
    });

    const body = { ok: true as const, event: dto.event, ...result };
    if (idempotencyKey) {
      await this.redis.set(
        `phix-sync:idem:${idempotencyKey}`,
        JSON.stringify({ ok: true, duplicate: true, event: dto.event }),
        IDEMPOTENCY_TTL_SECONDS,
      );
    }
    return body;
  }

  private assertConfigured() {
    const key = this.config.get<string>('PHIX_SYNC_API_KEY') ?? '';
    const secret = this.config.get<string>('PHIX_SYNC_HMAC_SECRET') ?? '';
    if (!key.trim() || !secret.trim() || key.length < 24 || secret.length < 32) {
      throw new ServiceUnavailableException('Phix sync is not configured');
    }
  }

  private async authenticate(req: Request) {
    const apiKey = this.config.get<string>('PHIX_SYNC_API_KEY') ?? '';
    const hmacSecret = this.config.get<string>('PHIX_SYNC_HMAC_SECRET') ?? '';
    const presented = bearerToken(req.headers.authorization);
    if (!presented || !secretsEqual(presented, apiKey)) {
      throw new UnauthorizedException('Invalid integration credentials');
    }

    const timestamp = header(req, 'x-phix-timestamp');
    const nonce = header(req, 'x-phix-nonce');
    const signature = header(req, 'x-phix-signature');
    const rawBody = rawBodyUtf8(req);

    const verified = verifyPhixHmac({
      secret: hmacSecret,
      signature,
      timestamp,
      nonce,
      rawBody,
    });
    if (!verified.ok) {
      throw new UnauthorizedException(
        verified.reason === 'skew' ? 'Request timestamp is too old' : 'Invalid request signature',
      );
    }

    const claimed = await this.redis.setNx(
      `phix-sync:nonce:${nonce}`,
      '1',
      PHIX_SYNC_NONCE_TTL_SECONDS,
    );
    if (!claimed) {
      throw new UnauthorizedException('Replay detected');
    }
  }

  private async dispatch(dto: PhixSyncEventDto) {
    switch (dto.event) {
      case 'pharmacy.upsert':
        return this.upsertPharmacy(requirePharmacy(dto), { activateIfVerified: false });
      case 'pharmacy.verified': {
        const pharmacy = await this.upsertPharmacy(requirePharmacy(dto), {
          activateIfVerified: true,
        });
        const users = dto.users?.length ? dto.users : dto.user ? [dto.user] : [];
        for (const user of users) {
          await this.upsertUser(user, { requirePassword: false });
        }
        return pharmacy;
      }
      case 'pharmacy.suspended':
        return this.setPharmacyStatus(requirePharmacyId(dto), TenantStatus.SUSPENDED);
      case 'pharmacy.resumed':
        return this.setPharmacyStatus(requirePharmacyId(dto), TenantStatus.ACTIVE);
      case 'pharmacy.deleted':
        return this.deletePharmacy(requirePharmacyId(dto));
      case 'user.upsert':
        return this.upsertUser(requireUser(dto), { requirePassword: false });
      case 'user.suspended':
        return this.setUserStatus(requireUser(dto), UserStatus.SUSPENDED);
      case 'user.resumed':
        return this.setUserStatus(requireUser(dto), UserStatus.ACTIVE);
      case 'user.removed':
        return this.removeUserFromPharmacy(requireUser(dto));
      case 'user.deleted':
        return this.deletePhixUser(requireUser(dto).phixUserId);
      case 'user.password':
        return this.updatePassword(requireUser(dto), dto.passwordHash ?? dto.user?.passwordHash);
      default:
        throw new BadRequestException('Unsupported event');
    }
  }

  private async upsertPharmacy(
    pharmacy: NonNullable<PhixSyncEventDto['pharmacy']>,
    opts: { activateIfVerified: boolean },
  ) {
    const verified = pharmacy.verified === true || opts.activateIfVerified;
    const suspended = pharmacy.suspended === true;
    const status = !verified || suspended ? TenantStatus.SUSPENDED : TenantStatus.ACTIVE;

    const existing = await this.prisma.tenant.findUnique({
      where: { phixPharmacyId: pharmacy.phixPharmacyId },
    });

    const data = {
      name: pharmacy.name.trim(),
      pharmacyLicenseNumber: pharmacy.licenseNumber?.trim() || null,
      phone: pharmacy.phone?.trim() || null,
      faxNumber: pharmacy.fax?.trim() || null,
      phixCustomer: true,
      status,
    };

    const tenant = existing
      ? await this.prisma.tenant.update({ where: { id: existing.id }, data })
      : await this.prisma.tenant.create({
          data: {
            ...data,
            phixPharmacyId: pharmacy.phixPharmacyId,
            slug: slugifyPharmacyName(pharmacy.name, pharmacy.phixPharmacyId),
          },
        });

    await this.ensurePrescribeEntitlement(tenant.id);
    return { tenantId: tenant.id, status: tenant.status };
  }

  private async ensurePrescribeEntitlement(tenantId: string) {
    await this.prisma.safeScribeEntitlement.upsert({
      where: { tenantId_module: { tenantId, module: SAFESCRIBE_MODULES.PRESCRIBE } },
      update: {},
      create: {
        tenantId,
        module: SAFESCRIBE_MODULES.PRESCRIBE,
        includedQuantity: DEFAULT_PRESCRIBE_DAILY_INCLUDED,
        period: 'daily',
        active: true,
      },
    });
  }

  private async setPharmacyStatus(phixPharmacyId: string, status: TenantStatus) {
    const tenant = await this.requireTenant(phixPharmacyId);
    await this.prisma.tenant.update({ where: { id: tenant.id }, data: { status } });
    if (status === TenantStatus.SUSPENDED) {
      await this.revokeTenantSessions(tenant.id);
    }
    return { tenantId: tenant.id, status };
  }

  private async deletePharmacy(phixPharmacyId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { phixPharmacyId },
    });
    if (!tenant) return { tenantId: null, deleted: false };

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.tenant.update({
        where: { id: tenant.id },
        data: { status: TenantStatus.SUSPENDED },
      }),
      this.prisma.user.updateMany({
        where: { tenantId: tenant.id, deletedAt: null },
        data: { status: UserStatus.SUSPENDED, deletedAt: now },
      }),
    ]);
    await this.revokeTenantSessions(tenant.id);
    return { tenantId: tenant.id, deleted: true };
  }

  private async upsertUser(payload: PhixUserPayloadDto, opts: { requirePassword: boolean }) {
    const tenant = await this.requireTenant(payload.phixPharmacyId);
    const email = payload.email.trim().toLowerCase();
    const { firstName, lastName } = splitDisplayName(payload.displayName);
    const roleName = mapPhixRolesToSafescribe(payload.roles);
    const role = await this.prisma.role.findUnique({ where: { name: roleName } });
    if (!role) throw new BadRequestException('Role is not configured');

    const passwordHash = await this.resolvePasswordHash(payload.passwordHash, opts.requirePassword);
    const active = payload.isActive !== false && Boolean(payload.passwordHash);
    const status = active ? UserStatus.ACTIVE : UserStatus.PENDING;

    const existing = await this.prisma.user.findFirst({
      where: { tenantId: tenant.id, phixUserId: payload.phixUserId },
    });

    if (existing) {
      const data: {
        email: string;
        firstName: string;
        lastName: string;
        roleId: string;
        status: UserStatus;
        passwordHash?: string;
        deletedAt: null;
        emailVerifiedAt: Date;
      } = {
        email,
        firstName,
        lastName,
        roleId: role.id,
        status: payload.isActive === false ? UserStatus.SUSPENDED : existing.deletedAt ? UserStatus.PENDING : status,
        deletedAt: null,
        emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
      };
      if (payload.passwordHash) {
        data.passwordHash = passwordHash;
        data.status = payload.isActive === false ? UserStatus.SUSPENDED : UserStatus.ACTIVE;
      }
      const user = await this.prisma.user.update({ where: { id: existing.id }, data });
      return { userId: user.id, tenantId: tenant.id, status: user.status };
    }

    const conflict = await this.prisma.user.findFirst({
      where: { email, tenantId: tenant.id, deletedAt: null },
    });
    if (conflict) {
      const user = await this.prisma.user.update({
        where: { id: conflict.id },
        data: {
          phixUserId: payload.phixUserId,
          firstName,
          lastName,
          roleId: role.id,
          status,
          ...(payload.passwordHash ? { passwordHash } : {}),
          emailVerifiedAt: conflict.emailVerifiedAt ?? new Date(),
        },
      });
      return { userId: user.id, tenantId: tenant.id, status: user.status };
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        tenantId: tenant.id,
        roleId: role.id,
        status,
        phixUserId: payload.phixUserId,
        emailVerifiedAt: new Date(),
      },
    });
    return { userId: user.id, tenantId: tenant.id, status: user.status };
  }

  private async setUserStatus(payload: PhixUserPayloadDto, status: UserStatus) {
    const tenant = await this.requireTenant(payload.phixPharmacyId);
    const user = await this.prisma.user.findFirst({
      where: { tenantId: tenant.id, phixUserId: payload.phixUserId, deletedAt: null },
    });
    if (!user) return { userId: null, status };
    await this.prisma.user.update({ where: { id: user.id }, data: { status } });
    if (status !== UserStatus.ACTIVE) {
      await this.revokeUserSessions(user.id);
    }
    return { userId: user.id, tenantId: tenant.id, status };
  }

  private async removeUserFromPharmacy(payload: PhixUserPayloadDto) {
    const tenant = await this.requireTenant(payload.phixPharmacyId);
    const user = await this.prisma.user.findFirst({
      where: { tenantId: tenant.id, phixUserId: payload.phixUserId, deletedAt: null },
    });
    if (!user) return { userId: null, removed: false };
    await this.prisma.user.update({
      where: { id: user.id },
      data: { status: UserStatus.SUSPENDED, deletedAt: new Date() },
    });
    await this.revokeUserSessions(user.id);
    return { userId: user.id, tenantId: tenant.id, removed: true };
  }

  private async deletePhixUser(phixUserId: string) {
    const users = await this.prisma.user.findMany({
      where: { phixUserId, deletedAt: null },
      select: { id: true },
    });
    const now = new Date();
    await this.prisma.user.updateMany({
      where: { phixUserId, deletedAt: null },
      data: { status: UserStatus.SUSPENDED, deletedAt: now },
    });
    await Promise.all(users.map((user) => this.revokeUserSessions(user.id)));
    return { deleted: users.length };
  }

  private async updatePassword(payload: PhixUserPayloadDto, passwordHash: string | null | undefined) {
    if (!passwordHash || !looksLikePasswordHash(passwordHash)) {
      throw new BadRequestException('A valid password hash is required');
    }
    const scopedPharmacyId =
      payload.phixPharmacyId && payload.phixPharmacyId !== 'all'
        ? payload.phixPharmacyId
        : null;
    const users = scopedPharmacyId
      ? await this.prisma.user.findMany({
          where: {
            phixUserId: payload.phixUserId,
            tenant: { phixPharmacyId: scopedPharmacyId },
            deletedAt: null,
          },
        })
      : await this.prisma.user.findMany({
          where: { phixUserId: payload.phixUserId, deletedAt: null },
        });

    if (!users.length) return { updated: 0 };
    await this.prisma.user.updateMany({
      where: { id: { in: users.map((user) => user.id) } },
      data: { passwordHash },
    });
    await Promise.all(users.map((user) => this.revokeUserSessions(user.id)));
    return { updated: users.length };
  }

  private async resolvePasswordHash(
    incoming: string | null | undefined,
    requirePassword: boolean,
  ): Promise<string> {
    if (incoming) {
      if (!looksLikePasswordHash(incoming)) {
        throw new BadRequestException('Password hash format is not recognized');
      }
      return incoming;
    }
    if (requirePassword) {
      throw new BadRequestException('Password hash is required');
    }
    return argon2.hash(randomBytes(32).toString('hex'));
  }

  private async requireTenant(phixPharmacyId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { phixPharmacyId } });
    if (!tenant) {
      throw new BadRequestException('Pharmacy has not been synced yet');
    }
    return tenant;
  }

  private async revokeUserSessions(userId: string) {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }

  private async revokeTenantSessions(tenantId: string) {
    const users = await this.prisma.user.findMany({
      where: { tenantId },
      select: { id: true },
    });
    await Promise.all(users.map((user) => this.revokeUserSessions(user.id)));
  }
}

function header(req: Request, name: string): string {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0] ?? '';
  return typeof value === 'string' ? value : '';
}

function rawBodyUtf8(req: Request): string {
  const raw = (req as Request & { rawBody?: Buffer | string }).rawBody;
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (typeof raw === 'string') return raw;
  return JSON.stringify(req.body ?? {});
}

function requirePharmacy(dto: PhixSyncEventDto) {
  if (!dto.pharmacy?.phixPharmacyId || !dto.pharmacy.name) {
    throw new BadRequestException('pharmacy payload is required');
  }
  return dto.pharmacy;
}

function requirePharmacyId(dto: PhixSyncEventDto) {
  const id = dto.pharmacy?.phixPharmacyId ?? dto.user?.phixPharmacyId;
  if (!id) throw new BadRequestException('phixPharmacyId is required');
  return id;
}

function requireUser(dto: PhixSyncEventDto) {
  if (!dto.user?.phixUserId) {
    throw new BadRequestException('user payload is required');
  }
  return dto.user;
}

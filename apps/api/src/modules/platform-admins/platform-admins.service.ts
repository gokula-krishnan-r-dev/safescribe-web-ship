import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, SuperAdminScope, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { Request } from 'express';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { getClientInfo } from '@/common/utils/client-info';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import { canManagePlatformAdmins, resolveSuperAdminScope, ROLES } from '@safescript/shared';
import {
  CreatePlatformAdminDto,
  ListPlatformAdminsQueryDto,
  UpdatePlatformAdminDto,
} from './dto/platform-admin.dto';

const LAST_FULL_ADMIN_MESSAGE =
  'At least one active full-access platform administrator must remain.';

@Injectable()
export class PlatformAdminsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private getClientInfo(req: Request) {
    return getClientInfo(req);
  }

  assertCanManage(currentUser: RequestUser) {
    const scope = resolveSuperAdminScope(currentUser.role, currentUser.superAdminScope);
    if (currentUser.role !== ROLES.SUPER_ADMIN || !canManagePlatformAdmins(scope)) {
      throw new ForbiddenException(
        'Only full-access platform administrators can manage platform admin accounts.',
      );
    }
  }

  private sanitize(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    status: UserStatus;
    superAdminScope: SuperAdminScope | null;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`,
      status: user.status,
      superAdminScope: resolveSuperAdminScope(ROLES.SUPER_ADMIN, user.superAdminScope),
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private async superAdminRoleId() {
    const role = await this.prisma.role.findUnique({ where: { name: ROLES.SUPER_ADMIN } });
    if (!role) throw new BadRequestException('Super Admin role is not configured');
    return role.id;
  }

  private platformAdminWhere(extra: Prisma.UserWhereInput = {}): Prisma.UserWhereInput {
    return {
      deletedAt: null,
      tenantId: null,
      role: { name: ROLES.SUPER_ADMIN },
      ...extra,
    };
  }

  async list(query: ListPlatformAdminsQueryDto, currentUser: RequestUser) {
    this.assertCanManage(currentUser);

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const roleId = await this.superAdminRoleId();

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      tenantId: null,
      roleId,
      ...(query.status && { status: query.status }),
      ...(query.scope && { superAdminScope: query.scope }),
      ...(query.search && {
        OR: [
          { email: { contains: query.search, mode: 'insensitive' } },
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const sortBy = query.sortBy ?? 'createdAt';
    const allowedSort = new Set(['createdAt', 'email', 'firstName', 'lastName', 'lastLoginAt', 'status']);
    const orderBy: Prisma.UserOrderByWithRelationInput = {
      [allowedSort.has(sortBy) ? sortBy : 'createdAt']: query.sortOrder ?? 'desc',
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map((u) => this.sanitize(u)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getById(id: string, currentUser: RequestUser) {
    this.assertCanManage(currentUser);
    const user = await this.prisma.user.findFirst({
      where: this.platformAdminWhere({ id }),
    });
    if (!user) throw new NotFoundException('Platform administrator not found');
    return this.sanitize(user);
  }

  async create(dto: CreatePlatformAdminDto, currentUser: RequestUser, req: Request) {
    this.assertCanManage(currentUser);
    const { ipAddress, userAgent } = this.getClientInfo(req);
    const email = this.normalizeEmail(dto.email);
    const roleId = await this.superAdminRoleId();

    const existing = await this.prisma.user.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        tenantId: null,
        deletedAt: null,
      },
    });
    if (existing) throw new ConflictException('This email is already in use');

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash: await argon2.hash(dto.password),
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        tenantId: null,
        roleId,
        superAdminScope: dto.superAdminScope,
        status: dto.status ?? UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });

    await this.audit.log({
      userId: currentUser.id,
      tenantId: null,
      action: 'PLATFORM_ADMIN_CREATE',
      module: 'platform-admins',
      ipAddress,
      userAgent,
      newValue: this.sanitize(user) as unknown as Record<string, unknown>,
    });

    return this.sanitize(user);
  }

  async update(id: string, dto: UpdatePlatformAdminDto, currentUser: RequestUser, req: Request) {
    this.assertCanManage(currentUser);
    const { ipAddress, userAgent } = this.getClientInfo(req);
    const user = await this.prisma.user.findFirst({
      where: this.platformAdminWhere({ id }),
    });
    if (!user) throw new NotFoundException('Platform administrator not found');

    const previous = this.sanitize(user);
    const nextScope = dto.superAdminScope ?? user.superAdminScope ?? SuperAdminScope.FULL;
    const nextStatus = dto.status ?? user.status;

    await this.assertNotRemovingLastFullAdmin(id, nextScope, nextStatus);

    let email = user.email;
    if (dto.email && this.normalizeEmail(dto.email) !== user.email.toLowerCase()) {
      email = this.normalizeEmail(dto.email);
      const clash = await this.prisma.user.findFirst({
        where: {
          email: { equals: email, mode: 'insensitive' },
          tenantId: null,
          deletedAt: null,
          NOT: { id },
        },
      });
      if (clash) throw new ConflictException('This email is already in use');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        email,
        firstName: dto.firstName?.trim() ?? user.firstName,
        lastName: dto.lastName?.trim() ?? user.lastName,
        superAdminScope: nextScope,
        status: nextStatus,
      },
    });

    const scopeOrStatusChanged =
      previous.superAdminScope !== nextScope || previous.status !== nextStatus;
    if (scopeOrStatusChanged) {
      await this.revokeSessions(id);
    }

    await this.audit.log({
      userId: currentUser.id,
      tenantId: null,
      action: 'PLATFORM_ADMIN_UPDATE',
      module: 'platform-admins',
      ipAddress,
      userAgent,
      metadata: { targetUserId: id },
      previousValue: previous as unknown as Record<string, unknown>,
      newValue: this.sanitize(updated) as unknown as Record<string, unknown>,
    });

    return this.sanitize(updated);
  }

  async delete(id: string, currentUser: RequestUser, req: Request) {
    this.assertCanManage(currentUser);
    if (id === currentUser.id) {
      throw new ForbiddenException('You cannot delete your own platform administrator account');
    }

    const { ipAddress, userAgent } = this.getClientInfo(req);
    const user = await this.prisma.user.findFirst({
      where: this.platformAdminWhere({ id }),
    });
    if (!user) throw new NotFoundException('Platform administrator not found');

    await this.assertNotRemovingLastFullAdmin(id, SuperAdminScope.PHARMACY, UserStatus.SUSPENDED);

    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: UserStatus.SUSPENDED },
    });
    await this.revokeSessions(id);

    await this.audit.log({
      userId: currentUser.id,
      tenantId: null,
      action: 'PLATFORM_ADMIN_DELETE',
      module: 'platform-admins',
      ipAddress,
      userAgent,
      metadata: { targetUserId: id },
      previousValue: this.sanitize(user) as unknown as Record<string, unknown>,
    });

    return { message: 'Platform administrator removed' };
  }

  async resetPassword(
    id: string,
    password: string,
    currentUser: RequestUser,
    req: Request,
  ) {
    this.assertCanManage(currentUser);
    const { ipAddress, userAgent } = this.getClientInfo(req);
    const user = await this.prisma.user.findFirst({
      where: this.platformAdminWhere({ id }),
    });
    if (!user) throw new NotFoundException('Platform administrator not found');

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await argon2.hash(password) },
    });
    await this.revokeSessions(id);

    await this.audit.log({
      userId: currentUser.id,
      tenantId: null,
      action: 'PLATFORM_ADMIN_PASSWORD_RESET',
      module: 'platform-admins',
      ipAddress,
      userAgent,
      metadata: { targetUserId: id },
    });

    return { message: 'Password has been reset. They must sign in again.' };
  }

  private async countActiveFullAdmins(excludeId?: string) {
    return this.prisma.user.count({
      where: this.platformAdminWhere({
        status: UserStatus.ACTIVE,
        superAdminScope: SuperAdminScope.FULL,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      }),
    });
  }

  private async assertNotRemovingLastFullAdmin(
    targetId: string,
    nextScope: SuperAdminScope,
    nextStatus: UserStatus,
  ) {
    const remainsFull = nextScope === SuperAdminScope.FULL && nextStatus === UserStatus.ACTIVE;
    if (remainsFull) return;

    const remaining = await this.countActiveFullAdmins(targetId);
    if (remaining < 1) {
      throw new ForbiddenException(LAST_FULL_ADMIN_MESSAGE);
    }
  }

  private async revokeSessions(userId: string) {
    await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }
}

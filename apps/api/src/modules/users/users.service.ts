import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { Request } from 'express';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { getClientInfo } from '@/common/utils/client-info';
import { RequestUser } from '@/common/decorators/auth.decorator';
import { canAccessPharmacyManagement, resolveSuperAdminScope, ROLES } from '@safescript/shared';
import {
  CreateUserDto,
  UpdateUserDto,
  ListUsersQueryDto,
  BulkActionDto,
} from './dto/users.dto';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private getClientInfo(req: Request) {
    return getClientInfo(req);
  }

  private sanitizeUser(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    status: UserStatus;
    tenantId: string | null;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    role: { name: string; displayName: string };
    tenant?: { id: string; name: string } | null;
  }) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`,
      status: user.status,
      tenantId: user.tenantId,
      organization: user.tenant?.name ?? null,
      role: user.role.name,
      roleDisplayName: user.role.displayName,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async listPharmacistAdmins(query: ListUsersQueryDto, currentUser: RequestUser, req: Request) {
    this.assertPharmacyPlatformAccess(currentUser);

    const tenantId = query.tenantId ?? undefined;
    return this.listUsers(query, ROLES.PHARMACIST_ADMIN, tenantId, currentUser, req);
  }

  async listPharmacists(query: ListUsersQueryDto, currentUser: RequestUser, req: Request) {
    if (currentUser.role !== ROLES.PHARMACIST_ADMIN && currentUser.role !== ROLES.SUPER_ADMIN) {
      throw new ForbiddenException('You do not have permission for this action');
    }

    if (currentUser.role === ROLES.SUPER_ADMIN) {
      this.assertPharmacyPlatformAccess(currentUser);
    }

    const tenantId =
      currentUser.role === ROLES.SUPER_ADMIN ? query.tenantId ?? undefined : currentUser.tenantId;

    if (currentUser.role === ROLES.PHARMACIST_ADMIN && !currentUser.tenantId) {
      throw new ForbiddenException('No pharmacy is linked to your account');
    }

    return this.listUsers(query, ROLES.PHARMACIST, tenantId ?? null, currentUser, req);
  }

  private async listUsers(
    query: ListUsersQueryDto,
    roleName: string,
    tenantId: string | null | undefined,
    currentUser: RequestUser,
    req: Request,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const role = await this.prisma.role.findUnique({ where: { name: roleName } });
    if (!role) throw new BadRequestException('That role could not be found');

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      roleId: role.id,
      ...(tenantId !== undefined && { tenantId }),
      ...(query.status && { status: query.status }),
      ...(query.search && {
        OR: [
          { email: { contains: query.search, mode: 'insensitive' } },
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const orderBy: Prisma.UserOrderByWithRelationInput = {
      [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc',
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: { role: true, tenant: true },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map((u) => this.sanitizeUser(u)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getUser(id: string, currentUser: RequestUser) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { role: true, tenant: true },
    });
    if (!user) throw new NotFoundException('User not found');
    this.assertAccess(user, currentUser);
    return this.sanitizeUser(user);
  }

  async createPharmacistAdmin(dto: CreateUserDto, currentUser: RequestUser, req: Request) {
    this.assertPharmacyPlatformAccess(currentUser);
    return this.createUser(dto, ROLES.PHARMACIST_ADMIN, currentUser, req);
  }

  async createPharmacist(dto: CreateUserDto, currentUser: RequestUser, req: Request) {
    if (currentUser.role !== ROLES.PHARMACIST_ADMIN) throw new ForbiddenException('Only pharmacy admins can do this');
    if (!currentUser.tenantId) throw new ForbiddenException('No tenant associated');
    return this.createUser(
      { ...dto, tenantId: currentUser.tenantId },
      ROLES.PHARMACIST,
      currentUser,
      req,
    );
  }

  private async createUser(
    dto: CreateUserDto,
    roleName: string,
    currentUser: RequestUser,
    req: Request,
  ) {
    const { ipAddress, userAgent } = this.getClientInfo(req);
    const role = await this.prisma.role.findUnique({ where: { name: roleName } });
    if (!role) throw new BadRequestException('That role could not be found');

    let tenantId = dto.tenantId ?? null;

    if (roleName === ROLES.PHARMACIST_ADMIN) {
      if (dto.tenantId) {
        const tenant = await this.prisma.tenant.findUnique({ where: { id: dto.tenantId } });
        if (!tenant) throw new BadRequestException('Pharmacy not found');
        tenantId = tenant.id;
      } else if (dto.organizationName) {
        const slug = dto.organizationName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        const tenant = await this.prisma.tenant.create({
          data: {
            name: dto.organizationName,
            slug: `${slug}-${Date.now()}`,
            faxNumber: optionalContact(dto.organizationFax),
            phone: optionalContact(dto.organizationPhone),
          },
        });
        tenantId = tenant.id;
        await this.prisma.safeScribeEntitlement.create({
          data: {
            tenantId: tenant.id,
            module: 'prescribe',
            includedQuantity: 10,
            period: 'daily',
            active: true,
          },
        });
      } else {
        throw new BadRequestException('Please select a pharmacy or enter an organisation name');
      }
    }

    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email, tenantId, deletedAt: null },
    });
    if (existing) throw new ConflictException('This email is already in use');

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: await argon2.hash(dto.password),
        firstName: dto.firstName,
        lastName: dto.lastName,
        tenantId,
        roleId: role.id,
        status: dto.status ?? UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
      include: { role: true, tenant: true },
    });

    await this.audit.log({
      userId: currentUser.id,
      tenantId: user.tenantId,
      action: 'USER_CREATE',
      module: 'users',
      ipAddress,
      userAgent,
      newValue: this.sanitizeUser(user) as unknown as Record<string, unknown>,
    });

    return this.sanitizeUser(user);
  }

  async updateUser(id: string, dto: UpdateUserDto, currentUser: RequestUser, req: Request) {
    const { ipAddress, userAgent } = this.getClientInfo(req);
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { role: true, tenant: true },
    });
    if (!user) throw new NotFoundException('User not found');
    this.assertAccess(user, currentUser);

    if (dto.tenantId && user.role.name === ROLES.PHARMACIST_ADMIN) {
      if (currentUser.role !== ROLES.SUPER_ADMIN) {
        throw new ForbiddenException('Only super admins can change pharmacy assignment');
      }
      const tenant = await this.prisma.tenant.findUnique({ where: { id: dto.tenantId } });
      if (!tenant) throw new BadRequestException('Pharmacy not found');
    }

    const previous = this.sanitizeUser(user);
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.email && { email: dto.email }),
        ...(dto.firstName && { firstName: dto.firstName }),
        ...(dto.lastName && { lastName: dto.lastName }),
        ...(dto.status && { status: dto.status }),
        ...(dto.tenantId &&
          user.role.name === ROLES.PHARMACIST_ADMIN &&
          currentUser.role === ROLES.SUPER_ADMIN && { tenantId: dto.tenantId }),
      },
      include: { role: true, tenant: true },
    });

    await this.audit.log({
      userId: currentUser.id,
      tenantId: updated.tenantId,
      action: 'USER_UPDATE',
      module: 'users',
      ipAddress,
      userAgent,
      previousValue: previous as unknown as Record<string, unknown>,
      newValue: this.sanitizeUser(updated) as unknown as Record<string, unknown>,
    });

    return this.sanitizeUser(updated);
  }

  async deleteUser(id: string, currentUser: RequestUser, req: Request) {
    const { ipAddress, userAgent } = this.getClientInfo(req);
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { role: true, tenant: true },
    });
    if (!user) throw new NotFoundException('User not found');
    this.assertAccess(user, currentUser);

    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: UserStatus.SUSPENDED },
    });

    await this.audit.log({
      userId: currentUser.id,
      tenantId: user.tenantId,
      action: 'USER_DELETE',
      module: 'users',
      ipAddress,
      userAgent,
      previousValue: this.sanitizeUser(user) as unknown as Record<string, unknown>,
    });

    return { message: 'User removed successfully' };
  }

  async bulkAction(dto: BulkActionDto, currentUser: RequestUser, req: Request) {
    const results = [];
    for (const id of dto.ids) {
      if (dto.action === 'delete') {
        results.push(await this.deleteUser(id, currentUser, req));
      } else {
        const status = dto.action === 'suspend' ? UserStatus.SUSPENDED : UserStatus.ACTIVE;
        results.push(await this.updateUser(id, { status }, currentUser, req));
      }
    }
    return { message: `Bulk ${dto.action} completed for selected users`, count: results.length };
  }

  async resetPassword(id: string, password: string, currentUser: RequestUser, req: Request) {
    const { ipAddress, userAgent } = this.getClientInfo(req);
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { role: true },
    });
    if (!user) throw new NotFoundException('User not found');
    this.assertAccess(user, currentUser);

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await argon2.hash(password) },
    });

    await this.audit.log({
      userId: currentUser.id,
      tenantId: user.tenantId,
      action: 'PASSWORD_RESET_BY_ADMIN',
      module: 'users',
      ipAddress,
      userAgent,
      metadata: { targetUserId: id },
    });

    return { message: 'Password has been reset' };
  }

  async getLoginHistory(id: string, currentUser: RequestUser) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { role: true },
    });
    if (!user) throw new NotFoundException('User not found');
    this.assertAccess(user, currentUser);

    return this.prisma.loginHistory.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  private assertPharmacyPlatformAccess(currentUser: RequestUser) {
    if (currentUser.role !== ROLES.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admins can do this');
    }
    const scope = resolveSuperAdminScope(currentUser.role, currentUser.superAdminScope);
    if (!canAccessPharmacyManagement(scope)) {
      throw new ForbiddenException('Your platform administrator role does not include pharmacy management');
    }
  }

  private assertAccess(
    target: { tenantId: string | null; role: { name: string } },
    currentUser: RequestUser,
  ) {
    if (currentUser.role === ROLES.SUPER_ADMIN) {
      if (target.role.name === ROLES.SUPER_ADMIN) {
        throw new ForbiddenException('Platform administrators are managed in Platform Admins');
      }
      this.assertPharmacyPlatformAccess(currentUser);
      return;
    }

    if (currentUser.role === ROLES.PHARMACIST_ADMIN) {
      if (target.tenantId !== currentUser.tenantId) {
        throw new ForbiddenException('You can only view users in your own pharmacy');
      }
      if (target.role.name === ROLES.SUPER_ADMIN || target.role.name === ROLES.PHARMACIST_ADMIN) {
        throw new ForbiddenException('You cannot manage admin users');
      }
      return;
    }

    throw new ForbiddenException('You do not have permission for this action');
  }
}

function optionalContact(raw?: string | null): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length > 0 && (digits.length < 10 || digits.length > 15)) {
    throw new BadRequestException('Please enter a valid fax or phone number');
  }
  return trimmed;
}

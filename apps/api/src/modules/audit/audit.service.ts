import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { RequestUser } from '@/common/decorators/auth.decorator';
import { ROLES } from '@safescript/shared';
import { ListAuditLogsQueryDto } from './dto/audit.dto';

export interface AuditLogInput {
  userId?: string;
  tenantId?: string | null;
  action: string;
  module: string;
  ipAddress?: string;
  userAgent?: string;
  deviceInfo?: string;
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(input: AuditLogInput) {
    return this.prisma.auditLog.create({
      data: {
        userId: input.userId,
        tenantId: input.tenantId,
        action: input.action,
        module: input.module,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        deviceInfo: input.deviceInfo,
        previousValue: input.previousValue as object,
        newValue: input.newValue as object,
        metadata: input.metadata as object,
      },
    });
  }

  private formatLog(log: {
    id: string;
    action: string;
    module: string;
    ipAddress: string | null;
    userAgent: string | null;
    deviceInfo: string | null;
    previousValue: unknown;
    newValue: unknown;
    metadata: unknown;
    createdAt: Date;
    user?: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      role: { name: string; displayName: string };
    } | null;
    tenant?: { id: string; name: string } | null;
  }) {
    const isFailed = ['LOGIN_FAILED', 'TOKEN_REVOKED'].includes(log.action);
    return {
      id: log.id,
      action: log.action,
      module: log.module,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      deviceInfo: log.deviceInfo,
      browser: log.userAgent,
      previousValue: log.previousValue,
      newValue: log.newValue,
      metadata: log.metadata,
      createdAt: log.createdAt,
      status: isFailed ? 'FAILED' : 'SUCCESS',
      userName: log.user ? `${log.user.firstName} ${log.user.lastName}` : null,
      userEmail: log.user?.email ?? null,
      userRole: log.user?.role.displayName ?? null,
      organization: log.tenant?.name ?? null,
      tenantId: log.tenant?.id ?? null,
      userId: log.user?.id ?? null,
    };
  }

  async list(query: ListAuditLogsQueryDto, currentUser: RequestUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {
      ...(currentUser.role === ROLES.PHARMACIST_ADMIN && {
        tenantId: currentUser.tenantId ?? undefined,
      }),
      ...(query.module && { module: query.module }),
      ...(query.action && { action: query.action }),
      ...(query.userId && { userId: query.userId }),
      ...(query.tenantId && { tenantId: query.tenantId }),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from && { gte: new Date(query.from) }),
              ...(query.to && { lte: new Date(query.to) }),
            },
          }
        : {}),
      ...(query.search && {
        OR: [
          { action: { contains: query.search, mode: 'insensitive' } },
          { module: { contains: query.search, mode: 'insensitive' } },
          { ipAddress: { contains: query.search, mode: 'insensitive' } },
          { user: { email: { contains: query.search, mode: 'insensitive' } } },
          { user: { firstName: { contains: query.search, mode: 'insensitive' } } },
          { user: { lastName: { contains: query.search, mode: 'insensitive' } } },
        ],
      }),
    };

    const orderBy: Prisma.AuditLogOrderByWithRelationInput = {
      [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc',
    };

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          user: { include: { role: true } },
          tenant: true,
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs.map((log) => this.formatLog(log)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string, currentUser: RequestUser) {
    const log = await this.prisma.auditLog.findUnique({
      where: { id },
      include: {
        user: { include: { role: true } },
        tenant: true,
      },
    });
    if (!log) throw new NotFoundException('Activity log not found');

    if (
      currentUser.role === ROLES.PHARMACIST_ADMIN &&
      log.tenantId !== currentUser.tenantId
    ) {
      throw new ForbiddenException('You do not have permission to view this log');
    }

    return this.formatLog(log);
  }

  async listForUser(userId: string, currentUser: RequestUser, limit = 20) {
    return this.list(
      { userId, limit, page: 1, sortBy: 'createdAt', sortOrder: 'desc' },
      currentUser,
    );
  }
}

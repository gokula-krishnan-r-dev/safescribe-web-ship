import { ForbiddenException } from '@nestjs/common';
import { SuperAdminScope, UserStatus } from '@prisma/client';
import { ROLES, SUPER_ADMIN_SCOPES } from '@safescript/shared';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import { PlatformAdminsService } from './platform-admins.service';

function fullUser(): RequestUser {
  return {
    id: 'full-1',
    email: 'admin@safescript.com',
    role: ROLES.SUPER_ADMIN,
    tenantId: null,
    permissions: [],
    superAdminScope: SUPER_ADMIN_SCOPES.FULL,
  };
}

function clinicalUser(): RequestUser {
  return {
    id: 'clin-1',
    email: 'clinical-admin@safescript.com',
    role: ROLES.SUPER_ADMIN,
    tenantId: null,
    permissions: [],
    superAdminScope: SUPER_ADMIN_SCOPES.CLINICAL,
  };
}

describe('PlatformAdminsService', () => {
  const prisma = {
    role: { findUnique: jest.fn() },
    user: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    session: { updateMany: jest.fn() },
    refreshToken: { updateMany: jest.fn() },
    $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  };
  const audit = { log: jest.fn() };
  const service = new PlatformAdminsService(prisma as never, audit as never);
  const req = { headers: {}, ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.role.findUnique.mockResolvedValue({ id: 'role-sa' });
  });

  it('rejects clinical-only operators from managing platform admins', () => {
    expect(() => service.assertCanManage(clinicalUser())).toThrow(ForbiddenException);
  });

  it('lists only tenantless SUPER_ADMIN accounts', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'a1',
        email: 'admin@safescript.com',
        firstName: 'Super',
        lastName: 'Admin',
        status: UserStatus.ACTIVE,
        superAdminScope: SuperAdminScope.FULL,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    prisma.user.count.mockResolvedValue(1);

    const result = await service.list({ page: 1, limit: 10 }, fullUser());
    expect(result.meta.total).toBe(1);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: null, roleId: 'role-sa' }),
      }),
    );
  });

  it('refuses to demote the last full-access administrator', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'full-1',
      email: 'admin@safescript.com',
      firstName: 'Super',
      lastName: 'Admin',
      status: UserStatus.ACTIVE,
      superAdminScope: SuperAdminScope.FULL,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.user.count.mockResolvedValue(0);

    await expect(
      service.update(
        'full-1',
        { superAdminScope: SuperAdminScope.CLINICAL },
        fullUser(),
        req,
      ),
    ).rejects.toThrow(/full-access platform administrator/);
  });
});

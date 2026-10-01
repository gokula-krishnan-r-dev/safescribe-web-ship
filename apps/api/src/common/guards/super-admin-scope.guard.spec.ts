import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES, SUPER_ADMIN_SCOPES, PLATFORM_ACCESS } from '@safescript/shared';
import type { RequestUser } from '../decorators/auth.decorator';
import { SuperAdminScopeGuard } from './super-admin-scope.guard';

describe('SuperAdminScopeGuard', () => {
  const pharmacyAdmin: RequestUser = {
    id: '1',
    email: 'pharmacy@example.com',
    role: ROLES.SUPER_ADMIN,
    tenantId: null,
    permissions: [],
    superAdminScope: SUPER_ADMIN_SCOPES.PHARMACY,
  };
  const clinicalAdmin: RequestUser = {
    ...pharmacyAdmin,
    id: '2',
    email: 'clinical@example.com',
    superAdminScope: SUPER_ADMIN_SCOPES.CLINICAL,
  };
  const fullAdmin: RequestUser = {
    ...pharmacyAdmin,
    id: '3',
    email: 'full@example.com',
    superAdminScope: SUPER_ADMIN_SCOPES.FULL,
  };

  function activate(user: RequestUser | undefined, required: string[]) {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(required as never);
    const guard = new SuperAdminScopeGuard(reflector);
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
    return guard.canActivate(ctx);
  }

  it('allows when no platform access is required', () => {
    expect(activate(pharmacyAdmin, [])).toBe(true);
  });

  it('lets tenant roles through so pharmacist routes stay usable', () => {
    expect(
      activate(
        {
          id: 'p',
          email: 'pharm@example.com',
          role: ROLES.PHARMACIST,
          tenantId: 't1',
          permissions: [],
          superAdminScope: null,
        },
        [PLATFORM_ACCESS.CLINICAL],
      ),
    ).toBe(true);
  });

  it('blocks a pharmacy-only super admin from clinical endpoints', () => {
    expect(() => activate(pharmacyAdmin, [PLATFORM_ACCESS.CLINICAL])).toThrow(ForbiddenException);
  });

  it('blocks a clinical-only super admin from pharmacy endpoints', () => {
    expect(() => activate(clinicalAdmin, [PLATFORM_ACCESS.PHARMACY])).toThrow(ForbiddenException);
  });

  it('lets a full super admin into both domains', () => {
    expect(activate(fullAdmin, [PLATFORM_ACCESS.PHARMACY])).toBe(true);
    expect(activate(fullAdmin, [PLATFORM_ACCESS.CLINICAL])).toBe(true);
    expect(activate(fullAdmin, [PLATFORM_ACCESS.FULL])).toBe(true);
  });

  it('treats a missing stored scope as full access', () => {
    expect(activate({ ...fullAdmin, superAdminScope: null }, [PLATFORM_ACCESS.CLINICAL])).toBe(
      true,
    );
  });
});

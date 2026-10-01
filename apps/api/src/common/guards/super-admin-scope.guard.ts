import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  hasPlatformAccess,
  PLATFORM_ACCESS_DENIED_MESSAGE,
  resolveSuperAdminScope,
  ROLES,
  type PlatformAccess,
} from '@safescript/shared';
import { PLATFORM_ACCESS_KEY } from '../decorators/auth.decorator';
import type { RequestUser } from '../decorators/auth.decorator';

@Injectable()
export class SuperAdminScopeGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PlatformAccess[]>(PLATFORM_ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    if (!user) {
      throw new ForbiddenException(PLATFORM_ACCESS_DENIED_MESSAGE);
    }

    // Tenant-scoped roles are not gated by platform function.
    if (user.role !== ROLES.SUPER_ADMIN) return true;

    const scope = resolveSuperAdminScope(user.role, user.superAdminScope);
    const allowed = required.some((access) => hasPlatformAccess(scope, access));
    if (!allowed) {
      throw new ForbiddenException(PLATFORM_ACCESS_DENIED_MESSAGE);
    }
    return true;
  }
}

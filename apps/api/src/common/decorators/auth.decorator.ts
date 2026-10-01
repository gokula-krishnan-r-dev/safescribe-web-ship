import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { PLATFORM_ACCESS, type PlatformAccess, ROLES, RoleName, type SuperAdminScope } from '@safescript/shared';

export const ROLES_KEY = 'roles';
export const PERMISSIONS_KEY = 'permissions';
export const PLATFORM_ACCESS_KEY = 'platformAccess';

export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
export const RequirePlatformAccess = (...access: PlatformAccess[]) =>
  SetMetadata(PLATFORM_ACCESS_KEY, access);

export interface RequestUser {
  id: string;
  email: string;
  role: RoleName;
  tenantId: string | null;
  permissions: string[];
  /** SUPER_ADMIN platform function. Null for tenant-scoped users. */
  superAdminScope: SuperAdminScope | null;
}

export const CurrentUser = createParamDecorator(
  (data: keyof RequestUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as RequestUser;
    if (!data) return user;
    return user?.[data];
  },
);

export { ROLES, PLATFORM_ACCESS };

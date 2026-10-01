import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { PrismaService } from '@/prisma/prisma.service';
import { RequestUser } from '@/common/decorators/auth.decorator';
import { IpAccessService } from '@/modules/ip-access/ip-access.service';
import { getClientIp } from '@/common/utils/client-info';
import { resolveSuperAdminScope } from '@safescript/shared';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tenantId: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
    private ipAccess: IpAccessService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_ACCESS_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload): Promise<RequestUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      include: {
        role: { include: { rolePermissions: { include: { permission: true } } } },
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Your account is inactive or could not be found');
    }

    const clientIp = getClientIp(req);
    await this.ipAccess.assertAccessAllowed(
      user.tenantId,
      user.id,
      user.role.name,
      clientIp,
      req,
      'request',
    );

    return {
      id: user.id,
      email: user.email,
      role: user.role.name as RequestUser['role'],
      tenantId: user.tenantId,
      permissions: user.role.rolePermissions.map((rp) => rp.permission.name),
      superAdminScope: resolveSuperAdminScope(user.role.name, user.superAdminScope),
    };
  }
}

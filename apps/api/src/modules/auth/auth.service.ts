import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Request } from 'express';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/redis/redis.service';
import { AuditService } from '@/modules/audit/audit.service';
import { RequestUser } from '@/common/decorators/auth.decorator';
import { IpAccessService } from '@/modules/ip-access/ip-access.service';
import { ProfessionalAcknowledgementService } from '@/modules/professional-acknowledgement/professional-acknowledgement.service';
import { MailService } from '@/modules/contact/mail.service';
import { getClientInfo } from '@/common/utils/client-info';
import { isEnvFlagEnabled } from '@/modules/contact/mail.util';
import {
  LoginDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ResendLoginEmailDto,
  VerifyLoginEmailDto,
} from './dto/auth.dto';
import { verifyPassword } from './password-hash.util';
import { loginEmail2faContent } from './login-email-2fa.templates';
import {
  AUTH_SESSION_MAX_DAYS,
  AUTH_SESSION_MAX_MS,
  AUTH_SESSION_MAX_SECONDS,
  LOGIN_CHANNELS,
  LOGIN_ERROR_CODES,
  LOGIN_UI,
  PROFESSIONAL_ACK_AUDIT_MODULE,
  PROFESSIONAL_ACK_EVENTS,
  PROFESSIONAL_ACK_SIGN_OUT_SOURCE,
  ROLES,
  authSessionExpiresAt,
  isEntitledToSafescribe,
  isProfessionalAckRole,
  maskEmail,
  requiresLoginEmail2fa,
  resolveSuperAdminScope,
  shouldChallengeLoginEmail2fa,
  type LoginEmail2faChallengeResponse,
} from '@safescript/shared';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tenantId: string | null;
  /** Unique per token — prevents identical JWTs under concurrent refresh */
  jti: string;
}

interface RedisChallengePayload {
  challengeId: string;
  userId: string;
  rememberMe: boolean;
}

const REDIS_TOKEN_PREFIX = 'auth:login2fa:token:';
const REDIS_USER_PREFIX = 'auth:login2fa:user:';
const REDIS_RESEND_PREFIX = 'auth:login2fa:resend:';
const RESEND_COOLDOWN_SECONDS = 60;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private redis: RedisService,
    private audit: AuditService,
    private ipAccess: IpAccessService,
    private professionalAcks: ProfessionalAcknowledgementService,
    private mail: MailService,
  ) {}

  private getClientInfo(req: Request) {
    return getClientInfo(req);
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private webUrl() {
    const fromEmail = this.config.get<string>('EMAIL_APP_URL')?.trim();
    const fromWeb = this.config.get<string>('WEB_URL')?.trim();
    return (fromEmail || fromWeb || 'http://localhost:3000').replace(/\/$/, '');
  }

  private email2faEnabled() {
    return isEnvFlagEnabled(this.config.get<string>('LOGIN_EMAIL_2FA_ENABLED'), false);
  }

  private email2faTtlMinutes() {
    const raw = this.config.get<number>('LOGIN_EMAIL_2FA_TTL_MINUTES');
    const minutes = typeof raw === 'number' && Number.isFinite(raw) ? raw : 15;
    return Math.min(60, Math.max(5, minutes));
  }

  private shouldChallengeLoginEmail2fa(roleName: string, email: string) {
    return shouldChallengeLoginEmail2fa({
      enabled: this.email2faEnabled(),
      role: roleName,
      email,
      bypassEmails: this.config.get<string>('DEMO_LOGIN_BYPASS_EMAILS'),
      requiresRole: requiresLoginEmail2fa,
    });
  }

  async login(dto: LoginDto, req: Request) {
    const { ipAddress, userAgent } = this.getClientInfo(req);
    const maxAttempts = this.config.get<number>('MAX_LOGIN_ATTEMPTS', 5);
    const lockoutMinutes = this.config.get<number>('LOCKOUT_DURATION_MINUTES', 15);

    const candidates = await this.prisma.user.findMany({
      where: {
        email: { equals: dto.email.trim(), mode: 'insensitive' },
        deletedAt: null,
        ...(dto.tenantId ? { tenantId: dto.tenantId } : {}),
      },
      include: {
        role: { include: { rolePermissions: { include: { permission: true } } } },
        tenant: { select: { id: true, name: true, status: true } },
      },
    });

    if (!candidates.length) {
      await this.audit.log({
        action: 'LOGIN_FAILED',
        module: 'auth',
        ipAddress,
        userAgent,
        metadata: { email: dto.email, reason: 'user_not_found' },
      });
      throw new UnauthorizedException(LOGIN_UI.invalidCredentials);
    }

    const now = new Date();
    if (candidates.every((row) => row.lockedUntil && row.lockedUntil > now)) {
      throw new ForbiddenException(LOGIN_UI.locked);
    }

    const matched: typeof candidates = [];
    for (const row of candidates) {
      if (row.lockedUntil && row.lockedUntil > now) continue;
      if (await verifyPassword(row.passwordHash, dto.password)) {
        matched.push(row);
      }
    }

    if (!matched.length) {
      await Promise.all(
        candidates.map(async (row) => {
          const attempts = row.failedLoginAttempts + 1;
          await this.prisma.user.update({
            where: { id: row.id },
            data: {
              failedLoginAttempts: attempts,
              ...(attempts >= maxAttempts
                ? { lockedUntil: new Date(Date.now() + lockoutMinutes * 60 * 1000) }
                : {}),
            },
          });
          await this.prisma.loginHistory.create({
            data: { userId: row.id, ipAddress, userAgent, success: false },
          });
        }),
      );
      await this.audit.log({
        action: 'LOGIN_FAILED',
        module: 'auth',
        ipAddress,
        userAgent,
        metadata: { email: dto.email, reason: 'bad_password', accounts: candidates.length },
      });
      throw new UnauthorizedException(LOGIN_UI.invalidCredentials);
    }

    const loginChannel = dto.loginChannel ?? LOGIN_CHANNELS.PHARMACY;
    const channelOk = matched.filter((row) => {
      const isSuperAdmin = row.role.name === ROLES.SUPER_ADMIN;
      if (isSuperAdmin && loginChannel !== LOGIN_CHANNELS.SUPER_ADMIN_ACCESS) return false;
      if (!isSuperAdmin && loginChannel === LOGIN_CHANNELS.SUPER_ADMIN_ACCESS) return false;
      return true;
    });

    if (!channelOk.length) {
      const user = matched[0];
      const isSuperAdmin = user.role.name === ROLES.SUPER_ADMIN;
      await this.audit.log({
        userId: user.id,
        tenantId: user.tenantId,
        action: 'LOGIN_FAILED',
        module: 'auth',
        ipAddress,
        userAgent,
        metadata: {
          reason: isSuperAdmin ? 'super_admin_wrong_channel' : 'non_super_admin_on_admin_channel',
          loginChannel,
          role: user.role.name,
        },
      });
      throw new HttpException(
        {
          statusCode: HttpStatus.FORBIDDEN,
          error: isSuperAdmin
            ? LOGIN_ERROR_CODES.SUPER_ADMIN_CHANNEL_REQUIRED
            : LOGIN_ERROR_CODES.ADMIN_ACCESS_RESTRICTED,
          message: isSuperAdmin
            ? 'Platform administrator accounts can only sign in through the dedicated admin access page.'
            : 'This sign-in page is reserved for platform administrators. Use the pharmacy workspace login instead.',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    const selectable = channelOk.filter((row) =>
      isEntitledToSafescribe({
        userStatus: row.status,
        role: row.role.name,
        tenantStatus: row.tenant?.status ?? null,
      }),
    );

    if (!selectable.length) {
      const user = channelOk[0];
      await this.prisma.loginHistory.create({
        data: { userId: user.id, ipAddress, userAgent, success: false },
      });
      await this.audit.log({
        userId: user.id,
        tenantId: user.tenantId,
        action: 'LOGIN_FAILED',
        module: 'auth',
        ipAddress,
        userAgent,
        metadata: { reason: 'not_entitled', userStatus: user.status, tenantStatus: user.tenant?.status },
      });
      throw new HttpException(
        {
          statusCode: HttpStatus.FORBIDDEN,
          error: LOGIN_ERROR_CODES.SAFESCRIBE_NOT_ENTITLED,
          message: LOGIN_UI.notEntitled,
        },
        HttpStatus.FORBIDDEN,
      );
    }

    if (selectable.length > 1 && !dto.tenantId) {
      throw new HttpException(
        {
          statusCode: HttpStatus.CONFLICT,
          error: LOGIN_ERROR_CODES.TENANT_SELECTION_REQUIRED,
          message: LOGIN_UI.selectPharmacy,
          tenants: selectable.map((row) => ({
            id: row.tenantId,
            name: row.tenant?.name ?? 'Pharmacy',
          })),
        },
        HttpStatus.CONFLICT,
      );
    }

    const user = selectable[0];
    const roleName = user.role.name;

    await this.ipAccess.assertAccessAllowed(
      user.tenantId,
      user.id,
      user.role.name,
      ipAddress,
      req,
      'login',
    );

    // Clear lockout counters after password + entitlement succeed (before 2FA).
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });

    if (this.shouldChallengeLoginEmail2fa(roleName, user.email)) {
      return this.beginLoginEmailChallenge({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          tenantId: user.tenantId,
          role: roleName,
        },
        rememberMe: Boolean(dto.rememberMe),
        ipAddress,
        userAgent,
      });
    }

    if (this.email2faEnabled() && requiresLoginEmail2fa(roleName)) {
      await this.audit.log({
        userId: user.id,
        tenantId: user.tenantId,
        action: 'LOGIN_DEMO_2FA_BYPASSED',
        module: 'auth',
        ipAddress,
        userAgent,
        metadata: { email: user.email, role: roleName },
      });
    }

    return this.completeAuthenticatedSession({
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roleName,
      tenantId: user.tenantId,
      permissions: user.role.rolePermissions.map((rp) => rp.permission.name),
      superAdminScope: resolveSuperAdminScope(user.role.name, user.superAdminScope),
      phixUserId: user.phixUserId,
      rememberMe: Boolean(dto.rememberMe),
      ipAddress,
      userAgent,
      auditAction: 'LOGIN',
    });
  }

  async verifyLoginEmail(dto: VerifyLoginEmailDto, req: Request) {
    const { ipAddress, userAgent } = this.getClientInfo(req);
    const token = dto.token.trim();
    if (token.length < 32) {
      throw this.invalidLoginEmailChallenge();
    }

    const tokenHash = this.hashToken(token);
    const redisKey = `${REDIS_TOKEN_PREFIX}${tokenHash}`;
    const redisRaw = await this.redis.getDel(redisKey);

    let challengeId: string | null = null;
    let rememberMe = false;
    let userId: string | null = null;

    if (redisRaw) {
      try {
        const parsed = JSON.parse(redisRaw) as RedisChallengePayload;
        challengeId = parsed.challengeId;
        rememberMe = Boolean(parsed.rememberMe);
        userId = parsed.userId;
      } catch {
        throw this.invalidLoginEmailChallenge();
      }
    }

    const challenge = challengeId
      ? await this.prisma.loginEmailChallenge.findUnique({ where: { id: challengeId } })
      : await this.prisma.loginEmailChallenge.findUnique({ where: { tokenHash } });

    if (
      !challenge ||
      challenge.consumedAt ||
      challenge.expiresAt < new Date() ||
      !this.hexTokensEqual(challenge.tokenHash, tokenHash)
    ) {
      throw this.invalidLoginEmailChallenge();
    }

    if (userId && userId !== challenge.userId) {
      throw this.invalidLoginEmailChallenge();
    }

    const claimed = await this.prisma.loginEmailChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw this.invalidLoginEmailChallenge();
    }

    await this.redis.del(`${REDIS_USER_PREFIX}${challenge.userId}`);

    const user = await this.prisma.user.findFirst({
      where: { id: challenge.userId, deletedAt: null },
      include: {
        role: { include: { rolePermissions: { include: { permission: true } } } },
        tenant: { select: { id: true, name: true, status: true } },
      },
    });

    if (
      !user ||
      !requiresLoginEmail2fa(user.role.name) ||
      !isEntitledToSafescribe({
        userStatus: user.status,
        role: user.role.name,
        tenantStatus: user.tenant?.status ?? null,
      })
    ) {
      throw this.invalidLoginEmailChallenge();
    }

    await this.ipAccess.assertAccessAllowed(
      user.tenantId,
      user.id,
      user.role.name,
      ipAddress,
      req,
      'login',
    );

    rememberMe = challenge.rememberMe || rememberMe;

    return this.completeAuthenticatedSession({
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roleName: user.role.name,
      tenantId: user.tenantId,
      permissions: user.role.rolePermissions.map((rp) => rp.permission.name),
      superAdminScope: resolveSuperAdminScope(user.role.name, user.superAdminScope),
      phixUserId: user.phixUserId,
      rememberMe,
      ipAddress,
      userAgent,
      auditAction: 'LOGIN',
      auditMetadata: {
        method: 'email_2fa',
        challengeId: challenge.id,
      },
    });
  }

  async resendLoginEmail(dto: ResendLoginEmailDto, req: Request) {
    const { ipAddress, userAgent } = this.getClientInfo(req);
    const challenge = await this.prisma.loginEmailChallenge.findUnique({
      where: { id: dto.challengeId.trim() },
      include: {
        user: {
          include: {
            role: true,
            tenant: { select: { status: true } },
          },
        },
      },
    });

    if (
      !challenge ||
      challenge.consumedAt ||
      challenge.expiresAt < new Date() ||
      !requiresLoginEmail2fa(challenge.user.role.name) ||
      !isEntitledToSafescribe({
        userStatus: challenge.user.status,
        role: challenge.user.role.name,
        tenantStatus: challenge.user.tenant?.status ?? null,
      })
    ) {
      throw this.invalidLoginEmailChallenge();
    }

    const cooldownKey = `${REDIS_RESEND_PREFIX}${challenge.userId}`;
    const allowed = await this.redis.setNx(cooldownKey, '1', RESEND_COOLDOWN_SECONDS);
    if (!allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: LOGIN_ERROR_CODES.LOGIN_EMAIL_2FA_RESEND_COOLDOWN,
          message: LOGIN_UI.email2faCooldown,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return this.beginLoginEmailChallenge({
      user: {
        id: challenge.user.id,
        email: challenge.user.email,
        firstName: challenge.user.firstName,
        tenantId: challenge.user.tenantId,
        role: challenge.user.role.name,
      },
      rememberMe: challenge.rememberMe,
      ipAddress,
      userAgent,
      replaceChallengeId: challenge.id,
    });
  }

  async refresh(refreshToken: string, req: Request) {
    const { ipAddress, userAgent } = this.getClientInfo(req);
    const now = new Date();

    if (!refreshToken?.trim()) {
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }

    const blacklisted = await this.redis.exists(`blacklist:${refreshToken}`);
    if (blacklisted) {
      throw new UnauthorizedException('Your session has ended. Please sign in again.');
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: { include: { role: true } } },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < now) {
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }

    const session = await this.prisma.session.findFirst({
      where: {
        userId: stored.userId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!session) {
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }

    // Absolute max from login — refresh rotation must never extend this window.
    const absoluteExpiresAt = new Date(
      Math.min(session.expiresAt.getTime(), session.createdAt.getTime() + AUTH_SESSION_MAX_MS),
    );
    if (absoluteExpiresAt <= now) {
      await this.prisma.session.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }

    await this.ipAccess.assertAccessAllowed(
      stored.user.tenantId,
      stored.user.id,
      stored.user.role.name,
      ipAddress,
      req,
      'request',
    );

    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: now },
    });

    if (claimed.count === 0) {
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }

    const remainingSeconds = Math.max(
      1,
      Math.floor((absoluteExpiresAt.getTime() - now.getTime()) / 1000),
    );
    await this.redis.set(
      `blacklist:${refreshToken}`,
      '1',
      Math.min(remainingSeconds, AUTH_SESSION_MAX_SECONDS),
    );

    const tokens = await this.generateTokens(
      stored.user.id,
      stored.user.email,
      stored.user.role.name,
      stored.user.tenantId,
      remainingSeconds,
    );

    try {
      await this.prisma.refreshToken.create({
        data: {
          userId: stored.user.id,
          token: tokens.refreshToken,
          expiresAt: absoluteExpiresAt,
        },
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;

      const retryTokens = await this.generateTokens(
        stored.user.id,
        stored.user.email,
        stored.user.role.name,
        stored.user.tenantId,
        remainingSeconds,
      );

      await this.prisma.refreshToken.create({
        data: {
          userId: stored.user.id,
          token: retryTokens.refreshToken,
          expiresAt: absoluteExpiresAt,
        },
      });

      await this.audit.log({
        userId: stored.user.id,
        tenantId: stored.user.tenantId,
        action: 'TOKEN_REFRESH',
        module: 'auth',
        ipAddress,
        userAgent,
        metadata: { sessionExpiresAt: absoluteExpiresAt.toISOString() },
      });

      return retryTokens;
    }

    await this.audit.log({
      userId: stored.user.id,
      tenantId: stored.user.tenantId,
      action: 'TOKEN_REFRESH',
      module: 'auth',
      ipAddress,
      userAgent,
      metadata: { sessionExpiresAt: absoluteExpiresAt.toISOString() },
    });

    return tokens;
  }

  async logout(
    userId: string,
    refreshToken: string | undefined,
    req: Request,
    source?: string,
  ) {
    const { ipAddress, userAgent } = this.getClientInfo(req);

    await this.professionalAcks.clearSessionAcknowledgement(userId);

    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { token: refreshToken, userId },
        data: { revokedAt: new Date() },
      });
      await this.redis.set(`blacklist:${refreshToken}`, '1', 7 * 24 * 60 * 60);
    }

    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    await this.audit.log({
      userId,
      tenantId: user?.tenantId,
      action: 'LOGOUT',
      module: 'auth',
      ipAddress,
      userAgent,
    });

    if (source === PROFESSIONAL_ACK_SIGN_OUT_SOURCE) {
      await this.audit.log({
        userId,
        tenantId: user?.tenantId,
        action: PROFESSIONAL_ACK_EVENTS.SIGN_OUT,
        module: PROFESSIONAL_ACK_AUDIT_MODULE,
        ipAddress,
        userAgent,
        metadata: { source },
      });
    }

    return { message: 'You have been signed out' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto, req: Request) {
    const { ipAddress, userAgent } = this.getClientInfo(req);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Please sign in again');

    if (user.phixUserId) {
      throw new HttpException(
        {
          statusCode: HttpStatus.FORBIDDEN,
          error: LOGIN_ERROR_CODES.PHIX_PASSWORD_MANAGED,
          message: LOGIN_UI.phixPasswordManaged,
        },
        HttpStatus.FORBIDDEN,
      );
    }

    const valid = await verifyPassword(user.passwordHash, dto.currentPassword);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await argon2.hash(dto.newPassword) },
    });

    await this.audit.log({
      userId,
      tenantId: user.tenantId,
      action: 'PASSWORD_CHANGE',
      module: 'auth',
      ipAddress,
      userAgent,
    });

    return { message: 'Password changed successfully' };
  }

  async forgotPassword(dto: ForgotPasswordDto, req: Request) {
    const { ipAddress, userAgent } = this.getClientInfo(req);
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
    });

    if (user && !user.phixUserId) {
      const token = uuidv4();
      await this.prisma.passwordReset.create({
        data: {
          userId: user.id,
          token,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      await this.audit.log({
        userId: user.id,
        tenantId: user.tenantId,
        action: 'PASSWORD_RESET_REQUESTED',
        module: 'auth',
        ipAddress,
        userAgent,
        metadata: { token },
      });
      console.log(`Password reset token for ${dto.email}: ${token}`);
    }

    return { message: 'If that email is registered, we have sent a reset link' };
  }

  async resetPassword(dto: ResetPasswordDto, req: Request) {
    const { ipAddress, userAgent } = this.getClientInfo(req);
    const reset = await this.prisma.passwordReset.findUnique({
      where: { token: dto.token },
      include: { user: true },
    });

    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
      throw new UnauthorizedException('This reset link is invalid or has expired');
    }

    if (reset.user.phixUserId) {
      throw new HttpException(
        {
          statusCode: HttpStatus.FORBIDDEN,
          error: LOGIN_ERROR_CODES.PHIX_PASSWORD_MANAGED,
          message: LOGIN_UI.phixPasswordManaged,
        },
        HttpStatus.FORBIDDEN,
      );
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: reset.userId },
        data: { passwordHash: await argon2.hash(dto.password) },
      }),
      this.prisma.passwordReset.update({
        where: { id: reset.id },
        data: { usedAt: new Date() },
      }),
    ]);

    await this.audit.log({
      userId: reset.userId,
      tenantId: reset.user.tenantId,
      action: 'PASSWORD_RESET',
      module: 'auth',
      ipAddress,
      userAgent,
    });

    return { message: 'Your password has been reset. You can sign in now.' };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        role: { include: { rolePermissions: { include: { permission: true } } } },
        tenant: true,
      },
    });
    if (!user) throw new UnauthorizedException('Please sign in again');

    const professionalAcknowledgement = await this.professionalAcks.getStatusForUser({
      id: user.id,
      role: user.role.name as RequestUser['role'],
    });

    const tenant = user.tenant
      ? {
          ...user.tenant,
          logoStorageKey: undefined,
          logoStorageProvider: undefined,
          logoMimeType: undefined,
          hasLogo: Boolean(user.tenant.logoStorageKey),
        }
      : null;

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role.name,
      tenantId: user.tenantId,
      tenant,
      status: user.status,
      permissions: user.role.rolePermissions.map((rp) => rp.permission.name),
      superAdminScope: resolveSuperAdminScope(user.role.name, user.superAdminScope),
      lastLoginAt: user.lastLoginAt,
      professionalAcknowledgement,
      phixLinked: Boolean(user.phixUserId),
      hasSignature: Boolean(user.signatureStorageKey),
    };
  }

  private async beginLoginEmailChallenge(input: {
    user: {
      id: string;
      email: string;
      firstName: string;
      tenantId: string | null;
      role: string;
    };
    rememberMe: boolean;
    ipAddress?: string | null;
    userAgent?: string | null;
    replaceChallengeId?: string;
  }): Promise<LoginEmail2faChallengeResponse> {
    const ttlMinutes = this.email2faTtlMinutes();
    const ttlSeconds = ttlMinutes * 60;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);

    await this.invalidateActiveLoginEmailChallenges(input.user.id);

    const challenge = await this.prisma.loginEmailChallenge.create({
      data: {
        userId: input.user.id,
        tokenHash,
        rememberMe: input.rememberMe,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        expiresAt,
      },
    });

    const redisPayload: RedisChallengePayload = {
      challengeId: challenge.id,
      userId: input.user.id,
      rememberMe: input.rememberMe,
    };
    await this.redis.set(
      `${REDIS_TOKEN_PREFIX}${tokenHash}`,
      JSON.stringify(redisPayload),
      ttlSeconds,
    );
    await this.redis.set(`${REDIS_USER_PREFIX}${input.user.id}`, challenge.id, ttlSeconds);

    const verifyUrl = `${this.webUrl()}/verify-login/${rawToken}`;
    const content = loginEmail2faContent({
      firstName: input.user.firstName,
      verifyUrl,
      expiresInMinutes: ttlMinutes,
    });

    const mailed = await this.mail.send({
      to: input.user.email,
      subject: content.subject,
      text: content.text,
      html: content.html,
      idempotencyKey: `login-email-2fa-${challenge.id}`,
      tags: [
        { name: 'category', value: 'login_email_2fa' },
        { name: 'role', value: input.user.role },
      ],
    });

    if (!mailed && this.config.get<string>('NODE_ENV') !== 'production') {
      this.logger.warn(`Login email 2FA link (dev only): ${verifyUrl}`);
    }

    await this.audit.log({
      userId: input.user.id,
      tenantId: input.user.tenantId,
      action: input.replaceChallengeId ? 'LOGIN_EMAIL_2FA_RESENT' : 'LOGIN_EMAIL_2FA_SENT',
      module: 'auth',
      ipAddress: input.ipAddress ?? undefined,
      userAgent: input.userAgent ?? undefined,
      metadata: {
        challengeId: challenge.id,
        mailed,
        replacedChallengeId: input.replaceChallengeId ?? null,
      },
    });

    return {
      requiresEmailVerification: true,
      challengeId: challenge.id,
      emailMasked: maskEmail(input.user.email),
      expiresInSeconds: ttlSeconds,
      mailed,
    };
  }

  private async invalidateActiveLoginEmailChallenges(userId: string) {
    const previousChallengeId = await this.redis.get(`${REDIS_USER_PREFIX}${userId}`);
    const open = await this.prisma.loginEmailChallenge.findMany({
      where: {
        userId,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, tokenHash: true },
    });

    if (open.length) {
      await this.prisma.loginEmailChallenge.updateMany({
        where: { id: { in: open.map((row) => row.id) } },
        data: { consumedAt: new Date() },
      });
      await Promise.all(open.map((row) => this.redis.del(`${REDIS_TOKEN_PREFIX}${row.tokenHash}`)));
    }

    if (previousChallengeId) {
      await this.redis.del(`${REDIS_USER_PREFIX}${userId}`);
    }
  }

  private async completeAuthenticatedSession(input: {
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    roleName: string;
    tenantId: string | null;
    permissions: string[];
    superAdminScope: ReturnType<typeof resolveSuperAdminScope>;
    phixUserId: string | null;
    rememberMe: boolean;
    ipAddress?: string | null;
    userAgent?: string | null;
    auditAction: string;
    auditMetadata?: Record<string, unknown>;
  }) {
    await this.prisma.user.update({
      where: { id: input.userId },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.generateTokens(
      input.userId,
      input.email,
      input.roleName,
      input.tenantId,
      AUTH_SESSION_MAX_SECONDS,
    );
    const sessionToken = uuidv4();
    const sessionExpiresAt = authSessionExpiresAt();

    await this.prisma.session.create({
      data: {
        userId: input.userId,
        token: sessionToken,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        expiresAt: sessionExpiresAt,
      },
    });

    await this.prisma.refreshToken.create({
      data: {
        userId: input.userId,
        token: tokens.refreshToken,
        expiresAt: sessionExpiresAt,
      },
    });

    await this.prisma.loginHistory.create({
      data: {
        userId: input.userId,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        success: true,
      },
    });
    await this.audit.log({
      userId: input.userId,
      tenantId: input.tenantId,
      action: input.auditAction,
      module: 'auth',
      ipAddress: input.ipAddress ?? undefined,
      userAgent: input.userAgent ?? undefined,
      metadata: {
        ...(input.auditMetadata ?? {}),
        sessionExpiresAt: sessionExpiresAt.toISOString(),
        sessionMaxDays: AUTH_SESSION_MAX_DAYS,
        rememberMe: input.rememberMe,
      },
    });

    await this.professionalAcks.clearSessionAcknowledgement(input.userId);
    const professionalAcknowledgement = isProfessionalAckRole(input.roleName)
      ? this.professionalAcks.currentStatus(false)
      : await this.professionalAcks.getStatusForUser({
          id: input.userId,
          role: input.roleName as RequestUser['role'],
        });

    return {
      ...tokens,
      user: {
        id: input.userId,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.roleName,
        tenantId: input.tenantId,
        permissions: input.permissions,
        superAdminScope: input.superAdminScope,
        professionalAcknowledgement,
        phixLinked: Boolean(input.phixUserId),
      },
    };
  }

  private invalidLoginEmailChallenge() {
    return new HttpException(
      {
        statusCode: HttpStatus.UNAUTHORIZED,
        error: LOGIN_ERROR_CODES.LOGIN_EMAIL_2FA_INVALID_OR_EXPIRED,
        message: LOGIN_UI.email2faInvalid,
      },
      HttpStatus.UNAUTHORIZED,
    );
  }

  private hexTokensEqual(a: string, b: string) {
    try {
      const left = Buffer.from(a, 'hex');
      const right = Buffer.from(b, 'hex');
      if (left.length !== right.length) return false;
      return timingSafeEqual(left, right);
    } catch {
      return false;
    }
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: string,
    tenantId: string | null,
    refreshExpiresInSeconds: number = AUTH_SESSION_MAX_SECONDS,
  ) {
    const base = { sub: userId, email, role, tenantId };
    const refreshTtlSeconds = Math.max(
      1,
      Math.min(refreshExpiresInSeconds, AUTH_SESSION_MAX_SECONDS),
    );
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { ...base, jti: uuidv4() } satisfies JwtPayload,
        {
          secret: this.config.get('JWT_ACCESS_SECRET'),
          expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN', '15m'),
        },
      ),
      this.jwt.signAsync(
        { ...base, jti: uuidv4() } satisfies JwtPayload,
        {
          secret: this.config.get('JWT_REFRESH_SECRET'),
          expiresIn: refreshTtlSeconds,
        },
      ),
    ]);
    return { accessToken, refreshToken };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    );
  }
}

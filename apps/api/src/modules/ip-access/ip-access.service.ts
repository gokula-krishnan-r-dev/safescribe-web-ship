import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  GoneException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PharmacyNetwork,
  PharmacyNetworkSource,
  PharmacyNetworkStatus,
  PharmacyNetworkVerificationStatus,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { Request } from 'express';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/redis/redis.service';
import { AuditService } from '@/modules/audit/audit.service';
import { MailService } from '@/modules/contact/mail.service';
import { RequestUser } from '@/common/decorators/auth.decorator';
import { ROLES } from '@safescript/shared';
import { getClientInfo, getClientIp, isUsablePublicClientIp } from '@/common/utils/client-info';
import { isCloudflareIp } from '@/common/utils/cloudflare-ips';
import {
  cidrPrefixLength,
  cidrToIpAndPrefix,
  compileAllowlist,
  isIpAllowed,
  isPrivateOrReservedIp,
  matchCompiledIp,
  stabilizeAllowlistCidr,
  type CompiledNetwork,
} from '@/common/utils/ip-matcher';
import { IpAccessDeniedException } from '@/common/exceptions/ip-access-denied.exception';
import {
  CreatePharmacyNetworkDto,
  SendNetworkVerificationDto,
  UpdatePharmacyNetworkAccessDto,
  UpdatePharmacyNetworkDto,
} from './dto/pharmacy-network.dto';
import { isPharmacyIpRestrictionActive } from './pharmacy-network-enforcement';

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_SECONDS = 60;

@Injectable()
export class IpAccessService {
  private readonly compiledCache = new Map<
    string,
    {
      compiled: CompiledNetwork[];
      sourceCount: number;
      networkAccessEnabled: boolean;
      expiresAt: number;
    }
  >();
  private readonly ipv6RefreshInFlight = new Set<string>();

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private audit: AuditService,
    private mail: MailService,
    private config: ConfigService,
  ) {}

  private cacheKey(tenantId: string) {
    return `pharmacy-networks:v2:${tenantId}`;
  }

  private isIpRestrictedRole(role: string) {
    return role === ROLES.PHARMACIST || role === ROLES.PHARMACIST_ADMIN;
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private webUrl() {
    const fromEmail = this.config.get<string>('EMAIL_APP_URL')?.trim();
    const fromWeb = this.config.get<string>('WEB_URL')?.trim();
    return (fromEmail || fromWeb || 'http://localhost:3000').replace(/\/$/, '');
  }

  private async invalidateCache(tenantId: string) {
    this.compiledCache.delete(tenantId);
    await this.redis.del(this.cacheKey(tenantId));
  }

  private async compiledAllowlist(tenantId: string): Promise<{
    compiled: CompiledNetwork[];
    sourceCount: number;
    networkAccessEnabled: boolean;
  }> {
    const now = Date.now();
    const cached = this.compiledCache.get(tenantId);
    if (cached && cached.expiresAt > now) {
      return cached;
    }
    const state = await this.allowlistState(tenantId);
    const compiled = compileAllowlist(state.cidrs);
    const next = {
      compiled,
      sourceCount: state.cidrs.length,
      networkAccessEnabled: state.networkAccessEnabled,
      expiresAt: now + CACHE_TTL_SECONDS * 1000,
    };
    this.compiledCache.set(tenantId, next);
    return next;
  }

  /**
   * Legacy IPv6 rows were stored as /128 or /64. When a later request still
   * belongs to that pharmacy /48, rewrite the row to the stable site prefix
   * so the next lookup stays a cheap byte compare.
   */
  private scheduleIpv6SiteRefresh(
    tenantId: string,
    clientIp: string,
    storedCidr: string,
  ) {
    let next: ReturnType<typeof stabilizeAllowlistCidr>;
    try {
      next = stabilizeAllowlistCidr(clientIp);
    } catch {
      return;
    }
    if (next.family !== 'ipv6' || next.cidr === storedCidr) return;

    const key = `${tenantId}:${storedCidr}:${next.cidr}`;
    if (this.ipv6RefreshInFlight.has(key)) return;
    this.ipv6RefreshInFlight.add(key);

    void this.prisma.pharmacyNetwork
      .updateMany({
        where: {
          tenantId,
          cidr: storedCidr,
          status: PharmacyNetworkStatus.APPROVED,
        },
        data: {
          ipAddress: next.ipAddress,
          cidr: next.cidr,
          lastSeenAt: new Date(),
        },
      })
      .then((result: { count: number }) => {
        if (result.count > 0) {
          return this.invalidateCache(tenantId);
        }
      })
      .catch(() => undefined)
      .finally(() => this.ipv6RefreshInFlight.delete(key));
  }

  private assertSuperAdmin(user: RequestUser) {
    if (user.role !== ROLES.SUPER_ADMIN) {
      throw new ForbiddenException('Only SafeScribe admins can manage pharmacy networks');
    }
  }

  private rejectPrivateManualIp(ipAddress: string) {
    if (this.config.get('NODE_ENV') !== 'production') return;
    if (isPrivateOrReservedIp(ipAddress) || isCloudflareIp(ipAddress)) {
      throw new BadRequestException(
        'Enter the pharmacy public internet IP. Private, reserved, or CDN proxy addresses cannot be used.',
      );
    }
  }

  private parseNetworkInput(value: string) {
    try {
      return cidrToIpAndPrefix(value);
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Enter a valid public IP address or CIDR range',
      );
    }
  }

  private async allowlistState(tenantId: string): Promise<{
    networkAccessEnabled: boolean;
    cidrs: string[];
  }> {
    const cached = await this.redis.get(this.cacheKey(tenantId));
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as {
          networkAccessEnabled?: boolean;
          cidrs?: string[];
        };
        if (typeof parsed.networkAccessEnabled === 'boolean' && Array.isArray(parsed.cidrs)) {
          return {
            networkAccessEnabled: parsed.networkAccessEnabled,
            cidrs: parsed.cidrs,
          };
        }
      } catch {
        // Rebuild from the database if a previous cache shape is present.
      }
    }
    const [tenant, rows] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { networkAccessEnabled: true },
      }),
      this.prisma.pharmacyNetwork.findMany({
        where: { tenantId, status: PharmacyNetworkStatus.APPROVED },
        select: { cidr: true },
      }),
    ]);
    const state = {
      networkAccessEnabled: tenant?.networkAccessEnabled !== false,
      cidrs: rows.map((r) => r.cidr),
    };
    await this.redis.set(this.cacheKey(tenantId), JSON.stringify(state), CACHE_TTL_SECONDS);
    return state;
  }

  async isAccessAllowed(
    tenantId: string | null,
    _userId: string,
    role: string,
    clientIp: string | undefined,
  ): Promise<boolean> {
    if (!tenantId || !this.isIpRestrictedRole(role)) {
      return true;
    }

    const { compiled, sourceCount, networkAccessEnabled } =
      await this.compiledAllowlist(tenantId);
    if (!isPharmacyIpRestrictionActive(networkAccessEnabled, sourceCount)) {
      return true;
    }
    if (!clientIp || !compiled.length) {
      return false;
    }
    const result = matchCompiledIp(clientIp, compiled);
    if (result.allowed && result.rotatedPrefix && result.matched) {
      this.scheduleIpv6SiteRefresh(tenantId, clientIp, result.matched.storedCidr);
    }
    return result.allowed;
  }

  async assertAccessAllowed(
    tenantId: string | null,
    userId: string,
    role: string,
    clientIp: string | undefined,
    req?: Request,
    context: 'login' | 'request' = 'request',
  ) {
    const allowed = await this.isAccessAllowed(tenantId, userId, role, clientIp);
    if (allowed) return;

    const { ipAddress, userAgent } = req
      ? getClientInfo(req)
      : { ipAddress: clientIp, userAgent: undefined };

    await this.audit.log({
      userId,
      tenantId,
      action: context === 'login' ? 'LOGIN_BLOCKED_IP' : 'IP_ACCESS_DENIED',
      module: 'ip_access',
      ipAddress: ipAddress ?? undefined,
      userAgent,
      metadata: { context },
    });

    if (context === 'login' && userId) {
      await this.prisma.loginHistory.create({
        data: {
          userId,
          ipAddress: ipAddress ?? clientIp,
          userAgent,
          success: false,
        },
      });
    }

    throw new IpAccessDeniedException(
      (() => {
        const ip = ipAddress ?? clientIp;
        if (!ip) return undefined;
        try {
          const stabilized = stabilizeAllowlistCidr(ip);
          return { family: stabilized.family, recommendedCidr: stabilized.cidr };
        } catch {
          return { family: ip.includes(':') ? 'ipv6' : 'ipv4', recommendedCidr: null };
        }
      })(),
    );
  }

  async getDetectedIp(req: Request) {
    const ipAddress = getClientIp(req) ?? null;
    if (!ipAddress) {
      return {
        ipAddress: null,
        family: null,
        recommendedCidr: null,
        isPrivate: true,
        isCloudflare: false,
        usable: false,
      };
    }

    let family: 'ipv4' | 'ipv6' | null = null;
    let recommendedCidr: string | null = null;
    try {
      const stabilized = stabilizeAllowlistCidr(ipAddress);
      family = stabilized.family;
      recommendedCidr = stabilized.cidr;
    } catch {
      family = ipAddress.includes(':') ? 'ipv6' : 'ipv4';
    }

    return {
      ipAddress,
      family,
      recommendedCidr,
      isPrivate: isPrivateOrReservedIp(ipAddress),
      isCloudflare: isCloudflareIp(ipAddress),
      usable: isUsablePublicClientIp(ipAddress),
    };
  }

  async listPharmacyNetworkSummaries(user: RequestUser) {
    this.assertSuperAdmin(user);
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        status: true,
        networkAccessEnabled: true,
        users: {
          where: { deletedAt: null, role: { name: ROLES.PHARMACIST_ADMIN } },
          take: 1,
          select: { firstName: true, lastName: true, email: true },
        },
        _count: {
          select: {
            pharmacyNetworks: { where: { status: PharmacyNetworkStatus.APPROVED } },
            networkVerifications: {
              where: {
                status: {
                  in: [
                    PharmacyNetworkVerificationStatus.SENT,
                    PharmacyNetworkVerificationStatus.OPENED,
                  ],
                },
              },
            },
          },
        },
      },
    });

    return tenants.map((tenant) => {
      const admin = tenant.users[0] ?? null;
      return {
        id: tenant.id,
        name: tenant.name,
        status: tenant.status,
        adminName: admin ? `${admin.firstName} ${admin.lastName}` : null,
        adminEmail: admin?.email ?? null,
        approvedNetworkCount: tenant._count.pharmacyNetworks,
        pendingVerificationCount: tenant._count.networkVerifications,
        networkAccessEnabled: tenant.networkAccessEnabled,
        restrictionActive: isPharmacyIpRestrictionActive(
          tenant.networkAccessEnabled,
          tenant._count.pharmacyNetworks,
        ),
      };
    });
  }

  async getPharmacyNetworkOverview(tenantId: string, user: RequestUser, req?: Request) {
    this.assertSuperAdmin(user);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        users: {
          where: { deletedAt: null, role: { name: ROLES.PHARMACIST_ADMIN } },
          take: 1,
          select: { email: true, firstName: true, lastName: true },
        },
      },
    });
    if (!tenant) throw new NotFoundException('Pharmacy not found');

    await this.expireStaleVerifications(tenantId);

    const [networks, verifications] = await Promise.all([
      this.prisma.pharmacyNetwork.findMany({
        where: { tenantId, status: { not: PharmacyNetworkStatus.DISABLED } },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.pharmacyNetworkVerification.findMany({
        where: {
          tenantId,
          status: {
            in: [
              PharmacyNetworkVerificationStatus.SENT,
              PharmacyNetworkVerificationStatus.OPENED,
              PharmacyNetworkVerificationStatus.CONFIRMED,
            ],
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    const approvedCount = networks.filter((n) => n.status === PharmacyNetworkStatus.APPROVED).length;
    const ordered = [...networks].sort((a, b) => {
      if (a.status === b.status) return 0;
      if (a.status === PharmacyNetworkStatus.PENDING) return -1;
      if (b.status === PharmacyNetworkStatus.PENDING) return 1;
      return 0;
    });
    const currentIp = req ? getClientIp(req) : undefined;
    return {
      pharmacy: {
        id: tenant.id,
        name: tenant.name,
        status: tenant.status,
        email: tenant.users[0]?.email ?? null,
      },
      restrictionActive: isPharmacyIpRestrictionActive(
        tenant.networkAccessEnabled,
        approvedCount,
      ),
      networkAccessEnabled: tenant.networkAccessEnabled,
      networks: ordered.map((network) => ({
        ...network,
        matchesCurrentRequest: currentIp ? isIpAllowed(currentIp, [network.cidr]) : false,
      })),
      verifications,
    };
  }

  async updatePharmacyNetworkAccess(
    tenantId: string,
    dto: UpdatePharmacyNetworkAccessDto,
    user: RequestUser,
    req: Request,
  ) {
    this.assertSuperAdmin(user);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, networkAccessEnabled: true },
    });
    if (!tenant) throw new NotFoundException('Pharmacy not found');

    if (tenant.networkAccessEnabled === dto.networkAccessEnabled) {
      return {
        networkAccessEnabled: tenant.networkAccessEnabled,
        restrictionActive: isPharmacyIpRestrictionActive(
          tenant.networkAccessEnabled,
          await this.approvedNetworkCount(tenantId),
        ),
      };
    }

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { networkAccessEnabled: dto.networkAccessEnabled },
      select: { networkAccessEnabled: true },
    });
    await this.invalidateCache(tenantId);

    const { ipAddress, userAgent } = getClientInfo(req);
    await this.audit.log({
      userId: user.id,
      tenantId,
      action: dto.networkAccessEnabled
        ? 'PHARMACY_NETWORK_ACCESS_ENABLED'
        : 'PHARMACY_NETWORK_ACCESS_DISABLED',
      module: 'ip_access',
      ipAddress: ipAddress ?? undefined,
      userAgent,
      previousValue: { networkAccessEnabled: tenant.networkAccessEnabled },
      newValue: { networkAccessEnabled: updated.networkAccessEnabled },
    });

    return {
      networkAccessEnabled: updated.networkAccessEnabled,
      restrictionActive: isPharmacyIpRestrictionActive(
        updated.networkAccessEnabled,
        await this.approvedNetworkCount(tenantId),
      ),
    };
  }

  private async approvedNetworkCount(tenantId: string) {
    return this.prisma.pharmacyNetwork.count({
      where: { tenantId, status: PharmacyNetworkStatus.APPROVED },
    });
  }

  async addPharmacyNetwork(
    tenantId: string,
    dto: CreatePharmacyNetworkDto,
    user: RequestUser,
    req: Request,
  ) {
    this.assertSuperAdmin(user);
    await this.assertTenant(tenantId);
    const { ipAddress, cidr } = this.parseNetworkInput(dto.cidr);
    this.rejectPrivateManualIp(ipAddress);

    const reconciled = await this.reconcilePharmacyNetwork({
      tenantId,
      ipAddress,
      cidr,
      label: dto.label?.trim() || this.defaultNetworkLabel(cidr),
      status: PharmacyNetworkStatus.APPROVED,
      source: PharmacyNetworkSource.MANUAL,
      createdById: user.id,
      approvedById: user.id,
    });

    return this.finishAddNetwork(tenantId, user, req, cidr, ipAddress, reconciled);
  }

  async addLaunchCapturedNetwork(params: {
    tenantId: string;
    ipAddress: string;
    approvedById: string;
    source?: PharmacyNetworkSource;
  }) {
    await this.assertTenant(params.tenantId);
    const stabilized = stabilizeAllowlistCidr(params.ipAddress);
    this.rejectPrivateManualIp(stabilized.ipAddress);
    const reconciled = await this.reconcilePharmacyNetwork({
      tenantId: params.tenantId,
      ipAddress: stabilized.ipAddress,
      cidr: stabilized.cidr,
      label: 'Alberta launch — captured pharmacy network',
      status: PharmacyNetworkStatus.APPROVED,
      source: params.source ?? PharmacyNetworkSource.ALBERTA_LAUNCH,
      createdById: params.approvedById,
      approvedById: params.approvedById,
    });
    await this.audit.log({
      userId: params.approvedById,
      tenantId: params.tenantId,
      action: reconciled.created ? 'NETWORK_LAUNCH_ADDED' : 'NETWORK_LAUNCH_REFRESHED',
      module: 'ip_access',
      ipAddress: stabilized.ipAddress,
      newValue: { id: reconciled.network.id, cidr: stabilized.cidr },
    });
    return reconciled;
  }

  private async finishAddNetwork(
    tenantId: string,
    user: RequestUser,
    req: Request,
    cidr: string,
    ipAddress: string,
    reconciled: { network: PharmacyNetwork; created: boolean; upgraded: boolean },
  ) {

    const companion = await this.registerRequestCompanion(tenantId, user, req, cidr);

    const { ipAddress: actorIp, userAgent } = getClientInfo(req);
    if (reconciled.created || reconciled.upgraded) {
      await this.audit.log({
        userId: user.id,
        tenantId,
        action: reconciled.upgraded ? 'NETWORK_UPGRADED' : 'NETWORK_MANUALLY_ADDED',
        module: 'ip_access',
        ipAddress: actorIp ?? undefined,
        userAgent,
        newValue: { id: reconciled.network.id, cidr, ipAddress },
      });
    }
    if (companion?.created || companion?.upgraded) {
      await this.audit.log({
        userId: user.id,
        tenantId,
        action: 'NETWORK_COMPANION_ADDED',
        module: 'ip_access',
        ipAddress: actorIp ?? undefined,
        userAgent,
        newValue: { id: companion.network.id, cidr: companion.network.cidr },
        metadata: { primaryCidr: cidr },
      });
    }
    return {
      ...reconciled.network,
      companion: companion?.network ?? null,
      companionCreated: Boolean(companion?.created || companion?.upgraded),
    };
  }

  async updatePharmacyNetwork(
    id: string,
    dto: UpdatePharmacyNetworkDto,
    user: RequestUser,
    req: Request,
  ) {
    this.assertSuperAdmin(user);
    const existing = await this.prisma.pharmacyNetwork.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Network not found');

    let ipAddress = existing.ipAddress;
    let cidr = existing.cidr;
    if (dto.cidr) {
      const parsed = this.parseNetworkInput(dto.cidr);
      ipAddress = parsed.ipAddress;
      cidr = parsed.cidr;
      this.rejectPrivateManualIp(ipAddress);
    }

    const { ipAddress: actorIp, userAgent } = getClientInfo(req);
    const updated = await this.prisma.pharmacyNetwork.update({
      where: { id },
      data: {
        ipAddress,
        cidr,
        ...(dto.label !== undefined && { label: dto.label.trim() || null }),
      },
    });
    await this.invalidateCache(existing.tenantId);
    await this.audit.log({
      userId: user.id,
      tenantId: existing.tenantId,
      action: 'NETWORK_UPDATED',
      module: 'ip_access',
      ipAddress: actorIp ?? undefined,
      userAgent,
      previousValue: { cidr: existing.cidr, label: existing.label },
      newValue: { cidr: updated.cidr, label: updated.label },
    });
    return updated;
  }

  async removePharmacyNetwork(id: string, user: RequestUser, req: Request) {
    this.assertSuperAdmin(user);
    const existing = await this.prisma.pharmacyNetwork.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Network not found');

    const { ipAddress, userAgent } = getClientInfo(req);
    await this.prisma.pharmacyNetwork.delete({ where: { id } });
    await this.invalidateCache(existing.tenantId);
    await this.audit.log({
      userId: user.id,
      tenantId: existing.tenantId,
      action: 'NETWORK_REMOVED',
      module: 'ip_access',
      ipAddress: ipAddress ?? undefined,
      userAgent,
      previousValue: { id, cidr: existing.cidr },
    });
    return { message: 'Network removed' };
  }

  async sendVerification(
    tenantId: string,
    dto: SendNetworkVerificationDto,
    user: RequestUser,
    req: Request,
  ) {
    this.assertSuperAdmin(user);
    const tenant = await this.assertTenant(tenantId);
    const { ipAddress, userAgent } = getClientInfo(req);

    await this.prisma.pharmacyNetworkVerification.updateMany({
      where: {
        tenantId,
        status: {
          in: [
            PharmacyNetworkVerificationStatus.SENT,
            PharmacyNetworkVerificationStatus.OPENED,
          ],
        },
      },
      data: { status: PharmacyNetworkVerificationStatus.CANCELLED },
    });

    const token = randomBytes(32).toString('hex');
    const verification = await this.prisma.pharmacyNetworkVerification.create({
      data: {
        tenantId,
        email: dto.email.trim().toLowerCase(),
        tokenHash: this.hashToken(token),
        status: PharmacyNetworkVerificationStatus.SENT,
        expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
        createdById: user.id,
      },
    });

    const link = `${this.webUrl()}/verify-network/${token}`;
    const sent = await this.mail.send({
      to: verification.email,
      subject: 'Verify your pharmacy network for SafeScribe',
      text:
        `SafeScribe access is restricted to your pharmacy's registered internet connection.\n\n` +
        `Please open the link below from a computer connected to your pharmacy's regular internet connection.\n\n` +
        `Verify pharmacy network: ${link}\n\n` +
        `Do not open this link from home or another location.\n\n` +
        `This link expires in 24 hours.`,
      html:
        `<p>SafeScribe access is restricted to your pharmacy's registered internet connection.</p>` +
        `<p>Please open the link below from a computer connected to your pharmacy's regular internet connection.</p>` +
        `<p><a href="${link}"><strong>Verify pharmacy network</strong></a></p>` +
        `<p>Do not open this link from home or another location.</p>` +
        `<p>This link expires in 24 hours.</p>`,
    });

    await this.audit.log({
      userId: user.id,
      tenantId,
      action: 'NETWORK_VERIFICATION_SENT',
      module: 'ip_access',
      ipAddress: ipAddress ?? undefined,
      userAgent,
      metadata: { verificationId: verification.id, email: verification.email, mailed: sent },
    });

    return {
      id: verification.id,
      email: verification.email,
      status: verification.status,
      expiresAt: verification.expiresAt,
      pharmacyName: tenant.name,
      mailed: sent,
    };
  }

  async cancelVerification(id: string, user: RequestUser, req: Request) {
    this.assertSuperAdmin(user);
    const row = await this.prisma.pharmacyNetworkVerification.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Verification not found');
    const { ipAddress, userAgent } = getClientInfo(req);
    const updated = await this.prisma.pharmacyNetworkVerification.update({
      where: { id },
      data: { status: PharmacyNetworkVerificationStatus.CANCELLED },
    });
    await this.audit.log({
      userId: user.id,
      tenantId: row.tenantId,
      action: 'NETWORK_VERIFICATION_CANCELLED',
      module: 'ip_access',
      ipAddress: ipAddress ?? undefined,
      userAgent,
      metadata: { verificationId: id },
    });
    return updated;
  }

  async approveNetwork(id: string, user: RequestUser, req: Request) {
    this.assertSuperAdmin(user);
    const network = await this.prisma.pharmacyNetwork.findUnique({ where: { id } });
    if (!network) throw new NotFoundException('Network not found');
    if (network.status === PharmacyNetworkStatus.APPROVED) return network;

    const { ipAddress, userAgent } = getClientInfo(req);
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.pharmacyNetwork.update({
        where: { id },
        data: {
          status: PharmacyNetworkStatus.APPROVED,
          approvedById: user.id,
          approvedAt: new Date(),
          lastVerifiedAt: new Date(),
          label: network.label?.trim() || 'Primary pharmacy internet',
        },
      });
      if (network.verificationId) {
        await tx.pharmacyNetworkVerification.update({
          where: { id: network.verificationId },
          data: {
            status: PharmacyNetworkVerificationStatus.APPROVED,
            approvedAt: new Date(),
            approvedById: user.id,
          },
        });
      }
      return next;
    });
    await this.invalidateCache(network.tenantId);
    await this.audit.log({
      userId: user.id,
      tenantId: network.tenantId,
      action: 'NETWORK_APPROVED',
      module: 'ip_access',
      ipAddress: ipAddress ?? undefined,
      userAgent,
      metadata: { networkId: id, cidr: network.cidr, verificationId: network.verificationId },
    });
    return updated;
  }

  async rejectNetwork(id: string, user: RequestUser, req: Request) {
    this.assertSuperAdmin(user);
    const network = await this.prisma.pharmacyNetwork.findUnique({ where: { id } });
    if (!network) throw new NotFoundException('Network not found');

    const { ipAddress, userAgent } = getClientInfo(req);
    await this.prisma.$transaction(async (tx) => {
      if (network.verificationId) {
        await tx.pharmacyNetworkVerification.update({
          where: { id: network.verificationId },
          data: {
            status: PharmacyNetworkVerificationStatus.REJECTED,
            rejectedAt: new Date(),
          },
        });
      }
      await tx.pharmacyNetwork.delete({ where: { id } });
    });
    await this.invalidateCache(network.tenantId);
    await this.audit.log({
      userId: user.id,
      tenantId: network.tenantId,
      action: 'NETWORK_REJECTED',
      module: 'ip_access',
      ipAddress: ipAddress ?? undefined,
      userAgent,
      metadata: { networkId: id, cidr: network.cidr, verificationId: network.verificationId },
    });
    return { message: 'Network request rejected' };
  }

  async openVerification(token: string, req: Request) {
    const row = await this.loadUsableVerification(token);
    const detectedIp = getClientIp(req) ?? null;
    const now = new Date();
    const nextStatus =
      row.status === PharmacyNetworkVerificationStatus.SENT
        ? PharmacyNetworkVerificationStatus.OPENED
        : row.status;

    const updated = await this.prisma.pharmacyNetworkVerification.update({
      where: { id: row.id },
      data: {
        status: nextStatus,
        openedAt: row.openedAt ?? now,
        detectedIp,
      },
      include: { tenant: { select: { name: true, status: true } } },
    });

    if (row.status === PharmacyNetworkVerificationStatus.SENT) {
      await this.audit.log({
        tenantId: row.tenantId,
        action: 'NETWORK_VERIFICATION_OPENED',
        module: 'ip_access',
        ipAddress: detectedIp ?? undefined,
        metadata: { verificationId: row.id },
      });
    }

    let recommendedCidr: string | null = null;
    let family: 'ipv4' | 'ipv6' | null = null;
    if (detectedIp) {
      try {
        const stabilized = stabilizeAllowlistCidr(detectedIp);
        recommendedCidr = stabilized.cidr;
        family = stabilized.family;
      } catch {
        family = detectedIp.includes(':') ? 'ipv6' : 'ipv4';
      }
    }

    return {
      pharmacyName: updated.tenant.name,
      detectedIp,
      recommendedCidr,
      family,
      status: updated.status,
      expiresAt: updated.expiresAt,
    };
  }

  async confirmVerification(token: string, req: Request) {
    const row = await this.loadUsableVerification(token);
    const detectedIp = getClientIp(req);
    if (!detectedIp) {
      throw new BadRequestException('Could not detect a public IP for this request');
    }

    const { cidr, ipAddress } = this.parseNetworkInput(detectedIp);
    this.rejectPrivateManualIp(ipAddress);
    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const verification = await tx.pharmacyNetworkVerification.update({
        where: { id: row.id },
        data: {
          status: PharmacyNetworkVerificationStatus.CONFIRMED,
          detectedIp: ipAddress,
          confirmedAt: now,
        },
        include: { tenant: { select: { name: true } } },
      });

      const existing =
        (await tx.pharmacyNetwork.findFirst({
          where: { verificationId: row.id },
        })) ??
        (await tx.pharmacyNetwork.findFirst({
          where: { tenantId: row.tenantId, cidr, status: { not: PharmacyNetworkStatus.DISABLED } },
        }));

      const covering =
        existing ??
        (await tx.pharmacyNetwork.findMany({
          where: { tenantId: row.tenantId, status: { not: PharmacyNetworkStatus.DISABLED } },
        })).find((network) => isIpAllowed(ipAddress, [network.cidr]));

      const network =
        covering ??
        (await tx.pharmacyNetwork.create({
          data: {
            tenantId: row.tenantId,
            ipAddress,
            cidr,
            label: 'Captured from pharmacy verification link',
            status: PharmacyNetworkStatus.PENDING,
            source: PharmacyNetworkSource.VERIFICATION_LINK,
            createdById: row.createdById,
            verificationId: row.id,
          },
        }));

      return { verification, network };
    });

    await this.audit.log({
      tenantId: row.tenantId,
      action: 'NETWORK_VERIFICATION_CONFIRMED',
      module: 'ip_access',
      ipAddress: detectedIp,
      metadata: { verificationId: row.id, cidr, networkId: result.network.id },
    });

    return {
      pharmacyName: result.verification.tenant.name,
      detectedIp: ipAddress,
      cidr,
      family: stabilizeAllowlistCidr(cidr).family,
    };
  }

  private defaultNetworkLabel(cidr: string) {
    return cidr.includes(':') ? 'Pharmacy IPv6 site' : 'Primary pharmacy internet';
  }

  /**
   * Login uses the protocol the browser actually connected with (often IPv6
   * on dual-stack networks). If an admin pasted only the IPv4 from a lookup
   * site, also register this request's IP.
   */
  private async registerRequestCompanion(
    tenantId: string,
    user: RequestUser,
    req: Request,
    primaryCidr: string,
  ) {
    const detected = getClientIp(req);
    if (!detected || !isUsablePublicClientIp(detected)) return null;
    try {
      const stabilized = stabilizeAllowlistCidr(detected);
      if (stabilized.cidr === primaryCidr) return null;
      this.rejectPrivateManualIp(stabilized.ipAddress);
      return this.reconcilePharmacyNetwork({
        tenantId,
        ipAddress: stabilized.ipAddress,
        cidr: stabilized.cidr,
        label:
          stabilized.family === 'ipv6'
            ? 'Pharmacy IPv6 site (same connection)'
            : 'Pharmacy public IPv4 (same connection)',
        status: PharmacyNetworkStatus.APPROVED,
        source: PharmacyNetworkSource.MANUAL,
        createdById: user.id,
        approvedById: user.id,
      });
    } catch {
      return null;
    }
  }

  private async reconcilePharmacyNetwork(input: {
    tenantId: string;
    ipAddress: string;
    cidr: string;
    label: string;
    status: PharmacyNetworkStatus;
    source: PharmacyNetworkSource;
    createdById: string;
    approvedById?: string;
    verificationId?: string;
  }) {
    const now = new Date();
    const rows = await this.prisma.pharmacyNetwork.findMany({
      where: { tenantId: input.tenantId, status: { not: PharmacyNetworkStatus.DISABLED } },
    });

    const alreadyCovered = rows.find((row) => isIpAllowed(input.ipAddress, [row.cidr]));
    const incomingBroader =
      alreadyCovered != null &&
      cidrPrefixLength(input.cidr) >= 0 &&
      cidrPrefixLength(alreadyCovered.cidr) >= 0 &&
      cidrPrefixLength(input.cidr) < cidrPrefixLength(alreadyCovered.cidr) &&
      isIpAllowed(alreadyCovered.ipAddress, [input.cidr]);

    if (alreadyCovered && !incomingBroader) {
      const refreshed = await this.prisma.pharmacyNetwork.update({
        where: { id: alreadyCovered.id },
        data: { lastVerifiedAt: now, lastSeenAt: now },
      });
      return { network: refreshed, created: false, upgraded: false };
    }

    const subsumed = rows.filter((row) => {
      if (row.cidr === input.cidr) return false;
      return (
        isIpAllowed(row.ipAddress, [input.cidr]) &&
        cidrPrefixLength(input.cidr) < cidrPrefixLength(row.cidr)
      );
    });
    const keep = subsumed[0];
    const extras = subsumed.slice(1);

    if (keep) {
      const upgraded = await this.prisma.$transaction(async (tx) => {
        if (extras.length) {
          await tx.pharmacyNetwork.deleteMany({
            where: { id: { in: extras.map((row) => row.id) } },
          });
        }
        return tx.pharmacyNetwork.update({
          where: { id: keep.id },
          data: {
            ipAddress: input.ipAddress,
            cidr: input.cidr,
            label: input.label || keep.label,
            lastVerifiedAt: now,
            lastSeenAt: now,
            ...(input.status === PharmacyNetworkStatus.APPROVED && {
              status: PharmacyNetworkStatus.APPROVED,
              approvedById: input.approvedById,
              approvedAt: keep.approvedAt ?? now,
            }),
          },
        });
      });
      await this.invalidateCache(input.tenantId);
      return { network: upgraded, created: false, upgraded: true };
    }

    const network = await this.prisma.pharmacyNetwork.create({
      data: {
        tenantId: input.tenantId,
        ipAddress: input.ipAddress,
        cidr: input.cidr,
        label: input.label,
        status: input.status,
        source: input.source,
        createdById: input.createdById,
        approvedById: input.approvedById,
        verificationId: input.verificationId,
        approvedAt: input.status === PharmacyNetworkStatus.APPROVED ? now : undefined,
        lastVerifiedAt: now,
        lastSeenAt: now,
      },
    });
    await this.invalidateCache(input.tenantId);
    return { network, created: true, upgraded: false };
  }

  private async assertTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Pharmacy not found');
    return tenant;
  }

  private async expireStaleVerifications(tenantId: string) {
    await this.prisma.pharmacyNetworkVerification.updateMany({
      where: {
        tenantId,
        status: {
          in: [PharmacyNetworkVerificationStatus.SENT, PharmacyNetworkVerificationStatus.OPENED],
        },
        expiresAt: { lt: new Date() },
      },
      data: { status: PharmacyNetworkVerificationStatus.EXPIRED },
    });
  }

  private async loadUsableVerification(token: string) {
    const tokenHash = this.hashToken(token);
    const row = await this.prisma.pharmacyNetworkVerification.findUnique({
      where: { tokenHash },
      include: { tenant: { select: { name: true, status: true } } },
    });
    if (!row) throw new NotFoundException('This verification link is not valid');
    if (row.tenant.status !== 'ACTIVE') {
      throw new ForbiddenException('This pharmacy is not active');
    }
    if (
      row.status === PharmacyNetworkVerificationStatus.EXPIRED ||
      row.expiresAt.getTime() < Date.now()
    ) {
      if (row.status !== PharmacyNetworkVerificationStatus.EXPIRED) {
        await this.prisma.pharmacyNetworkVerification.update({
          where: { id: row.id },
          data: { status: PharmacyNetworkVerificationStatus.EXPIRED },
        });
      }
      throw new GoneException('This verification link has expired');
    }
    if (
      row.status === PharmacyNetworkVerificationStatus.CANCELLED ||
      row.status === PharmacyNetworkVerificationStatus.REJECTED ||
      row.status === PharmacyNetworkVerificationStatus.APPROVED
    ) {
      throw new GoneException('This verification link is no longer active');
    }
    if (row.status === PharmacyNetworkVerificationStatus.CONFIRMED) {
      throw new GoneException('This pharmacy network has already been submitted');
    }
    return row;
  }
}

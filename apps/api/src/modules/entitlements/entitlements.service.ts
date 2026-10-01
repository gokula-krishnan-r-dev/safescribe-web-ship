import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import {
  ACCESS_DENIAL_CODES,
  DEFAULT_PHARMACY_TIMEZONE,
  DEFAULT_PRESCRIBE_DAILY_INCLUDED,
  ENTITLEMENT_PERIODS,
  ROLES,
  SAFESCRIBE_MODULES,
  USAGE_EVENT_TYPES,
  bucketCountsByLocalDate,
  moduleLabel,
  parseEnabledFlag,
  pharmacyUsageHealth,
  remainingAllowance,
  usagePeriodWindow,
  utilizationPercent,
  type EntitlementUsageSnapshot,
} from '@safescript/shared';
import {
  DailyLimitReachedException,
  ModuleNotEntitledException,
} from '@/common/exceptions/daily-limit-reached.exception';

const PRESCRIBE = SAFESCRIBE_MODULES.PRESCRIBE;

@Injectable()
export class EntitlementsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private config: ConfigService,
  ) {}

  isRenewEnvironmentEnabled(): boolean {
    return parseEnabledFlag(this.config.get<string>('SAFESCRIBE_RENEW_ENABLED'), true);
  }

  isAdaptEnvironmentEnabled(): boolean {
    return parseEnabledFlag(this.config.get<string>('SAFESCRIBE_ADAPT_ENABLED'), false);
  }

  async ensureDefaultPrescribe(tenantId: string) {
    await this.ensureDefaultModule(tenantId, PRESCRIBE);
  }

  async ensureDefaultRenew(tenantId: string | null | undefined) {
    if (!tenantId) return;
    await this.ensureDefaultModule(tenantId, SAFESCRIBE_MODULES.RENEW);
  }

  async ensureDefaultAdapt(tenantId: string | null | undefined) {
    if (!tenantId || !this.isAdaptEnvironmentEnabled()) return;
    await this.ensureDefaultModule(tenantId, SAFESCRIBE_MODULES.ADAPT);
  }

  private async ensureDefaultModule(tenantId: string, module: string) {
    await this.prisma.safeScribeEntitlement.upsert({
      where: { tenantId_module: { tenantId, module } },
      create: {
        tenantId,
        module,
        includedQuantity: DEFAULT_PRESCRIBE_DAILY_INCLUDED,
        period: ENTITLEMENT_PERIODS.DAILY,
        active: true,
      },
      update: {},
    });
  }

  async getUsageSnapshot(
    tenantId: string,
    module: string = PRESCRIBE,
    now = new Date(),
  ): Promise<EntitlementUsageSnapshot> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    if (!tenant) throw new NotFoundException('Pharmacy not found');

    const timezone = tenant.timezone?.trim() || DEFAULT_PHARMACY_TIMEZONE;
    let entitlement = await this.prisma.safeScribeEntitlement.findUnique({
      where: { tenantId_module: { tenantId, module } },
    });

    if (
      !entitlement &&
      (module === PRESCRIBE ||
        module === SAFESCRIBE_MODULES.RENEW ||
        (module === SAFESCRIBE_MODULES.ADAPT && this.isAdaptEnvironmentEnabled()))
    ) {
      await this.ensureDefaultModule(tenantId, module);
      entitlement = await this.prisma.safeScribeEntitlement.findUnique({
        where: { tenantId_module: { tenantId, module } },
      });
    }

    const period = entitlement?.period || ENTITLEMENT_PERIODS.DAILY;
    const window = usagePeriodWindow(now, timezone, period);
    const included = entitlement?.active === false ? 0 : entitlement?.includedQuantity ?? null;

    const used = entitlement
      ? await this.prisma.safeScribeUsageEvent.count({
          where: {
            tenantId,
            module,
            counted: true,
            occurredAt: { gte: window.start, lt: window.end },
          },
        })
      : 0;

    const { remaining, unlimited, allowed } = remainingAllowance(
      entitlement?.active === false ? 0 : included,
      used,
    );

    return {
      module,
      moduleLabel: moduleLabel(module),
      active: Boolean(entitlement?.active),
      period,
      included: entitlement?.active === false ? 0 : included,
      used,
      remaining,
      unlimited,
      allowed: Boolean(entitlement?.active) && allowed,
      timezone,
      periodStart: window.start.toISOString(),
      periodEnd: window.end.toISOString(),
      resetsAt: window.end.toISOString(),
    };
  }

  async listForTenant(tenantId: string): Promise<{
    timezone: string;
    entitlements: EntitlementUsageSnapshot[];
  }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    if (!tenant) throw new NotFoundException('Pharmacy not found');

    await this.ensureDefaultPrescribe(tenantId);
    await this.ensureDefaultRenew(tenantId);
    await this.ensureDefaultAdapt(tenantId);
    const rows = await this.prisma.safeScribeEntitlement.findMany({
      where: { tenantId },
      orderBy: { module: 'asc' },
    });

    const entitlements = await Promise.all(
      rows.map((row) => this.getUsageSnapshot(tenantId, row.module)),
    );

    return {
      timezone: tenant.timezone || DEFAULT_PHARMACY_TIMEZONE,
      entitlements,
    };
  }

  async updateTenantTimezone(tenantId: string, timezone: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Pharmacy not found');
    const tz = timezone.trim();
    if (!tz) throw new BadRequestException('Enter a timezone');
    try {
      Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
    } catch {
      throw new BadRequestException('That timezone is not valid');
    }
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { timezone: tz },
      select: { id: true, timezone: true, updatedAt: true },
    });
  }

  async upsertEntitlement(
    tenantId: string,
    module: string,
    dto: {
      includedQuantity?: number | null;
      period?: string;
      active?: boolean;
    },
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Pharmacy not found');

    const included =
      dto.includedQuantity === undefined
        ? undefined
        : dto.includedQuantity == null
          ? null
          : Math.max(0, Math.floor(dto.includedQuantity));

    await this.prisma.safeScribeEntitlement.upsert({
      where: { tenantId_module: { tenantId, module } },
      create: {
        tenantId,
        module,
        includedQuantity: included ?? DEFAULT_PRESCRIBE_DAILY_INCLUDED,
        period: dto.period ?? ENTITLEMENT_PERIODS.DAILY,
        active: dto.active ?? true,
      },
      update: {
        ...(included !== undefined ? { includedQuantity: included } : {}),
        ...(dto.period ? { period: dto.period } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });

    return this.getUsageSnapshot(tenantId, module);
  }

  /**
   * Count a genuine clinical assessment once per consultation.
   * Existing counted consultations are never blocked (in-progress work continues).
   */
  async assertAndCountAssessment(params: {
    tenantId: string | null | undefined;
    userId: string;
    consultationId: string;
    module?: string;
    alreadyStarted: boolean;
  }): Promise<EntitlementUsageSnapshot | null> {
    const tenantId = params.tenantId;
    if (!tenantId) return null;
    const module = params.module ?? PRESCRIBE;

    const existing = await this.prisma.safeScribeUsageEvent.findUnique({
      where: {
        consultationId_eventType: {
          consultationId: params.consultationId,
          eventType: USAGE_EVENT_TYPES.ASSESSMENT_STARTED,
        },
      },
    });
    if (existing || params.alreadyStarted) {
      return this.getUsageSnapshot(tenantId, module);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.safeScribeEntitlement.findUnique({
          where: { tenantId_module: { tenantId, module } },
        });
        if (!row) {
          await tx.safeScribeEntitlement.create({
            data: {
              tenantId,
              module,
              includedQuantity: DEFAULT_PRESCRIBE_DAILY_INCLUDED,
              period: ENTITLEMENT_PERIODS.DAILY,
              active: true,
            },
          });
        }

        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "SafeScribeEntitlement" WHERE "tenantId" = ${tenantId} AND "module" = ${module} FOR UPDATE`,
        );

        const entitlement = await tx.safeScribeEntitlement.findUnique({
          where: { tenantId_module: { tenantId, module } },
        });
        if (!entitlement?.active) {
          throw new ModuleNotEntitledException(module);
        }

        const tenant = await tx.tenant.findUnique({
          where: { id: tenantId },
          select: { timezone: true },
        });
        const timezone = tenant?.timezone?.trim() || DEFAULT_PHARMACY_TIMEZONE;
        const period = entitlement.period || ENTITLEMENT_PERIODS.DAILY;
        const included = entitlement.includedQuantity;
        const window = usagePeriodWindow(new Date(), timezone, period);

        const used = await tx.safeScribeUsageEvent.count({
          where: {
            tenantId,
            module,
            counted: true,
            occurredAt: { gte: window.start, lt: window.end },
          },
        });

        const allowance = remainingAllowance(included, used);
        if (!allowance.allowed) {
          const snapshot = await this.getUsageSnapshot(tenantId, module);
          throw new DailyLimitReachedException(snapshot);
        }

        await tx.safeScribeUsageEvent.create({
          data: {
            tenantId,
            userId: params.userId,
            module,
            consultationId: params.consultationId,
            eventType: USAGE_EVENT_TYPES.ASSESSMENT_STARTED,
            counted: true,
          },
        });

        return this.getUsageSnapshot(tenantId, module);
      });
    } catch (err) {
      if (
        err instanceof DailyLimitReachedException ||
        err instanceof ModuleNotEntitledException
      ) {
        throw err;
      }
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return this.getUsageSnapshot(tenantId, module);
      }
      throw err;
    }
  }

  async assertNewConsultationAllowed(tenantId: string | null | undefined, module: string = PRESCRIBE) {
    if (module === SAFESCRIBE_MODULES.RENEW && !this.isRenewEnvironmentEnabled()) {
      throw new ModuleNotEntitledException(module);
    }
    if (module === SAFESCRIBE_MODULES.ADAPT && !this.isAdaptEnvironmentEnabled()) {
      throw new ModuleNotEntitledException(module);
    }
    if (!tenantId) return;
    const snapshot = await this.getUsageSnapshot(tenantId, module);
    if (!snapshot.active) {
      throw new ModuleNotEntitledException(module);
    }
    if (!snapshot.allowed) {
      await this.audit.log({
        tenantId,
        action: ACCESS_DENIAL_CODES.DAILY_LIMIT_REACHED,
        module: 'ENTITLEMENTS',
        metadata: { usageModule: module, used: snapshot.used, included: snapshot.included },
      });
      throw new DailyLimitReachedException(snapshot);
    }
  }

  private composeSnapshot(params: {
    module: string;
    timezone: string;
    period: string;
    active: boolean;
    included: number | null;
    used: number;
    window: { start: Date; end: Date };
  }): EntitlementUsageSnapshot {
    const { remaining, unlimited, allowed } = remainingAllowance(
      params.active ? params.included : 0,
      params.used,
    );
    return {
      module: params.module,
      moduleLabel: moduleLabel(params.module),
      active: params.active,
      period: params.period,
      included: params.active ? params.included : 0,
      used: params.used,
      remaining,
      unlimited: params.active ? unlimited : false,
      allowed: params.active && allowed,
      timezone: params.timezone,
      periodStart: params.window.start.toISOString(),
      periodEnd: params.window.end.toISOString(),
      resetsAt: params.window.end.toISOString(),
    };
  }

  /**
   * One batched overview for Super Admin: group pharmacies by timezone/period
   * so usage counts are a handful of queries, not one per pharmacy.
   */
  async listPlatformUsageOverview(module: string = PRESCRIBE, now = new Date()) {
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        status: true,
        timezone: true,
        entitlements: {
          where: { module },
          select: { active: true, includedQuantity: true, period: true },
        },
        users: {
          where: { deletedAt: null, role: { name: ROLES.PHARMACIST_ADMIN } },
          take: 1,
          select: { firstName: true, lastName: true },
        },
      },
    });

    type WindowGroup = {
      start: Date;
      end: Date;
      timezone: string;
      period: string;
      tenantIds: string[];
    };
    const groups = new Map<string, WindowGroup>();

    for (const tenant of tenants) {
      const timezone = tenant.timezone?.trim() || DEFAULT_PHARMACY_TIMEZONE;
      const period = tenant.entitlements[0]?.period || ENTITLEMENT_PERIODS.DAILY;
      const window = usagePeriodWindow(now, timezone, period);
      const key = `${timezone}|${period}|${window.start.toISOString()}`;
      const existing = groups.get(key);
      if (existing) {
        existing.tenantIds.push(tenant.id);
      } else {
        groups.set(key, {
          start: window.start,
          end: window.end,
          timezone,
          period,
          tenantIds: [tenant.id],
        });
      }
    }

    const usedByTenant = new Map<string, number>();
    await Promise.all(
      [...groups.values()].map(async (group) => {
        if (!group.tenantIds.length) return;
        const counts = await this.prisma.safeScribeUsageEvent.groupBy({
          by: ['tenantId'],
          where: {
            tenantId: { in: group.tenantIds },
            module,
            counted: true,
            occurredAt: { gte: group.start, lt: group.end },
          },
          _count: { _all: true },
        });
        for (const row of counts) {
          usedByTenant.set(row.tenantId, row._count._all);
        }
      }),
    );

    const pharmacistCounts = tenants.length
      ? await this.prisma.user.groupBy({
          by: ['tenantId'],
          where: {
            deletedAt: null,
            tenantId: { in: tenants.map((tenant) => tenant.id) },
            role: { name: { in: [ROLES.PHARMACIST, ROLES.PHARMACIST_ADMIN] } },
          },
          _count: { _all: true },
        })
      : [];
    const pharmacistsByTenant = new Map(
      pharmacistCounts.map((row) => [row.tenantId, row._count._all]),
    );

    const pharmacies = tenants.map((tenant) => {
      const timezone = tenant.timezone?.trim() || DEFAULT_PHARMACY_TIMEZONE;
      const row = tenant.entitlements[0];
      const period = row?.period || ENTITLEMENT_PERIODS.DAILY;
      const window = usagePeriodWindow(now, timezone, period);
      const included = row?.includedQuantity ?? DEFAULT_PRESCRIBE_DAILY_INCLUDED;
      const active = row?.active ?? true;
      const used = usedByTenant.get(tenant.id) ?? 0;
      const snapshot = this.composeSnapshot({
        module,
        timezone,
        period,
        active,
        included,
        used,
        window,
      });
      const admin = tenant.users[0];
      return {
        tenantId: tenant.id,
        name: tenant.name,
        status: tenant.status,
        timezone,
        adminName: admin ? `${admin.firstName} ${admin.lastName}` : null,
        pharmacistCount: pharmacistsByTenant.get(tenant.id) ?? 0,
        snapshot,
        health: pharmacyUsageHealth(snapshot),
        utilizationPct: utilizationPercent(snapshot.used, snapshot.included),
      };
    });

    pharmacies.sort((a, b) => {
      const healthRank: Record<string, number> = {
        at_limit: 0,
        tight: 1,
        ok: 2,
        unlimited: 3,
        inactive: 4,
      };
      const ha = healthRank[a.health] ?? 9;
      const hb = healthRank[b.health] ?? 9;
      if (ha !== hb) return ha - hb;
      const ua = a.utilizationPct ?? -1;
      const ub = b.utilizationPct ?? -1;
      if (ua !== ub) return ub - ua;
      if (a.snapshot.used !== b.snapshot.used) return b.snapshot.used - a.snapshot.used;
      return a.name.localeCompare(b.name);
    });

    return {
      generatedAt: now.toISOString(),
      module,
      moduleLabel: moduleLabel(module),
      summary: {
        pharmacyCount: pharmacies.length,
        activeCount: pharmacies.filter((p) => p.snapshot.active).length,
        inactiveCount: pharmacies.filter((p) => !p.snapshot.active).length,
        assessmentsToday: pharmacies.reduce((sum, p) => sum + p.snapshot.used, 0),
        atLimitCount: pharmacies.filter((p) => p.health === 'at_limit').length,
        nearingLimitCount: pharmacies.filter((p) => p.health === 'tight').length,
      },
      pharmacies,
    };
  }

  async getPharmacyUsageAnalysis(tenantId: string, module: string = PRESCRIBE, now = new Date()) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, status: true, timezone: true },
    });
    if (!tenant) throw new NotFoundException('Pharmacy not found');

    const snapshot = await this.getUsageSnapshot(tenantId, module, now);
    const timezone = snapshot.timezone;
    const window = {
      start: new Date(snapshot.periodStart),
      end: new Date(snapshot.periodEnd),
    };

    const byUser = await this.prisma.safeScribeUsageEvent.groupBy({
      by: ['userId'],
      where: {
        tenantId,
        module,
        counted: true,
        occurredAt: { gte: window.start, lt: window.end },
      },
      _count: { _all: true },
    });

    const users = byUser.length
      ? await this.prisma.user.findMany({
          where: { id: { in: byUser.map((row) => row.userId) } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            status: true,
            role: { select: { name: true } },
          },
        })
      : [];
    const userById = new Map(users.map((user) => [user.id, user]));

    const pharmacists = byUser
      .map((row) => {
        const user = userById.get(row.userId);
        return {
          userId: row.userId,
          fullName: user ? `${user.firstName} ${user.lastName}` : 'Former user',
          role: user?.role.name ?? 'PHARMACIST',
          status: user?.status ?? 'SUSPENDED',
          used: row._count._all,
        };
      })
      .sort((a, b) => b.used - a.used || a.fullName.localeCompare(b.fullName));

    const trendStart = usagePeriodWindow(
      new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000),
      timezone,
      ENTITLEMENT_PERIODS.DAILY,
    ).start;
    const recent = await this.prisma.safeScribeUsageEvent.findMany({
      where: {
        tenantId,
        module,
        counted: true,
        occurredAt: { gte: trendStart, lt: now },
      },
      select: { occurredAt: true },
      orderBy: { occurredAt: 'asc' },
    });

    return {
      pharmacy: {
        id: tenant.id,
        name: tenant.name,
        status: tenant.status,
        timezone,
      },
      snapshot,
      pharmacists,
      trend: bucketCountsByLocalDate(
        recent.map((row) => row.occurredAt),
        timezone,
        7,
        now,
      ),
    };
  }
}

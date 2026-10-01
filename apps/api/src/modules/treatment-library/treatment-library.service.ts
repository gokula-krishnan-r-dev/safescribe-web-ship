import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TreatmentLibraryMatchStatus,
  TreatmentLibraryPopulation,
  TreatmentLibraryVersionStatus,
} from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { getClientInfo } from '@/common/utils/client-info';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import type { Request } from 'express';
import {
  buildTreatmentLibrarySearchText,
  resolvePathwayLibraryUsage,
  sanitizeTreatmentLibrarySearch,
  treatmentLibraryTabWhere,
  type TreatmentLibraryListTab,
} from '@safescript/shared';
import type {
  CreateTreatmentLibraryDto,
  ListTreatmentLibraryQueryDto,
  ReviewNotesDto,
  SaveTreatmentLibraryPayloadDto,
  SearchApprovedLibraryQueryDto,
  UpdateTreatmentLibraryVersionDto,
} from './treatment-library.dto';

type Payload = Record<string, unknown>;

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function hashPayload(payload: Payload): string {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash('sha256').update(canonical).digest('hex');
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return `${base || 'treatment'}-${randomBytes(3).toString('hex')}`;
}

@Injectable()
export class TreatmentLibraryService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async list(query: ListTreatmentLibraryQueryDto, user: RequestUser) {
    this.assertClinicalAccess(user);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const sort = query.sort ?? 'updatedAt';
    const order = query.order ?? 'desc';
    const search = sanitizeTreatmentLibrarySearch(query.search);
    const tab = (query.status ?? 'all') as TreatmentLibraryListTab;

    const scope: Prisma.TreatmentLibraryItemWhereInput = {
      OR: [{ tenantId: null }, ...(user.tenantId ? [{ tenantId: user.tenantId }] : [])],
    };
    const tabWhere = treatmentLibraryTabWhere(tab);
    const filters: Prisma.TreatmentLibraryItemWhereInput = {
      AND: [
        scope,
        tabWhere,
        query.population ? { population: query.population } : {},
        query.matchStatus ? { matchStatus: query.matchStatus } : {},
        query.form ? { productFormDisplay: { equals: query.form, mode: 'insensitive' } } : {},
        query.route ? { routeDisplay: { equals: query.route, mode: 'insensitive' } } : {},
        search
          ? {
              OR: [
                { searchText: { contains: search, mode: 'insensitive' } },
                { identifierText: { contains: search, mode: 'insensitive' } },
                { displayName: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };

    const orderBy: Prisma.TreatmentLibraryItemOrderByWithRelationInput[] = [
      { [sort]: order } as Prisma.TreatmentLibraryItemOrderByWithRelationInput,
      { id: 'asc' },
    ];

    const [total, items, all, approved, drafts, needsReview, formRows, routeRows, formRouteRows] =
      await Promise.all([
        this.prisma.treatmentLibraryItem.count({ where: filters }),
        this.prisma.treatmentLibraryItem.findMany({
          where: filters,
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            versions: {
              where: { status: 'IN_REVIEW' },
              orderBy: { versionNumber: 'desc' },
              take: 1,
              select: { id: true },
            },
          },
        }),
        this.prisma.treatmentLibraryItem.count({ where: scope }),
        this.prisma.treatmentLibraryItem.count({
          where: { AND: [scope, { listStatus: 'APPROVED' }] },
        }),
        this.prisma.treatmentLibraryItem.count({
          where: { AND: [scope, { listStatus: 'DRAFT' }] },
        }),
        this.prisma.treatmentLibraryItem.count({
          where: {
            AND: [scope, { listStatus: { in: ['IN_REVIEW', 'CHANGES_REQUESTED'] } }],
          },
        }),
        this.prisma.treatmentLibraryItem.findMany({
          where: { AND: [scope, { productFormDisplay: { not: '' } }] },
          distinct: ['productFormDisplay'],
          select: { productFormDisplay: true },
          take: 80,
        }),
        this.prisma.treatmentLibraryItem.findMany({
          where: { AND: [scope, { routeDisplay: { not: '' } }] },
          distinct: ['routeDisplay'],
          select: { routeDisplay: true },
          take: 80,
        }),
        this.prisma.treatmentLibraryItem.findMany({
          where: {
            AND: [
              scope,
              {
                OR: [
                  { productFormDisplay: { not: '' } },
                  { routeDisplay: { not: '' } },
                ],
              },
            ],
          },
          distinct: ['productFormDisplay', 'routeDisplay'],
          select: { productFormDisplay: true, routeDisplay: true },
          take: 120,
        }),
      ]);

    return {
      items: items.map((row) =>
        this.toListItem(row, row.versions[0]?.id ?? null),
      ),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      counts: { all, approved, drafts, needsReview },
      facets: {
        forms: formRows.map((r) => r.productFormDisplay).filter(Boolean).sort(),
        routes: routeRows.map((r) => r.routeDisplay).filter(Boolean).sort(),
        formRoutes: formRouteRows
          .map((r) => ({
            form: r.productFormDisplay,
            route: r.routeDisplay,
            label: [r.productFormDisplay, r.routeDisplay].filter(Boolean).join(' · '),
          }))
          .filter((r) => r.label)
          .sort((a, b) => a.label.localeCompare(b.label)),
      },
    };
  }

  async searchApproved(query: SearchApprovedLibraryQueryDto | string, user: RequestUser) {
    this.assertClinicalAccess(user);
    const params: SearchApprovedLibraryQueryDto =
      typeof query === 'string' ? { q: query } : query;
    const search = sanitizeTreatmentLibrarySearch(params.q);
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 20, 50);
    const scope: Prisma.TreatmentLibraryItemWhereInput = {
      isRetired: false,
      listStatus: 'APPROVED',
      currentApprovedVersionId: { not: null },
      OR: [{ tenantId: null }, ...(user.tenantId ? [{ tenantId: user.tenantId }] : [])],
      ...(params.treatmentType ? { category: params.treatmentType } : {}),
      ...(params.population ? { population: params.population } : {}),
      ...(params.form ? { productFormDisplay: { equals: params.form, mode: 'insensitive' } } : {}),
      ...(params.route ? { routeDisplay: { equals: params.route, mode: 'insensitive' } } : {}),
    };
    const where: Prisma.TreatmentLibraryItemWhereInput = search
      ? {
          AND: [
            scope,
            {
              OR: [
                { searchText: { contains: search, mode: 'insensitive' } },
                { identifierText: { contains: search, mode: 'insensitive' } },
                { displayName: { contains: search, mode: 'insensitive' } },
              ],
            },
          ],
        }
      : scope;

    const [total, items, formRouteRows] = await Promise.all([
      this.prisma.treatmentLibraryItem.count({ where }),
      this.prisma.treatmentLibraryItem.findMany({
        where,
        orderBy: [{ pathwayUsageCount: 'desc' }, { displayName: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.treatmentLibraryItem.findMany({
        where: {
          isRetired: false,
          listStatus: 'APPROVED',
          OR: [{ tenantId: null }, ...(user.tenantId ? [{ tenantId: user.tenantId }] : [])],
          ...(params.treatmentType ? { category: params.treatmentType } : {}),
        },
        distinct: ['productFormDisplay', 'routeDisplay'],
        select: { productFormDisplay: true, routeDisplay: true },
        take: 80,
      }),
    ]);

    let pathwayTreatments: Array<{
      id: string;
      treatmentLibraryItemId: string | null;
      sourceVersionNumber: number | null;
      genericName: string | null;
      route: string | null;
      productForm: string | null;
    }> = [];
    if (params.pathwayId) {
      const rows = await this.prisma.clinicalTreatment.findMany({
        where: { pathwayId: params.pathwayId, archivedAt: null },
        select: {
          id: true,
          treatmentLibraryItemId: true,
          sourceVersionNumber: true,
          genericName: true,
          route: true,
          metadata: true,
        },
        take: 400,
      });
      pathwayTreatments = rows.map((row) => {
        const meta = (row.metadata ?? {}) as Record<string, unknown>;
        return {
          id: row.id,
          treatmentLibraryItemId: row.treatmentLibraryItemId,
          sourceVersionNumber: row.sourceVersionNumber,
          genericName: row.genericName,
          route: row.route,
          productForm: typeof meta.productForm === 'string' ? meta.productForm : null,
        };
      });
    }

    return {
      items: items.map((row) => {
        const list = this.toListItem(row);
        return {
          ...list,
          itemId: row.id,
          approvedVersionId: row.currentApprovedVersionId,
          versionNumber: row.approvedVersionNumber ?? 1,
          treatmentType: list.category,
          strengthText: row.strength || undefined,
          populationLabel: row.population,
          regimenSummary: row.regimenLabel,
          medicationMatchStatus: row.matchStatus,
          currentPathwayUsage: resolvePathwayLibraryUsage(row, pathwayTreatments),
        };
      }),
      page,
      pageSize,
      total,
      filters: {
        formRoutes: formRouteRows
          .map((r) => ({
            form: r.productFormDisplay,
            route: r.routeDisplay,
            label: [r.productFormDisplay, r.routeDisplay].filter(Boolean).join(' · '),
          }))
          .filter((r) => r.label)
          .sort((a, b) => a.label.localeCompare(b.label)),
      },
    };
  }

  async reviewPayload(itemId: string, user: RequestUser) {
    this.assertClinicalAccess(user);
    const item = await this.loadItem(itemId);
    if (item.isRetired || item.listStatus !== 'APPROVED' || !item.currentApprovedVersionId) {
      throw new ConflictException('This library treatment is not an approved reusable version.');
    }
    const version = await this.prisma.treatmentLibraryVersion.findUnique({
      where: { id: item.currentApprovedVersionId },
    });
    if (!version || version.status !== 'APPROVED') {
      throw new ConflictException('The approved library version is no longer available.');
    }
    return {
      item: this.toListItem(item),
      workingVersion: this.toVersion(version),
      versions: [this.toVersion(version)],
    };
  }

  async get(itemId: string, user: RequestUser) {
    this.assertClinicalAccess(user);
    const item = await this.loadItem(itemId);
    const versions = await this.prisma.treatmentLibraryVersion.findMany({
      where: { itemId },
      orderBy: { versionNumber: 'desc' },
    });
    const working =
      versions.find((v) => v.status !== 'APPROVED' && v.status !== 'RETIRED') ??
      versions.find((v) => v.id === item.currentApprovedVersionId) ??
      versions[0];
    return {
      item: this.toListItem(item),
      workingVersion: working ? this.toVersion(working) : null,
      versions: versions.map((v) => this.toVersion(v)),
    };
  }

  async create(dto: CreateTreatmentLibraryDto, user: RequestUser, req?: Request) {
    this.assertClinicalAccess(user);
    const payload = this.normalizePayload(dto);
    const hash = hashPayload(payload);
    const denorm = this.denormFromPayload(payload);
    const item = await this.prisma.treatmentLibraryItem.create({
      data: {
        tenantId: user.role === 'SUPER_ADMIN' ? null : user.tenantId,
        stableKey: slugify(denorm.displayName),
        ...denorm,
        createdById: user.id,
        updatedById: user.id,
        versions: {
          create: {
            versionNumber: 1,
            status: 'DRAFT',
            payload: payload as Prisma.InputJsonValue,
            payloadHash: hash,
            createdById: user.id,
            updatedById: user.id,
          },
        },
      },
      include: { versions: true },
    });
    await this.auditSafe(user, req, 'CREATE', item.id, { displayName: denorm.displayName });
    return this.get(item.id, user);
  }

  async updateDraft(
    itemId: string,
    versionId: string,
    dto: UpdateTreatmentLibraryVersionDto,
    user: RequestUser,
    req?: Request,
  ) {
    this.assertClinicalAccess(user);
    const version = await this.loadVersion(itemId, versionId);
    if (version.status !== 'DRAFT' && version.status !== 'CHANGES_REQUESTED') {
      throw new ConflictException('Only draft versions can be edited.');
    }
    const payload = this.normalizePayload(dto, version.payload as Payload);
    const hash = hashPayload(payload);
    await this.prisma.$transaction([
      this.prisma.treatmentLibraryVersion.update({
        where: { id: version.id },
        data: {
          payload: payload as Prisma.InputJsonValue,
          payloadHash: hash,
          changeSummary: dto.changeSummary?.trim() || version.changeSummary,
          status: 'DRAFT',
          updatedById: user.id,
        },
      }),
      this.prisma.treatmentLibraryItem.update({
        where: { id: itemId },
        data: {
          ...this.denormFromPayload(payload),
          listStatus: 'DRAFT',
          updatedById: user.id,
        },
      }),
    ]);
    await this.auditSafe(user, req, 'UPDATE', itemId, { versionId });
    return this.get(itemId, user);
  }

  async validate(itemId: string, versionId: string, user: RequestUser) {
    this.assertClinicalAccess(user);
    const version = await this.loadVersion(itemId, versionId);
    return { checks: this.validationChecks(version.payload as Payload) };
  }

  async submitReview(itemId: string, versionId: string, user: RequestUser, req?: Request) {
    this.assertClinicalAccess(user);
    const version = await this.loadVersion(itemId, versionId);
    if (version.status !== 'DRAFT' && version.status !== 'CHANGES_REQUESTED') {
      throw new ConflictException('Only a draft can be submitted for review.');
    }
    const checks = this.validationChecks(version.payload as Payload);
    if (checks.some((c) => !c.ok)) {
      throw new BadRequestException({
        message: 'Resolve validation issues before submitting for review.',
        checks,
      });
    }
    await this.prisma.$transaction([
      this.prisma.treatmentLibraryVersion.update({
        where: { id: version.id },
        data: {
          status: 'IN_REVIEW',
          submittedById: user.id,
          submittedAt: new Date(),
          updatedById: user.id,
        },
      }),
      this.prisma.treatmentLibraryItem.update({
        where: { id: itemId },
        data: { listStatus: 'IN_REVIEW', updatedById: user.id },
      }),
    ]);
    await this.auditSafe(user, req, 'SUBMIT_REVIEW', itemId, { versionId });
    return this.get(itemId, user);
  }

  async requestChanges(
    itemId: string,
    versionId: string,
    dto: ReviewNotesDto,
    user: RequestUser,
    req?: Request,
  ) {
    this.assertClinicalAccess(user);
    const version = await this.loadVersion(itemId, versionId);
    if (version.status !== 'IN_REVIEW') {
      throw new ConflictException('Only in-review versions can be returned for changes.');
    }
    await this.prisma.$transaction([
      this.prisma.treatmentLibraryVersion.update({
        where: { id: version.id },
        data: {
          status: 'CHANGES_REQUESTED',
          reviewedById: user.id,
          reviewedAt: new Date(),
          reviewNotes: dto.reviewNotes?.trim() || null,
          updatedById: user.id,
        },
      }),
      this.prisma.treatmentLibraryItem.update({
        where: { id: itemId },
        data: { listStatus: 'CHANGES_REQUESTED', updatedById: user.id },
      }),
    ]);
    await this.auditSafe(user, req, 'REQUEST_CHANGES', itemId, { versionId });
    return this.get(itemId, user);
  }

  async approve(itemId: string, versionId: string, user: RequestUser, req?: Request) {
    this.assertClinicalAccess(user);
    const version = await this.loadVersion(itemId, versionId);
    if (version.status !== 'IN_REVIEW') {
      throw new ConflictException('Only in-review versions can be approved.');
    }
    const checks = this.validationChecks(version.payload as Payload);
    if (checks.some((c) => !c.ok)) {
      throw new BadRequestException({
        message: 'This version is not ready for approval.',
        checks,
      });
    }
    const payload = version.payload as Payload;
    await this.prisma.$transaction([
      this.prisma.treatmentLibraryVersion.update({
        where: { id: version.id },
        data: {
          status: 'APPROVED',
          reviewedById: user.id,
          reviewedAt: new Date(),
          updatedById: user.id,
        },
      }),
      this.prisma.treatmentLibraryItem.update({
        where: { id: itemId },
        data: {
          ...this.denormFromPayload(payload),
          currentApprovedVersionId: version.id,
          approvedVersionNumber: version.versionNumber,
          listStatus: 'APPROVED',
          isRetired: false,
          updatedById: user.id,
        },
      }),
    ]);
    await this.auditSafe(user, req, 'APPROVE', itemId, {
      versionId,
      versionNumber: version.versionNumber,
    });
    return this.get(itemId, user);
  }

  async createNewVersion(itemId: string, user: RequestUser, req?: Request) {
    this.assertClinicalAccess(user);
    const item = await this.loadItem(itemId);
    if (item.isRetired) throw new ConflictException('Retired treatments cannot be versioned.');
    const existingDraft = await this.prisma.treatmentLibraryVersion.findFirst({
      where: { itemId, status: { in: ['DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED'] } },
    });
    if (existingDraft) {
      throw new ConflictException('A draft version already exists for this treatment.');
    }
    const source =
      (item.currentApprovedVersionId
        ? await this.prisma.treatmentLibraryVersion.findUnique({
            where: { id: item.currentApprovedVersionId },
          })
        : null) ??
      (await this.prisma.treatmentLibraryVersion.findFirst({
        where: { itemId },
        orderBy: { versionNumber: 'desc' },
      }));
    if (!source) throw new NotFoundException('No source version to clone.');
    const latest = await this.prisma.treatmentLibraryVersion.findFirst({
      where: { itemId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });
    const created = await this.prisma.treatmentLibraryVersion.create({
      data: {
        itemId,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        status: 'DRAFT',
        payload: source.payload as Prisma.InputJsonValue,
        payloadHash: source.payloadHash,
        createdById: user.id,
        updatedById: user.id,
      },
    });
    await this.prisma.treatmentLibraryItem.update({
      where: { id: itemId },
      data: { listStatus: 'DRAFT', updatedById: user.id },
    });
    await this.auditSafe(user, req, 'CREATE_VERSION', itemId, { versionId: created.id });
    return this.get(itemId, user);
  }

  async retire(itemId: string, user: RequestUser, req?: Request) {
    this.assertClinicalAccess(user);
    const item = await this.loadItem(itemId);
    await this.prisma.treatmentLibraryItem.update({
      where: { id: item.id },
      data: { isRetired: true, listStatus: 'RETIRED', updatedById: user.id },
    });
    await this.auditSafe(user, req, 'RETIRE', itemId, {});
    return this.get(itemId, user);
  }

  async usage(itemId: string, user: RequestUser) {
    this.assertClinicalAccess(user);
    await this.loadItem(itemId);
    const rows = await this.prisma.clinicalTreatment.findMany({
      where: { treatmentLibraryItemId: itemId, libraryLinkStatus: 'LINKED' },
      include: {
        pathway: { select: { id: true, name: true, province: true, status: true, version: true } },
        treatmentLibraryVersion: { select: { versionNumber: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    const item = await this.loadItem(itemId);
    return {
      items: rows.map((row) => ({
        pathwayId: row.pathwayId,
        pathwayName: row.pathway.name,
        province: row.pathway.province,
        pathwayStatus: row.pathway.status,
        pathwayTreatmentId: row.id,
        sourceVersionNumber: row.sourceVersionNumber,
        hasUpdateAvailable:
          Boolean(item.approvedVersionNumber) &&
          (row.sourceVersionNumber ?? 0) < (item.approvedVersionNumber ?? 0),
      })),
    };
  }

  private validationChecks(payload: Payload) {
    const regimens = Array.isArray(payload.regimens) ? payload.regimens : [];
    const medication = (payload.medication ?? {}) as Record<string, unknown>;
    const category = asString(payload.category) || 'PRESCRIPTION';
    const match = asString(payload.matchStatus) || 'UNMATCHED';
    const safety = (payload.safety ?? {}) as Record<string, unknown>;
    const checks: Array<{ id: string; label: string; ok: boolean; detail?: string }> = [
      { id: 'name', label: 'Treatment name', ok: Boolean(asString(payload.displayName)) },
      { id: 'population', label: 'Population', ok: Boolean(asString(payload.population)) },
      {
        id: 'form',
        label: 'Product form',
        ok: Boolean(asString(payload.productFormDisplay)),
      },
      { id: 'route', label: 'Route', ok: Boolean(asString(payload.routeDisplay)) },
      { id: 'regimen', label: 'At least one regimen line', ok: regimens.length > 0 },
      {
        id: 'directions',
        label: 'Patient directions',
        ok: Boolean(asString(payload.directions)),
      },
    ];
    if (category === 'PRESCRIPTION' || category === 'OTC') {
      checks.push({
        id: 'generic',
        label: 'Canonical generic name',
        ok: Boolean(asString(payload.genericName) || asString(medication.genericName)),
      });
      checks.push({
        id: 'match',
        label: 'Medication match',
        ok: match === 'MATCHED',
        detail: match === 'MATCHED' ? undefined : 'Match must be complete before approval.',
      });
    }
    for (const flag of ['renalAdjustment', 'hepaticAdjustment', 'pregnancyConsideration', 'lactationConsideration', 'labMonitoringNeeded'] as const) {
      if (safety[flag] === true && !asString(safety[`${flag}Reason`] ?? safety.renalReason)) {
        checks.push({
          id: flag,
          label: `Reason for ${flag}`,
          ok: false,
          detail: 'A reason is required when this safety flag is Yes.',
        });
      }
    }
    return checks;
  }

  private normalizePayload(
    dto: SaveTreatmentLibraryPayloadDto,
    previous: Payload = {},
  ): Payload {
    return {
      ...previous,
      category: dto.category ?? previous.category ?? 'PRESCRIPTION',
      displayName: dto.displayName.trim(),
      genericName: dto.genericName?.trim() ?? previous.genericName ?? '',
      brandName: dto.brandName?.trim() ?? previous.brandName ?? '',
      strength: dto.strength?.trim() ?? previous.strength ?? '',
      population: dto.population ?? previous.population ?? 'ADULT',
      matchStatus: dto.matchStatus ?? previous.matchStatus ?? 'UNMATCHED',
      productFormDisplay: dto.productFormDisplay?.trim() ?? previous.productFormDisplay ?? '',
      routeDisplay: dto.routeDisplay?.trim() ?? previous.routeDisplay ?? '',
      regimenLabel: dto.regimenLabel?.trim() ?? previous.regimenLabel ?? '',
      medication: dto.medication ?? previous.medication ?? {},
      regimens: dto.regimens ?? previous.regimens ?? [],
      directions: dto.directions ?? previous.directions ?? '',
      clinicalNotes: dto.clinicalNotes ?? previous.clinicalNotes ?? '',
      eligibility: dto.eligibility ?? previous.eligibility ?? '',
      safety: dto.safety ?? previous.safety ?? {},
      extras: dto.extras ?? previous.extras ?? {},
    };
  }

  private denormFromPayload(payload: Payload) {
    const medication = (payload.medication ?? {}) as Record<string, unknown>;
    const regimens = Array.isArray(payload.regimens) ? payload.regimens : [];
    const first = (regimens[0] ?? {}) as Record<string, unknown>;
    const displayName = asString(payload.displayName);
    const genericName = asString(payload.genericName) || asString(medication.genericName);
    const brandName = asString(payload.brandName) || asString(medication.brandName);
    const strength = asString(payload.strength) || asString(medication.strengthText);
    const productFormDisplay =
      asString(payload.productFormDisplay) || asString(first.productFormDisplay);
    const routeDisplay = asString(payload.routeDisplay) || asString(first.routeDisplay);
    const regimenLabel =
      asString(payload.regimenLabel) ||
      asString(first.label) ||
      [asString(first.frequencyDisplay), asString(first.doseText)].filter(Boolean).join(' · ');
    const identifiers = [
      asString(medication.ccddMedicationId),
      asString(medication.dpdProductId),
      asString(medication.din),
    ].filter(Boolean);
    return {
      displayName,
      genericName,
      brandName,
      strength,
      productFormDisplay,
      routeDisplay,
      regimenLabel,
      category: asString(payload.category) || 'PRESCRIPTION',
      population: (asString(payload.population) || 'ADULT') as TreatmentLibraryPopulation,
      matchStatus: (asString(payload.matchStatus) || 'UNMATCHED') as TreatmentLibraryMatchStatus,
      searchText: buildTreatmentLibrarySearchText({
        displayName,
        genericName,
        brandName,
        strength,
        productFormDisplay,
        routeDisplay,
        regimenLabel,
        ingredientName: asString(medication.genericName),
      }),
      identifierText: identifiers.join(' ').toLowerCase(),
    };
  }

  private toListItem(
    row: {
      id: string;
      displayName: string;
      genericName: string;
      brandName: string;
      strength: string;
      productFormDisplay: string;
      routeDisplay: string;
      regimenLabel: string;
      category?: string;
      population: TreatmentLibraryPopulation;
      matchStatus: TreatmentLibraryMatchStatus;
      listStatus: TreatmentLibraryVersionStatus;
      approvedVersionNumber: number | null;
      isRetired: boolean;
      pathwayUsageCount: number;
      currentApprovedVersionId: string | null;
      updatedAt: Date;
      createdAt: Date;
    },
    pendingReviewVersionId: string | null = null,
  ) {
    const status = row.isRetired ? 'RETIRED' : row.listStatus;
    return {
      id: row.id,
      displayName: row.displayName,
      genericName: row.genericName,
      brandName: row.brandName,
      strength: row.strength,
      productFormDisplay: row.productFormDisplay,
      routeDisplay: row.routeDisplay,
      regimenLabel: row.regimenLabel,
      category: row.category || 'PRESCRIPTION',
      population: row.population,
      matchStatus: row.matchStatus,
      status,
      approvedVersionNumber: row.approvedVersionNumber,
      currentApprovedVersionId: row.currentApprovedVersionId,
      pendingReviewVersionId: status === 'IN_REVIEW' ? pendingReviewVersionId : null,
      isRetired: row.isRetired,
      pathwayUsageCount: row.pathwayUsageCount,
      updatedAt: row.updatedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toVersion(row: {
    id: string;
    itemId: string;
    versionNumber: number;
    status: TreatmentLibraryVersionStatus;
    payload: Prisma.JsonValue;
    payloadHash: string;
    changeSummary: string | null;
    submittedById: string | null;
    submittedAt: Date | null;
    reviewedById: string | null;
    reviewedAt: Date | null;
    reviewNotes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      itemId: row.itemId,
      versionNumber: row.versionNumber,
      status: row.status,
      payload: row.payload,
      payloadHash: row.payloadHash,
      changeSummary: row.changeSummary,
      submittedById: row.submittedById,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      reviewedById: row.reviewedById,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      reviewNotes: row.reviewNotes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async loadItem(itemId: string) {
    const item = await this.prisma.treatmentLibraryItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Treatment library item not found');
    return item;
  }

  private async loadVersion(itemId: string, versionId: string) {
    const version = await this.prisma.treatmentLibraryVersion.findFirst({
      where: { id: versionId, itemId },
    });
    if (!version) throw new NotFoundException('Treatment library version not found');
    return version;
  }

  private assertClinicalAccess(user: RequestUser) {
    if (user.role === 'SUPER_ADMIN') return;
    throw new ForbiddenException('Treatment Library is managed from the clinical platform.');
  }

  private async auditSafe(
    user: RequestUser,
    req: Request | undefined,
    action: string,
    itemId: string,
    metadata: Record<string, unknown>,
  ) {
    const client = req ? getClientInfo(req) : {};
    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action,
      module: 'TREATMENT_LIBRARY',
      metadata: { itemId, ...metadata },
      ...client,
    });
  }
}

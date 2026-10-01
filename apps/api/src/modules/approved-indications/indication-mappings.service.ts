import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import { getClientInfo } from '@/common/utils/client-info';
import { CcdDFhirClient } from '@/modules/terminology/providers/ccdd/ccdd.client';
import {
  SNOMED_CLINICAL_FINDING_ECL,
  SNOMED_SYSTEM,
} from '@/modules/terminology/providers/ccdd/ccdd.constants';
import type {
  CreateGovernedMappingDto,
  ListCandidatesQueryDto,
  ListGovernedMappingsQueryDto,
  ReviewCandidateDto,
  UpdateGovernedMappingDto,
} from './approved-indications.dto';

const AUDIT_MODULE = 'APPROVED_INDICATIONS';

const MAPPING_LEVELS = new Set([
  'therapeutic_moiety',
  'ingredient',
  'ingredient_combination',
  'clinical_drug',
  'product',
]);

const RELATIONSHIPS = new Set([
  'approved_indication',
  'guideline_supported',
  'off_label',
  'other',
]);

const JURISDICTIONS = new Set(['CA', 'AB', 'BC', 'ON', 'MB', 'SK']);

function snomedConditionCode(conceptId: string): string {
  return `SNOMED_${conceptId}`;
}

function relationshipFromLegacyStrength(strength: string): string {
  if (strength === 'primary') return 'approved_indication';
  if (strength === 'common') return 'guideline_supported';
  if (strength === 'possible' || strength === 'rare') return 'other';
  return 'approved_indication';
}

@Injectable()
export class IndicationMappingsService {
  private readonly logger = new Logger(IndicationMappingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly fhir: CcdDFhirClient | null,
  ) {}

  async searchSnomed(q: string, limit = 12) {
    const query = q.trim();
    if (query.length < 2 || !this.fhir) return [];
    try {
      const hits = await this.fhir.expandValueSet(
        SNOMED_CLINICAL_FINDING_ECL,
        query,
        Math.min(limit, 24),
      );
      return hits
        .filter((hit) => hit.code && hit.display)
        .map((hit) => ({
          conceptId: hit.code!,
          displayName: hit.display!,
          system: SNOMED_SYSTEM,
        }));
    } catch (error) {
      this.logger.warn(
        `SNOMED search failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  async listMappings(query: ListGovernedMappingsQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const q = query.q?.trim() ?? '';
    const status =
      query.status === 'all'
        ? undefined
        : query.status === 'retired'
          ? 'retired'
          : 'approved';

    const where: Prisma.MedicationIndicationMappingWhereInput = {
      ...(status ? { status } : {}),
      ...(query.jurisdiction && query.jurisdiction !== 'all'
        ? { jurisdiction: query.jurisdiction.toUpperCase() }
        : {}),
      ...(query.relationship && query.relationship !== 'all'
        ? { relationshipType: query.relationship }
        : {}),
      ...(query.level && query.level !== 'all'
        ? { medicationMappingLevel: query.level }
        : {}),
      ...(q
        ? {
            OR: [
              { medicationDisplayName: { contains: q, mode: 'insensitive' } },
              { medicationConceptId: { contains: q, mode: 'insensitive' } },
              { indicationDisplayName: { contains: q, mode: 'insensitive' } },
              { indicationConceptId: { contains: q, mode: 'insensitive' } },
              { sourceLabel: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.medicationIndicationMapping.count({ where }),
      this.prisma.medicationIndicationMapping.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { medicationDisplayName: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: rows.map((row) => this.toMappingDto(row)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async getMapping(id: string) {
    const row = await this.prisma.medicationIndicationMapping.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Mapping not found');
    return this.toMappingDto(row);
  }

  async createMapping(dto: CreateGovernedMappingDto, user: RequestUser, req: Request) {
    this.validateMappingDto(dto);

    const medicationConceptId = dto.medicationConceptId.trim().toLowerCase();
    const indicationConceptId = dto.indicationConceptId.trim();
    const medicationDisplayName = dto.medicationDisplayName.trim();
    const indicationDisplayName = dto.indicationDisplayName.trim();
    const jurisdiction = dto.jurisdiction.toUpperCase();

    const existing = await this.prisma.medicationIndicationMapping.findFirst({
      where: {
        medicationConceptId,
        medicationMappingLevel: dto.medicationMappingLevel,
        indicationConceptId,
        relationshipType: dto.relationshipType,
        jurisdiction,
        status: 'approved',
      },
    });
    if (existing) {
      throw new BadRequestException('This mapping already exists.');
    }

    const legacyConditionId = await this.ensureLegacyCondition(
      indicationConceptId,
      indicationDisplayName,
    );
    await this.ensureLegacyMap(
      medicationConceptId,
      medicationDisplayName,
      legacyConditionId,
      dto.relationshipType,
    );

    const row = await this.prisma.medicationIndicationMapping.create({
      data: {
        medicationConceptId,
        medicationDisplayName,
        medicationMappingLevel: dto.medicationMappingLevel,
        indicationConceptId,
        indicationDisplayName,
        relationshipType: dto.relationshipType,
        jurisdiction,
        sourceReferenceId: dto.sourceReferenceId?.trim() || null,
        sourceLabel: dto.sourceLabel?.trim() || null,
        notes: dto.notes?.trim() || null,
        status: 'approved',
        createdById: user.id,
        approvedById: user.id,
        updatedById: user.id,
        legacyConditionId,
      },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'indication_mapping_created',
      module: AUDIT_MODULE,
      ...getClientInfo(req),
      newValue: this.toMappingDto(row),
    });

    return this.toMappingDto(row);
  }

  async updateMapping(
    id: string,
    dto: UpdateGovernedMappingDto,
    user: RequestUser,
    req: Request,
  ) {
    const current = await this.prisma.medicationIndicationMapping.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Mapping not found');
    if (current.status === 'retired') {
      throw new BadRequestException('Retired mappings cannot be edited. Create a new mapping.');
    }

    if (dto.medicationMappingLevel && !MAPPING_LEVELS.has(dto.medicationMappingLevel)) {
      throw new BadRequestException('Invalid mapping level.');
    }
    if (dto.relationshipType && !RELATIONSHIPS.has(dto.relationshipType)) {
      throw new BadRequestException('Invalid relationship type.');
    }
    if (dto.jurisdiction && !JURISDICTIONS.has(dto.jurisdiction.toUpperCase())) {
      throw new BadRequestException('Invalid jurisdiction.');
    }

    const identityChanging =
      (dto.medicationConceptId &&
        dto.medicationConceptId.trim() !== current.medicationConceptId) ||
      (dto.indicationConceptId &&
        dto.indicationConceptId.trim() !== current.indicationConceptId);

    if (identityChanging) {
      throw new BadRequestException(
        'Changing medication or indication identity requires retiring this mapping and creating a new one.',
      );
    }

    const row = await this.prisma.medicationIndicationMapping.update({
      where: { id },
      data: {
        ...(dto.medicationDisplayName !== undefined && {
          medicationDisplayName: dto.medicationDisplayName.trim(),
        }),
        ...(dto.medicationMappingLevel !== undefined && {
          medicationMappingLevel: dto.medicationMappingLevel,
        }),
        ...(dto.indicationDisplayName !== undefined && {
          indicationDisplayName: dto.indicationDisplayName.trim(),
        }),
        ...(dto.relationshipType !== undefined && {
          relationshipType: dto.relationshipType,
        }),
        ...(dto.jurisdiction !== undefined && {
          jurisdiction: dto.jurisdiction.toUpperCase(),
        }),
        ...(dto.sourceReferenceId !== undefined && {
          sourceReferenceId: dto.sourceReferenceId?.trim() || null,
        }),
        ...(dto.sourceLabel !== undefined && {
          sourceLabel: dto.sourceLabel?.trim() || null,
        }),
        ...(dto.notes !== undefined && { notes: dto.notes?.trim() || null }),
        mappingVersion: { increment: 1 },
        updatedById: user.id,
      },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'indication_mapping_updated',
      module: AUDIT_MODULE,
      ...getClientInfo(req),
      previousValue: this.toMappingDto(current),
      newValue: this.toMappingDto(row),
    });

    return this.toMappingDto(row);
  }

  async retireMapping(id: string, user: RequestUser, req: Request) {
    const current = await this.prisma.medicationIndicationMapping.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Mapping not found');
    if (current.status === 'retired') return this.toMappingDto(current);

    const now = new Date();
    const row = await this.prisma.medicationIndicationMapping.update({
      where: { id },
      data: {
        status: 'retired',
        validTo: now,
        retiredAt: now,
        retiredById: user.id,
        updatedById: user.id,
        mappingVersion: { increment: 1 },
      },
    });

    if (current.legacyConditionId) {
      await this.prisma.renewMedicationIndicationMap.updateMany({
        where: {
          medicationConceptId: current.medicationConceptId.toLowerCase(),
          conditionId: current.legacyConditionId,
          active: true,
        },
        data: { active: false },
      });
    }

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'indication_mapping_retired',
      module: AUDIT_MODULE,
      ...getClientInfo(req),
      previousValue: this.toMappingDto(current),
      newValue: this.toMappingDto(row),
    });

    return this.toMappingDto(row);
  }

  async listCandidates(query: ListCandidatesQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const status = query.status === 'all' ? undefined : query.status ?? 'pending';
    const q = query.q?.trim() ?? '';

    const where: Prisma.MedicationIndicationCandidateWhereInput = {
      ...(status ? { status } : {}),
      ...(query.jurisdiction && query.jurisdiction !== 'all'
        ? { jurisdiction: query.jurisdiction.toUpperCase() }
        : {}),
      ...(query.sourceType && query.sourceType !== 'all'
        ? { sourceType: query.sourceType }
        : {}),
      ...(q
        ? {
            OR: [
              { medicationDisplayName: { contains: q, mode: 'insensitive' } },
              { medicationConceptId: { contains: q, mode: 'insensitive' } },
              { indicationDisplayName: { contains: q, mode: 'insensitive' } },
              { indicationConceptId: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.medicationIndicationCandidate.count({ where }),
      this.prisma.medicationIndicationCandidate.findMany({
        where,
        orderBy: [{ lastSeenAt: 'desc' }, { usageCount: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: rows.map((row) => this.toCandidateDto(row)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async reviewCandidate(
    id: string,
    dto: ReviewCandidateDto,
    user: RequestUser,
    req: Request,
  ) {
    const candidate = await this.prisma.medicationIndicationCandidate.findUnique({
      where: { id },
    });
    if (!candidate) throw new NotFoundException('Candidate not found');
    if (candidate.status !== 'pending') {
      throw new BadRequestException('Only pending candidates can be reviewed.');
    }

    if (dto.action === 'reject') {
      const row = await this.prisma.medicationIndicationCandidate.update({
        where: { id },
        data: {
          status: 'rejected',
          reviewedById: user.id,
          reviewedAt: new Date(),
          reviewNotes: dto.reviewNotes?.trim() || null,
        },
      });
      await this.audit.log({
        userId: user.id,
        tenantId: user.tenantId ?? null,
        action: 'indication_candidate_rejected',
        module: AUDIT_MODULE,
        ...getClientInfo(req),
        newValue: this.toCandidateDto(row),
      });
      return this.toCandidateDto(row);
    }

    let mapping: Awaited<ReturnType<IndicationMappingsService['createMapping']>>;
    try {
      mapping = await this.createMapping(
        {
          medicationConceptId: candidate.medicationConceptId,
          medicationDisplayName:
            candidate.medicationDisplayName || candidate.medicationConceptId,
          medicationMappingLevel:
            candidate.medicationMappingLevel as CreateGovernedMappingDto['medicationMappingLevel'],
          indicationConceptId: candidate.indicationConceptId,
          indicationDisplayName: candidate.indicationDisplayName,
          relationshipType: (candidate.relationshipTypeSuggested ||
            'approved_indication') as CreateGovernedMappingDto['relationshipType'],
          jurisdiction: candidate.jurisdiction as CreateGovernedMappingDto['jurisdiction'],
          sourceReferenceId: candidate.sourceReferenceId,
          notes: dto.reviewNotes,
        },
        user,
        req,
      );
    } catch (error) {
      if (!(error instanceof BadRequestException)) throw error;
      // Mapping may already exist from a parallel approve — attach to it.
      const existing = await this.prisma.medicationIndicationMapping.findFirst({
        where: {
          medicationConceptId: candidate.medicationConceptId.trim().toLowerCase(),
          medicationMappingLevel: candidate.medicationMappingLevel,
          indicationConceptId: candidate.indicationConceptId,
          relationshipType:
            candidate.relationshipTypeSuggested || 'approved_indication',
          jurisdiction: candidate.jurisdiction.toUpperCase(),
          status: 'approved',
        },
      });
      if (!existing) throw error;
      mapping = this.toMappingDto(existing);
    }

    const row = await this.prisma.medicationIndicationCandidate.update({
      where: { id },
      data: {
        status: 'accepted',
        reviewedById: user.id,
        reviewedAt: new Date(),
        reviewNotes: dto.reviewNotes?.trim() || null,
        promotedMappingId: mapping.id,
      },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'indication_candidate_approved',
      module: AUDIT_MODULE,
      ...getClientInfo(req),
      newValue: { candidate: this.toCandidateDto(row), mapping },
    });

    return this.toCandidateDto(row);
  }

  /**
   * Upsert a platform review-queue candidate from Adapt pharmacist SNOMED selection.
   */
  async observePharmacistCandidate(input: {
    medicationConceptId: string;
    medicationDisplayName?: string | null;
    medicationMappingLevel?: string;
    indicationConceptId: string;
    indicationDisplayName: string;
    jurisdiction?: string | null;
  }) {
    const medicationConceptId = input.medicationConceptId.trim().toLowerCase();
    const indicationConceptId = input.indicationConceptId.trim();
    if (!medicationConceptId || !indicationConceptId) return null;

    const level = input.medicationMappingLevel || 'ingredient';
    const jurisdiction = (input.jurisdiction || 'CA').toUpperCase();
    const now = new Date();
    const displayName = input.indicationDisplayName.trim();
    const medDisplay = input.medicationDisplayName?.trim() || null;

    try {
      const existing = await this.prisma.medicationIndicationCandidate.findUnique({
        where: {
          medicationConceptId_medicationMappingLevel_indicationConceptId_jurisdiction: {
            medicationConceptId,
            medicationMappingLevel: level,
            indicationConceptId,
            jurisdiction,
          },
        },
      });

      // Do not reopen accepted/rejected candidates — only bump usage for analytics.
      if (existing && existing.status !== 'pending') {
        return this.prisma.medicationIndicationCandidate.update({
          where: { id: existing.id },
          data: {
            usageCount: { increment: 1 },
            lastSeenAt: now,
            ...(medDisplay ? { medicationDisplayName: medDisplay } : {}),
            indicationDisplayName: displayName,
          },
        });
      }

      return await this.prisma.medicationIndicationCandidate.upsert({
        where: {
          medicationConceptId_medicationMappingLevel_indicationConceptId_jurisdiction: {
            medicationConceptId,
            medicationMappingLevel: level,
            indicationConceptId,
            jurisdiction,
          },
        },
        create: {
          medicationConceptId,
          medicationDisplayName: medDisplay,
          medicationMappingLevel: level,
          indicationConceptId,
          indicationDisplayName: displayName,
          sourceType: 'pharmacist_selection',
          jurisdiction,
          usageCount: 1,
          firstSeenAt: now,
          lastSeenAt: now,
          status: 'pending',
        },
        update: {
          usageCount: { increment: 1 },
          lastSeenAt: now,
          medicationDisplayName: medDisplay || undefined,
          indicationDisplayName: displayName,
          status: 'pending',
        },
      });
    } catch (error) {
      this.logger.warn(
        `Candidate upsert failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  async coverage() {
    const [
      approvedRelationships,
      pendingRelationships,
      retiredRelationships,
      distinctMedsWithMaps,
      distinctMedsPending,
      legacyMaps,
    ] = await Promise.all([
      this.prisma.medicationIndicationMapping.count({ where: { status: 'approved' } }),
      this.prisma.medicationIndicationCandidate.count({ where: { status: 'pending' } }),
      this.prisma.medicationIndicationMapping.count({ where: { status: 'retired' } }),
      this.prisma.medicationIndicationMapping.findMany({
        where: { status: 'approved' },
        distinct: ['medicationConceptId'],
        select: { medicationConceptId: true },
      }),
      this.prisma.medicationIndicationCandidate.findMany({
        where: { status: 'pending' },
        distinct: ['medicationConceptId'],
        select: { medicationConceptId: true },
      }),
      this.prisma.renewMedicationIndicationMap.findMany({
        where: { active: true },
        distinct: ['medicationConceptId'],
        select: { medicationConceptId: true },
      }),
    ]);

    const approvedMedSet = new Set(distinctMedsWithMaps.map((r) => r.medicationConceptId));
    const pendingMedSet = new Set(distinctMedsPending.map((r) => r.medicationConceptId));
    const encountered = new Set([
      ...approvedMedSet,
      ...pendingMedSet,
      ...legacyMaps.map((r) => r.medicationConceptId),
    ]);

    const withApprovedMappings = approvedMedSet.size;
    const needsReview = [...pendingMedSet].filter((id) => !approvedMedSet.has(id)).length;
    const noApprovedMappings = Math.max(0, encountered.size - withApprovedMappings);

    return {
      medicationsEncountered: encountered.size,
      withApprovedMappings,
      needsReview,
      noApprovedMappings,
      pendingRelationships,
      approvedRelationships,
      retiredRelationships,
    };
  }

  async listVersions() {
    const rows = await this.prisma.medicationIndicationRepositoryVersion.findMany({
      orderBy: { publishedAt: 'desc' },
      take: 50,
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        versionCode: row.versionCode,
        publishedAt: row.publishedAt.toISOString(),
        publishedById: row.publishedById,
        changeSummary: row.changeSummary,
        status: row.status,
        mappingsAdded: row.mappingsAdded,
        mappingsUpdated: row.mappingsUpdated,
        mappingsRetired: row.mappingsRetired,
      })),
    };
  }

  async publishVersion(user: RequestUser, req: Request, changeSummary?: string) {
    const now = new Date();
    const versionCode = `${now.getUTCFullYear()}.${String(now.getUTCMonth() + 1).padStart(2, '0')}.${now.getUTCDate()}.${now.getUTCHours()}${now.getUTCMinutes()}`;
    const coverage = await this.coverage();
    const row = await this.prisma.medicationIndicationRepositoryVersion.create({
      data: {
        versionCode,
        publishedById: user.id,
        changeSummary: changeSummary?.trim() || null,
        status: 'published',
        mappingsAdded: coverage.approvedRelationships,
        mappingsUpdated: 0,
        mappingsRetired: coverage.retiredRelationships,
      },
    });
    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'indication_repository_version_published',
      module: AUDIT_MODULE,
      ...getClientInfo(req),
      newValue: row,
    });
    return row;
  }

  /**
   * Idempotent bootstrap: promote active RenewMedicationIndicationMap rows into
   * the governed Approved Indications repository (MedicationIndicationMapping).
   * Requires RenewCondition.externalCode (SNOMED CT) to be populated.
   */
  async bootstrapFromLegacyLibrary(opts: { actorUserId?: string | null } = {}) {
    const legacyMaps = await this.prisma.renewMedicationIndicationMap.findMany({
      where: { active: true },
      include: {
        condition: {
          select: {
            id: true,
            code: true,
            displayName: true,
            externalCode: true,
            codeSystem: true,
            active: true,
          },
        },
      },
    });

    let created = 0;
    let skippedExisting = 0;
    let skippedNoSnomed = 0;
    let skippedOther = 0;

    for (const map of legacyMaps) {
      const condition = map.condition;
      if (!condition?.active || condition.code === 'OTHER_CUSTOM') {
        skippedOther += 1;
        continue;
      }
      const snomed = condition.externalCode?.trim();
      if (!snomed || !/^\d+$/.test(snomed)) {
        skippedNoSnomed += 1;
        continue;
      }

      const medicationConceptId = map.medicationConceptId.trim().toLowerCase();
      const medicationDisplayName =
        map.drugName?.trim() ||
        map.ingredientId?.trim().replace(/_/g, ' ') ||
        medicationConceptId;
      const relationshipType = relationshipFromLegacyStrength(map.mappingStrength);

      const existing = await this.prisma.medicationIndicationMapping.findFirst({
        where: {
          medicationConceptId,
          medicationMappingLevel: 'ingredient',
          indicationConceptId: snomed,
          relationshipType,
          jurisdiction: 'CA',
          status: 'approved',
        },
        select: { id: true },
      });
      if (existing) {
        skippedExisting += 1;
        continue;
      }

      await this.prisma.medicationIndicationMapping.create({
        data: {
          medicationConceptId,
          medicationDisplayName,
          medicationMappingLevel: 'ingredient',
          indicationConceptId: snomed,
          indicationDisplayName: condition.displayName,
          relationshipType,
          jurisdiction: 'CA',
          sourceLabel: 'SafeScribe starter library',
          sourceReferenceId: `legacy-map:${map.id}`,
          status: 'approved',
          mappingVersion: 1,
          notes: `Bootstrapped from RenewMedicationIndicationMap (${condition.code}).`,
          legacyConditionId: condition.id,
          createdById: opts.actorUserId ?? null,
          approvedById: opts.actorUserId ?? null,
          updatedById: opts.actorUserId ?? null,
        },
      });
      created += 1;
    }

    const approvedRelationships = await this.prisma.medicationIndicationMapping.count({
      where: { status: 'approved' },
    });

    this.logger.log(
      `bootstrapFromLegacyLibrary: created=${created} existing=${skippedExisting} noSnomed=${skippedNoSnomed} other=${skippedOther} approvedTotal=${approvedRelationships}`,
    );

    return {
      created,
      skippedExisting,
      skippedNoSnomed,
      skippedOther,
      scanned: legacyMaps.length,
      approvedRelationships,
    };
  }

  /** Rows for MedicationIndicationResolver (Adapt/Renew). */
  async loadResolverRows() {
    const rows = await this.prisma.medicationIndicationMapping.findMany({
      where: { status: 'approved' },
    });
    return rows.flatMap((row) => {
      const strength =
        row.relationshipType === 'approved_indication'
          ? 'primary'
          : row.relationshipType === 'guideline_supported'
            ? 'common'
            : 'possible';
      const base = {
        mappingId: row.id,
        conditionId: row.legacyConditionId || `snomed:${row.indicationConceptId}`,
        conditionCode: snomedConditionCode(row.indicationConceptId),
        displayName: row.indicationDisplayName,
        mappingStrength: strength,
        autoGroupAllowed: false,
        alwaysRequireConfirmation: row.relationshipType === 'off_label',
        rankingWeight: null as number | null,
        active: true,
        jurisdiction: row.jurisdiction,
        medicationMappingLevel: row.medicationMappingLevel,
        indicationConceptId: row.indicationConceptId,
      };
      // Emit concept-id and display-name keys so Adapt ingredient matching works
      // whether the consultation carries a CCDD id or a generic/brand label.
      const conceptId = row.medicationConceptId.trim().toLowerCase();
      const nameKey = row.medicationDisplayName.trim();
      return [
        {
          ...base,
          ingredientId: nameKey,
          medicationConceptId: conceptId,
        },
        ...(nameKey
          ? [
              {
                ...base,
                mappingId: `${row.id}:name`,
                ingredientId: nameKey.toUpperCase().replace(/\s+/g, '_'),
                medicationConceptId: nameKey.toLowerCase(),
              },
            ]
          : []),
      ];
    });
  }

  private validateMappingDto(dto: CreateGovernedMappingDto) {
    if (!dto.medicationConceptId?.trim()) {
      throw new BadRequestException('Medication CCDD concept is required.');
    }
    if (!dto.indicationConceptId?.trim()) {
      throw new BadRequestException('Indication SNOMED concept is required.');
    }
    if (!MAPPING_LEVELS.has(dto.medicationMappingLevel)) {
      throw new BadRequestException('Invalid mapping level.');
    }
    if (!RELATIONSHIPS.has(dto.relationshipType)) {
      throw new BadRequestException('Invalid relationship type.');
    }
    if (!JURISDICTIONS.has(dto.jurisdiction.toUpperCase())) {
      throw new BadRequestException('Invalid jurisdiction.');
    }
  }

  private async ensureLegacyCondition(snomedConceptId: string, displayName: string) {
    const code = snomedConditionCode(snomedConceptId);
    const existing = await this.prisma.renewCondition.findUnique({ where: { code } });
    if (existing) {
      if (!existing.active || existing.displayName !== displayName) {
        return (
          await this.prisma.renewCondition.update({
            where: { id: existing.id },
            data: {
              active: true,
              displayName,
              codeSystem: SNOMED_SYSTEM,
              externalCode: snomedConceptId,
            },
          })
        ).id;
      }
      return existing.id;
    }
    const created = await this.prisma.renewCondition.create({
      data: {
        code,
        displayName,
        category: 'snomed_clinical_finding',
        codeSystem: SNOMED_SYSTEM,
        externalCode: snomedConceptId,
        commonForRenewal: true,
        displayPriority: 200,
        active: true,
        aliases: {
          create: [
            {
              alias: displayName,
              normalizedAlias: displayName.trim().toLowerCase().replace(/\s+/g, ' '),
              active: true,
            },
          ],
        },
      },
    });
    return created.id;
  }

  private async ensureLegacyMap(
    medicationConceptId: string,
    medicationDisplayName: string,
    conditionId: string,
    relationshipType: string,
  ) {
    const key = medicationConceptId.trim().toLowerCase();
    const strength =
      relationshipType === 'approved_indication'
        ? 'primary'
        : relationshipType === 'guideline_supported'
          ? 'common'
          : 'possible';
    await this.prisma.renewMedicationIndicationMap.upsert({
      where: {
        medicationConceptId_conditionId: {
          medicationConceptId: key,
          conditionId,
        },
      },
      create: {
        medicationConceptId: key,
        ingredientId: medicationDisplayName.trim().toUpperCase().replace(/\s+/g, '_'),
        drugName: medicationDisplayName.trim(),
        conditionId,
        mappingStrength: strength,
        commonIndication: true,
        active: true,
      },
      update: {
        drugName: medicationDisplayName.trim(),
        mappingStrength: strength,
        active: true,
      },
    });
  }

  private toMappingDto(row: {
    id: string;
    medicationConceptId: string;
    medicationDisplayName: string;
    medicationMappingLevel: string;
    indicationConceptId: string;
    indicationDisplayName: string;
    relationshipType: string;
    jurisdiction: string;
    sourceReferenceId: string | null;
    sourceLabel: string | null;
    status: string;
    mappingVersion: number;
    notes: string | null;
    validFrom: Date;
    validTo: Date | null;
    createdById: string | null;
    updatedById: string | null;
    approvedById: string | null;
    retiredById: string | null;
    retiredAt: Date | null;
    legacyConditionId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      medicationConceptId: row.medicationConceptId,
      medicationDisplayName: row.medicationDisplayName,
      medicationMappingLevel: row.medicationMappingLevel,
      indicationConceptId: row.indicationConceptId,
      indicationDisplayName: row.indicationDisplayName,
      relationshipType: row.relationshipType,
      jurisdiction: row.jurisdiction,
      sourceReferenceId: row.sourceReferenceId,
      sourceLabel: row.sourceLabel,
      status: row.status,
      mappingVersion: row.mappingVersion,
      notes: row.notes,
      validFrom: row.validFrom.toISOString(),
      validTo: row.validTo?.toISOString() ?? null,
      createdById: row.createdById,
      updatedById: row.updatedById,
      approvedById: row.approvedById,
      retiredById: row.retiredById,
      retiredAt: row.retiredAt?.toISOString() ?? null,
      legacyConditionId: row.legacyConditionId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toCandidateDto(row: {
    id: string;
    medicationConceptId: string;
    medicationDisplayName: string | null;
    medicationMappingLevel: string;
    indicationConceptId: string;
    indicationDisplayName: string;
    sourceType: string;
    sourceReferenceId: string | null;
    jurisdiction: string;
    relationshipTypeSuggested: string | null;
    usageCount: number;
    firstSeenAt: Date;
    lastSeenAt: Date;
    status: string;
    reviewedById: string | null;
    reviewedAt: Date | null;
    reviewNotes: string | null;
    promotedMappingId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      medicationConceptId: row.medicationConceptId,
      medicationDisplayName: row.medicationDisplayName,
      medicationMappingLevel: row.medicationMappingLevel,
      indicationConceptId: row.indicationConceptId,
      indicationDisplayName: row.indicationDisplayName,
      sourceType: row.sourceType,
      sourceReferenceId: row.sourceReferenceId,
      jurisdiction: row.jurisdiction,
      relationshipTypeSuggested: row.relationshipTypeSuggested,
      usageCount: row.usageCount,
      firstSeenAt: row.firstSeenAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
      status: row.status,
      reviewedById: row.reviewedById,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      reviewNotes: row.reviewNotes,
      promotedMappingId: row.promotedMappingId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

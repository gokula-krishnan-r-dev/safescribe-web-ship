import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import { getClientInfo } from '@/common/utils/client-info';
import {
  CreateConditionDto,
  CreateIndicationMapDto,
  ListApprovedIndicationsQueryDto,
  ListIndicationMapsQueryDto,
  UpdateConditionDto,
  UpdateIndicationMapDto,
} from './approved-indications.dto';

const AUDIT_MODULE = 'APPROVED_INDICATIONS';

function normalizeAlias(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[-_/]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s.+]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCode(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_]/g, '_');
}

function normalizeIngredientKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

@Injectable()
export class ApprovedIndicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listConditions(query: ListApprovedIndicationsQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 25, 100);
    const q = query.q?.trim() ?? '';
    const active =
      query.active === 'false' ? false : query.active === 'all' ? undefined : true;

    const where: Prisma.RenewConditionWhereInput = {
      ...(active === undefined ? {} : { active }),
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: 'insensitive' } },
              { displayName: { contains: q, mode: 'insensitive' } },
              { category: { contains: q, mode: 'insensitive' } },
              {
                aliases: {
                  some: {
                    active: true,
                    normalizedAlias: { contains: normalizeAlias(q), mode: 'insensitive' },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.renewCondition.count({ where }),
      this.prisma.renewCondition.findMany({
        where,
        include: {
          aliases: { where: { active: true }, orderBy: { alias: 'asc' } },
          _count: { select: { indicationMaps: true } },
        },
        orderBy: [{ displayPriority: 'asc' }, { displayName: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        code: row.code,
        displayName: row.displayName,
        category: row.category,
        description: row.description,
        defaultEffectivenessQuestion: row.defaultEffectivenessQuestion,
        commonForRenewal: row.commonForRenewal,
        displayPriority: row.displayPriority,
        active: row.active,
        aliases: row.aliases.map((a) => a.alias),
        mapCount: row._count.indicationMaps,
        updatedAt: row.updatedAt.toISOString(),
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async createCondition(dto: CreateConditionDto, user: RequestUser, req: Request) {
    const code = normalizeCode(dto.code);
    if (!code) throw new BadRequestException('Condition code is required.');

    const existing = await this.prisma.renewCondition.findUnique({ where: { code } });
    if (existing) {
      throw new BadRequestException(`Condition code ${code} already exists.`);
    }

    const row = await this.prisma.renewCondition.create({
      data: {
        code,
        displayName: dto.displayName.trim(),
        category: dto.category?.trim() || null,
        description: dto.description?.trim() || null,
        defaultEffectivenessQuestion:
          dto.defaultEffectivenessQuestion?.trim() ||
          'Therapy effective / condition stable?',
        commonForRenewal: dto.commonForRenewal ?? true,
        displayPriority: dto.displayPriority ?? 100,
        active: true,
      },
    });

    await this.replaceAliases(row.id, dto.aliases ?? []);

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'approved_indication_condition_created',
      module: AUDIT_MODULE,
      newValue: { id: row.id, code: row.code, displayName: row.displayName },
      metadata: { entityType: 'RenewCondition', entityId: row.id },
      ...getClientInfo(req),
    });

    return this.getCondition(row.id);
  }

  async getCondition(id: string) {
    const row = await this.prisma.renewCondition.findUnique({
      where: { id },
      include: {
        aliases: { where: { active: true }, orderBy: { alias: 'asc' } },
        _count: { select: { indicationMaps: true } },
      },
    });
    if (!row) throw new NotFoundException('Condition not found');
    return {
      id: row.id,
      code: row.code,
      displayName: row.displayName,
      category: row.category,
      description: row.description,
      defaultEffectivenessQuestion: row.defaultEffectivenessQuestion,
      commonForRenewal: row.commonForRenewal,
      displayPriority: row.displayPriority,
      active: row.active,
      aliases: row.aliases.map((a) => a.alias),
      mapCount: row._count.indicationMaps,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async updateCondition(
    id: string,
    dto: UpdateConditionDto,
    user: RequestUser,
    req: Request,
  ) {
    const existing = await this.prisma.renewCondition.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Condition not found');

    const updated = await this.prisma.renewCondition.update({
      where: { id },
      data: {
        ...(dto.displayName !== undefined ? { displayName: dto.displayName.trim() } : {}),
        ...(dto.category !== undefined ? { category: dto.category?.trim() || null } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.defaultEffectivenessQuestion !== undefined
          ? {
              defaultEffectivenessQuestion:
                dto.defaultEffectivenessQuestion?.trim() || null,
            }
          : {}),
        ...(dto.commonForRenewal !== undefined
          ? { commonForRenewal: dto.commonForRenewal }
          : {}),
        ...(dto.displayPriority !== undefined
          ? { displayPriority: dto.displayPriority }
          : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });

    if (dto.aliases) {
      await this.replaceAliases(id, dto.aliases);
    }

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'approved_indication_condition_updated',
      module: AUDIT_MODULE,
      previousValue: { displayName: existing.displayName, active: existing.active },
      newValue: { displayName: updated.displayName, active: updated.active },
      metadata: { entityType: 'RenewCondition', entityId: id },
      ...getClientInfo(req),
    });

    return this.getCondition(id);
  }

  async deleteCondition(id: string, user: RequestUser, req: Request) {
    const existing = await this.prisma.renewCondition.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Condition not found');

    await this.prisma.renewCondition.update({
      where: { id },
      data: { active: false },
    });
    await this.prisma.renewMedicationIndicationMap.updateMany({
      where: { conditionId: id },
      data: { active: false },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'approved_indication_condition_deleted',
      module: AUDIT_MODULE,
      previousValue: { code: existing.code, active: true },
      newValue: { active: false },
      metadata: { entityType: 'RenewCondition', entityId: id },
      ...getClientInfo(req),
    });

    return { ok: true };
  }

  async listMaps(query: ListIndicationMapsQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 25, 100);
    const q = query.q?.trim() ?? '';
    const ingredient = query.ingredient?.trim().toLowerCase() ?? '';
    const active =
      query.active === 'false' ? false : query.active === 'all' ? undefined : true;

    const where: Prisma.RenewMedicationIndicationMapWhereInput = {
      ...(active === undefined ? {} : { active }),
      ...(query.conditionId ? { conditionId: query.conditionId } : {}),
      ...(ingredient
        ? {
            OR: [
              { medicationConceptId: { contains: ingredient, mode: 'insensitive' } },
              { ingredientId: { contains: ingredient, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(q
        ? {
            OR: [
              { medicationConceptId: { contains: q, mode: 'insensitive' } },
              { ingredientId: { contains: q, mode: 'insensitive' } },
              { condition: { displayName: { contains: q, mode: 'insensitive' } } },
              { condition: { code: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.renewMedicationIndicationMap.count({ where }),
      this.prisma.renewMedicationIndicationMap.findMany({
        where,
        include: { condition: true },
        orderBy: [{ medicationConceptId: 'asc' }, { suggestionRank: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        medicationConceptId: row.medicationConceptId,
        ingredientId: row.ingredientId,
        conditionId: row.conditionId,
        conditionCode: row.condition.code,
        conditionDisplayName: row.condition.displayName,
        mappingStrength: row.mappingStrength,
        rankingWeight: row.rankingWeight ? Number(row.rankingWeight) : null,
        autoGroupAllowed: row.autoGroupAllowed,
        alwaysRequireConfirmation: row.alwaysRequireConfirmation,
        commonIndication: row.commonIndication,
        active: row.active,
        updatedAt: row.updatedAt.toISOString(),
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async createMap(dto: CreateIndicationMapDto, user: RequestUser, req: Request) {
    const medicationConceptId = normalizeIngredientKey(dto.medicationConceptId);
    const ingredientId = normalizeIngredientKey(dto.ingredientId || medicationConceptId);
    const condition = await this.prisma.renewCondition.findUnique({
      where: { id: dto.conditionId },
    });
    if (!condition || !condition.active) {
      throw new BadRequestException('Select an active approved condition.');
    }

    try {
      const row = await this.prisma.renewMedicationIndicationMap.create({
        data: {
          medicationConceptId,
          ingredientId,
          conditionId: dto.conditionId,
          mappingStrength: dto.mappingStrength,
          rankingWeight: dto.rankingWeight ?? null,
          autoGroupAllowed: dto.autoGroupAllowed ?? false,
          alwaysRequireConfirmation: dto.alwaysRequireConfirmation ?? true,
          commonIndication: dto.commonIndication ?? true,
          active: true,
        },
        include: { condition: true },
      });

      await this.audit.log({
        userId: user.id,
        tenantId: user.tenantId ?? null,
        action: 'approved_indication_map_created',
        module: AUDIT_MODULE,
        newValue: {
          id: row.id,
          medicationConceptId: row.medicationConceptId,
          conditionCode: row.condition.code,
        },
        metadata: { entityType: 'RenewMedicationIndicationMap', entityId: row.id },
        ...getClientInfo(req),
      });

      return this.mapToDto(row);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(
          'A mapping already exists for this ingredient and condition.',
        );
      }
      throw error;
    }
  }

  async updateMap(
    id: string,
    dto: UpdateIndicationMapDto,
    user: RequestUser,
    req: Request,
  ) {
    const existing = await this.prisma.renewMedicationIndicationMap.findUnique({
      where: { id },
      include: { condition: true },
    });
    if (!existing) throw new NotFoundException('Indication map not found');

    if (dto.conditionId) {
      const condition = await this.prisma.renewCondition.findUnique({
        where: { id: dto.conditionId },
      });
      if (!condition || !condition.active) {
        throw new BadRequestException('Select an active approved condition.');
      }
    }

    try {
      const row = await this.prisma.renewMedicationIndicationMap.update({
        where: { id },
        data: {
          ...(dto.medicationConceptId !== undefined
            ? { medicationConceptId: normalizeIngredientKey(dto.medicationConceptId) }
            : {}),
          ...(dto.ingredientId !== undefined
            ? {
                ingredientId: dto.ingredientId
                  ? normalizeIngredientKey(dto.ingredientId)
                  : null,
              }
            : {}),
          ...(dto.conditionId !== undefined ? { conditionId: dto.conditionId } : {}),
          ...(dto.mappingStrength !== undefined
            ? { mappingStrength: dto.mappingStrength }
            : {}),
          ...(dto.rankingWeight !== undefined
            ? { rankingWeight: dto.rankingWeight }
            : {}),
          ...(dto.autoGroupAllowed !== undefined
            ? { autoGroupAllowed: dto.autoGroupAllowed }
            : {}),
          ...(dto.alwaysRequireConfirmation !== undefined
            ? { alwaysRequireConfirmation: dto.alwaysRequireConfirmation }
            : {}),
          ...(dto.commonIndication !== undefined
            ? { commonIndication: dto.commonIndication }
            : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        },
        include: { condition: true },
      });

      await this.audit.log({
        userId: user.id,
        tenantId: user.tenantId ?? null,
        action: 'approved_indication_map_updated',
        module: AUDIT_MODULE,
        previousValue: {
          medicationConceptId: existing.medicationConceptId,
          active: existing.active,
        },
        newValue: {
          medicationConceptId: row.medicationConceptId,
          active: row.active,
        },
        metadata: { entityType: 'RenewMedicationIndicationMap', entityId: id },
        ...getClientInfo(req),
      });

      return this.mapToDto(row);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(
          'A mapping already exists for this ingredient and condition.',
        );
      }
      throw error;
    }
  }

  async deleteMap(id: string, user: RequestUser, req: Request) {
    const existing = await this.prisma.renewMedicationIndicationMap.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Indication map not found');

    await this.prisma.renewMedicationIndicationMap.update({
      where: { id },
      data: { active: false },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'approved_indication_map_deleted',
      module: AUDIT_MODULE,
      previousValue: { medicationConceptId: existing.medicationConceptId, active: true },
      newValue: { active: false },
      metadata: { entityType: 'RenewMedicationIndicationMap', entityId: id },
      ...getClientInfo(req),
    });

    return { ok: true };
  }

  private async replaceAliases(conditionId: string, aliases: string[]) {
    const normalized = [
      ...new Map(
        aliases
          .map((alias) => alias.trim())
          .filter(Boolean)
          .map((alias) => [normalizeAlias(alias), alias] as const),
      ).entries(),
    ];

    await this.prisma.renewConditionAlias.updateMany({
      where: { conditionId },
      data: { active: false },
    });

    for (const [normalizedAlias, alias] of normalized) {
      if (!normalizedAlias) continue;
      await this.prisma.renewConditionAlias.upsert({
        where: {
          conditionId_normalizedAlias: { conditionId, normalizedAlias },
        },
        update: { alias, active: true },
        create: { conditionId, alias, normalizedAlias, active: true },
      });
    }
  }

  private mapToDto(row: {
    id: string;
    medicationConceptId: string;
    ingredientId: string | null;
    conditionId: string;
    mappingStrength: string;
    rankingWeight: Prisma.Decimal | null;
    autoGroupAllowed: boolean;
    alwaysRequireConfirmation: boolean;
    commonIndication: boolean;
    active: boolean;
    updatedAt: Date;
    condition: { code: string; displayName: string };
  }) {
    return {
      id: row.id,
      medicationConceptId: row.medicationConceptId,
      ingredientId: row.ingredientId,
      conditionId: row.conditionId,
      conditionCode: row.condition.code,
      conditionDisplayName: row.condition.displayName,
      mappingStrength: row.mappingStrength,
      rankingWeight: row.rankingWeight ? Number(row.rankingWeight) : null,
      autoGroupAllowed: row.autoGroupAllowed,
      alwaysRequireConfirmation: row.alwaysRequireConfirmation,
      commonIndication: row.commonIndication,
      active: row.active,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import { ConsultationsService } from './consultations.service';
import {
  clampQuickAddLimit,
  collectExclusionKeys,
  filterExcludedAndDedup,
  isResolvableConceptId,
  normalizeConceptKey,
  sortRankedUsage,
  toQuickAddMedication,
  treatmentPlanCatalog,
  type QuickAddMedication,
  type QuickAddSource,
  type RankedUsageRow,
} from './treatment-quick-add.util';
import type { RecordQuickAddUsageDto } from './dto/consultation.dto';

const DEFAULT_LOOKBACK_DAYS = 180;

export interface QuickAddResponse {
  items: QuickAddMedication[];
  total: number;
  pathwayId?: string;
  generatedAt: string;
}

@Injectable()
export class TreatmentQuickAddService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consultations: ConsultationsService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async getQuickAdd(
    consultationId: string,
    user: RequestUser,
    source: QuickAddSource,
    limit?: number,
  ): Promise<QuickAddResponse> {
    const consultation = await this.consultations.findOne(consultationId, user);
    const take = clampQuickAddLimit(limit);
    const pathwayId =
      typeof consultation.selectedPathwayId === 'string'
        ? consultation.selectedPathwayId
        : undefined;
    const generatedAt = new Date().toISOString();
    const tenantId = consultation.tenantId ?? user.tenantId ?? undefined;

    if (source === 'condition' && (!pathwayId || !tenantId)) {
      return { items: [], total: 0, pathwayId, generatedAt };
    }

    const lookbackDays =
      this.config.get<number>('QUICK_ADD_LOOKBACK_DAYS') ?? DEFAULT_LOOKBACK_DAYS;
    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

    const where: Prisma.TreatmentQuickAddUsageWhereInput = {
      createdAt: { gte: since },
      clinicalDrugConceptId: { not: '' },
      ...(source === 'frequent'
        ? {
            pharmacistId: user.id,
            ...(tenantId ? { tenantId } : {}),
          }
        : {
            tenantId,
            pathwayId,
          }),
    };

    const grouped = await this.prisma.treatmentQuickAddUsage.groupBy({
      by: ['clinicalDrugConceptId'],
      where,
      _count: { _all: true },
      _max: { createdAt: true },
    });

    const rankedMeta = sortRankedUsage(
      grouped.map((row) => ({
        clinicalDrugConceptId: row.clinicalDrugConceptId,
        medicationId: row.clinicalDrugConceptId,
        displayName: row.clinicalDrugConceptId,
        usageCount: row._count._all,
        lastUsedAt: row._max.createdAt ?? since,
      })),
    );

    const conceptIds = rankedMeta.map((row) => row.clinicalDrugConceptId);
    if (!conceptIds.length) {
      return { items: [], total: 0, pathwayId, generatedAt };
    }

    const latestRows = await this.prisma.treatmentQuickAddUsage.findMany({
      where: {
        ...where,
        clinicalDrugConceptId: { in: conceptIds },
      },
      orderBy: { createdAt: 'desc' },
    });

    const latestByConcept = new Map<string, (typeof latestRows)[number]>();
    for (const row of latestRows) {
      const key = normalizeConceptKey(row.clinicalDrugConceptId);
      if (!key || latestByConcept.has(key)) continue;
      latestByConcept.set(key, row);
    }

    const rows: RankedUsageRow[] = rankedMeta.flatMap((meta) => {
      const latest = latestByConcept.get(normalizeConceptKey(meta.clinicalDrugConceptId));
      if (!latest || !isResolvableConceptId(latest.clinicalDrugConceptId)) return [];
      return [
        {
          clinicalDrugConceptId: latest.clinicalDrugConceptId,
          medicationId: latest.medicationId,
          displayName: latest.displayName,
          strengthLabel: latest.strengthLabel,
          dosageFormLabel: latest.dosageFormLabel,
          genericName: latest.genericName,
          terminologySource: latest.terminologySource,
          rxcui: latest.rxcui,
          ndc: latest.ndc,
          usageCount: meta.usageCount,
          lastUsedAt: meta.lastUsedAt,
        },
      ];
    });

    const mapped = rows.map((row) => toQuickAddMedication(row, source));
    const pathwayTreatments = Array.isArray(consultation.pathway?.treatments)
      ? consultation.pathway.treatments.filter(
          (t: { isActive?: boolean; archivedAt?: Date | null }) =>
            t.isActive !== false && !t.archivedAt,
        )
      : [];
    const excluded = collectExclusionKeys([
      pathwayTreatments,
      treatmentPlanCatalog(consultation.treatmentPlan),
    ]);
    const filtered = filterExcludedAndDedup(mapped, excluded);

    return {
      items: filtered.slice(0, take),
      total: filtered.length,
      pathwayId,
      generatedAt,
    };
  }

  async recordUsage(
    consultationId: string,
    user: RequestUser,
    dto: RecordQuickAddUsageDto,
  ): Promise<{ recorded: boolean }> {
    const consultation = await this.consultations.findOne(consultationId, user);
    const medicationId = dto.medicationId.trim();
    const clinicalDrugConceptId = (dto.clinicalDrugConceptId || medicationId).trim();
    if (!isResolvableConceptId(medicationId) || !isResolvableConceptId(clinicalDrugConceptId)) {
      return { recorded: false };
    }

    await this.prisma.treatmentQuickAddUsage.create({
      data: {
        tenantId: consultation.tenantId ?? user.tenantId,
        pharmacistId: user.id,
        consultationId: consultation.id,
        pathwayId: consultation.selectedPathwayId,
        medicationId,
        clinicalDrugConceptId,
        displayName: dto.displayName.trim(),
        strengthLabel: dto.strengthLabel?.trim() || null,
        dosageFormLabel: dto.dosageFormLabel?.trim() || null,
        genericName: dto.genericName?.trim() || null,
        terminologySource: dto.terminologySource?.trim() || 'ccdd',
        rxcui: dto.rxcui?.trim() || null,
        ndc: dto.ndc?.trim() || null,
      },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: consultation.tenantId ?? user.tenantId,
      action: 'TREATMENT_ADDED',
      module: 'consultations',
      metadata: {
        event: 'treatment_added',
        selectionSource: dto.selectionSource ?? 'search',
        medicationId,
        clinicalDrugConceptId,
        pathwayId: consultation.selectedPathwayId ?? null,
      },
    });

    return { recorded: true };
  }
}

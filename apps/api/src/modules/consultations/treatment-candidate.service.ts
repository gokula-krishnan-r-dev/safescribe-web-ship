import { randomUUID } from 'crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { MedicationSafetyService } from '@/modules/medication-safety/medication-safety.service';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import {
  SAFETY_EVAL_STATUSES,
  baseIngredientKeys,
  classifyTreatmentDuplicate,
  identityFromTreatmentRecord,
  isPharmacistAddedMedication,
  type MedicationIdentityInput,
  type TreatmentDuplicateResult,
} from '@safescript/shared';
import { ConsultationsService } from './consultations.service';
import { mapSafetyEvalToMedication } from './treatment-safety-flags';
import type { EvaluateTreatmentCandidateDto } from './dto/consultation.dto';
import { treatmentPlanCatalog } from './treatment-quick-add.util';

export interface TreatmentCandidateEvaluateResult {
  candidate: {
    treatmentInstanceId: string;
    medicationConceptId: string;
    normalizedBaseIngredientConceptIds: string[];
    normalizationStatus: 'RESOLVED' | 'PARTIAL' | 'UNRESOLVED';
    patientContextVersion: string;
  };
  duplicate: TreatmentDuplicateResult;
  safety: Record<string, unknown> | null;
}

@Injectable()
export class TreatmentCandidateService {
  private readonly logger = new Logger(TreatmentCandidateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly consultations: ConsultationsService,
    private readonly medicationSafety: MedicationSafetyService,
    private readonly audit: AuditService,
  ) {}

  async evaluate(
    consultationId: string,
    user: RequestUser,
    dto: EvaluateTreatmentCandidateDto,
  ): Promise<TreatmentCandidateEvaluateResult> {
    const consultation = await this.consultations.findOne(consultationId, user);
    const treatmentInstanceId = dto.treatmentInstanceId?.trim() || randomUUID();
    const medicationName = dto.medicationName.trim();
    const genericName = dto.genericName?.trim() || undefined;
    const medicationConceptId = (dto.medicationId ?? dto.drugId ?? '').trim();
    const source = dto.source;
    const route = dto.route?.trim() || dto.regimen?.route?.trim() || undefined;

    const normalizedBaseIngredientConceptIds = baseIngredientKeys(
      medicationName,
      genericName,
    );
    const normalizationStatus: 'RESOLVED' | 'PARTIAL' | 'UNRESOLVED' = medicationConceptId
      ? 'RESOLVED'
      : medicationName.length >= 2
        ? 'PARTIAL'
        : 'UNRESOLVED';

    const candidateIdentity: MedicationIdentityInput = {
      medicationName,
      genericName,
      drugId: medicationConceptId || undefined,
      rxcui: dto.rxcui?.trim() || undefined,
      ndc: dto.ndc?.trim() || undefined,
      route,
      treatmentInstanceId,
      source: source === 'MANUAL' ? 'manual' : 'ccdd',
      treatmentKind: 'MEDICATION',
    };

    const { pathwayOptions, planTreatments } = await this.loadComparisonSets(
      consultation,
      dto.existingTreatments,
    );

    const duplicate = classifyTreatmentDuplicate(candidateIdentity, {
      pathwayOptions,
      planTreatments,
    });

    const patientInputs = this.consultations.patientSafetyInputs(consultation);
    const candidate = {
      treatmentInstanceId,
      medicationConceptId,
      normalizedBaseIngredientConceptIds,
      normalizationStatus,
      patientContextVersion: patientInputs.patientContextVersion,
    };

    this.logger.log(
      JSON.stringify({
        event: 'treatment_candidate_evaluated',
        source,
        matchType: duplicate.matchType,
        blocking: duplicate.blocking,
        normalizationStatus,
      }),
    );

    if (duplicate.blocking) {
      const enriched = await this.enrichDuplicateSafety(
        duplicate,
        pathwayOptions,
        planTreatments,
        patientInputs,
        user,
        consultation.tenantId,
        consultationId,
      );
      await this.audit.log({
        userId: user.id,
        tenantId: user.tenantId ?? consultation.tenantId,
        action: 'TREATMENT_CANDIDATE_DUPLICATE',
        module: 'CONSULTATIONS',
        newValue: {
          consultationId,
          source,
          matchType: enriched.matchType,
          existingPathwayOptionId: enriched.existingPathwayOptionId ?? null,
          existingTreatmentInstanceId: enriched.existingTreatmentInstanceId ?? null,
        },
      });
      return { candidate, duplicate: enriched, safety: null };
    }

    if (normalizationStatus === 'UNRESOLVED') {
      throw new BadRequestException({
        code: 'MEDICATION_IDENTITY_UNRESOLVED',
        message:
          'This medication could not be verified for safety. Search again or enter a different medication.',
      });
    }

    let safetyEval;
    try {
      safetyEval = await this.medicationSafety.evaluate(
        {
          consultationId,
          patientContext: patientInputs.patientContext,
          selectedMedications: [{ productName: medicationName, genericName }],
        },
        user,
        consultation.tenantId,
      );
    } catch (err) {
      this.logger.warn(
        `Safety evaluation failed for consultation ${consultationId}: ${
          err instanceof Error ? err.message : 'unknown'
        }`,
      );
      throw new HttpException(
        {
          code: 'SAFETY_UNAVAILABLE',
          message: 'Safety checks could not be completed. Try again before adding this treatment.',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (safetyEval.status === SAFETY_EVAL_STATUSES.SERVICE_UNAVAILABLE) {
      throw new HttpException(
        {
          code: 'SAFETY_UNAVAILABLE',
          message: 'Safety checks could not be completed. Try again before adding this treatment.',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const flags = mapSafetyEvalToMedication({
      medicationName,
      genericName,
      findings: safetyEval.findings,
      patientAllergies: patientInputs.allergies,
      knowledgeRelease: safetyEval.knowledgeRelease,
      engineVersion: safetyEval.engineVersion,
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? consultation.tenantId,
      action: 'TREATMENT_CANDIDATE_EVALUATED',
      module: 'CONSULTATIONS',
      newValue: {
        consultationId,
        source,
        matchType: duplicate.matchType,
        evaluationId: safetyEval.evaluationId,
        safetyStatus: flags.status,
        patientContextVersion: patientInputs.patientContextVersion,
        normalizationStatus,
      },
    });

    return {
      candidate,
      duplicate,
      safety: {
        evaluationId: safetyEval.evaluationId,
        consultationId,
        treatmentInstanceId,
        source,
        patientContextVersion: patientInputs.patientContextVersion,
        status: flags.status,
        findings: safetyEval.findings,
        evaluatedAt: new Date().toISOString(),
        allergyBlocked: flags.allergyBlocked,
        allergyWarning: flags.allergyWarning,
        renalWarning: flags.renalWarning,
        hepaticWarning: flags.hepaticWarning,
        pregnancyWarning: flags.pregnancyWarning,
        interactions: flags.interactions,
        interactionSafetySources: flags.interactionSafetySources,
        safetySources: flags.safetySources,
        safetyReviewItems: flags.safetyReviewItems,
        safetyTier: flags.safetyTier,
        safetyEngineMeta: flags.safetyEngineMeta,
      },
    };
  }

  private async loadComparisonSets(
    consultation: {
      selectedPathwayId?: string | null;
      treatmentPlan?: unknown;
    },
    existingTreatments?: Array<Record<string, unknown>>,
  ): Promise<{
    pathwayOptions: MedicationIdentityInput[];
    planTreatments: MedicationIdentityInput[];
  }> {
    const pathwayRows = consultation.selectedPathwayId
      ? await this.prisma.clinicalTreatment.findMany({
          where: {
            pathwayId: consultation.selectedPathwayId,
            isActive: true,
            archivedAt: null,
            approved: true,
          },
          select: {
            id: true,
            medicationName: true,
            genericName: true,
            route: true,
          },
        })
      : [];

    const asRecord = (row: unknown): row is Record<string, unknown> =>
      Boolean(row) && typeof row === 'object' && !Array.isArray(row);
    const clientRows = (Array.isArray(existingTreatments) ? existingTreatments : []).filter(asRecord);
    const persistedRows = treatmentPlanCatalog(consultation.treatmentPlan).filter(asRecord);
    const catalogRows = [...persistedRows, ...clientRows];
    const catalogIdentities = catalogRows.map(identityFromTreatmentRecord);
    const byPathwayId = new Map<string, MedicationIdentityInput>();
    for (const item of catalogIdentities) {
      const id = item.pathwayTreatmentId?.trim();
      if (id && !byPathwayId.has(id)) byPathwayId.set(id, item);
    }

    const pathwayOptions: MedicationIdentityInput[] = pathwayRows
      .filter((row) => row.medicationName?.trim())
      .map((row) => {
        const fromCatalog = byPathwayId.get(row.id);
        return {
          medicationName: row.medicationName,
          genericName: row.genericName ?? fromCatalog?.genericName,
          route: row.route ?? fromCatalog?.route,
          pathwayTreatmentId: row.id,
          source: 'pathway',
          treatmentKind: 'MEDICATION',
          allergyBlocked: fromCatalog?.allergyBlocked,
          allergyWarningReason: fromCatalog?.allergyWarningReason,
          treatmentInstanceId: fromCatalog?.treatmentInstanceId,
        };
      });

    const seen = new Set<string>();
    const planTreatments: MedicationIdentityInput[] = [];
    for (const item of catalogIdentities) {
      if (!isPharmacistAddedMedication(item)) continue;
      const key =
        item.treatmentInstanceId ||
        item.drugId ||
        `${item.medicationName}|${item.genericName ?? ''}|${item.route ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      planTreatments.push(item);
    }

    return { pathwayOptions, planTreatments };
  }

  private async enrichDuplicateSafety(
    duplicate: TreatmentDuplicateResult,
    pathwayOptions: MedicationIdentityInput[],
    planTreatments: MedicationIdentityInput[],
    patientInputs: ReturnType<ConsultationsService['patientSafetyInputs']>,
    user: RequestUser,
    tenantId: string | null,
    consultationId: string,
  ): Promise<TreatmentDuplicateResult> {
    if (duplicate.existingBlockingFindingSummary) return duplicate;
    const existing =
      pathwayOptions.find(
        (o) =>
          o.pathwayTreatmentId === duplicate.existingPathwayOptionId ||
          o.treatmentInstanceId === duplicate.existingTreatmentInstanceId,
      ) ??
      planTreatments.find(
        (o) => o.treatmentInstanceId === duplicate.existingTreatmentInstanceId,
      );
    if (!existing?.medicationName.trim()) return duplicate;
    if (existing.allergyWarningReason) {
      return {
        ...duplicate,
        existingBlockingFindingSummary: existing.allergyWarningReason,
        existingSafetyStatus: existing.allergyBlocked ? 'AVOID' : duplicate.existingSafetyStatus,
      };
    }
    try {
      const safetyEval = await this.medicationSafety.evaluate(
        {
          consultationId,
          patientContext: patientInputs.patientContext,
          selectedMedications: [
            {
              productName: existing.medicationName,
              genericName: existing.genericName ?? undefined,
            },
          ],
        },
        user,
        tenantId,
      );
      const flags = mapSafetyEvalToMedication({
        medicationName: existing.medicationName,
        genericName: existing.genericName ?? undefined,
        findings: safetyEval.findings,
        patientAllergies: patientInputs.allergies,
      });
      if (!flags.allergyBlocked && !flags.allergyWarning?.reason) return duplicate;
      return {
        ...duplicate,
        existingSafetyStatus: flags.status,
        existingBlockingFindingSummary: flags.allergyWarning?.reason,
      };
    } catch {
      return duplicate;
    }
  }
}

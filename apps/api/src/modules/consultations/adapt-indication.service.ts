import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '@/prisma/prisma.service';
import { AiConfigService } from '@/modules/ai-config/ai-config.service';
import { AI_PROMPT_KEYS } from '@/modules/ai-config/ai-config.defaults';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import { CcdDFhirClient } from '@/modules/terminology/providers/ccdd/ccdd.client';
import {
  SNOMED_CLINICAL_FINDING_ECL,
  SNOMED_SYSTEM,
} from '@/modules/terminology/providers/ccdd/ccdd.constants';
import { IndicationMappingsService } from '@/modules/approved-indications/indication-mappings.service';
import {
  isUnsupportedTemperatureError,
  withOptionalTemperature,
} from '@/common/utils/openai-compat';
import {
  adaptMedicationConceptKey,
  baseIngredientKeys,
  MedicationIndicationResolver,
  MEDICATION_INDICATION_REPOSITORY_VERSION,
  medicationDirections,
  medicationDisplayName,
  medicationIngredientKeys,
  parseAdaptPayload,
  SAFESCRIBE_MODULES,
  type AdaptIndicationSelection,
  type AdaptIndicationSuggestion,
  type ApprovedIndicationMapping,
  type MedicationIndicationRepositoryRow,
  type RenewConditionCatalogItem,
  type RenewIndicationCandidate,
  type RenewMedication,
} from '@safescript/shared';
import { normalizeConditionAlias } from './renew-condition-library.data';
import { RenewTherapyReviewService } from './renew-therapy-review.service';

export type AdaptIndicationMedicationHint = {
  medicationId?: string | null;
  medicationText?: string | null;
  genericName?: string | null;
  brandName?: string | null;
  medicationConceptId?: string | null;
};

const ADAPT_RANKING_PROMPT = `You are assisting a Canadian pharmacist using SafeScribe Adapt.

Your task is ONLY to rank likely medication indications from a supplied CLOSED APPROVED CONDITION LIST.

You are not diagnosing the patient.
You are not deciding the adaptation type or reason.
You are not allowed to invent a condition outside the supplied condition list.

Use the medication name, normalized ingredient, strength, dosage form, directions, and structured patient conditions only as contextual evidence for ranking.

If multiple indications are plausible, keep status needs_confirmation.
Never force a single indication when the evidence is ambiguous.
Never auto-confirm an indication.

Return JSON only matching the supplied schema.`;

export type AdaptIndicationSearchHit = RenewConditionCatalogItem & {
  source: 'approved_library' | 'snomed';
  snomedConceptId?: string | null;
};

export type AdaptIndicationResolveResponse = {
  medicationId: string;
  medicationConceptKey: string;
  medicationDisplayName: string;
  /** Spec: approvedMappings from MedicationIndicationResolver */
  approvedMappings: ApprovedIndicationMapping[];
  candidates: RenewIndicationCandidate[];
  suggestions: AdaptIndicationSuggestion[];
  commonIndications: RenewConditionCatalogItem[];
  patientConditionMatches: RenewConditionCatalogItem[];
  repositoryVersion: string;
  needsAiRanking: boolean;
  suggestionsUnavailable: boolean;
  resolverStatus: 'empty' | 'provisional' | 'needs_confirmation';
  provisionalConditionId: string | null;
  existingSelection: AdaptIndicationSelection | null;
};

@Injectable()
export class AdaptIndicationService {
  private readonly logger = new Logger(AdaptIndicationService.name);
  private readonly openai: OpenAI | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly aiConfig: AiConfigService,
    private readonly renewTherapyReview: RenewTherapyReviewService,
    private readonly indicationMappings: IndicationMappingsService,
    @Optional() private readonly fhir: CcdDFhirClient | null,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async resolve(
    consultationId: string,
    user: RequestUser,
    options?: {
      suggest?: boolean;
      patientConditions?: string[];
      medicationHint?: AdaptIndicationMedicationHint | null;
    },
  ): Promise<AdaptIndicationResolveResponse> {
    const consultation = await this.requireAdaptConsultation(consultationId, user);
    await this.renewTherapyReview.ensureLibrary();

    const payload = parseAdaptPayload(
      consultation.renewPayload,
      (consultation as { jurisdiction?: string }).jurisdiction || 'AB',
    );
    const savedMedication = payload.step1.originalPrescription;
    const medication =
      savedMedication ?? provisionalMedicationFromHint(options?.medicationHint);

    if (!medication) {
      // Soft-empty: Step 1 may call resolve before autosave finishes and before
      // the client can send a medication hint. Never 400 — that permanently
      // breaks the indication panel after React Query retries are exhausted.
      return emptyAdaptIndicationResolveResponse();
    }

    try {
      const conditions = await this.listActiveConditions();
      const catalogById = new Map(conditions.map((row) => [row.id, row]));
      const repository = await this.loadRepositoryRows();

      const patientLabels = [
        ...(options?.patientConditions ?? []),
        ...(payload.step2A?.background.conditions ?? []),
      ]
        .map((label) => label.trim())
        .filter(Boolean);

      const ingredientConceptIds = savedMedication
        ? medicationIngredientKeys(savedMedication)
        : baseIngredientKeys(
            options?.medicationHint?.medicationConceptId,
            options?.medicationHint?.genericName,
            options?.medicationHint?.brandName,
            options?.medicationHint?.medicationText,
          );

      if (!ingredientConceptIds.length) {
        return emptyAdaptIndicationResolveResponse({
          medicationId: medication.id,
          medicationDisplayName: medicationDisplayName(medication),
        });
      }

      const resolved = MedicationIndicationResolver.resolve({
        input: {
          medicationConceptId:
            medication.normalized.medicationConceptId ??
            options?.medicationHint?.medicationConceptId ??
            null,
          productConceptId:
            medication.productIdentity?.ccddManufacturedProductId ??
            medication.productIdentity?.din ??
            null,
          clinicalDrugConceptId: null,
          ingredientConceptIds,
          jurisdiction: payload.step1.jurisdiction || 'AB',
          patientConditionLabels: patientLabels,
        },
        repository,
        catalog: conditions,
        repositoryVersion: MEDICATION_INDICATION_REPOSITORY_VERSION,
      });

      const suggestions = this.buildDeterministicSuggestions(
        resolved.candidates,
        resolved.patientConditionMatches,
        resolved.approvedMappings,
      );

      let rankedCandidates = resolved.candidates;
      let rankedSuggestions = suggestions;
      // Deterministic mappings are enough for the panel; AI ranking is optional polish.
      let suggestionsUnavailable = false;

      if (
        options?.suggest !== false &&
        resolved.needsAIRanking &&
        this.openai &&
        savedMedication
      ) {
        try {
          const ai = await this.rankWithAi(
            savedMedication,
            resolved.candidates,
            conditions,
            patientLabels,
          );
          if (ai.candidates.length) rankedCandidates = ai.candidates;
          if (ai.suggestions.length) {
            rankedSuggestions = mergeSuggestions(suggestions, ai.suggestions);
          }
        } catch (error) {
          // Keep deterministic suggestions; only mark AI sidebar unavailable.
          suggestionsUnavailable = suggestions.length === 0;
          this.logger.warn(
            `Adapt indication AI ranking unavailable: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      } else if (resolved.needsAIRanking && !this.openai && suggestions.length === 0) {
        suggestionsUnavailable = true;
      }

      const commonIndications = resolved.approvedMappings
        .map((m) => catalogById.get(m.conditionId))
        .filter((row): row is RenewConditionCatalogItem => Boolean(row));

      const existing = payload.step1.indication ?? null;
      const conceptKey = adaptMedicationConceptKey(medication);
      const existingSelection =
        existing &&
        existing.medicationConceptKey === conceptKey &&
        existing.medicationId === medication.id
          ? existing
          : null;

      return {
        medicationId: medication.id,
        medicationConceptKey: conceptKey,
        medicationDisplayName: medicationDisplayName(medication),
        approvedMappings: resolved.approvedMappings,
        candidates: rankedCandidates,
        suggestions: rankedSuggestions.slice(0, 3),
        commonIndications,
        patientConditionMatches: resolved.patientConditionMatches,
        repositoryVersion: resolved.repositoryVersion,
        needsAiRanking: resolved.needsAIRanking,
        suggestionsUnavailable,
        resolverStatus: resolved.status,
        provisionalConditionId: resolved.provisionalConditionId,
        existingSelection,
      };
    } catch (error) {
      this.logger.error(
        `Adapt indication resolve failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return emptyAdaptIndicationResolveResponse({
        medicationId: medication.id,
        medicationDisplayName: medicationDisplayName(medication),
        suggestionsUnavailable: true,
      });
    }
  }

  async searchConditions(
    consultationId: string,
    user: RequestUser,
    q: string,
  ): Promise<AdaptIndicationSearchHit[]> {
    await this.requireAdaptConsultation(consultationId, user);
    await this.renewTherapyReview.ensureLibrary();
    const query = q.trim();

    const libraryHits = await this.searchApprovedLibrary(query);
    if (!query || query.length < 2) {
      return libraryHits.map((row) => ({ ...row, source: 'approved_library' as const }));
    }

    // Broader SNOMED clinical-finding search for All indications / manual entry.
    // Never invent codes — only return Infoway expansion hits.
    const snomedHits = await this.searchSnomedClinicalFindings(query);
    const seen = new Set(libraryHits.map((row) => row.id));
    const merged: AdaptIndicationSearchHit[] = libraryHits.map((row) => ({
      ...row,
      source: 'approved_library',
      snomedConceptId: /^\d+$/.test(row.code) ? row.code : null,
    }));

    for (const hit of snomedHits) {
      if (seen.has(hit.id)) continue;
      seen.add(hit.id);
      merged.push(hit);
    }
    return merged.slice(0, 30);
  }

  /**
   * Persist consultation-level review note + upsert platform Review Queue candidate
   * when pharmacist selects a SNOMED indication not yet in the approved repository.
   */
  async recordManualCandidate(
    consultationId: string,
    user: RequestUser,
    body: {
      snomedConceptId: string;
      displayName: string;
      medicationId: string;
    },
  ): Promise<{ ok: true; candidateId: string }> {
    const consultation = await this.requireAdaptConsultation(consultationId, user);
    const payload = parseAdaptPayload(consultation.renewPayload, 'AB');
    const med = payload.step1.originalPrescription;
    if (!med || med.id !== body.medicationId) {
      throw new BadRequestException('Medication does not match the Adapt original prescription.');
    }

    const medicationConceptId = (
      med.normalized.medicationConceptId ||
      med.productIdentity?.ccddManufacturedProductId ||
      adaptMedicationConceptKey(med)
    )
      .trim()
      .toLowerCase();

    // Non-blocking platform review-queue upsert (spec §46–47).
    void this.indicationMappings
      .observePharmacistCandidate({
        medicationConceptId,
        medicationDisplayName:
          med.normalized.genericName ||
          med.normalized.brandName ||
          med.raw?.medicationText ||
          null,
        medicationMappingLevel: 'ingredient',
        indicationConceptId: body.snomedConceptId.trim(),
        indicationDisplayName: body.displayName.trim(),
        jurisdiction: payload.step1.jurisdiction || 'AB',
      })
      .catch((error) => {
        this.logger.warn(
          `Indication candidate observe failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });

    const candidateId = `mic_${body.snomedConceptId}_${Date.now().toString(36)}`;
    const existingIndication = payload.step1.indication;
    const reviewCandidates = [
      ...(existingIndication?.reviewCandidates ?? []),
      {
        id: candidateId,
        snomedConceptId: body.snomedConceptId,
        displayName: body.displayName,
        createdAt: new Date().toISOString(),
      },
    ].slice(-20);

    const next = {
      ...payload,
      step1: {
        ...payload.step1,
        indication: {
          ...(existingIndication ?? {
            medicationId: body.medicationId,
            medicationConceptKey: adaptMedicationConceptKey(med),
            status: 'pending' as const,
            selectionSource: 'manual_search' as const,
            confirmedByPharmacist: false,
          }),
          reviewCandidates,
        },
      },
    };

    await this.prisma.consultation.update({
      where: { id: consultationId },
      data: { renewPayload: JSON.parse(JSON.stringify(next)) },
    });

    return { ok: true, candidateId };
  }

  private async searchApprovedLibrary(query: string): Promise<RenewConditionCatalogItem[]> {
    if (!query) {
      const common = await this.prisma.renewCondition.findMany({
        where: { active: true, commonForRenewal: true },
        orderBy: [{ displayPriority: 'asc' }, { displayName: 'asc' }],
        take: 20,
      });
      return common.map(toCatalogItem);
    }

    const normalized = normalizeConditionAlias(query);
    const aliases = await this.prisma.renewConditionAlias.findMany({
      where: {
        active: true,
        normalizedAlias: { contains: normalized, mode: 'insensitive' },
        condition: { active: true },
      },
      select: { conditionId: true },
      take: 24,
    });
    const aliasIds = aliases.map((row) => row.conditionId);
    const rows = await this.prisma.renewCondition.findMany({
      where: {
        active: true,
        OR: [
          { displayName: { contains: query, mode: 'insensitive' } },
          {
            code: {
              contains: query.toUpperCase().replace(/\s+/g, '_'),
              mode: 'insensitive',
            },
          },
          ...(aliasIds.length ? [{ id: { in: aliasIds } }] : []),
        ],
      },
      orderBy: [{ displayPriority: 'asc' }, { displayName: 'asc' }],
      take: 24,
    });
    return rows.map(toCatalogItem);
  }

  private async searchSnomedClinicalFindings(query: string): Promise<AdaptIndicationSearchHit[]> {
    if (!this.fhir || query.trim().length < 2) return [];
    try {
      const hits = await this.fhir.expandValueSet(SNOMED_CLINICAL_FINDING_ECL, query.trim(), 12);
      return hits
        .filter((hit) => hit.code && hit.display)
        .map((hit) => ({
          id: `snomed:${hit.code}`,
          code: hit.code!,
          displayName: hit.display!,
          category: 'snomed_clinical_finding',
          description: `${SNOMED_SYSTEM}|${hit.code}`,
          defaultEffectivenessQuestion: null,
          commonForRenewal: false,
          displayPriority: 500,
          source: 'snomed' as const,
          snomedConceptId: hit.code!,
        }));
    } catch (error) {
      this.logger.warn(
        `SNOMED clinical finding search failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  private async loadRepositoryRows(): Promise<MedicationIndicationRepositoryRow[]> {
    const [maps, governed] = await Promise.all([
      this.prisma.renewMedicationIndicationMap
        .findMany({
          where: { active: true, condition: { active: true } },
          include: { condition: true },
        })
        .catch((error) => {
          this.logger.warn(
            `Legacy indication maps unavailable: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return [];
        }),
      this.indicationMappings.loadResolverRows().catch(() => []),
    ]);

    const byKey = new Map<string, MedicationIndicationRepositoryRow>();
    for (const row of maps) {
      const mapped: MedicationIndicationRepositoryRow = {
        mappingId: row.id,
        ingredientId: row.ingredientId,
        medicationConceptId: row.medicationConceptId,
        conditionId: row.conditionId,
        conditionCode: row.condition.code,
        displayName: row.condition.displayName,
        mappingStrength: row.mappingStrength,
        autoGroupAllowed: row.autoGroupAllowed,
        alwaysRequireConfirmation: row.alwaysRequireConfirmation,
        rankingWeight: row.rankingWeight ? Number(row.rankingWeight) : null,
        active: row.active,
      };
      byKey.set(`${mapped.medicationConceptId}|${mapped.conditionId}`, mapped);
    }
    for (const row of governed) {
      const key = `${row.medicationConceptId}|${row.conditionId}`;
      // Governed CCDD↔SNOMED rows take precedence over legacy ingredient maps.
      byKey.set(key, {
        mappingId: row.mappingId,
        ingredientId: row.ingredientId,
        medicationConceptId: row.medicationConceptId,
        conditionId: row.conditionId,
        conditionCode: row.conditionCode,
        displayName: row.displayName,
        mappingStrength: row.mappingStrength,
        autoGroupAllowed: row.autoGroupAllowed,
        alwaysRequireConfirmation: row.alwaysRequireConfirmation,
        rankingWeight: row.rankingWeight,
        active: row.active,
      });
    }
    return [...byKey.values()];
  }

  private buildDeterministicSuggestions(
    candidates: RenewIndicationCandidate[],
    patientMatches: RenewConditionCatalogItem[],
    approvedMappings: ApprovedIndicationMapping[],
  ): AdaptIndicationSuggestion[] {
    const suggestions: AdaptIndicationSuggestion[] = [];
    const seen = new Set<string>();
    const approvedIds = new Set(approvedMappings.map((m) => m.conditionId));

    for (const match of patientMatches) {
      if (!approvedIds.has(match.id) || seen.has(match.id)) continue;
      seen.add(match.id);
      suggestions.push({
        conditionId: match.id,
        displayName: match.displayName,
        conditionCode: match.code,
        reason: 'Matches an existing patient condition',
        badge: 'matches_patient',
      });
    }

    for (const candidate of candidates) {
      if (seen.has(candidate.conditionId)) continue;
      if (candidate.mappingStrength !== 'primary' && candidate.mappingStrength !== 'common') {
        continue;
      }
      seen.add(candidate.conditionId);
      suggestions.push({
        conditionId: candidate.conditionId,
        displayName: candidate.displayName,
        conditionCode: candidate.conditionCode,
        reason:
          candidate.mappingStrength === 'primary'
            ? 'Common approved indication for this medication'
            : 'Approved indication mapped for this medication',
        badge: 'suggested',
      });
      if (suggestions.length >= 3) break;
    }

    return suggestions.slice(0, 3);
  }

  private async rankWithAi(
    medication: RenewMedication,
    candidates: RenewIndicationCandidate[],
    conditions: RenewConditionCatalogItem[],
    patientLabels: string[],
  ): Promise<{ candidates: RenewIndicationCandidate[]; suggestions: AdaptIndicationSuggestion[] }> {
    if (!this.openai || !candidates.length) {
      return { candidates, suggestions: [] };
    }

    const allowed = candidates.map((c) => ({
      condition_code: c.conditionCode,
      condition_id: c.conditionId,
      display_name: c.displayName,
    }));

    const prompt = this.aiConfig.getPrompt(
      AI_PROMPT_KEYS.RENEW_INDICATION_RANKING,
      ADAPT_RANKING_PROMPT,
    );

    const model = this.config.get<string>('OPENAI_MODEL', 'gpt-5.6-luna');
    const createParams = withOptionalTemperature(
      {
        model,
        max_completion_tokens: 1024,
        response_format: { type: 'json_object' as const },
        messages: [
          { role: 'system' as const, content: prompt },
          {
            role: 'user' as const,
            content: JSON.stringify({
              medication: {
                medication_id: medication.id,
                name: medicationDisplayName(medication),
                generic: medication.normalized.genericName ?? null,
                strength: medication.normalized.strength ?? null,
                dosage_form: medication.normalized.dosageForm ?? null,
                directions: medicationDirections(medication),
                allowed_candidates: allowed,
              },
              patient_conditions: patientLabels,
              closed_condition_list: allowed,
              schema: {
                ranked: [
                  {
                    condition_id: 'string',
                    reason: 'short factual reason',
                  },
                ],
              },
            }),
          },
        ],
      },
      0,
    );

    let response;
    try {
      response = await this.openai.chat.completions.create(createParams);
    } catch (err) {
      if (isUnsupportedTemperatureError(err) && 'temperature' in createParams) {
        delete createParams.temperature;
        this.logger.warn(
          `Model ${model} rejected temperature — retrying indication ranking with API default`,
        );
        response = await this.openai.chat.completions.create(createParams);
      } else {
        throw err;
      }
    }

    const content = response.choices[0]?.message?.content ?? '{}';
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch {
      return { candidates, suggestions: [] };
    }

    const rankedRaw = Array.isArray(parsed.ranked) ? parsed.ranked : [];
    const byId = new Map(candidates.map((c) => [c.conditionId, c]));
    const ordered: RenewIndicationCandidate[] = [];
    const suggestions: AdaptIndicationSuggestion[] = [];
    const seen = new Set<string>();

    for (const [index, row] of rankedRaw.entries()) {
      if (!row || typeof row !== 'object') continue;
      const item = row as Record<string, unknown>;
      const id = typeof item.condition_id === 'string' ? item.condition_id : '';
      const candidate = byId.get(id);
      if (!candidate || seen.has(id)) continue;
      seen.add(id);
      ordered.push({
        ...candidate,
        rank: index + 1,
        confidenceBand: index === 0 ? 'high' : candidate.confidenceBand ?? 'moderate',
      });
      if (suggestions.length < 3) {
        suggestions.push({
          conditionId: candidate.conditionId,
          displayName: candidate.displayName,
          conditionCode: candidate.conditionCode,
          reason:
            typeof item.reason === 'string' && item.reason.trim()
              ? item.reason.trim()
              : 'Suggested based on patient information',
          badge: 'suggested',
        });
      }
    }

    for (const candidate of candidates) {
      if (seen.has(candidate.conditionId)) continue;
      ordered.push(candidate);
    }

    return {
      candidates: ordered.length ? ordered : candidates,
      suggestions,
    };
  }

  private async listActiveConditions(): Promise<RenewConditionCatalogItem[]> {
    const rows = await this.prisma.renewCondition.findMany({
      where: { active: true },
      orderBy: [{ displayPriority: 'asc' }, { displayName: 'asc' }],
    });
    return rows.map(toCatalogItem);
  }

  private async requireAdaptConsultation(consultationId: string, user: RequestUser) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
    });
    if (!consultation) throw new NotFoundException('Consultation not found');
    if (consultation.module !== SAFESCRIBE_MODULES.ADAPT) {
      throw new BadRequestException('This endpoint is only available for Adapt consultations.');
    }
    if (user.role === 'SUPER_ADMIN') return consultation;
    if (
      user.role === 'PHARMACIST_ADMIN' &&
      user.tenantId &&
      consultation.tenantId === user.tenantId
    ) {
      return consultation;
    }
    if (consultation.pharmacistId === user.id) return consultation;
    throw new ForbiddenException('You do not have access to this consultation');
  }
}

function toCatalogItem(row: {
  id: string;
  code: string;
  displayName: string;
  category: string | null;
  description: string | null;
  defaultEffectivenessQuestion: string | null;
  commonForRenewal: boolean;
  displayPriority: number;
}): RenewConditionCatalogItem {
  return {
    id: row.id,
    code: row.code,
    displayName: row.displayName,
    category: row.category,
    description: row.description,
    defaultEffectivenessQuestion: row.defaultEffectivenessQuestion,
    commonForRenewal: row.commonForRenewal,
    displayPriority: row.displayPriority,
  };
}

function emptyAdaptIndicationResolveResponse(
  partial?: Partial<AdaptIndicationResolveResponse>,
): AdaptIndicationResolveResponse {
  return {
    medicationId: '',
    medicationConceptKey: '',
    medicationDisplayName: '',
    approvedMappings: [],
    candidates: [],
    suggestions: [],
    commonIndications: [],
    patientConditionMatches: [],
    repositoryVersion: MEDICATION_INDICATION_REPOSITORY_VERSION,
    needsAiRanking: false,
    suggestionsUnavailable: true,
    resolverStatus: 'empty',
    provisionalConditionId: null,
    existingSelection: null,
    ...partial,
  };
}

/** Minimal medication shape so resolve can run before renewPayload autosave lands. */
function provisionalMedicationFromHint(
  hint?: AdaptIndicationMedicationHint | null,
): RenewMedication | null {
  if (!hint) return null;
  const medicationText = hint.medicationText?.trim() || '';
  const genericName = hint.genericName?.trim() || '';
  const brandName = hint.brandName?.trim() || '';
  const medicationConceptId = hint.medicationConceptId?.trim() || null;
  if (!medicationText && !genericName && !brandName && !medicationConceptId) {
    return null;
  }
  const id = hint.medicationId?.trim() || 'provisional-adapt-rx';
  return {
    id,
    source: { type: 'manual_search' },
    raw: {
      medicationText: medicationText || brandName || genericName || medicationConceptId || id,
      directionsText: null,
      quantityText: null,
      prescriberText: null,
      dateText: null,
    },
    normalized: {
      medicationConceptId,
      brandName: brandName || null,
      genericName: genericName || null,
      strength: null,
      dosageForm: null,
      route: null,
      dose: null,
      frequency: null,
      quantity: null,
      quantityUnit: null,
      directions: null,
      prescriberName: null,
      prescribedDate: null,
    },
    confidence: {},
    reviewStatus: 'needs_review',
    ccddMatchStatus: 'unmatched',
    pharmacistEdited: false,
  };
}

function mergeSuggestions(
  deterministic: AdaptIndicationSuggestion[],
  ai: AdaptIndicationSuggestion[],
): AdaptIndicationSuggestion[] {
  const out: AdaptIndicationSuggestion[] = [];
  const seen = new Set<string>();
  for (const row of [...deterministic.filter((s) => s.badge === 'matches_patient'), ...ai, ...deterministic]) {
    if (seen.has(row.conditionId)) continue;
    seen.add(row.conditionId);
    out.push(row);
    if (out.length >= 3) break;
  }
  return out;
}

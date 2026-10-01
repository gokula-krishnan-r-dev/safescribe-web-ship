import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import OpenAI from 'openai';
import { ConsultationStep, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { AiConfigService } from '@/modules/ai-config/ai-config.service';
import { AI_PROMPT_KEYS } from '@/modules/ai-config/ai-config.defaults';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import {
  applyStableResponses,
  confirmAllMappings,
  evaluateTherapyReviewGate,
  ingredientAliasMatches,
  isIndicationResolved,
  medicationDirections,
  medicationDisplayName,
  medicationFingerprint,
  medicationIngredientKeys,
  parseRenewPayload,
  parseTherapyReview,
  resolveIndicationMapping,
  SAFESCRIBE_MODULES,
  syncConditionReviews,
  therapyReviewIntegrityError,
  type RenewConditionCatalogItem,
  type CuratedIndicationRow,
  type RenewIndicationCandidate,
  type RenewMedication,
  type RenewMedicationIndication,
  type RenewPayload,
  type RenewTherapyReviewState,
} from '@safescript/shared';
import {
  normalizeConditionAlias,
  RENEW_STARTER_CONDITIONS,
  RENEW_STARTER_INDICATION_MAPS,
} from './renew-condition-library.data';

const RANKING_PROMPT = `You are assisting a Canadian pharmacist using SafeScribe Renew.

Your task is ONLY to rank likely medication indications from a supplied CLOSED APPROVED CONDITION LIST.

You are not diagnosing the patient.
You are not deciding whether the medication should be renewed.
You are not allowed to invent a condition outside the supplied condition list.
You are not allowed to mark adherence, effectiveness, tolerability, safety, or renewal eligibility.

Use the medication name, normalized ingredient, strength, dosage form, directions, and the other confirmed medications only as contextual evidence for ranking.

If multiple indications are plausible, return status = needs_confirmation.
If there is no supported match, return status = manual_review.
Never force a single indication when the evidence is ambiguous.
Never replace pharmacist-confirmed mappings.

Return JSON only matching the supplied schema.`;

export interface TherapyReviewResponse {
  medications: RenewMedication[];
  therapyReview: RenewTherapyReviewState;
  conditions: RenewConditionCatalogItem[];
  gate: ReturnType<typeof evaluateTherapyReviewGate>;
  suggestionsUnavailable: boolean;
  updatedConditionCount?: number;
  preservedConditionCount?: number;
  skippedUnsavedCount?: number;
}

@Injectable()
export class RenewTherapyReviewService {
  private readonly logger = new Logger(RenewTherapyReviewService.name);
  private readonly openai: OpenAI | null;
  private libraryReady = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly aiConfig: AiConfigService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async getTherapyReview(consultationId: string, user: RequestUser): Promise<TherapyReviewResponse> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    await this.ensureLibrary();
    const payload = parseRenewPayload(consultation.renewPayload);
    this.assertStep1Confirmed(payload);

    const conditions = await this.listActiveConditions();
    const therapyReview = await this.buildMappings(payload, conditions);
    const saved = await this.persistTherapyReview(consultationId, payload, therapyReview);

    return {
      medications: payload.medicationList.items,
      therapyReview: saved,
      conditions,
      gate: evaluateTherapyReviewGate(payload.medicationList.items, saved, conditions),
      suggestionsUnavailable: !this.openai,
    };
  }

  async suggestMappings(consultationId: string, user: RequestUser): Promise<TherapyReviewResponse> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    await this.ensureLibrary();
    const payload = parseRenewPayload(consultation.renewPayload);
    this.assertStep1Confirmed(payload);
    const conditions = await this.listActiveConditions();
    let therapyReview = payload.therapyReview;
    if (!therapyReview.mappings.length) {
      therapyReview = await this.buildMappings(payload, conditions);
    }

    let suggestionsUnavailable = !this.openai;
    try {
      therapyReview = await this.rankUnresolvedWithAi(payload.medicationList.items, therapyReview, conditions);
      therapyReview = await this.suggestAddConditions(payload.medicationList.items, therapyReview, conditions);
    } catch (error) {
      this.logger.warn(
        `Indication ranking unavailable for ${consultationId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      suggestionsUnavailable = true;
    }

    const saved = await this.persistTherapyReview(consultationId, payload, therapyReview);
    return {
      medications: payload.medicationList.items,
      therapyReview: saved,
      conditions,
      gate: evaluateTherapyReviewGate(payload.medicationList.items, saved, conditions),
      suggestionsUnavailable,
    };
  }

  async searchConditions(consultationId: string, user: RequestUser, q: string) {
    await this.requireRenewConsultation(consultationId, user);
    await this.ensureLibrary();
    return this.queryConditionCatalog(q);
  }

  /**
   * Pharmacist-facing condition library search for any consultation module
   * (patient history pickers, Adapt/Prescribe free-text conditions, etc.).
   * Backed by the same RenewCondition master table as therapy review.
   */
  async searchConditionCatalog(consultationId: string, user: RequestUser, q: string) {
    await this.requireConsultationAccess(consultationId, user);
    await this.ensureLibrary();
    return this.queryConditionCatalog(q);
  }

  private async queryConditionCatalog(q: string): Promise<RenewConditionCatalogItem[]> {
    const query = q.trim();
    if (!query) {
      const common = await this.prisma.renewCondition.findMany({
        where: { active: true, commonForRenewal: true, code: { not: 'OTHER_CUSTOM' } },
        orderBy: [{ displayPriority: 'asc' }, { displayName: 'asc' }],
        take: 12,
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
      take: 20,
    });
    const aliasIds = aliases.map((row) => row.conditionId);
    const rows = await this.prisma.renewCondition.findMany({
      where: {
        active: true,
        code: { not: 'OTHER_CUSTOM' },
        OR: [
          { displayName: { contains: query, mode: 'insensitive' } },
          { code: { contains: query.toUpperCase().replace(/\s+/g, '_'), mode: 'insensitive' } },
          ...(aliasIds.length ? [{ id: { in: aliasIds } }] : []),
        ],
      },
      orderBy: [{ displayPriority: 'asc' }, { displayName: 'asc' }],
      take: 20,
    });
    return rows.map(toCatalogItem);
  }

  async addCondition(
    consultationId: string,
    user: RequestUser,
    body: { conditionId?: string; customText?: string; medicationIds?: string[] },
  ): Promise<TherapyReviewResponse> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    const payload = parseRenewPayload(consultation.renewPayload);
    this.assertStep1Confirmed(payload);
    await this.ensureLibrary();
    const conditions = await this.listActiveConditions();

    let conditionId = body.conditionId?.trim() || null;
    let customText = body.customText?.trim() || null;
    if (conditionId) {
      const approved = conditions.find((row) => row.id === conditionId);
      if (!approved || approved.code === 'OTHER_CUSTOM') {
        if (approved?.code === 'OTHER_CUSTOM' && !customText) {
          throw new BadRequestException('Specify the custom indication.');
        }
        if (!approved) throw new BadRequestException('That condition is not in the approved library.');
      }
      if (approved.code === 'OTHER_CUSTOM') conditionId = null;
    } else if (!customText) {
      throw new BadRequestException('Select a condition or specify a custom indication.');
    }

    const therapy = { ...payload.therapyReview };
    const existing = therapy.reviews.find((review) =>
      conditionId
        ? review.conditionId === conditionId
        : (review.customConditionText ?? '').trim().toLowerCase() === customText!.toLowerCase(),
    );
    if (existing && !(body.medicationIds ?? []).length) {
      throw new BadRequestException(
        `${existing.customConditionText || conditions.find((c) => c.id === existing.conditionId)?.displayName || 'This condition'} is already part of this therapy review.`,
      );
    }

    if (!existing) {
      therapy.reviews = [
        ...therapy.reviews,
        {
          id: newReviewId(),
          conditionId,
          customConditionText: customText,
          adherenceStatus: null,
          effectivenessStatus: null,
          medicationConcernStatus: null,
          answerSource: null,
          issues: [],
          manuallyPreserved: true,
        },
      ];
    }

    for (const medicationId of body.medicationIds ?? []) {
      if (!payload.medicationList.items.some((med) => med.id === medicationId)) continue;
      therapy.mappings = this.upsertMapping(therapy.mappings, {
        medicationId,
        conditionId,
        customIndicationText: customText,
        mappingSource: customText && !conditionId ? 'custom' : 'pharmacist_selected',
        status: customText && !conditionId ? 'custom' : 'pharmacist_confirmed',
        pharmacistConfirmed: true,
        candidates: [],
      });
    }

    therapy.reviews = syncConditionReviews(therapy.mappings, therapy.reviews);
    const saved = await this.persistTherapyReview(consultationId, payload, therapy);
    return this.toResponse(payload, saved, conditions, !this.openai);
  }

  async setMedicationIndication(
    consultationId: string,
    user: RequestUser,
    medicationId: string,
    body: { conditionId?: string | null; customIndicationText?: string | null },
  ): Promise<TherapyReviewResponse> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    const payload = parseRenewPayload(consultation.renewPayload);
    this.assertStep1Confirmed(payload);
    const med = payload.medicationList.items.find((row) => row.id === medicationId);
    if (!med) throw new NotFoundException('Medication not found on this renewal.');
    await this.ensureLibrary();
    const conditions = await this.listActiveConditions();

    let conditionId = body.conditionId?.trim() || null;
    const customIndicationText = body.customIndicationText?.trim() || null;
    if (conditionId) {
      const approved = conditions.find((row) => row.id === conditionId);
      if (!approved) throw new BadRequestException('That condition is not in the approved library.');
      if (approved.code === 'OTHER_CUSTOM') conditionId = null;
    }
    const therapy = { ...payload.therapyReview };
    const previous = therapy.mappings.find((row) => row.medicationId === medicationId);
    if (!conditionId && !customIndicationText) {
      therapy.mappings = this.upsertMapping(therapy.mappings, {
        medicationId,
        conditionId: null,
        customIndicationText: null,
        mappingSource: 'pharmacist_changed',
        status: 'needs_confirmation',
        pharmacistConfirmed: false,
        candidates: previous?.candidates ?? [],
      });
      therapy.reviews = syncConditionReviews(therapy.mappings, therapy.reviews);
      therapy.completed = false;
      therapy.completedAt = null;
      const saved = await this.persistTherapyReview(consultationId, payload, therapy);
      return this.toResponse(payload, saved, conditions, !this.openai);
    }
    therapy.mappings = this.upsertMapping(therapy.mappings, {
      medicationId,
      conditionId,
      customIndicationText,
      mappingSource: customIndicationText && !conditionId ? 'custom' : 'pharmacist_changed',
      status: customIndicationText && !conditionId ? 'custom' : 'pharmacist_confirmed',
      pharmacistConfirmed: true,
      candidates: previous?.candidates ?? [],
    });
    therapy.reviews = syncConditionReviews(therapy.mappings, therapy.reviews);
    therapy.completed = false;
    therapy.completedAt = null;
    const saved = await this.persistTherapyReview(consultationId, payload, therapy);
    return this.toResponse(payload, saved, conditions, !this.openai);
  }

  async patchConditionReview(
    consultationId: string,
    user: RequestUser,
    reviewId: string,
    patch: {
      adherenceStatus?: 'yes' | 'no' | null;
      effectivenessStatus?: 'yes' | 'no' | 'unable_to_assess' | 'unsure' | 'no_unsure' | null;
      medicationConcernStatus?: 'no' | 'yes' | null;
      issues?: unknown[];
    },
  ): Promise<TherapyReviewResponse> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    const payload = parseRenewPayload(consultation.renewPayload);
    this.assertStep1Confirmed(payload);
    await this.ensureLibrary();
    const conditions = await this.listActiveConditions();
    const therapy = { ...payload.therapyReview };
    const index = therapy.reviews.findIndex((row) => row.id === reviewId);
    if (index < 0) throw new NotFoundException('Condition review not found.');
    const current = therapy.reviews[index]!;
    const parsedIssues = Array.isArray(patch.issues)
      ? parseTherapyReview({
          reviews: [{ id: current.id, issues: patch.issues }],
        }).reviews[0]?.issues ?? current.issues
      : current.issues;
    therapy.reviews = therapy.reviews.map((row, i) =>
      i === index
        ? {
            ...row,
            adherenceStatus: patch.adherenceStatus === undefined ? row.adherenceStatus : patch.adherenceStatus,
            effectivenessStatus:
              patch.effectivenessStatus === undefined ? row.effectivenessStatus : patch.effectivenessStatus,
            medicationConcernStatus:
              patch.medicationConcernStatus === undefined
                ? row.medicationConcernStatus
                : patch.medicationConcernStatus,
            issues: parsedIssues,
            answerSource: 'individual',
          }
        : row,
    );
    therapy.completed = false;
    therapy.completedAt = null;
    const saved = await this.persistTherapyReview(consultationId, payload, therapy);
    return this.toResponse(payload, saved, conditions, !this.openai);
  }

  async applyStableAll(
    consultationId: string,
    user: RequestUser,
    skipReviewIds: string[] = [],
  ): Promise<TherapyReviewResponse> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    const payload = parseRenewPayload(consultation.renewPayload);
    this.assertStep1Confirmed(payload);
    await this.ensureLibrary();
    const conditions = await this.listActiveConditions();
    const applied = applyStableResponses(
      payload.therapyReview.reviews,
      payload.therapyReview.mappings,
      { skipReviewIds },
    );
    for (const review of applied.reviews) {
      const integrity = therapyReviewIntegrityError(review);
      if (integrity) throw new BadRequestException(integrity);
    }
    const therapy = {
      ...payload.therapyReview,
      reviews: applied.reviews,
      completed: false,
      completedAt: null,
    };
    const saved = await this.persistTherapyReview(consultationId, payload, therapy);
    return {
      ...this.toResponse(payload, saved, conditions, !this.openai),
      updatedConditionCount: applied.updatedCount,
      preservedConditionCount: applied.preservedCount,
      skippedUnsavedCount: applied.skippedUnsavedCount,
    };
  }

  async complete(consultationId: string, user: RequestUser): Promise<TherapyReviewResponse> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    const payload = parseRenewPayload(consultation.renewPayload);
    this.assertStep1Confirmed(payload);
    await this.ensureLibrary();
    const conditions = await this.listActiveConditions();
    const gate = evaluateTherapyReviewGate(
      payload.medicationList.items,
      payload.therapyReview,
      conditions,
    );
    if (!gate.ok) {
      throw new BadRequestException(
        gate.itemsNeedingCompletion === 1
          ? '1 condition needs completion before continuing.'
          : `${gate.itemsNeedingCompletion || gate.attentionCount || 1} conditions need completion before continuing.`,
      );
    }
    const therapy: RenewTherapyReviewState = {
      ...payload.therapyReview,
      mappings: confirmAllMappings(payload.therapyReview.mappings),
      completed: true,
      completedAt: new Date().toISOString(),
    };
    const saved = await this.persistTherapyReview(
      consultationId,
      payload,
      therapy,
      2,
      ConsultationStep.RENEW_CLINICAL_ASSESSMENT,
    );
    return this.toResponse(payload, saved, conditions, !this.openai);
  }

  async ensureLibrary() {
    if (this.libraryReady) return;
    // Always upsert starter conditions/maps so Adapt/Renew coverage grows with the
    // starter library. Governed packs (sourceBatchId) remain; starter rows merge by unique key.
    const count = await this.prisma.renewCondition.count();
    if (count === 0) {
      await this.seedLibrary();
    } else {
      await this.upsertMissingLibraryRows();
    }
    this.libraryReady = true;
  }

  private async seedLibrary() {
    for (const condition of RENEW_STARTER_CONDITIONS) {
      await this.upsertCondition(condition);
    }
    await this.upsertIndicationMaps();
  }

  private async upsertMissingLibraryRows() {
    for (const condition of RENEW_STARTER_CONDITIONS) {
      await this.upsertCondition(condition);
    }
    await this.upsertIndicationMaps();
  }

  private async upsertCondition(condition: (typeof RENEW_STARTER_CONDITIONS)[number]) {
    const snomed = condition.snomedConceptId?.trim() || null;
    const row = await this.prisma.renewCondition.upsert({
      where: { code: condition.code },
      update: {
        displayName: condition.displayName,
        category: condition.category,
        description: condition.description,
        defaultEffectivenessQuestion: condition.defaultEffectivenessQuestion,
        commonForRenewal: condition.commonForRenewal,
        displayPriority: condition.displayPriority,
        active: true,
        ...(snomed
          ? {
              codeSystem: 'http://snomed.info/sct',
              externalCode: snomed,
            }
          : {}),
      },
      create: {
        code: condition.code,
        displayName: condition.displayName,
        category: condition.category,
        description: condition.description,
        defaultEffectivenessQuestion: condition.defaultEffectivenessQuestion,
        commonForRenewal: condition.commonForRenewal,
        displayPriority: condition.displayPriority,
        ...(snomed
          ? {
              codeSystem: 'http://snomed.info/sct',
              externalCode: snomed,
            }
          : {}),
      },
    });
    for (const alias of condition.aliases) {
      const normalizedAlias = normalizeConditionAlias(alias);
      if (!normalizedAlias) continue;
      await this.prisma.renewConditionAlias.upsert({
        where: {
          conditionId_normalizedAlias: { conditionId: row.id, normalizedAlias },
        },
        update: { alias, active: true },
        create: { conditionId: row.id, alias, normalizedAlias, active: true },
      });
    }
    return row;
  }

  private async upsertIndicationMaps() {
    const conditions = await this.prisma.renewCondition.findMany({ select: { id: true, code: true } });
    const byCode = new Map(conditions.map((row) => [row.code, row.id]));
    for (const map of RENEW_STARTER_INDICATION_MAPS) {
      const conditionId = byCode.get(map.conditionCode);
      if (!conditionId) continue;
      await this.prisma.renewMedicationIndicationMap.upsert({
        where: {
          medicationConceptId_conditionId: {
            medicationConceptId: map.ingredientKey,
            conditionId,
          },
        },
        update: {
          mappingStrength: map.mappingStrength,
          rankingWeight: map.rankingWeight,
          autoGroupAllowed: map.autoGroupAllowed,
          alwaysRequireConfirmation: map.alwaysRequireConfirmation,
          active: true,
        },
        create: {
          medicationConceptId: map.ingredientKey,
          conditionId,
          mappingStrength: map.mappingStrength,
          rankingWeight: map.rankingWeight,
          autoGroupAllowed: map.autoGroupAllowed,
          alwaysRequireConfirmation: map.alwaysRequireConfirmation,
        },
      });
    }
  }

  private async buildMappings(
    payload: RenewPayload,
    conditions: RenewConditionCatalogItem[],
  ): Promise<RenewTherapyReviewState> {
    const items = payload.medicationList.items;
    const fingerprint = medicationFingerprint(items);
    const existing = payload.therapyReview;
    const byMed = new Map(existing.mappings.map((row) => [row.medicationId, row]));
    const catalogById = new Map(conditions.map((row) => [row.id, row]));

    const maps = await this.prisma.renewMedicationIndicationMap.findMany({
      where: { active: true, condition: { active: true } },
      include: { condition: true },
    });

    const next: RenewMedicationIndication[] = [];
    for (const med of items) {
      const previous = byMed.get(med.id);
      if (
        previous &&
        (previous.pharmacistConfirmed ||
          previous.mappingSource === 'pharmacist_selected' ||
          previous.mappingSource === 'pharmacist_changed' ||
          previous.mappingSource === 'custom') &&
        isIndicationResolved(previous)
      ) {
        next.push(previous);
        continue;
      }

      const keys = medicationIngredientKeys(med);
      const curated: CuratedIndicationRow[] = maps
        .filter((row) =>
          ingredientAliasMatches(row.ingredientId || row.medicationConceptId, keys),
        )
        .filter((row) => catalogById.has(row.conditionId))
        .map((row) => ({
          conditionId: row.conditionId,
          conditionCode: row.condition.code,
          displayName: row.condition.displayName,
          mappingStrength: asStrength(row.mappingStrength),
          autoGroupAllowed: row.autoGroupAllowed,
          alwaysRequireConfirmation: row.alwaysRequireConfirmation,
          rankingWeight: row.rankingWeight ? Number(row.rankingWeight) : null,
        }));

      const unique = dedupeCurated(curated);
      const resolved = resolveIndicationMapping(unique);
      next.push({
        medicationId: med.id,
        conditionId: previous?.conditionId && isIndicationResolved(previous) ? previous.conditionId : resolved.conditionId,
        customIndicationText:
          previous?.customIndicationText && isIndicationResolved(previous)
            ? previous.customIndicationText
            : null,
        mappingSource: previous && isIndicationResolved(previous) ? previous.mappingSource : resolved.mappingSource,
        status: previous && isIndicationResolved(previous) ? previous.status : resolved.status,
        pharmacistConfirmed: previous?.pharmacistConfirmed ?? false,
        candidates: resolved.candidates.length ? resolved.candidates : previous?.candidates ?? [],
      });
    }

    return {
      mappings: next,
      reviews: syncConditionReviews(next, existing.reviews),
      suggestedConditionIds: existing.suggestedConditionIds,
      completed: existing.completed && fingerprint === existing.mappingFingerprint,
      completedAt: fingerprint === existing.mappingFingerprint ? existing.completedAt : null,
      mappingFingerprint: fingerprint,
    };
  }

  private async rankUnresolvedWithAi(
    items: RenewMedication[],
    therapy: RenewTherapyReviewState,
    conditions: RenewConditionCatalogItem[],
  ): Promise<RenewTherapyReviewState> {
    if (!this.openai) return therapy;
    const unresolved = therapy.mappings.filter((row) => !isIndicationResolved(row) && row.candidates.length > 0);
    if (!unresolved.length) return therapy;

    const allowed = conditions.map((row) => ({
      condition_code: catalogCode(row, conditions),
      condition_id: row.id,
      display_name: row.displayName,
    }));
    const codeById = new Map(conditions.map((row) => [row.id, row.code]));

    const payload = {
      medications: unresolved.map((row) => {
        const med = items.find((m) => m.id === row.medicationId);
        return {
          medication_id: row.medicationId,
          name: med ? medicationDisplayName(med) : row.medicationId,
          generic: med?.normalized.genericName ?? null,
          strength: med?.normalized.strength ?? null,
          dosage_form: med?.normalized.dosageForm ?? null,
          directions: med ? medicationDirections(med) : null,
          allowed_candidates: row.candidates.map((c) => ({
            condition_code: c.conditionCode,
            condition_id: c.conditionId,
            display_name: c.displayName,
          })),
        };
      }),
      other_confirmed_medications: items
        .filter((med) => !unresolved.some((row) => row.medicationId === med.id))
        .map((med) => ({
          name: medicationDisplayName(med),
          generic: med.normalized.genericName,
        })),
      closed_condition_list: allowed,
    };

    const prompt = this.aiConfig.getPrompt(AI_PROMPT_KEYS.RENEW_INDICATION_RANKING, RANKING_PROMPT);
    const response = await this.openai.chat.completions.create({
      model: this.config.get<string>('OPENAI_MODEL', 'gpt-5.6-luna'),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content: `Rank indications for these unresolved medications. Use only the supplied candidate condition codes.\n\n${JSON.stringify(payload)}`,
        },
      ],
      max_completion_tokens: 2048,
    });

    const parsed = parseJsonObject(response.choices[0]?.message?.content ?? '{}');
    const ranked = Array.isArray(parsed.medications) ? parsed.medications : [];
    const byMed = new Map<string, RenewIndicationCandidate[]>();
    for (const row of ranked) {
      if (!row || typeof row !== 'object') continue;
      const rec = row as Record<string, unknown>;
      const medicationId = typeof rec.medication_id === 'string' ? rec.medication_id : null;
      if (!medicationId) continue;
      const original = unresolved.find((m) => m.medicationId === medicationId);
      if (!original) continue;
      const allowedIds = new Set(original.candidates.map((c) => c.conditionId));
      const candidates = Array.isArray(rec.candidates) ? rec.candidates : [];
      const nextCandidates: RenewIndicationCandidate[] = [];
      candidates.forEach((c, index) => {
        if (!c || typeof c !== 'object') return;
        const cand = c as Record<string, unknown>;
        const code = typeof cand.condition_code === 'string' ? cand.condition_code : null;
        const id =
          (typeof cand.condition_id === 'string' && cand.condition_id) ||
          conditions.find((row) => row.code === code)?.id;
        if (!id || !allowedIds.has(id)) return;
        const catalog = conditions.find((row) => row.id === id);
        if (!catalog) return;
        nextCandidates.push({
          conditionId: id,
          conditionCode: catalog.code,
          displayName: catalog.displayName,
          mappingStrength: original.candidates.find((x) => x.conditionId === id)?.mappingStrength ?? null,
          rank: index + 1,
          confidenceBand:
            cand.confidence_band === 'high' || cand.confidence_band === 'moderate' || cand.confidence_band === 'low'
              ? cand.confidence_band
              : 'moderate',
        });
      });
      if (nextCandidates.length) byMed.set(medicationId, nextCandidates);
      void codeById;
    }

    return {
      ...therapy,
      mappings: therapy.mappings.map((row) => {
        const rankedCandidates = byMed.get(row.medicationId);
        if (!rankedCandidates) return row;
        return { ...row, mappingSource: 'ai_ranked', candidates: rankedCandidates };
      }),
    };
  }

  private async suggestAddConditions(
    items: RenewMedication[],
    therapy: RenewTherapyReviewState,
    conditions: RenewConditionCatalogItem[],
  ): Promise<RenewTherapyReviewState> {
    const used = new Set(
      therapy.mappings.map((row) => row.conditionId).filter((id): id is string => Boolean(id)),
    );
    // Prefer master-table indication-map candidates (unresolved first, then all).
    const unresolvedIds = new Set(
      therapy.mappings.filter((row) => !isIndicationResolved(row)).map((row) => row.medicationId),
    );
    const fromMaps = therapy.mappings
      .flatMap((row) =>
        row.candidates.map((c) => ({
          ...c,
          unresolvedBoost: unresolvedIds.has(row.medicationId) ? 0 : 50,
        })),
      )
      .filter((c) => !used.has(c.conditionId));
    const ranked = [...fromMaps].sort(
      (a, b) => a.unresolvedBoost + (a.rank ?? 99) - (b.unresolvedBoost + (b.rank ?? 99)),
    );
    const ids: string[] = [];
    for (const candidate of ranked) {
      if (ids.includes(candidate.conditionId)) continue;
      ids.push(candidate.conditionId);
      if (ids.length >= 5) break;
    }
    if (ids.length < 4) {
      const commons = [...conditions]
        .filter((row) => row.commonForRenewal && row.code !== 'OTHER_CUSTOM')
        .sort(
          (a, b) =>
            a.displayPriority - b.displayPriority || a.displayName.localeCompare(b.displayName),
        );
      for (const row of commons) {
        if (used.has(row.id) || ids.includes(row.id)) continue;
        ids.push(row.id);
        if (ids.length >= 5) break;
      }
    }
    void items;
    return { ...therapy, suggestedConditionIds: ids };
  }

  private upsertMapping(
    mappings: RenewMedicationIndication[],
    next: RenewMedicationIndication,
  ): RenewMedicationIndication[] {
    const exists = mappings.some((row) => row.medicationId === next.medicationId);
    return exists
      ? mappings.map((row) => (row.medicationId === next.medicationId ? { ...row, ...next } : row))
      : [...mappings, next];
  }

  private async persistTherapyReview(
    consultationId: string,
    payload: RenewPayload,
    therapyReview: RenewTherapyReviewState,
    stepIndex?: number,
    currentStep?: ConsultationStep,
  ): Promise<RenewTherapyReviewState> {
    const next: RenewPayload = { ...payload, therapyReview };
    await this.prisma.consultation.update({
      where: { id: consultationId },
      data: {
        renewPayload: JSON.parse(JSON.stringify(next)) as Prisma.InputJsonValue,
        ...(stepIndex != null
          ? {
              stepIndex,
              currentStep: currentStep ?? ConsultationStep.RENEW_THERAPY_REVIEW,
            }
          : {}),
      },
    });
    return therapyReview;
  }

  private toResponse(
    payload: RenewPayload,
    therapyReview: RenewTherapyReviewState,
    conditions: RenewConditionCatalogItem[],
    suggestionsUnavailable: boolean,
  ): TherapyReviewResponse {
    return {
      medications: payload.medicationList.items,
      therapyReview,
      conditions,
      gate: evaluateTherapyReviewGate(payload.medicationList.items, therapyReview, conditions),
      suggestionsUnavailable,
    };
  }

  private async listActiveConditions(): Promise<RenewConditionCatalogItem[]> {
    const rows = await this.prisma.renewCondition.findMany({
      where: { active: true },
      orderBy: [{ displayPriority: 'asc' }, { displayName: 'asc' }],
    });
    return rows.map(toCatalogItem);
  }

  private async requireConsultationAccess(id: string, user: RequestUser) {
    const consultation = await this.prisma.consultation.findUnique({ where: { id } });
    if (!consultation) throw new NotFoundException('Consultation not found');
    if (user.role === 'SUPER_ADMIN') return consultation;
    if (user.role === 'PHARMACIST_ADMIN' && user.tenantId && consultation.tenantId === user.tenantId) {
      return consultation;
    }
    if (consultation.pharmacistId === user.id) return consultation;
    throw new ForbiddenException('You do not have access to this consultation');
  }

  private async requireRenewConsultation(id: string, user: RequestUser) {
    const consultation = await this.requireConsultationAccess(id, user);
    if (consultation.module !== SAFESCRIBE_MODULES.RENEW) {
      throw new BadRequestException('Therapy review is only available on Renew consultations');
    }
    return consultation;
  }

  private assertStep1Confirmed(payload: RenewPayload) {
    if (!payload.medicationList.confirmed || payload.medicationList.items.length === 0) {
      throw new BadRequestException('Confirm the medication list in Step 1 before therapy review.');
    }
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

function asStrength(value: string): CuratedIndicationRow['mappingStrength'] {
  if (value === 'primary' || value === 'common' || value === 'possible' || value === 'rare') return value;
  return 'possible';
}

function dedupeCurated(rows: CuratedIndicationRow[]): CuratedIndicationRow[] {
  const byId = new Map<string, CuratedIndicationRow>();
  for (const row of rows) {
    const current = byId.get(row.conditionId);
    if (!current || (row.rankingWeight ?? 0) > (current.rankingWeight ?? 0)) {
      byId.set(row.conditionId, row);
    }
  }
  return [...byId.values()];
}

function catalogCode(row: RenewConditionCatalogItem, all: RenewConditionCatalogItem[]): string {
  return all.find((c) => c.id === row.id)?.code ?? row.code;
}

function parseJsonObject(content: string): Record<string, unknown> {
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function newReviewId() {
  return `rrev_${randomBytes(8).toString('hex')}`;
}

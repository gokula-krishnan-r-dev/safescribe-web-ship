import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '@/prisma/prisma.service';
import { AiConfigService } from '@/modules/ai-config/ai-config.service';
import { AI_PROMPT_KEYS } from '@/modules/ai-config/ai-config.defaults';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import {
  generateDraftRationale,
  parseAdaptPayload,
  SAFESCRIBE_MODULES,
  type AdaptPayload,
  type ProposedPrescription,
} from '@safescript/shared';
import {
  isUnsupportedTemperatureError,
  withOptionalTemperature,
} from '@/common/utils/openai-compat';

const DEFAULT_RATIONALE_PROMPT = `You are assisting a Canadian pharmacist documenting a clinical rationale in SafeScribe Adapt Step 3A.

Task: write a precise, professional clinical rationale (max 500 characters) for the proposed adaptation.

Rules:
1. Be specific to THIS case — use the original medication, proposed change, adaptation type/reason, allergies, conditions, labs, and medication experience when provided.
2. Never invent patient facts (labs, allergies, diagnoses) that are not supplied.
3. Match the adaptation TYPE accurately:
   - therapeutic_substitution → explain why a different drug is appropriate (do NOT call it a "dose adjustment")
   - dose → explain the dose change
   - regimen / route / dosage_form / other → describe that change correctly
4. Mention the key patient-specific driver (e.g. documented allergy to X) when present.
5. Include brief monitoring/follow-up only if space allows.
6. Plain professional prose. No bullet lists. No markdown. No quotes around the whole answer.
7. Stay within 500 characters. Prefer 2–4 concise sentences.
8. Return JSON only: { "rationale": "..." }`;

export type AdaptClinicalRationaleResponse = {
  rationale: string;
  source: 'ai' | 'deterministic_fallback';
  model?: string;
  unavailableReason?: string;
};

@Injectable()
export class AdaptClinicalRationaleService {
  private readonly logger = new Logger(AdaptClinicalRationaleService.name);
  private readonly openai: OpenAI | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly aiConfig: AiConfigService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async generate(
    consultationId: string,
    user: RequestUser,
    proposedOverride?: ProposedPrescription | null,
  ): Promise<AdaptClinicalRationaleResponse> {
    const consultation = await this.requireAdaptConsultation(consultationId, user);
    const payload = parseAdaptPayload(consultation.renewPayload, 'AB');
    const step1 = payload.step1;
    if (!step1?.originalPrescription) {
      throw new BadRequestException(
        'Original prescription is required before generating a clinical rationale.',
      );
    }

    const proposed =
      proposedOverride && proposedOverride.drugName?.trim()
        ? proposedOverride
        : payload.step3A?.proposedPrescription;

    if (!proposed?.drugName?.trim()) {
      throw new BadRequestException(
        'Complete the proposed prescription before generating a clinical rationale.',
      );
    }

    const fallback = generateDraftRationale(
      step1,
      payload.step2A,
      payload.step2B,
      proposed,
    ).slice(0, 500);

    if (!this.openai) {
      return {
        rationale: fallback,
        source: 'deterministic_fallback',
        unavailableReason: 'AI is not configured for this environment.',
      };
    }

    try {
      const aiText = await this.callAi(payload, proposed);
      if (!aiText) {
        return {
          rationale: fallback,
          source: 'deterministic_fallback',
          unavailableReason: 'AI returned an empty rationale.',
        };
      }
      return {
        rationale: aiText.slice(0, 500),
        source: 'ai',
        model:
          this.aiConfig.getSettings().openaiModel ||
          this.config.get<string>('OPENAI_MODEL') ||
          undefined,
      };
    } catch (err) {
      this.logger.warn(
        `clinical rationale AI failed consultationId=${consultationId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return {
        rationale: fallback,
        source: 'deterministic_fallback',
        unavailableReason: 'AI draft unavailable; used structured fallback.',
      };
    }
  }

  private async callAi(
    payload: AdaptPayload,
    proposed: ProposedPrescription,
  ): Promise<string> {
    const step1 = payload.step1!;
    const original = step1.originalPrescription!;
    const prompt = this.aiConfig.getPrompt(
      AI_PROMPT_KEYS.ADAPT_CLINICAL_RATIONALE,
      DEFAULT_RATIONALE_PROMPT,
    );
    const model =
      this.aiConfig.getSettings().openaiModel ||
      this.config.get<string>('OPENAI_MODEL', 'gpt-4.1-mini');

    const createParams = withOptionalTemperature(
      {
        model,
        max_completion_tokens: 280,
        response_format: { type: 'json_object' as const },
        messages: [
          { role: 'system' as const, content: prompt },
          {
            role: 'user' as const,
            content: JSON.stringify({
              maxCharacters: 500,
              adaptation: {
                type: step1.adaptationType,
                reason: step1.adaptationReason,
                additionalComments: step1.additionalComments || null,
                customAdaptationSummary: payload.step3A?.customAdaptationSummary || null,
                changeSummary: payload.step3A?.changeSummary || null,
              },
              originalMedication: {
                display:
                  original.normalized?.genericName ||
                  original.normalized?.brandName ||
                  original.raw?.medicationText ||
                  null,
                strength: original.normalized?.strength ?? null,
                dosageForm: original.normalized?.dosageForm ?? null,
                route: original.normalized?.route ?? null,
                directions:
                  original.raw?.directionsText || original.normalized?.directions || null,
              },
              proposedPrescription: {
                drugName: proposed.drugName,
                genericName: proposed.genericName ?? null,
                brandName: proposed.brandName ?? null,
                strength: proposed.strength ?? null,
                dosageForm: proposed.dosageForm ?? null,
                dose: proposed.dose ?? null,
                frequency: proposed.frequency ?? null,
                route: proposed.route ?? null,
                quantity: proposed.quantity ?? null,
                refills: proposed.refills ?? null,
                sig: proposed.sig ?? null,
              },
              patient: {
                age: payload.step2A?.demographics?.age ?? null,
                ageUnit: payload.step2A?.demographics?.ageUnit ?? null,
                sex: payload.step2A?.demographics?.sex ?? null,
                pregnancyStatus: payload.step2A?.demographics?.pregnancyStatus ?? null,
                allergies: (payload.step2A?.background?.allergyEntries ?? []).map((a) => ({
                  drug: a.drug,
                  reaction: a.reaction ?? null,
                  severity: a.severity ?? null,
                })),
                allergiesNone: payload.step2A?.background?.allergiesNone ?? false,
                conditions: payload.step2A?.background?.conditions ?? [],
                conditionsNone: payload.step2A?.background?.conditionsNone ?? false,
              },
              medicationExperience: {
                isTaking: payload.step2B?.isTakingMedication ?? null,
                adverseEffects: payload.step2B?.adverseEffects ?? null,
                adverseEffectsDescription: payload.step2B?.adverseEffectsDescription ?? null,
                adherence: payload.step2B?.adherence ?? null,
                effectiveness: payload.step2B?.effectiveness ?? null,
                patientGoals: payload.step2B?.patientGoals ?? null,
              },
              labs: {
                freeText: payload.step2C?.labValues ?? null,
                extracted: (payload.step2C?.extractedLabValues ?? []).slice(0, 6),
              },
            }),
          },
        ],
      },
      0.3,
    );

    let response;
    try {
      response = await this.openai!.chat.completions.create(createParams);
    } catch (err) {
      if (isUnsupportedTemperatureError(err) && 'temperature' in createParams) {
        delete createParams.temperature;
        this.logger.warn(
          `Model ${model} rejected temperature — retrying clinical rationale with API default`,
        );
        response = await this.openai!.chat.completions.create(createParams);
      } else {
        throw err;
      }
    }

    const content = response.choices[0]?.message?.content ?? '{}';
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch {
      return '';
    }
    return typeof parsed.rationale === 'string' ? parsed.rationale.trim() : '';
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

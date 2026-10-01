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
  parseAdaptPayload,
  SAFESCRIBE_MODULES,
  type AdaptPayload,
} from '@safescript/shared';
import {
  isUnsupportedTemperatureError,
  withOptionalTemperature,
} from '@/common/utils/openai-compat';

const DEFAULT_GUIDANCE_PROMPT = `You are assisting a Canadian pharmacist using SafeScribe Adapt Step 3A (Proposed Adaptation).

Task: produce concise, PATIENT- AND CASE-SPECIFIC clinical guidance for the pharmacist while they design the proposed adaptation.

Rules:
1. Ground every point in the supplied case: original medication, adaptation type/reason, allergies, conditions, labs, and medication experience.
2. Do NOT give generic boilerplate that could apply to any adaptation type (e.g. "guidance is available").
3. Do NOT invent labs, allergies, diagnoses, or patient facts that are not provided.
4. Prefer Canadian practice norms and pharmacist-actionable wording.
5. If allergy or hypersensitivity is the reason, focus on cross-reactivity, safer alternatives, and counselling — without diagnosing.
6. Guidance supports judgment; never instruct the pharmacist that they must choose a specific product.
7. Keep each bullet to one clear sentence (max ~140 characters).
8. Return JSON only matching the schema. No markdown.

Schema:
{
  "caseFocus": "short headline for this case (e.g. Amoxicillin allergy — therapeutic substitution)",
  "summary": "1–2 sentence sidebar summary specific to this patient/case",
  "keyPoints": ["3–5 bullets: clinical decision points for this adaptation"],
  "comparativeOptions": ["3–5 bullets: how to compare/select alternatives for THIS case"],
  "monitoring": ["3–5 bullets: monitoring and follow-up appropriate to THIS case"]
}`;

export type AdaptClinicalGuidanceResponse = {
  caseFocus: string;
  summary: string;
  keyPoints: string[];
  comparativeOptions: string[];
  monitoring: string[];
  source: 'ai' | 'unavailable';
  model?: string;
  unavailableReason?: string;
};

@Injectable()
export class AdaptClinicalGuidanceService {
  private readonly logger = new Logger(AdaptClinicalGuidanceService.name);
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
  ): Promise<AdaptClinicalGuidanceResponse> {
    const consultation = await this.requireAdaptConsultation(consultationId, user);
    const payload = parseAdaptPayload(consultation.renewPayload, 'AB');
    const step1 = payload.step1;
    if (!step1?.originalPrescription) {
      throw new BadRequestException(
        'Original prescription is required before generating clinical guidance.',
      );
    }

    if (!this.openai) {
      return this.unavailable('AI is not configured for this environment.');
    }

    try {
      return await this.callAi(payload);
    } catch (err) {
      this.logger.warn(
        `clinical guidance AI failed consultationId=${consultationId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return this.unavailable(
        'Could not generate case-specific guidance right now. Try again shortly.',
      );
    }
  }

  private async callAi(payload: AdaptPayload): Promise<AdaptClinicalGuidanceResponse> {
    const step1 = payload.step1!;
    const original = step1.originalPrescription!;
    const drugName =
      original.normalized?.genericName ||
      original.normalized?.brandName ||
      original.raw?.medicationText ||
      'Medication';

    const prompt = this.aiConfig.getPrompt(
      AI_PROMPT_KEYS.ADAPT_CLINICAL_GUIDANCE,
      DEFAULT_GUIDANCE_PROMPT,
    );
    const model =
      this.aiConfig.getSettings().openaiModel ||
      this.config.get<string>('OPENAI_MODEL', 'gpt-4.1-mini');

    const createParams = withOptionalTemperature(
      {
        model,
        max_completion_tokens: 900,
        response_format: { type: 'json_object' as const },
        messages: [
          { role: 'system' as const, content: prompt },
          {
            role: 'user' as const,
            content: JSON.stringify({
              context: {
                jurisdiction: step1.jurisdiction || 'AB',
                adaptationType: step1.adaptationType,
                adaptationReason: step1.adaptationReason,
                additionalComments: step1.additionalComments || null,
                proposedPrescription: payload.step3A?.proposedPrescription ?? null,
                patient: {
                  age: payload.step2A?.demographics?.age ?? null,
                  ageUnit: payload.step2A?.demographics?.ageUnit ?? null,
                  sex: payload.step2A?.demographics?.sex ?? null,
                  pregnancyStatus: payload.step2A?.demographics?.pregnancyStatus ?? null,
                  breastfeedingStatus:
                    payload.step2A?.demographics?.breastfeedingStatus ?? null,
                  allergies: (payload.step2A?.background?.allergyEntries ?? [])
                    .map((a) => ({
                      drug: a.drug,
                      reaction: a.reaction ?? null,
                      severity: a.severity ?? null,
                    }))
                    .filter((a) => Boolean(a.drug)),
                  allergiesNone: payload.step2A?.background?.allergiesNone ?? false,
                  conditions: payload.step2A?.background?.conditions ?? [],
                  conditionsNone: payload.step2A?.background?.conditionsNone ?? false,
                },
                medicationExperience: {
                  isTaking: payload.step2B?.isTakingMedication ?? null,
                  adverseEffects: payload.step2B?.adverseEffects ?? null,
                  adverseEffectsDescription:
                    payload.step2B?.adverseEffectsDescription ?? null,
                  adherence: payload.step2B?.adherence ?? null,
                  effectiveness: payload.step2B?.effectiveness ?? null,
                },
                labs: {
                  freeText: payload.step2C?.labValues ?? null,
                  extracted: (payload.step2C?.extractedLabValues ?? [])
                    .slice(0, 8)
                    .map((lab) => ({
                      test: lab.test,
                      value: lab.value,
                      unit: lab.unit ?? null,
                    })),
                },
              },
              originalMedication: {
                display: drugName,
                generic: original.normalized?.genericName ?? null,
                brand: original.normalized?.brandName ?? null,
                strength: original.normalized?.strength ?? null,
                dosageForm: original.normalized?.dosageForm ?? null,
                route: original.normalized?.route ?? null,
                directions:
                  original.raw?.directionsText ||
                  original.normalized?.directions ||
                  null,
              },
            }),
          },
        ],
      },
      0.25,
    );

    let response;
    try {
      response = await this.openai!.chat.completions.create(createParams);
    } catch (err) {
      if (isUnsupportedTemperatureError(err) && 'temperature' in createParams) {
        delete createParams.temperature;
        this.logger.warn(
          `Model ${model} rejected temperature — retrying clinical guidance with API default`,
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
      return this.unavailable('Guidance response could not be parsed.');
    }

    const keyPoints = this.asStringList(parsed.keyPoints, 5);
    const comparativeOptions = this.asStringList(parsed.comparativeOptions, 5);
    const monitoring = this.asStringList(parsed.monitoring, 5);

    if (keyPoints.length === 0 && comparativeOptions.length === 0 && monitoring.length === 0) {
      return this.unavailable('No case-specific guidance was returned.');
    }

    const caseFocus =
      (typeof parsed.caseFocus === 'string' && parsed.caseFocus.trim()) ||
      `${drugName} — ${step1.adaptationType?.replace(/_/g, ' ') || 'adaptation'}`;
    const summary =
      (typeof parsed.summary === 'string' && parsed.summary.trim()) ||
      keyPoints[0] ||
      'Review case-specific points before confirming the proposed adaptation.';

    return {
      caseFocus: caseFocus.slice(0, 160),
      summary: summary.slice(0, 320),
      keyPoints,
      comparativeOptions,
      monitoring,
      source: 'ai',
      model,
    };
  }

  private asStringList(value: unknown, max: number): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
      .map((item) => item.trim().slice(0, 200))
      .slice(0, max);
  }

  private unavailable(reason: string): AdaptClinicalGuidanceResponse {
    return {
      caseFocus: '',
      summary: '',
      keyPoints: [],
      comparativeOptions: [],
      monitoring: [],
      source: 'unavailable',
      unavailableReason: reason,
    };
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

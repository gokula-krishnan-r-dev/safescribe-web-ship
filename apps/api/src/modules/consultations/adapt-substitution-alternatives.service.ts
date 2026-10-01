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
import { TerminologyService } from '@/modules/terminology/terminology.service';
import {
  parseAdaptPayload,
  SAFESCRIBE_MODULES,
  type AdaptPayload,
  type ProposedPrescription,
} from '@safescript/shared';
import {
  isUnsupportedTemperatureError,
  withOptionalTemperature,
} from '@/common/utils/openai-compat';

const DEFAULT_SUBSTITUTION_PROMPT = `You are assisting a Canadian pharmacist using SafeScribe Adapt (therapeutic substitution).

Task: suggest evidence-informed REPLACEMENT medications when the original drug is not suitable to continue as written.

Rules:
1. Never suggest the same ingredient / same drug as the original.
2. Prefer guideline-aligned, commonly stocked Canadian options in the same therapeutic class or an accepted clinical alternative for the adaptation reason.
3. Pharmacist decides — you only propose candidates. Do not invent diagnoses.
4. Each alternative must include realistic strengths used in practice and a short pharmacist-facing rationale (1 sentence).
5. Prefer oral options when the original is oral, unless route change is clearly appropriate.
6. Return 3–5 alternatives maximum, highest clinical usefulness first.
7. Return JSON only matching the schema. No markdown.

Schema:
{
  "alternatives": [
    {
      "genericName": "string",
      "brandExample": "string or null",
      "strengths": ["10 mg", "20 mg"],
      "defaultStrength": "10 mg",
      "dosageForm": "tablet",
      "route": "By mouth",
      "frequency": "Once daily",
      "rationale": "Why this is a useful substitution candidate for this case",
      "therapeuticClass": "short class label"
    }
  ]
}`;

export type AdaptSubstitutionAlternativeDto = {
  id: string;
  name: string;
  genericName?: string;
  brandName?: string;
  strengths: string[];
  defaultStrength: string;
  dosageForm: string;
  metadata?: string;
  rationale?: string;
  drugId?: string;
  proposed: ProposedPrescription;
  source: 'ai';
};

export type AdaptSubstitutionAlternativesResponse = {
  alternatives: AdaptSubstitutionAlternativeDto[];
  source: 'ai' | 'unavailable';
  model?: string;
  unavailableReason?: string;
};

type AiAltRow = {
  genericName?: unknown;
  brandExample?: unknown;
  strengths?: unknown;
  defaultStrength?: unknown;
  dosageForm?: unknown;
  route?: unknown;
  frequency?: unknown;
  rationale?: unknown;
  therapeuticClass?: unknown;
};

@Injectable()
export class AdaptSubstitutionAlternativesService {
  private readonly logger = new Logger(AdaptSubstitutionAlternativesService.name);
  private readonly openai: OpenAI | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly aiConfig: AiConfigService,
    private readonly terminology: TerminologyService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async suggest(
    consultationId: string,
    user: RequestUser,
  ): Promise<AdaptSubstitutionAlternativesResponse> {
    const consultation = await this.requireAdaptConsultation(consultationId, user);
    const payload = parseAdaptPayload(consultation.renewPayload, 'AB');
    const step1 = payload.step1;
    const original = step1?.originalPrescription;
    if (!original) {
      throw new BadRequestException('Original prescription is required before suggesting alternatives.');
    }

    const drugName =
      original.normalized?.genericName ||
      original.normalized?.brandName ||
      original.raw?.medicationText ||
      '';
    if (!drugName.trim()) {
      throw new BadRequestException('Original medication name is required.');
    }

    if (!this.openai) {
      return {
        alternatives: [],
        source: 'unavailable',
        unavailableReason: 'AI is not configured for this environment.',
      };
    }

    try {
      const raw = await this.callAi(payload, drugName);
      const enriched = await this.enrichWithTerminology(raw, drugName);
      return {
        alternatives: enriched.slice(0, 5),
        source: 'ai',
        model: this.aiConfig.getSettings().openaiModel || undefined,
      };
    } catch (err) {
      this.logger.warn(
        `substitution alternatives AI failed consultationId=${consultationId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return {
        alternatives: [],
        source: 'unavailable',
        unavailableReason: 'Could not generate alternatives right now. Use catalogue search.',
      };
    }
  }

  private async callAi(
    payload: AdaptPayload,
    drugName: string,
  ): Promise<Omit<AdaptSubstitutionAlternativeDto, 'drugId' | 'source'>[]> {
    const step1 = payload.step1!;
    const original = step1.originalPrescription!;
    const prompt = this.aiConfig.getPrompt(
      AI_PROMPT_KEYS.ADAPT_SUBSTITUTION_ALTERNATIVES,
      DEFAULT_SUBSTITUTION_PROMPT,
    );
    const model =
      this.aiConfig.getSettings().openaiModel ||
      this.config.get<string>('OPENAI_MODEL', 'gpt-4.1-mini');

    const createParams = withOptionalTemperature(
      {
        model,
        max_completion_tokens: 1200,
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
                patient: {
                  age: payload.step2A?.demographics?.age ?? null,
                  sex: payload.step2A?.demographics?.sex ?? null,
                  allergies: (payload.step2A?.background?.allergyEntries ?? [])
                    .map((a) => a.drug || a.genericName)
                    .filter(Boolean),
                  allergiesNone: payload.step2A?.background?.allergiesNone ?? false,
                  conditions: payload.step2A?.background?.conditions ?? [],
                },
                currentMedicationExperience: {
                  isTaking: payload.step2B?.isTakingMedication ?? null,
                  adverseEffects: payload.step2B?.adverseEffects ?? null,
                  adherence: payload.step2B?.adherence ?? null,
                  effectiveness: payload.step2B?.effectiveness ?? null,
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
                  original.raw?.directionsText || original.normalized?.directions || null,
                quantity: original.raw?.quantityText ?? null,
              },
            }),
          },
        ],
      },
      0.2,
    );

    let response;
    try {
      response = await this.openai!.chat.completions.create(createParams);
    } catch (err) {
      if (isUnsupportedTemperatureError(err) && 'temperature' in createParams) {
        delete createParams.temperature;
        this.logger.warn(
          `Model ${model} rejected temperature — retrying substitution alternatives with API default`,
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
      return [];
    }

    const rows = Array.isArray(parsed.alternatives) ? parsed.alternatives : [];
    const origToken = this.ingredientToken(drugName);
    const out: Omit<AdaptSubstitutionAlternativeDto, 'drugId' | 'source'>[] = [];

    for (const [index, row] of rows.entries()) {
      if (!row || typeof row !== 'object') continue;
      const item = row as AiAltRow;
      const generic =
        typeof item.genericName === 'string' ? item.genericName.trim() : '';
      if (!generic) continue;
      if (this.ingredientToken(generic) === origToken) continue;

      const strengths = Array.isArray(item.strengths)
        ? item.strengths
            .filter((s): s is string => typeof s === 'string' && Boolean(s.trim()))
            .map((s) => s.trim())
            .slice(0, 6)
        : [];
      const defaultStrength =
        (typeof item.defaultStrength === 'string' && item.defaultStrength.trim()) ||
        strengths[0] ||
        '';
      if (!defaultStrength) continue;

      const dosageForm =
        (typeof item.dosageForm === 'string' && item.dosageForm.trim()) || 'tablet';
      const route =
        (typeof item.route === 'string' && item.route.trim()) || 'By mouth';
      const frequency =
        (typeof item.frequency === 'string' && item.frequency.trim()) || 'Once daily';
      const brand =
        typeof item.brandExample === 'string' && item.brandExample.trim()
          ? item.brandExample.trim()
          : undefined;
      const rationale =
        typeof item.rationale === 'string' && item.rationale.trim()
          ? item.rationale.trim()
          : undefined;
      const therapeuticClass =
        typeof item.therapeuticClass === 'string' && item.therapeuticClass.trim()
          ? item.therapeuticClass.trim()
          : undefined;

      const drugLabel = `${generic} ${defaultStrength} ${dosageForm}`.replace(/\s+/g, ' ').trim();
      const proposed: ProposedPrescription = {
        drugName: drugLabel,
        genericName: generic,
        brandName: brand,
        strength: defaultStrength,
        dosageForm,
        dose: defaultStrength,
        frequency,
        route: route === 'Oral' ? 'By mouth' : route,
        quantity: 30,
        refills: 1,
        sig: `Take 1 ${dosageForm.toLowerCase()} ${
          route === 'Oral' || route === 'By mouth' ? 'by mouth' : route.toLowerCase()
        } ${frequency.toLowerCase()}`,
      };

      out.push({
        id: `ai_alt_${index}_${generic.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        name: generic,
        genericName: generic,
        brandName: brand,
        strengths: strengths.length ? strengths : [defaultStrength],
        defaultStrength,
        dosageForm,
        metadata: therapeuticClass
          ? `AI · ${therapeuticClass}`
          : 'AI evidence-linked option',
        rationale,
        proposed,
      });
    }

    return out;
  }

  private async enrichWithTerminology(
    rows: Omit<AdaptSubstitutionAlternativeDto, 'drugId' | 'source'>[],
    originalDrug: string,
  ): Promise<AdaptSubstitutionAlternativeDto[]> {
    const origToken = this.ingredientToken(originalDrug);
    const enriched: AdaptSubstitutionAlternativeDto[] = [];

    for (const row of rows) {
      let drugId: string | undefined;
      let brandName = row.brandName;
      let proposed = { ...row.proposed };

      try {
        const hits = await this.terminology.searchDrugs(
          `${row.name} ${row.defaultStrength}`.trim(),
          5,
          'medication',
        );
        const match =
          hits.find((h) => {
            const token = this.ingredientToken(
              `${h.genericName || ''} ${h.brandName || ''} ${h.label || ''}`,
            );
            return token.includes(this.ingredientToken(row.name)) && token !== origToken;
          }) || hits[0];

        if (match && !String(match.id).startsWith('text-')) {
          const matchToken = this.ingredientToken(
            `${match.genericName || ''} ${match.brandName || ''}`,
          );
          if (matchToken !== origToken) {
            drugId = match.id;
            brandName = match.brandName || brandName;
            proposed = {
              ...proposed,
              drugId: match.id,
              brandName: match.brandName || proposed.brandName,
              genericName: match.genericName || proposed.genericName,
              strength: match.strength || proposed.strength,
              dosageForm: match.dosageForm || proposed.dosageForm,
              drugName:
                [match.brandName || match.genericName || row.name, match.strength || row.defaultStrength, match.dosageForm || row.dosageForm]
                  .filter(Boolean)
                  .join(' '),
            };
          }
        }
      } catch {
        // Catalogue enrich is best-effort
      }

      enriched.push({
        ...row,
        brandName,
        drugId,
        proposed,
        source: 'ai',
      });
    }

    return enriched;
  }

  private ingredientToken(value: string): string {
    return value
      .toLowerCase()
      .replace(/\b\d+(\.\d+)?\s*(mg|mcg|g|ml|%)\b/gi, '')
      .replace(/\b(tablet|capsule|suspension|solution|cream|gel|patch|oral|sodium|hcl|hydrochloride)s?\b/gi, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)[0] || '';
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

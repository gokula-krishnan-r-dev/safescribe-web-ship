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
  ADAPT_COUNSELLING_PROMPT,
  ADAPT_COUNSELLING_PROMPT_VERSION,
  ADAPT_COUNSELLING_SCHEMA_VERSION,
  adaptCounsellingRequiresInput,
  buildAdaptCounsellingPayload,
  buildDeterministicAdaptCounselling,
  mapAdaptCounsellingToSections,
  parseAdaptPayload,
  SAFESCRIBE_MODULES,
  validateAdaptCounsellingOutput,
  type AdaptCounsellingAiOutput,
  type AdaptCounsellingPayload,
  type AdaptCounsellingPlanSection,
} from '@safescript/shared';
import {
  isUnsupportedTemperatureError,
  withOptionalTemperature,
} from '@/common/utils/openai-compat';

export type AdaptCounsellingResponse = {
  schemaVersion: string;
  promptVersion: string;
  source: 'ai' | 'deterministic_fallback';
  model?: string;
  unavailableReason?: string;
  generatedAt: string;
  payload: AdaptCounsellingPayload;
  ai: AdaptCounsellingAiOutput;
  sections: AdaptCounsellingPlanSection[];
  howToUse: string;
};

@Injectable()
export class AdaptCounsellingService {
  private readonly logger = new Logger(AdaptCounsellingService.name);
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
  ): Promise<AdaptCounsellingResponse> {
    const consultation = await this.requireAdaptConsultation(consultationId, user);
    const adaptPayload = parseAdaptPayload(consultation.renewPayload, 'AB');
    const gate = adaptCounsellingRequiresInput(adaptPayload.step1, adaptPayload.step3A);
    if (!gate.ok) {
      throw new BadRequestException(gate.reason);
    }

    const counsellingPayload = buildAdaptCounsellingPayload(adaptPayload);
    const generatedAt = new Date().toISOString();

    if (!this.openai) {
      return this.withDeterministic(
        consultationId,
        counsellingPayload,
        generatedAt,
        'AI is not configured for this environment.',
      );
    }

    try {
      const aiRaw = await this.callAi(counsellingPayload);
      const ai = validateAdaptCounsellingOutput(aiRaw, counsellingPayload);
      const hasContent =
        ai.what_to_expect.length +
          ai.self_care.length +
          ai.routine_follow_up.length +
          ai.seek_care.length >
        0;
      if (!hasContent) {
        return this.withDeterministic(
          consultationId,
          counsellingPayload,
          generatedAt,
          'AI returned empty counselling content.',
        );
      }

      const sections = mapAdaptCounsellingToSections(counsellingPayload, ai);
      const howToUse =
        sections.find((s) => s.section_key === 'MEDICATION_USE')?.bullets[0] ?? '';

      const model =
        this.aiConfig.getSettings().openaiModel ||
        this.config.get<string>('OPENAI_MODEL') ||
        undefined;

      const response: AdaptCounsellingResponse = {
        schemaVersion: ADAPT_COUNSELLING_SCHEMA_VERSION,
        promptVersion: ADAPT_COUNSELLING_PROMPT_VERSION,
        source: 'ai',
        model,
        generatedAt,
        payload: counsellingPayload,
        ai,
        sections,
        howToUse,
      };

      await this.persistDraft(consultationId, response);
      return response;
    } catch (err) {
      this.logger.warn(
        `adapt counselling AI failed consultationId=${consultationId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return this.withDeterministic(
        consultationId,
        counsellingPayload,
        generatedAt,
        'Could not generate AI counselling right now; used structured fallback.',
      );
    }
  }

  private async withDeterministic(
    consultationId: string,
    counsellingPayload: AdaptCounsellingPayload,
    generatedAt: string,
    unavailableReason: string,
  ): Promise<AdaptCounsellingResponse> {
    const ai = buildDeterministicAdaptCounselling(counsellingPayload);
    const sections = mapAdaptCounsellingToSections(counsellingPayload, ai);
    const howToUse =
      sections.find((s) => s.section_key === 'MEDICATION_USE')?.bullets[0] ?? '';
    const response: AdaptCounsellingResponse = {
      schemaVersion: ADAPT_COUNSELLING_SCHEMA_VERSION,
      promptVersion: ADAPT_COUNSELLING_PROMPT_VERSION,
      source: 'deterministic_fallback',
      unavailableReason,
      generatedAt,
      payload: counsellingPayload,
      ai,
      sections,
      howToUse,
    };
    await this.persistDraft(consultationId, response);
    return response;
  }

  private async callAi(payload: AdaptCounsellingPayload): Promise<unknown> {
    const prompt = this.aiConfig.getPrompt(
      AI_PROMPT_KEYS.ADAPT_COUNSELLING,
      ADAPT_COUNSELLING_PROMPT,
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
              adapt_counselling_payload: payload,
              instructions:
                'Generate Cards 2–4 only. Return JSON with what_to_expect, self_care, routine_follow_up, seek_care.',
            }),
          },
        ],
      },
      0.35,
    );

    let response;
    try {
      response = await this.openai!.chat.completions.create(createParams);
    } catch (err) {
      if (isUnsupportedTemperatureError(err) && 'temperature' in createParams) {
        delete createParams.temperature;
        this.logger.warn(
          `Model ${model} rejected temperature — retrying adapt counselling with API default`,
        );
        response = await this.openai!.chat.completions.create(createParams);
      } else {
        throw err;
      }
    }

    const content = response.choices[0]?.message?.content ?? '{}';
    try {
      return JSON.parse(content) as unknown;
    } catch {
      throw new Error('Adapt counselling response could not be parsed as JSON');
    }
  }

  private async persistDraft(
    consultationId: string,
    response: AdaptCounsellingResponse,
  ): Promise<void> {
    try {
      const consultation = await this.prisma.consultation.findUnique({
        where: { id: consultationId },
        select: { counsellingNotes: true },
      });
      const prev =
        consultation?.counsellingNotes &&
        typeof consultation.counsellingNotes === 'object'
          ? (consultation.counsellingNotes as Record<string, unknown>)
          : {};

      const sections = response.sections.map((s) => ({
        category: s.title,
        section_key: s.section_key,
        bullets: s.bullets,
        points: s.bullets.map((point, i) => ({ point, important: i === 0 })),
      }));

      await this.prisma.consultation.update({
        where: { id: consultationId },
        data: {
          counsellingNotes: {
            ...prev,
            sections,
            source: response.source === 'ai' ? 'ai' : 'adapt_deterministic',
            generationMode: 'adapt_ai',
            module: 'adapt',
            generatedAt: response.generatedAt,
            counselling_status: 'review_required',
            schemaVersion: response.schemaVersion,
            promptVersion: response.promptVersion,
            adapt_ai: response.ai,
            adapt_payload_snapshot: {
              medication: response.payload.medication,
              indication: response.payload.indication,
              adaptation: response.payload.adaptation,
              follow_up_plan: response.payload.follow_up_plan,
            },
            confirmed_counselling: null,
          } as object,
        },
      });
    } catch (err) {
      this.logger.warn(
        `adapt counselling persist failed consultationId=${consultationId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
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

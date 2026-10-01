import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Readable } from 'stream';
import OpenAI from 'openai';
import pRetry from 'p-retry';
import { AiConfigService } from '@/modules/ai-config/ai-config.service';
import { AI_PROMPT_KEYS } from '@/modules/ai-config/ai-config.defaults';
import { ObjectStorageService } from '@/modules/storage/object-storage.service';

export interface ClinicalPhotoVisibleFinding {
  finding: string;
  bodySite?: string;
  confidence: number;
}

export interface ClinicalPhotoAnalysisResult {
  summary: string;
  suggestedConditions: string[];
  visibleFindings: ClinicalPhotoVisibleFinding[];
  suggestedPathwayHints: string[];
  bodySite?: string;
  acuity?: string;
  overallConfidence: number;
  warnings: string[];
  attachmentIds: string[];
  analyzedAt: string;
  contentHash: string;
}

type PhotoInput = {
  id: string;
  fileName: string;
  mimeType: string;
  storageKey?: string;
  storageProvider?: 'gcs' | 'local';
  fileUrl?: string;
};

const ANALYSIS_PROMPT = `You are an expert clinical pharmacist AI reviewing optional clinical photos from a pharmacist consultation.
Your job is to describe visible findings that help match the correct prescribing pathway (e.g. cold sore / herpes labialis on the lip).

Return ONLY valid JSON:
{
  "summary": "1-2 sentence clinical description of what is visible",
  "suggestedConditions": ["cold sore", "herpes labialis"],
  "visibleFindings": [
    { "finding": "clustered vesicles on vermillion border", "bodySite": "lip", "confidence": 90 }
  ],
  "suggestedPathwayHints": ["cold sore", "oral herpes", "herpes labialis"],
  "bodySite": "lip",
  "acuity": "acute",
  "overallConfidence": 85,
  "warnings": ["any image quality or uncertainty notes"]
}

Rules:
- Describe only what is reasonably visible — never invent diagnoses with high certainty from a poor photo.
- Prefer common community-pharmacy conditions when the image supports them (cold sore, skin rash, eye redness, etc.).
- suggestedPathwayHints should be short searchable terms for pathway matching.
- confidence / overallConfidence are 0-100.
- If the image is not clinical / unreadable, return empty arrays and explain in warnings.
- Do NOT extract PHI speculation (name, DOB). Focus on lesion / site / appearance.`;

@Injectable()
export class ClinicalPhotoAnalyzerService {
  private readonly logger = new Logger(ClinicalPhotoAnalyzerService.name);
  private readonly openai: OpenAI | null;
  private readonly model: string;

  constructor(
    private readonly config: ConfigService,
    private readonly aiConfig: AiConfigService,
    private readonly objectStorage: ObjectStorageService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
    this.model = this.config.get<string>('OPENAI_MODEL', 'gpt-5.6-luna');
  }

  get isAvailable(): boolean {
    return Boolean(this.openai);
  }

  private resolveModel(): string {
    return this.aiConfig.getSettings().openaiModel || this.model;
  }

  private resolvePrompt(): string {
    return this.aiConfig.getPrompt(AI_PROMPT_KEYS.CLINICAL_PHOTO_ANALYSIS, ANALYSIS_PROMPT);
  }

  /** Stable hash of attachment set so we can skip re-analysis when unchanged. */
  contentHash(photos: PhotoInput[]): string {
    const key = photos
      .map((p) => `${p.id}:${p.storageKey || p.fileUrl || ''}:${p.fileName}`)
      .sort()
      .join('|');
    return createHash('sha256').update(key).digest('hex').slice(0, 24);
  }

  async analyzePhotos(photos: PhotoInput[]): Promise<ClinicalPhotoAnalysisResult | null> {
    if (!photos.length || !this.openai) return null;

    const hash = this.contentHash(photos);
    const images: Array<{ id: string; mime: string; base64: string; fileName: string }> = [];

    for (const photo of photos.slice(0, 5)) {
      try {
        const buffer = await this.readPhotoBuffer(photo);
        if (!buffer?.length) continue;
        // Cap very large images for the vision API (~4MB base64 payload comfort)
        if (buffer.length > 6 * 1024 * 1024) {
          this.logger.warn(`Skipping oversized clinical photo ${photo.id} (${buffer.length} bytes)`);
          continue;
        }
        const mime = (photo.mimeType || 'image/jpeg').toLowerCase();
        images.push({
          id: photo.id,
          mime: mime.startsWith('image/') ? mime : 'image/jpeg',
          base64: buffer.toString('base64'),
          fileName: photo.fileName,
        });
      } catch (err) {
        this.logger.warn(
          `Could not read clinical photo ${photo.id}: ${(err as Error).message}`,
        );
      }
    }

    if (!images.length) {
      return {
        summary: '',
        suggestedConditions: [],
        visibleFindings: [],
        suggestedPathwayHints: [],
        overallConfidence: 0,
        warnings: ['Clinical photos could not be read for analysis'],
        attachmentIds: photos.map((p) => p.id),
        analyzedAt: new Date().toISOString(),
        contentHash: hash,
      };
    }

    try {
      const parsed = await pRetry(() => this.callVision(images), {
        retries: 2,
        minTimeout: 800,
        onFailedAttempt: (err) => {
          this.logger.warn(
            `Clinical photo vision attempt ${err.attemptNumber} failed: ${String(err.error ?? err)}`,
          );
        },
      });

      return {
        summary: String(parsed.summary || '').trim(),
        suggestedConditions: asStringArray(parsed.suggestedConditions),
        visibleFindings: asFindings(parsed.visibleFindings),
        suggestedPathwayHints: asStringArray(parsed.suggestedPathwayHints),
        bodySite: parsed.bodySite ? String(parsed.bodySite) : undefined,
        acuity: parsed.acuity ? String(parsed.acuity) : undefined,
        overallConfidence: clampConfidence(parsed.overallConfidence, 70),
        warnings: asStringArray(parsed.warnings),
        attachmentIds: images.map((i) => i.id),
        analyzedAt: new Date().toISOString(),
        contentHash: hash,
      };
    } catch (err) {
      this.logger.error(`Clinical photo analysis failed: ${(err as Error).message}`);
      return {
        summary: '',
        suggestedConditions: [],
        visibleFindings: [],
        suggestedPathwayHints: [],
        overallConfidence: 0,
        warnings: ['Could not analyse clinical photos right now'],
        attachmentIds: photos.map((p) => p.id),
        analyzedAt: new Date().toISOString(),
        contentHash: hash,
      };
    }
  }

  private async callVision(
    images: Array<{ mime: string; base64: string; fileName: string }>,
  ): Promise<Record<string, unknown>> {
    if (!this.openai) throw new Error('Language model unavailable');

    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      {
        type: 'text',
        text:
          `Analyse ${images.length} clinical consultation photo(s) for pathway matching.\n` +
          `Filenames: ${images.map((i) => i.fileName).join(', ')}`,
      },
      ...images.map(
        (img): OpenAI.Chat.Completions.ChatCompletionContentPart => ({
          type: 'image_url',
          image_url: {
            url: `data:${img.mime};base64,${img.base64}`,
            detail: 'high',
          },
        }),
      ),
    ];

    const response = await this.openai.chat.completions.create({
      model: this.resolveModel(),
      max_completion_tokens: 1200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: this.resolvePrompt() },
        { role: 'user', content },
      ],
    });

    const raw = response.choices[0]?.message?.content || '{}';
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]) as Record<string, unknown>;
      throw new Error('Invalid JSON from clinical photo vision model');
    }
  }

  private async readPhotoBuffer(photo: PhotoInput): Promise<Buffer | null> {
    const storageKey =
      photo.storageKey ||
      (photo.fileUrl?.startsWith('/uploads/')
        ? photo.fileUrl.replace(/^\/uploads\//, '')
        : '');
    if (!storageKey) return null;

    const { stream } = await this.objectStorage.open(
      storageKey,
      photo.mimeType || 'image/jpeg',
      photo.storageProvider,
    );
    return streamToBuffer(stream);
  }
}

function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
    .slice(0, 12);
}

function asFindings(value: unknown): ClinicalPhotoVisibleFinding[] {
  if (!Array.isArray(value)) return [];
  const out: ClinicalPhotoVisibleFinding[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const finding = String(row.finding ?? '').trim();
    if (!finding) continue;
    out.push({
      finding,
      bodySite: row.bodySite ? String(row.bodySite) : undefined,
      confidence: clampConfidence(row.confidence, 70),
    });
    if (out.length >= 12) break;
  }
  return out;
}

function clampConfidence(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

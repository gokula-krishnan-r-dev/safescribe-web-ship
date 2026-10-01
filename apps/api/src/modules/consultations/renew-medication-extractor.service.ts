import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { createRequire } from 'module';
import OpenAI from 'openai';
import pRetry from 'p-retry';
import { RedisService } from '@/redis/redis.service';
import { AiConfigService } from '@/modules/ai-config/ai-config.service';
import { AI_PROMPT_KEYS } from '@/modules/ai-config/ai-config.defaults';
import {
  applyKrollDispenseQuantities,
  formatKrollHistoryForAi,
  krollLinesToMedications,
  parseKrollHistoryText,
  type KrollHistoryLine,
} from './renew-kroll-history.parser';
import {
  RENEW_EXTRACT_MAX_FILES,
  RENEW_EXTRACT_REDIS_PREFIX,
  RENEW_IMAGE_EXTENSIONS,
  RENEW_IMAGE_MAX_BYTES,
  RENEW_IMAGE_MIMES,
  RENEW_PDF_EXTENSIONS,
  RENEW_PDF_MAX_BYTES,
} from './renew-extract.types';
import type { RenewMedication, RenewMedicationSourceType } from '@safescript/shared';
import { deriveReviewStatus, mergeExtractedDuplicates } from '@safescript/shared';

const pkgRequire = createRequire(__filename);

export const RENEW_MEDICATION_EXTRACTION_PROMPT = `You are extracting medication lines from a pharmacy document or screenshot for a Canadian community pharmacist.

Extract ONLY medications that are clearly visible. Do not invent missing information. Do not decide whether a prescription can be renewed. Do not infer indication, effectiveness, tolerability, or laboratory requirements.

Read the ENTIRE source: headers, footers, page titles, and every table column, including columns on the far right that are easy to miss.

Return ONLY valid JSON:
{
  "sourceSystem": "kroll | netcare | pharmanet | other | null",
  "documentType": "compliance_sheet | medication_history | medication_profile | renewal_request | screenshot | other | null",
  "imageQuality": "clear | partial | poor",
  "warnings": ["string"],
  "medications": [
    {
      "rawName": "visible medication text",
      "brandName": "string or null",
      "genericName": "string or null",
      "strength": "string or null",
      "dosageForm": "string or null",
      "route": "string or null",
      "directionsRaw": "visible SIG text or null",
      "directionsNormalized": "plain-language SIG or null",
      "frequency": "string or null",
      "quantity": number or null,
      "quantityUnit": "string or null",
      "prescriberName": "string or null",
      "prescribedDate": "YYYY-MM-DD or null",
      "lastFillDate": "YYYY-MM-DD or null",
      "din": "string or null",
      "refillsRemaining": number or null,
      "complianceSchedule": { "morning": number or null, "noon": number or null, "evening": number or null, "bedtime": number or null },
      "confidence": {
        "medication": 0.0,
        "strength": 0.0,
        "directions": 0.0,
        "quantity": 0.0,
        "prescriber": 0.0,
        "dates": 0.0
      }
    }
  ]
}

Rules:
- Use null when a field is not clearly visible. Never guess prescriber, quantity, refill count, dates, indication, or route.
- Preserve original medication and SIG wording in rawName / directionsRaw.
- Normalize common SIG abbreviations (OD, BID, TID, QID, PO) only when confidence is high.

Prescriber (critical):
- Scan columns labeled Doctor, Dr, Prescriber, Physician, MD, Practitioner, Provider, or similar.
- Also read document headers/footers if a single prescriber is printed for the page.
- If a row has its own doctor name, use that name for that medication.
- If the document shows one prescriber for the list (header, repeated column, or footer) and a row has no different doctor, copy that visible name onto those medications.
- Keep visible credentials (Dr., MD). Do not invent a name that is not on the source.

Quantity:
- Prefer Disp. Qty, Quantity, Qty, or quantity dispensed.
- Never use Orig Rx, Rx number, or Rem. Qty as quantity.
- Kroll PDF text often concatenates columns with no spaces, e.g. 1564817158428930310TAB Auro-Finasteride 5mg… means Orig Rx 1564817, Rx 1584289, Disp. Qty 30, Rem. Qty 310, form TAB. quantity = 30, quantityUnit = tablets (TAB) or capsules (CAP).

Multiple screenshots:
- Treat all images as one patient medication list (consecutive pages or overlapping views).
- Return each unique medication ONCE.
- Same DIN, or same brand/generic + strength + form = one medication.
- When the same drug appears on more than one image, merge into one record and fill missing fields from the image that shows them most clearly.

Compliance sheets:
- Capture morning/noon/evening/bedtime grid values in complianceSchedule without replacing printed directions.
- If the timing grid conflicts with written SIG, keep both and lower directions confidence below 0.75.

- confidence is 0–1 per field.
- If the image/document is unreadable, return medications [] and imageQuality "poor".
- Never return a partial invented list. If nothing is reliably visible, return an empty medications array.`;

export interface RenewExtractionResult {
  medications: RenewMedication[];
  sourceSystem: string | null;
  documentType: string | null;
  imageQuality: 'clear' | 'partial' | 'poor';
  warnings: string[];
  cached: boolean;
}

function newMedicationId() {
  return `rmed_${randomBytes(8).toString('hex')}`;
}

function asNullString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!t || t.toLowerCase() === 'null' || t === '-') return null;
  return t;
}

function asNullNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value.replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asConfidence(value: unknown): number | null {
  const n = asNullNumber(value);
  if (n == null) return null;
  return n > 1 ? Math.min(1, n / 100) : Math.min(1, Math.max(0, n));
}

@Injectable()
export class RenewMedicationExtractorService {
  private readonly logger = new Logger(RenewMedicationExtractorService.name);
  private readonly openai: OpenAI | null;
  private readonly model: string;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly aiConfig: AiConfigService,
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
    return this.aiConfig.getPrompt(
      AI_PROMPT_KEYS.RENEW_MEDICATION_EXTRACTION,
      RENEW_MEDICATION_EXTRACTION_PROMPT,
    );
  }

  validateFile(file: Express.Multer.File): { kind: 'image' | 'pdf' } {
    if (!file?.buffer?.length) {
      throw new Error('Please upload a file');
    }

    const ext = `.${(file.originalname.split('.').pop() ?? '').toLowerCase()}`;
    const mime = (file.mimetype ?? '').toLowerCase();

    if (RENEW_PDF_EXTENSIONS.has(ext) || mime === 'application/pdf') {
      if (file.size > RENEW_PDF_MAX_BYTES) {
        throw new Error(`PDF is too large. Maximum size is ${RENEW_PDF_MAX_BYTES / (1024 * 1024)} MB`);
      }
      return { kind: 'pdf' };
    }

    if (RENEW_IMAGE_EXTENSIONS.has(ext) || RENEW_IMAGE_MIMES.has(mime)) {
      if (file.size > RENEW_IMAGE_MAX_BYTES) {
        throw new Error(`Image is too large. Maximum size is ${RENEW_IMAGE_MAX_BYTES / (1024 * 1024)} MB`);
      }
      return { kind: 'image' };
    }

    throw new Error('This file type is not supported. Upload a PDF, PNG, or JPG.');
  }

  async extract(
    file: Express.Multer.File,
    sourceType: RenewMedicationSourceType,
    note?: string,
  ): Promise<RenewExtractionResult> {
    return this.extractMany([file], sourceType, note);
  }

  async extractMany(
    files: Express.Multer.File[],
    sourceType: RenewMedicationSourceType,
    note?: string,
  ): Promise<RenewExtractionResult> {
    if (!files.length) {
      throw new Error('Please upload a file');
    }
    if (files.length > RENEW_EXTRACT_MAX_FILES) {
      throw new Error(`You can attach up to ${RENEW_EXTRACT_MAX_FILES} files at once.`);
    }

    const classified = files.map((file) => ({ file, kind: this.validateFile(file).kind }));
    const hash = createHash('sha256');
    for (const { file } of classified) hash.update(file.buffer);
    hash.update(sourceType);
    hash.update((note ?? '').trim());
    const cacheKey = `${RENEW_EXTRACT_REDIS_PREFIX}${hash.digest('hex')}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as RenewExtractionResult;
        return {
          ...parsed,
          medications: parsed.medications.map((m) => ({ ...m, source: { ...m.source, type: sourceType } })),
          cached: true,
        };
      } catch {
        /* ignore corrupt cache */
      }
    }

    if (!this.openai) {
      throw new Error('Medication reading is not set up on the server. Please contact your admin.');
    }

    const images = classified.filter((item) => item.kind === 'image').map((item) => item.file);
    const pdfs = classified.filter((item) => item.kind === 'pdf').map((item) => item.file);
    const parts: RenewExtractionResult[] = [];

    if (images.length) {
      const extracted = await pRetry(() => this.extractFromImages(images, note), {
        retries: 2,
        minTimeout: 1000,
        maxTimeout: 4000,
      });
      parts.push(this.normalizeResult(extracted.raw, sourceType, extracted.krollLines));
    }

    for (const pdf of pdfs) {
      const extracted = await pRetry(() => this.extractFromPdf(pdf), {
        retries: 2,
        minTimeout: 1000,
        maxTimeout: 4000,
      });
      parts.push(this.normalizeResult(extracted.raw, sourceType, extracted.krollLines));
    }

    const combined = this.combineResults(parts, sourceType);
    await this.redis.set(cacheKey, JSON.stringify({ ...combined, cached: false }), 12 * 60 * 60);
    return combined;
  }

  private combineResults(
    parts: RenewExtractionResult[],
    sourceType: RenewMedicationSourceType,
  ): RenewExtractionResult {
    const medications = mergeExtractedDuplicates(parts.flatMap((part) => part.medications));
    this.applySharedPrescriber(medications);

    const qualities = parts.map((part) => part.imageQuality);
    const imageQuality: RenewExtractionResult['imageQuality'] = !medications.length
      ? qualities.includes('poor') || !qualities.length
        ? 'poor'
        : 'partial'
      : qualities.includes('partial')
        ? 'partial'
        : 'clear';

    const warnings = [...new Set(parts.flatMap((part) => part.warnings))];
    if (!medications.length && !warnings.length) {
      warnings.push('No medications identified. We could not reliably extract a medication list from this file.');
    }

    return {
      medications: medications.map((m) => ({ ...m, source: { ...m.source, type: sourceType } })),
      sourceSystem: parts.find((part) => part.sourceSystem)?.sourceSystem ?? null,
      documentType: parts.find((part) => part.documentType)?.documentType ?? null,
      imageQuality,
      warnings,
      cached: false,
    };
  }

  private applySharedPrescriber(medications: RenewMedication[]) {
    if (medications.length < 2) return;
    const names = medications
      .map((m) => m.normalized.prescriberName?.trim())
      .filter((name): name is string => Boolean(name));
    const unique = new Set(names.map((name) => name.toLowerCase()));
    if (unique.size !== 1 || names.length < Math.ceil(medications.length / 2)) return;
    const canonical = names[0];
    if (!canonical) return;
    for (const med of medications) {
      if (med.normalized.prescriberName?.trim()) continue;
      med.normalized.prescriberName = canonical;
      med.raw.prescriberText = med.raw.prescriberText ?? canonical;
      med.confidence.prescriber = Math.max(med.confidence.prescriber ?? 0, 0.8);
      med.reviewStatus = deriveReviewStatus(med);
    }
  }

  private async extractFromImages(files: Express.Multer.File[], note?: string) {
    const pharmacistNote = note?.trim();
    const intro =
      files.length === 1
        ? 'Read this entire pharmacy screenshot, including headers, footers, and every table column (Drug Name, DIN, Doctor/Prescriber, Disp. Qty / Quantity, SIG). Extract every visible medication.'
        : `These ${files.length} images are pharmacy screenshots of the same patient (consecutive pages or overlapping views). Read every image in full, including Doctor/Prescriber and quantity columns. Extract one unique medication list. If the same drug appears on more than one screenshot, return it once and fill missing fields from the clearest image.`;

    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      {
        type: 'text',
        text: [intro, pharmacistNote ? `Pharmacist note: ${pharmacistNote}` : '']
          .filter(Boolean)
          .join('\n\n'),
      },
      ...files.map((file) => {
        const mime = file.mimetype?.startsWith('image/') ? file.mimetype : 'image/jpeg';
        return {
          type: 'image_url' as const,
          image_url: {
            url: `data:${mime};base64,${file.buffer.toString('base64')}`,
            detail: 'high' as const,
          },
        };
      }),
    ];

    const response = await this.openai!.chat.completions.create({
      model: this.resolveModel(),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: this.resolvePrompt() },
        { role: 'user', content },
      ],
      max_completion_tokens: files.length > 1 ? 12288 : 8192,
    });

    return {
      raw: this.parseAiJson(response.choices[0]?.message?.content ?? '{}'),
      krollLines: [] as KrollHistoryLine[],
    };
  }

  private async extractFromPdf(file: Express.Multer.File) {
    const pdfParse = pkgRequire('pdf-parse') as (buf: Buffer) => Promise<{ text: string; numpages: number }>;
    const parsed = await pdfParse(file.buffer);
    const text = parsed.text?.trim() ?? '';

    if (text.length < 40) {
      throw new Error(
        'This PDF looks like a scanned image with no readable text. Upload a clearer screenshot or a text-based PDF.',
      );
    }

    const krollLines = parseKrollHistoryText(text);
    const krollHint = formatKrollHistoryForAi(krollLines);
    const userContent = [
      `Extract every medication from this pharmacy document (${parsed.numpages} page(s)). Use only information present in the text.`,
      krollHint,
      `Raw PDF text:\n${text.slice(0, 24000)}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const response = await this.openai!.chat.completions.create({
      model: this.resolveModel(),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: this.resolvePrompt() },
        { role: 'user', content: userContent },
      ],
      max_completion_tokens: 8192,
    });

    return {
      raw: this.parseAiJson(response.choices[0]?.message?.content ?? '{}'),
      krollLines,
    };
  }

  private parseAiJson(content: string): Record<string, unknown> {
    try {
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      this.logger.warn('Failed to parse renew medication extraction JSON');
      return { medications: [], warnings: ['Returned invalid JSON'], imageQuality: 'poor' };
    }
  }

  private normalizeResult(
    raw: Record<string, unknown>,
    sourceType: RenewMedicationSourceType,
    krollLines: KrollHistoryLine[] = [],
  ): RenewExtractionResult {
    const rows = Array.isArray(raw.medications) ? raw.medications : [];
    let medications: RenewMedication[] = [];

    for (const item of rows) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const rawName = asNullString(row.rawName) ?? asNullString(row.medicationText);
      if (!rawName) continue;

      const confidence = (row.confidence ?? {}) as Record<string, unknown>;
      const schedule = (row.complianceSchedule ?? null) as Record<string, unknown> | null;
      const med: RenewMedication = {
        id: newMedicationId(),
        source: {
          type: sourceType,
          documentType: asNullString(raw.documentType),
          sourceSystem: asNullString(raw.sourceSystem),
        },
        raw: {
          medicationText: rawName,
          directionsText: asNullString(row.directionsRaw),
          quantityText: row.quantity != null ? String(row.quantity) : asNullString(row.quantityText),
          prescriberText: asNullString(row.prescriberName),
          dateText: asNullString(row.prescribedDate) ?? asNullString(row.lastFillDate),
        },
        normalized: {
          medicationConceptId: null,
          din: asNullString(row.din),
          brandName: asNullString(row.brandName),
          genericName: asNullString(row.genericName),
          strength: asNullString(row.strength),
          dosageForm: asNullString(row.dosageForm),
          route: asNullString(row.route),
          directions: asNullString(row.directionsNormalized) ?? asNullString(row.directionsRaw),
          directionsNormalized: asNullString(row.directionsNormalized),
          frequency: asNullString(row.frequency),
          quantity: asNullNumber(row.quantity),
          quantityUnit: asNullString(row.quantityUnit),
          prescriberName: asNullString(row.prescriberName),
          prescribedDate: asNullString(row.prescribedDate),
          lastFillDate: asNullString(row.lastFillDate),
          refillsRemaining: asNullNumber(row.refillsRemaining),
          complianceSchedule: schedule
            ? {
                morning: asNullNumber(schedule.morning),
                noon: asNullNumber(schedule.noon),
                evening: asNullNumber(schedule.evening),
                bedtime: asNullNumber(schedule.bedtime),
              }
            : null,
        },
        confidence: {
          medication: asConfidence(confidence.medication),
          strength: asConfidence(confidence.strength),
          directions: asConfidence(confidence.directions),
          quantity: asConfidence(confidence.quantity),
          prescriber: asConfidence(confidence.prescriber),
          dates: asConfidence(confidence.dates),
        },
        reviewStatus: 'not_reviewed',
        ccddMatchStatus: 'unmatched',
        ccddCandidates: [],
        pharmacistEdited: false,
      };
      med.reviewStatus = deriveReviewStatus(med);
      medications.push(med);
    }

    if (krollLines.length) {
      medications = medications.length
        ? applyKrollDispenseQuantities(medications, krollLines)
        : krollLinesToMedications(krollLines, newMedicationId);
      if (!asNullString(raw.sourceSystem)) raw.sourceSystem = 'kroll';
      if (!asNullString(raw.documentType)) raw.documentType = 'medication_history';
    }

    const qualityRaw = asNullString(raw.imageQuality);
    const imageQuality: RenewExtractionResult['imageQuality'] =
      qualityRaw === 'poor' || qualityRaw === 'partial' || qualityRaw === 'clear'
        ? qualityRaw
        : medications.length
          ? 'clear'
          : 'poor';

    const warnings = Array.isArray(raw.warnings) ? raw.warnings.map((w) => String(w)) : [];
    if (!medications.length && !warnings.length) {
      warnings.push('No medications identified. We could not reliably extract a medication list from this file.');
    }

    return {
      medications,
      sourceSystem: asNullString(raw.sourceSystem),
      documentType: asNullString(raw.documentType),
      imageQuality,
      warnings,
      cached: false,
    };
  }
}

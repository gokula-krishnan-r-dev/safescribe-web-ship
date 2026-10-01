import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { createRequire } from 'module';
import OpenAI from 'openai';
import pRetry from 'p-retry';
import { RedisService } from '@/redis/redis.service';
import { AiConfigService } from '@/modules/ai-config/ai-config.service';
import { AI_PROMPT_KEYS } from '@/modules/ai-config/ai-config.defaults';
import { canonicalizeLabTestName, selectLatestLabValues } from '@safescript/shared';
import {
  LAB_EXTRACT_REDIS_PREFIX,
  LAB_TEXT_EXTRACT_REDIS_PREFIX,
  LAB_IMAGE_EXTENSIONS,
  LAB_IMAGE_MAX_BYTES,
  LAB_IMAGE_MIMES,
  LAB_PDF_EXTENSIONS,
  LAB_PDF_MAX_BYTES,
  LAB_TEXT_MAX_CHARS,
  LAB_TEXT_MIN_CHARS,
  type ExtractedLabValue,
  type LabReportExtractionResult,
} from './lab-report.types';

const pkgRequire = createRequire(__filename);

const EXTRACTION_PROMPT = `You are a clinical laboratory report parser for pharmacists.
Extract the most recent laboratory test results and vital signs from the provided lab report or typed/pasted text.

Return ONLY valid JSON in this exact shape:
{
  "labValues": [
    {
      "test": "HbA1c",
      "value": "7.2",
      "unit": "%",
      "referenceRange": "4.0-5.6",
      "observedDate": "2026-07-20",
      "confidence": 95
    }
  ],
  "summary": "Brief clinical summary of notable findings",
  "reportDate": "YYYY-MM-DD or null",
  "patientName": "string or null",
  "warnings": ["any readability issues"]
}

Rules:
- confidence is 0-100 per value based on clarity
- ALWAYS canonicalize test names to standard clinical abbreviations (HbA1c not HBA1C/HBA!C/a1c; eGFR; ALT; AST; creatinine; TSH; etc.)
- Include vital signs when present (blood pressure, pulse/heart rate, height, weight, BMI, temperature, SpO2, respiratory rate)
- If the same test or vital appears more than once, keep ONLY the newest dated result. Never return a historical series for one test.
- Fix spelling/punctuation typos in test names
- Put numeric result in "value" and true unit only in "unit" (%, mmol/L, mL/min, etc.) — never put dates or prose in "unit"
- If a collection/result date appears (e.g. "july 20, 2026"), set observedDate as YYYY-MM-DD when possible
- Format dates cleanly; do not leave raw fragments like "& july 20,2026" attached to the value
- if a value is unclear, include it with confidence below 70
- if no lab values found, return labValues as empty array and add warning
- never invent values not present in the source`;

/** Common pharmacist / OCR aliases live in @safescript/shared canonicalizeLabTestName. */

const MONTH_TOKEN =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DATE_IN_TEXT = new RegExp(
  `(?:${MONTH_TOKEN}\\s+\\d{1,2},?\\s*\\d{2,4}|\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}|\\d{4}-\\d{2}-\\d{2})`,
  'i',
);

@Injectable()
export class LabReportExtractorService {
  private readonly logger = new Logger(LabReportExtractorService.name);
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
    return this.aiConfig.getPrompt(AI_PROMPT_KEYS.LAB_REPORT_EXTRACTION, EXTRACTION_PROMPT);
  }

  validateFile(file: Express.Multer.File): { kind: 'image' | 'pdf' } {
    if (!file?.buffer?.length) {
      throw new Error('Please upload a file');
    }

    const ext = `.${(file.originalname.split('.').pop() ?? '').toLowerCase()}`;
    const mime = (file.mimetype ?? '').toLowerCase();

    if (LAB_PDF_EXTENSIONS.has(ext) || mime === 'application/pdf') {
      if (file.size > LAB_PDF_MAX_BYTES) {
        throw new Error(`PDF is too large. Maximum size is ${LAB_PDF_MAX_BYTES / (1024 * 1024)} MB`);
      }
      return { kind: 'pdf' };
    }

    if (LAB_IMAGE_EXTENSIONS.has(ext) || LAB_IMAGE_MIMES.has(mime)) {
      if (file.size > LAB_IMAGE_MAX_BYTES) {
        throw new Error(`Image is too large. Maximum size is ${LAB_IMAGE_MAX_BYTES / (1024 * 1024)} MB`);
      }
      return { kind: 'image' };
    }

    throw new Error('Unsupported file type. Please upload JPG, JPEG, PNG, or PDF.');
  }

  async extract(file: Express.Multer.File): Promise<LabReportExtractionResult> {
    const { kind } = this.validateFile(file);
    const cacheKey = `${LAB_EXTRACT_REDIS_PREFIX}${createHash('sha256').update(file.buffer).digest('hex')}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as LabReportExtractionResult;
      return { ...parsed, cached: true };
    }

    if (!this.openai) {
      throw new Error('Lab report reading is not set up on the server. Please contact your admin.');
    }

    const raw = await pRetry(
      () => (kind === 'pdf'
        ? this.extractFromPdf(file)
        : this.extractFromImage(file)),
      { retries: 2, minTimeout: 1000, maxTimeout: 4000 },
    );

    const normalized = this.normalizeResult(raw);
    await this.redis.set(cacheKey, JSON.stringify(normalized), 24 * 60 * 60);
    return { ...normalized, cached: false };
  }

  async extractMany(files: Express.Multer.File[], note?: string): Promise<LabReportExtractionResult> {
    if (!files.length) throw new Error('Please upload at least one file');
    if (files.length === 1) return this.extract(files[0]!);

    const kinds = files.map((file) => ({ file, kind: this.validateFile(file).kind }));
    const images = kinds.filter((row) => row.kind === 'image').map((row) => row.file);
    const pdfs = kinds.filter((row) => row.kind === 'pdf').map((row) => row.file);

    const hash = createHash('sha256');
    for (const file of files) hash.update(file.buffer);
    if (note?.trim()) hash.update(note.trim());
    const cacheKey = `${LAB_EXTRACT_REDIS_PREFIX}multi:${hash.digest('hex')}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as LabReportExtractionResult;
      return { ...parsed, cached: true };
    }

    if (!this.openai) {
      throw new Error('Lab report reading is not set up on the server. Please contact your admin.');
    }

    const parts: LabReportExtractionResult[] = [];
    if (images.length) {
      const raw = await pRetry(() => this.extractFromImages(images, note), {
        retries: 2,
        minTimeout: 1000,
        maxTimeout: 4000,
      });
      parts.push(this.normalizeResult(raw));
    }
    for (const pdf of pdfs) {
      parts.push(await this.extract(pdf));
    }

    const merged = this.mergeExtractionResults(parts);
    await this.redis.set(cacheKey, JSON.stringify(merged), 24 * 60 * 60);
    return { ...merged, cached: false };
  }

  /**
   * Parse pasted / typed lab text.
   * Heuristic first; always AI-polish when OpenAI is available and the paste
   * looks messy (typos, dates jammed into units, odd punctuation).
   */
  async extractFromText(rawText: string): Promise<LabReportExtractionResult> {
    const text = this.sanitizeLabText(rawText);
    if (text.length < LAB_TEXT_MIN_CHARS) {
      throw new Error('Please enter or paste at least one lab value.');
    }
    if (text.length > LAB_TEXT_MAX_CHARS) {
      throw new Error(
        `Text is too long. Maximum length is ${LAB_TEXT_MAX_CHARS.toLocaleString()} characters.`,
      );
    }

    const cacheKey = `${LAB_TEXT_EXTRACT_REDIS_PREFIX}${createHash('sha256').update(text).digest('hex')}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as LabReportExtractionResult;
      return { ...parsed, cached: true };
    }

    const heuristic = this.parseLabTextHeuristically(text).map((v) =>
      this.canonicalizeLabValue(v),
    );
    const looksStructured = heuristic.length >= 1 && this.isMostlyStructuredPaste(text);
    const needsAiPolish = this.needsAiPolish(text, heuristic);

    // Clean structured paste — skip AI for speed/cost
    if (looksStructured && heuristic.length > 0 && !needsAiPolish) {
      const normalized = this.normalizeResult({
        labValues: heuristic,
        summary: `Parsed ${heuristic.length} lab value${heuristic.length === 1 ? '' : 's'} from entered text.`,
        warnings: [],
      });
      await this.redis.set(cacheKey, JSON.stringify(normalized), 24 * 60 * 60);
      return { ...normalized, cached: false };
    }

    if (!this.openai) {
      if (heuristic.length > 0) {
        const normalized = this.normalizeResult({
          labValues: heuristic,
          summary: `Parsed ${heuristic.length} value(s) locally. AI parsing is not configured.`,
          warnings: needsAiPolish
            ? ['Lab formatting is not available — review names, units, and dates carefully.']
            : ['Lab parsing is not available — review values carefully.'],
        });
        await this.redis.set(cacheKey, JSON.stringify(normalized), 24 * 60 * 60);
        return { ...normalized, cached: false };
      }
      throw new Error(
        'Could not parse lab values from this text. Try lines like “HbA1c: 7.2%” or enable lab parsing.',
      );
    }

    const raw = await pRetry(() => this.extractFromPlainText(text), {
      retries: 2,
      minTimeout: 1000,
      maxTimeout: 4000,
    });

    const aiNormalized = this.normalizeResult(raw);
    const merged = this.mergeLabValues(heuristic, aiNormalized.labValues).map((v) =>
      this.canonicalizeLabValue(v),
    );
    const normalized = {
      ...aiNormalized,
      labValues: merged,
      overallConfidence: merged.length
        ? Math.round(merged.reduce((sum, v) => sum + v.confidence, 0) / merged.length)
        : 0,
      summary:
        aiNormalized.summary ||
        (merged.length
          ? `Formatted ${merged.length} lab value${merged.length === 1 ? '' : 's'} from entered text.`
          : undefined),
    };

    await this.redis.set(cacheKey, JSON.stringify(normalized), 24 * 60 * 60);
    return { ...normalized, cached: false };
  }

  formatAsText(values: ExtractedLabValue[]): string {
    return values
      .map((v) => {
        const unit = v.unit ? ` ${v.unit}` : '';
        const range = v.referenceRange ? ` (ref ${v.referenceRange})` : '';
        const date = v.observedDate ? ` · ${this.formatObservedDate(v.observedDate)}` : '';
        return `${v.test}: ${v.value}${unit}${range}${date}`;
      })
      .join('\n');
  }

  private sanitizeLabText(raw: string): string {
    return String(raw ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/\u0000/g, '')
      .trim();
  }

  /** True when typed/pasted text needs AI formatting (typos, dates in units, junk chars). */
  private needsAiPolish(text: string, heuristic: ExtractedLabValue[]): boolean {
    if (/[!@#$%^*_?=<>]|hba[!l]/i.test(text)) return true;
    if (DATE_IN_TEXT.test(text)) return true;
    if (/&\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(text)) return true;

    for (const v of heuristic) {
      if (/[^A-Za-z0-9\s\-\/\(\)%+]/.test(v.test)) return true;
      if (v.unit && (DATE_IN_TEXT.test(v.unit) || /[&,]/.test(v.unit) || v.unit.length > 24)) {
        return true;
      }
      if (v.value && DATE_IN_TEXT.test(v.value)) return true;
      const canon = this.canonicalizeTestName(v.test);
      if (canon !== v.test && /hba|a1c/i.test(v.test)) return true;
    }
    return false;
  }

  private canonicalizeTestName(raw: string): string {
    return canonicalizeLabTestName(raw);
  }

  private canonicalizeLabValue(v: ExtractedLabValue): ExtractedLabValue {
    let test = this.canonicalizeTestName(v.test);
    let value = v.value.trim();
    let unit = v.unit?.trim() || undefined;
    let observedDate = v.observedDate?.trim() || undefined;
    let confidence = v.confidence;
    let needsReview = v.needsReview;

    // Pull dates out of unit / value trails
    const unitDate = unit ? unit.match(DATE_IN_TEXT)?.[0] : undefined;
    if (unitDate) {
      observedDate = observedDate || this.normalizeDateToken(unitDate);
      unit = unit!
        .replace(DATE_IN_TEXT, '')
        .replace(/^[\s&,;.\-–—]+|[\s&,;.\-–—]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim() || undefined;
    }

    const valueDate = value.match(DATE_IN_TEXT)?.[0];
    if (valueDate && !/^-?\d+(\.\d+)?$/.test(value)) {
      observedDate = observedDate || this.normalizeDateToken(valueDate);
      const numeric = value.match(/-?\d+(?:\.\d+)?/);
      if (numeric) value = numeric[0];
    }

    // Known units for common tests when unit was polluted and stripped
    if (!unit && /^HbA1c$/i.test(test) && /^-?\d+(\.\d+)?$/.test(value)) {
      const n = Number(value);
      // IFCC mmol/mol is typically 20–150; NGSP % is typically 4–15
      if (n >= 20) unit = 'mmol/mol';
      else if (n > 0 && n < 20) unit = '%';
    }

    if (unit && !/^[%µuA-Za-z0-9./^\-\s]+$/.test(unit)) {
      needsReview = true;
      confidence = Math.min(confidence, 72);
    }

    return {
      test,
      value,
      unit,
      referenceRange: v.referenceRange,
      observedDate,
      confidence,
      needsReview: needsReview || confidence < 75,
    };
  }

  private normalizeDateToken(token: string): string {
    const iso = token.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

    const slash = token.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (slash) {
      let year = Number(slash[3]);
      if (year < 100) year += 2000;
      const month = Number(slash[1]);
      const day = Number(slash[2]);
      // Prefer MDY for North America when ambiguous
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }

    const parsed = Date.parse(token);
    if (!Number.isNaN(parsed)) {
      const d = new Date(parsed);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    return token.trim();
  }

  private formatObservedDate(raw: string): string {
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) {
      const d = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
      return d.toLocaleDateString('en-CA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      });
    }
    return raw;
  }

  /** Detect common “Test: value unit” pastes so we can skip AI. */
  private isMostlyStructuredPaste(text: string): boolean {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));
    if (!lines.length) return false;
    const structured = lines.filter((l) =>
      /^.+?\s*[:=]\s*\S+/.test(l) || /^.+?\s+\d+(\.\d+)?\s*\S*/.test(l),
    ).length;
    return structured / lines.length >= 0.5;
  }

  /**
   * Deterministic parser for pharmacist-typed / copy-pasted lab lines.
   * Examples:
   *   HbA1c: 7.2%
   *   eGFR 65 mL/min
   *   Creatinine = 98 µmol/L (ref 45-90)
   */
  private parseLabTextHeuristically(text: string): ExtractedLabValue[] {
    const results: ExtractedLabValue[] = [];
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      // skip headers / noise
      if (/^(labs?|results?|report|patient|date|name)\b/i.test(line) && !/[:=]/.test(line)) {
        continue;
      }
      if (line.length < 3) continue;

      const refMatch = line.match(/\(?\s*ref(?:erence)?[:\s]*([^)]+)\)?/i);
      const referenceRange = refMatch?.[1]?.trim();
      const cleaned = line.replace(/\(?\s*ref(?:erence)?[:\s]*[^)]+\)?/i, '').trim();

      // Pattern: Test [:=] value [unit]
      let m = cleaned.match(/^(.+?)\s*[:=]\s*(-?\d+(?:\.\d+)?)\s*(.*)$/);
      if (!m) {
        // Pattern: Test value unit (no separator)
        m = cleaned.match(/^([A-Za-z][A-Za-z0-9\s\-\/\(\)%⁺]+?)\s+(-?\d+(?:\.\d+)?)\s*(.*)$/);
      }
      if (!m) {
        // Qualitative: Test: Positive / Negative / Detected
        m = cleaned.match(/^(.+?)\s*[:=]\s*(.+)$/);
        if (m) {
          const test = m[1].trim().replace(/\s+/g, ' ');
          const value = m[2].trim();
          if (test && value && test.length < 80 && value.length < 120) {
            results.push(
              this.canonicalizeLabValue({
                test,
                value,
                unit: undefined,
                referenceRange,
                confidence: 88,
                needsReview: false,
              }),
            );
          }
        }
        continue;
      }

      const test = m[1].trim().replace(/\s+/g, ' ');
      const value = m[2].trim();
      let unit = (m[3] ?? '').trim().replace(/\s+/g, ' ') || undefined;
      // strip trailing punctuation from unit
      if (unit) unit = unit.replace(/[;,.\s]+$/, '') || undefined;

      if (!test || !value || test.length > 80) continue;

      results.push(
        this.canonicalizeLabValue({
          test,
          value,
          unit,
          referenceRange,
          confidence: 92,
          needsReview: false,
        }),
      );
    }

    return selectLatestLabValues(results);
  }

  private mergeLabValues(
    heuristic: ExtractedLabValue[],
    ai: ExtractedLabValue[],
  ): ExtractedLabValue[] {
    return selectLatestLabValues([...heuristic, ...ai]);
  }

  private mergeExtractionResults(parts: LabReportExtractionResult[]): LabReportExtractionResult {
    const warnings: string[] = [];
    let reportDate: string | undefined;
    let patientName: string | undefined;
    const summaries: string[] = [];
    const mergedValues: ExtractedLabValue[] = [];

    for (const part of parts) {
      mergedValues.push(...part.labValues);
      if (part.reportDate && !reportDate) reportDate = part.reportDate;
      if (part.patientName && !patientName) patientName = part.patientName;
      if (part.summary) summaries.push(part.summary);
      if (part.warnings?.length) warnings.push(...part.warnings);
    }

    const labValues = selectLatestLabValues(
      mergedValues.map((value) => ({
        ...value,
        observedDate: value.observedDate || reportDate,
      })),
    );

    const overallConfidence = labValues.length
      ? Math.round(labValues.reduce((sum, row) => sum + row.confidence, 0) / labValues.length)
      : 0;

    return {
      labValues,
      summary: summaries[0],
      reportDate,
      patientName,
      overallConfidence,
      cached: false,
      warnings: [...new Set(warnings)],
    };
  }

  private async extractFromPlainText(text: string) {
    const response = await this.openai!.chat.completions.create({
      model: this.resolveModel(),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: this.resolvePrompt() },
        {
          role: 'user',
          content: `Extract the most recent laboratory values and vital signs from this pasted lab report / lab list text. Keep only the newest result for each unique test:\n\n${text.slice(0, 12000)}`,
        },
      ],
      max_completion_tokens: 4096,
    });

    return this.parseAiJson(response.choices[0]?.message?.content ?? '{}');
  }

  private async extractFromImage(file: Express.Multer.File) {
    const mime = file.mimetype?.startsWith('image/') ? file.mimetype : 'image/jpeg';
    const base64 = file.buffer.toString('base64');
    const dataUrl = `data:${mime};base64,${base64}`;

    const response = await this.openai!.chat.completions.create({
      model: this.resolveModel(),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: this.resolvePrompt() },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract the most recent laboratory values and vital signs from this lab report image. Keep only the newest result for each unique test.' },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
          ],
        },
      ],
      max_completion_tokens: 4096,
    });

    return this.parseAiJson(response.choices[0]?.message?.content ?? '{}');
  }

  private async extractFromImages(files: Express.Multer.File[], note?: string) {
    const pharmacistNote = note?.trim();
    const intro =
      files.length === 1
        ? 'Extract the most recent laboratory values, vitals, and dated results from this screenshot. Keep only the newest result for each unique test.'
        : `These ${files.length} images are lab or Netcare screenshots of the same patient (consecutive pages or overlapping views). Extract every visible laboratory value and vital. If the same test appears on more than one image, return it once and keep the clearest dated result.`;

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
      max_completion_tokens: files.length > 1 ? 8192 : 4096,
    });

    return this.parseAiJson(response.choices[0]?.message?.content ?? '{}');
  }

  private async extractFromPdf(file: Express.Multer.File) {
    const pdfParse = pkgRequire('pdf-parse') as (buf: Buffer) => Promise<{ text: string; numpages: number }>;
    const parsed = await pdfParse(file.buffer);
    const text = parsed.text?.trim();

    if (!text || text.length < 20) {
      throw new Error(
        'This PDF looks like a scanned image with no readable text. Please upload a photo of the report or a text-based PDF.',
      );
    }

    const response = await this.openai!.chat.completions.create({
      model: this.resolveModel(),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: this.resolvePrompt() },
        {
          role: 'user',
          content: `Extract the most recent laboratory values and vital signs from this lab report text (${parsed.numpages} page(s)). Keep only the newest result for each unique test:\n\n${text.slice(0, 12000)}`,
        },
      ],
      max_completion_tokens: 4096,
    });

    return this.parseAiJson(response.choices[0]?.message?.content ?? '{}');
  }

  private parseAiJson(content: string): Record<string, unknown> {
    try {
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      this.logger.warn('Failed to parse AI lab extraction JSON');
      return { labValues: [], warnings: ['Returned invalid JSON'] };
    }
  }

  private normalizeResult(raw: Record<string, unknown>): LabReportExtractionResult {
    const reportDate = raw.reportDate ? String(raw.reportDate) : undefined;
    const items = Array.isArray(raw.labValues) ? raw.labValues : [];
    const parsed: ExtractedLabValue[] = items
      .map((item) => {
        const row = item as Record<string, unknown>;
        const confidence = Math.min(100, Math.max(0, Number(row.confidence ?? 75)));
        return this.canonicalizeLabValue({
          test: String(row.test ?? '').trim(),
          value: String(row.value ?? '').trim(),
          unit: row.unit ? String(row.unit).trim() : undefined,
          referenceRange: row.referenceRange ? String(row.referenceRange).trim() : undefined,
          observedDate: row.observedDate
            ? String(row.observedDate).trim()
            : row.date
              ? String(row.date).trim()
              : reportDate,
          confidence,
          needsReview: confidence < 75,
        });
      })
      .filter((v) => v.test && v.value);
    const labValues = selectLatestLabValues(parsed);

    const overallConfidence = labValues.length
      ? Math.round(labValues.reduce((sum, v) => sum + v.confidence, 0) / labValues.length)
      : 0;

    const warnings = Array.isArray(raw.warnings)
      ? raw.warnings.map((w) => String(w))
      : [];

    if (!labValues.length && !warnings.length) {
      warnings.push('No laboratory values could be detected. Try a clearer photo or PDF.');
    }

    return {
      labValues,
      summary: raw.summary ? String(raw.summary) : undefined,
      reportDate,
      patientName: raw.patientName ? String(raw.patientName) : undefined,
      overallConfidence,
      cached: false,
      warnings: warnings.length ? warnings : undefined,
    };
  }
}

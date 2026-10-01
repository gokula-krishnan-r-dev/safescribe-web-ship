/**
 * RAG-based Clinical Knowledge Extraction Pipeline
 *
 * Phase 1 — Chunk: Split document into section-aware, overlapping chunks
 * Phase 2 — Extract: Analyse chunks in parallel (rate-limited, with retry)
 * Phase 3 — Merge: Deduplicate and score across all chunks
 * Phase 4 — Synthesise: GPT-4o final pass for summary + consistency
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRequire } from 'module';
import OpenAI from 'openai';
import { AiConfigService } from '@/modules/ai-config/ai-config.service';
import { AI_PROMPT_KEYS } from '@/modules/ai-config/ai-config.defaults';

const pkgRequire = createRequire(__filename);

// ─── Exported Interfaces ──────────────────────────────────────────────────────

export interface ExtractedSection {
  name: string;
  displayName: string;
  description: string;
  order: number;
}
export interface ExtractedQuestion {
  section: string;
  question: string;
  description: string;
  helpText: string;
  type: 'TEXT' | 'TEXTAREA' | 'YES_NO' | 'DATE' | 'NUMBER' | 'SELECT' | 'MULTI_SELECT' | 'SCALE';
  required: boolean;
  options?: { label: string; value: string }[];
  sourcePage?: number;
  sourceReference?: string;
  confidence?: number;
  clinicalReason: string;
}
export interface ExtractedRule {
  questionRef: string;
  condition: string;
  operator: string;
  value: string;
  action: 'URGENT_REFERRAL' | 'STOP_PRESCRIBING' | 'SHOW_WARNING' | 'REQUIRE_DOCUMENTATION' | 'ADJUST_DOSE' | 'CONTRAINDICATED';
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'STOP';
  message: string;
  details: string;
}
export interface ExtractedTreatment {
  medicationName: string;
  genericName?: string;
  dose?: string;
  strength?: string;
  route?: string;
  frequency?: string;
  duration?: string;
  maxDose?: string;
  eligibility?: string;
  renalAdjustment?: string;
  renalAdjustmentReason?: string;
  renalDosingBasis?: string;
  renalDosingRules?: unknown[];
  hepaticAdjustment?: string;
  hepaticAdjustmentReason?: string;
  pregnancyNotes?: string;
  pregnancyReason?: string;
  breastfeedingNotes?: string;
  warnings: string[];
  interactions: string[];
  monitoring?: string;
  monitoringReason?: string;
}
export interface ExtractedCounselling {
  category: string;
  point: string;
  detail?: string;
}
export interface ExtractedFollowup {
  timeframe: string;
  condition: string;
  action: string;
  urgency: 'ROUTINE' | 'URGENT' | 'EMERGENCY';
}
export interface ExtractedRedFlag {
  title: string;
  description?: string;
  severity: 'WARNING' | 'CRITICAL' | 'EMERGENCY';
  action?: string;
  sourceReference?: string;
}
export interface ExtractedDifferential {
  condition: string;
  question?: string;
  whyItMatters?: string;
  suggestedPathway?: string;
  keySymptoms?: string;
  distinguishingFeatures?: string;
  recommendedAction?: string;
  likelihood?: 'COMMON' | 'LESS_COMMON' | 'RARE';
}
export interface ExtractedKnowledge {
  summary: string;
  sections: ExtractedSection[];
  questions: ExtractedQuestion[];
  rules: ExtractedRule[];
  treatments: ExtractedTreatment[];
  counselling: ExtractedCounselling[];
  followup: ExtractedFollowup[];
  redFlags: ExtractedRedFlag[];
  differentials: ExtractedDifferential[];
}

type ChunkResult = Omit<ExtractedKnowledge, 'summary'>;

// ─── Constants ────────────────────────────────────────────────────────────────

const CHUNK_CHARS = 3500;        // ~875 tokens per chunk
const CHUNK_OVERLAP = 300;       // overlapping chars between chunks
const PARALLEL_LIMIT = 4;        // max simultaneous OpenAI calls
const RETRY_LIMIT = 3;           // per-chunk retry attempts
const RETRY_DELAY_MS = 1500;     // base delay between retries

const STANDARD_SECTIONS: ExtractedSection[] = [
  { name: 'diagnosisConfirmation', displayName: 'Diagnosis Confirmation', description: 'Questions that confirm the clinical diagnosis', order: 0 },
  { name: 'additionalAssessment',  displayName: 'Additional Assessment',  description: 'Context-specific assessment (severity, pregnancy, etc.)', order: 1 },
  { name: 'treatmentEligibility',  displayName: 'Treatment Eligibility',  description: 'Criteria that determine which treatments are appropriate', order: 2 },
];

/** Maps legacy extraction section names → canonical Assessment sections */
const LEGACY_SECTION_ALIASES: Record<string, string> = {
  presentationReview: 'diagnosisConfirmation',
  presentingConcern: 'diagnosisConfirmation',
  typicalFeatures: 'diagnosisConfirmation',
  patientHistory: 'additionalAssessment',
  safetyScreening: 'treatmentEligibility',
  redFlags: 'treatmentEligibility',
  counselling: 'additionalAssessment',
  documentation: 'additionalAssessment',
  followUp: 'additionalAssessment',
};

// ─── Concurrency helper (inline — avoids ESM issues with p-limit) ─────────────

function pLimit(concurrency: number) {
  let running = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    if (running < concurrency && queue.length) {
      running++;
      queue.shift()!();
    }
  };
  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn()
          .then(resolve, reject)
          .finally(() => { running--; next(); });
      });
      next();
    });
}

async function retryAsync<T>(
  fn: () => Promise<T>,
  attempts: number,
  baseDelayMs: number,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, baseDelayMs * (i + 1)));
      }
    }
  }
  throw lastErr;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AiPipelineService {
  private readonly logger = new Logger(AiPipelineService.name);
  private readonly openai: OpenAI;
  private readonly model: string;
  private readonly fastModel: string;

  constructor(
    private config: ConfigService,
    private readonly aiConfig: AiConfigService,
  ) {
    this.openai = new OpenAI({ apiKey: this.config.get<string>('OPENAI_API_KEY') });
    this.model = this.config.get<string>('OPENAI_MODEL', 'gpt-5.6-luna');
    this.fastModel = this.config.get<string>('OPENAI_FAST_MODEL', 'gpt-5.6-luna');
  }

  private resolveModels() {
    const s = this.aiConfig.getSettings();
    return {
      model: s.openaiModel || this.model,
      fastModel: s.openaiFastModel || this.fastModel,
    };
  }

  // ── Phase 1: Chunk ──────────────────────────────────────────────────────────

  chunkText(text: string, chunkSize = CHUNK_CHARS, overlap = CHUNK_OVERLAP): string[] {
    if (text.length <= chunkSize) return [text];

    // Prefer splitting on structural markers: blank lines, headers, numbered items
    const SPLITTERS = /\n(?=\d+\.|#{1,3} |[A-Z][A-Z ]{5,}:|\n)/;

    const paragraphs = text.split(SPLITTERS).filter((p) => p.trim().length > 20);

    const chunks: string[] = [];
    let current = '';

    for (const para of paragraphs) {
      if ((current + para).length > chunkSize && current.length > overlap) {
        chunks.push(current.trim());
        // Keep tail overlap
        const words = current.split(' ');
        current = words.slice(-Math.floor(overlap / 5)).join(' ') + '\n' + para;
      } else {
        current += (current ? '\n' : '') + para;
      }
    }
    if (current.trim().length > 50) chunks.push(current.trim());

    return chunks.length ? chunks : [text];
  }

  // ── Phase 2: Extract (parallel, rate-limited) ───────────────────────────────

  async analyzeDocument(text: string, pathwayName: string, condition: string): Promise<ExtractedKnowledge> {
    const chunks = this.chunkText(text);
    this.logger.log(`RAG pipeline: ${chunks.length} chunks for "${pathwayName}"`);

    const limit = pLimit(PARALLEL_LIMIT);

    const results = await Promise.allSettled(
      chunks.map((chunk, i) =>
        limit(() =>
          retryAsync(
            () => this.extractChunk(chunk, pathwayName, condition, i, chunks.length),
            RETRY_LIMIT,
            RETRY_DELAY_MS,
          ),
        ),
      ),
    );

    const successful = results
      .filter((r): r is PromiseFulfilledResult<ChunkResult> => r.status === 'fulfilled')
      .map((r) => r.value);

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) this.logger.warn(`${failed}/${chunks.length} chunks failed extraction`);

    // ── Phase 3: Merge & deduplicate ─────────────────────────────────────────
    const merged = this.mergeChunks(successful, pathwayName, condition);

    // ── Phase 4: Synthesise summary ──────────────────────────────────────────
    merged.summary = await this.generateSummary(pathwayName, condition, merged);

    return merged;
  }

  private async extractChunk(
    chunk: string,
    pathwayName: string,
    condition: string,
    idx: number,
    total: number,
  ): Promise<ChunkResult> {
    this.logger.debug(`Chunk ${idx + 1}/${total} — ${chunk.length} chars`);
    const { fastModel } = this.resolveModels();
    const systemPrompt = this.aiConfig.getPrompt(
      AI_PROMPT_KEYS.PATHWAY_CHUNK_EXTRACTION,
      SYSTEM_PROMPT,
    );

    const response = await this.openai.chat.completions.create({
      model: fastModel,
      max_completion_tokens: 3500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: buildChunkPrompt(chunk, pathwayName, condition, idx, total) },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    return parseChunkResult(raw);
  }

  // ── Phase 3: Merge ──────────────────────────────────────────────────────────

  private mergeChunks(chunks: ChunkResult[], pathwayName: string, condition: string): ExtractedKnowledge {
    const seenSections = new Map<string, ExtractedSection>();
    const seenQuestions = new Map<string, ExtractedQuestion>();
    const seenTreatments = new Map<string, ExtractedTreatment>();
    const seenCounselling = new Set<string>();
    const rules: ExtractedRule[] = [];
    const followups: ExtractedFollowup[] = [];
    const seenRedFlags = new Map<string, ExtractedRedFlag>();
    const seenDifferentials = new Map<string, ExtractedDifferential>();

    for (const chunk of chunks) {
      for (const q of chunk.questions) {
        const canonicalSection =
          LEGACY_SECTION_ALIASES[q.section] ??
          (STANDARD_SECTIONS.some((s) => s.name === q.section) ? q.section : 'diagnosisConfirmation');
        const normalizedQ = { ...q, section: canonicalSection };
        const key = normalizeStr(normalizedQ.question);
        const existing = seenQuestions.get(key);
        if (!existing || (normalizedQ.confidence ?? 0) > (existing.confidence ?? 0)) {
          seenQuestions.set(key, normalizedQ);
        }
      }
      for (const s of chunk.sections) {
        const canonicalName = LEGACY_SECTION_ALIASES[s.name] ?? s.name;
        if (!seenSections.has(canonicalName) && STANDARD_SECTIONS.some((std) => std.name === canonicalName)) {
          const std = STANDARD_SECTIONS.find((x) => x.name === canonicalName)!;
          seenSections.set(canonicalName, { ...std });
        }
      }
      for (const t of chunk.treatments) {
        const key = normalizeStr(t.medicationName);
        if (!seenTreatments.has(key)) seenTreatments.set(key, t);
        else {
          // Merge non-null fields from newer occurrence
          const cur = seenTreatments.get(key)!;
          seenTreatments.set(key, mergeObjects(cur, t) as ExtractedTreatment);
        }
      }
      for (const r of chunk.rules) rules.push(r);
      for (const c of chunk.counselling) {
        const key = normalizeStr(c.point);
        if (!seenCounselling.has(key)) { seenCounselling.add(key); }
      }
      for (const f of chunk.followup) followups.push(f);
      for (const rf of chunk.redFlags ?? []) {
        if (!rf?.title) continue;
        const key = normalizeStr(rf.title);
        if (!seenRedFlags.has(key)) seenRedFlags.set(key, rf);
      }
      for (const d of chunk.differentials ?? []) {
        if (!d?.condition) continue;
        const key = normalizeStr(d.condition);
        if (!seenDifferentials.has(key)) seenDifferentials.set(key, d);
        else seenDifferentials.set(key, mergeObjects(seenDifferentials.get(key)!, d));
      }
    }

    // Collect counselling with dedup
    const counselling: ExtractedCounselling[] = [];
    const usedKeys = new Set<string>();
    for (const chunk of chunks) {
      for (const c of chunk.counselling) {
        const key = normalizeStr(c.point);
        if (!usedKeys.has(key)) { usedKeys.add(key); counselling.push(c); }
      }
    }

    // Collect sections; fill missing standard ones
    const sections: ExtractedSection[] = Array.from(seenSections.values());
    const existingNames = new Set(sections.map((s) => s.name));
    for (const std of STANDARD_SECTIONS) {
      if (!existingNames.has(std.name)) sections.push(std);
    }
    sections.sort((a, b) => a.order - b.order);

    // Deduplicate follow-ups
    const seenFollowup = new Set<string>();
    const uniqueFollowups = followups.filter((f) => {
      const key = normalizeStr(`${f.timeframe}-${f.condition}`);
      if (seenFollowup.has(key)) return false;
      seenFollowup.add(key);
      return true;
    });

    return {
      summary: `Clinical prescribing pathway for ${condition} (${pathwayName})`,
      sections,
      questions: Array.from(seenQuestions.values()),
      rules: deduplicateRules(rules),
      treatments: Array.from(seenTreatments.values()),
      counselling,
      followup: uniqueFollowups,
      redFlags: Array.from(seenRedFlags.values()),
      differentials: Array.from(seenDifferentials.values()),
    };
  }

  // ── Phase 4: Synthesise ──────────────────────────────────────────────────────

  async generateSummary(pathwayName: string, condition: string, knowledge: ExtractedKnowledge): Promise<string> {
    try {
      const { model } = this.resolveModels();
      const summarySystem = this.aiConfig.getPrompt(
        AI_PROMPT_KEYS.PATHWAY_SUMMARY,
        'You are a senior clinical pharmacist. Write concise, professional clinical summaries.',
      );
      const res = await this.openai.chat.completions.create({
        model,
        max_completion_tokens: 220,
        messages: [
          {
            role: 'system',
            content: summarySystem,
          },
          {
            role: 'user',
            content:
              `Write a 2–3 sentence clinical summary for the "${pathwayName}" prescribing pathway for ${condition}.\n` +
              `Sections covered: ${knowledge.sections.map((s) => s.displayName).join(', ')}.\n` +
              `${knowledge.questions.length} clinical questions · ${knowledge.treatments.length} treatment options · ` +
              `${knowledge.rules.length} decision rules · ${knowledge.counselling.length} counselling points.\n` +
              'Write from a pharmacist perspective. Be professional and clinically precise.',
          },
        ],
      });
      return res.choices[0]?.message?.content?.trim() ?? '';
    } catch {
      return (
        `Clinical prescribing pathway for ${condition}. ` +
        `Extracted ${knowledge.questions.length} questions, ` +
        `${knowledge.treatments.length} treatment options, and ` +
        `${knowledge.rules.length} decision rules from guidelines.`
      );
    }
  }

  async regenerateSection(
    originalText: string,
    sectionName: string,
    instructions: string,
  ): Promise<Partial<ExtractedKnowledge>> {
    const { model } = this.resolveModels();
    const systemPrompt = this.aiConfig.getPrompt(
      AI_PROMPT_KEYS.PATHWAY_SECTION_REGENERATE,
      'You are an expert clinical pharmacist. Regenerate the specified section of a clinical pathway.',
    );
    const res = await this.openai.chat.completions.create({
      model,
      max_completion_tokens: 2500,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content:
            `Regenerate the "${sectionName}" section.\n\nOriginal context:\n${originalText.slice(0, 3000)}\n\n` +
            `Instructions: ${instructions}\n\nReturn JSON matching the clinical pathway extraction format.`,
        },
      ],
    });
    const raw = res.choices[0]?.message?.content ?? '{}';
    return parseChunkResult(raw);
  }
}

// ─── Prompts ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert clinical pharmacist with 20+ years of experience in prescribing pathways and clinical decision support.

Extract structured clinical knowledge from guideline document sections.

RULES:
1. Extract ONLY information explicitly stated — never infer or assume
2. Confidence < 85 if information is ambiguous or incomplete
3. Every question must relate to patient safety or treatment decisions
4. Return ONLY valid JSON (no markdown, no explanation)
5. Empty arrays for sections with no relevant content`;

function buildChunkPrompt(
  chunk: string,
  pathwayName: string,
  condition: string,
  idx: number,
  total: number,
): string {
  return `Analyze this section (${idx + 1}/${total}) of the "${pathwayName}" clinical guideline for "${condition}".

DOCUMENT SECTION:
---
${chunk}
---

Return JSON with this exact structure:
{
  "sections": [{"name":"camelCaseId","displayName":"Human Name","description":"string","order":0}],
  "questions": [{
    "section":"diagnosisConfirmation|additionalAssessment|treatmentEligibility","question":"patient-facing text","description":"why it matters",
    "helpText":"pharmacist tip","type":"YES_NO|TEXT|TEXTAREA|NUMBER|DATE|SELECT|MULTI_SELECT|SCALE",
    "required":true,"options":[{"label":"","value":""}],"sourcePage":null,"sourceReference":"quote",
    "confidence":90,"clinicalReason":"why this matters"
  }],
  "rules": [{
    "questionRef":"question text","condition":"condition desc",
    "operator":"equals|not_equals|greater_than|less_than|contains|yes|no","value":"string",
    "action":"URGENT_REFERRAL|STOP_PRESCRIBING|SHOW_WARNING|REQUIRE_DOCUMENTATION|ADJUST_DOSE|CONTRAINDICATED",
    "severity":"INFO|WARNING|CRITICAL|STOP","message":"pharmacist message","details":"explanation"
  }],
  "treatments": [{
    "medicationName":"","genericName":null,"strength":null,"dose":null,"route":null,"frequency":null,"duration":null,
    "maxDose":null,"eligibility":null,
    "renalAdjustment":"Yes|No|null","renalAdjustmentReason":"why when Yes",
    "renalSourceBasis":"CrCl|eGFR|OTHER|NONE",
    "renalDosingBasis":"eGFR|NONE","renalDosingRules":[],
    "hepaticAdjustment":"Yes|No|null","hepaticAdjustmentReason":"why when Yes",
    "pregnancyNotes":"Yes|No|null","pregnancyReason":"why when Yes",
    "breastfeedingNotes":null,
    "warnings":[],"interactions":[],
    "monitoring":"Yes|No|null","monitoringReason":"why when Yes"
  }],
  "counselling": [{"category":"Medication counselling|Non-drug advice|Prevention|Follow-up|When to seek urgent care|Handouts","point":"concise point","detail":null}],
  "followup": [{"timeframe":"48-72 hours","condition":"when/why","action":"what to do","urgency":"ROUTINE|URGENT|EMERGENCY"}],
  "redFlags": [{
    "title":"short warning sign name","description":"what to look for",
    "severity":"WARNING|CRITICAL|EMERGENCY",
    "action":"IMMEDIATE_REFERRAL|SAME_DAY_PHYSICIAN|EMERGENCY|PATHWAY_EXCLUDED|PHARMACIST_DISCRETION",
    "sourceReference":"quote from document"
  }],
  "differentials": [{
    "condition":"alternative condition name","question":"screening question (yes → this differential)",
    "whyItMatters":"clinical rationale","suggestedPathway":"alternate pathway name if known",
    "keySymptoms":"typical presenting features",
    "distinguishingFeatures":"how to tell it apart from the primary condition",
    "recommendedAction":"what to do if suspected","likelihood":"COMMON|LESS_COMMON|RARE"
  }]
}

RED FLAGS: warning signs/symptoms that require urgent referral, stopping treatment, or emergency care.
DIFFERENTIALS: other conditions the pharmacist should consider or rule out before treating.`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseChunkResult(raw: string): ChunkResult {
  try {
    const parsed = JSON.parse(raw);
    return {
      sections:   Array.isArray(parsed.sections)   ? parsed.sections   : [],
      questions:  Array.isArray(parsed.questions)  ? parsed.questions  : [],
      rules:      Array.isArray(parsed.rules)      ? parsed.rules      : [],
      treatments: Array.isArray(parsed.treatments) ? parsed.treatments : [],
      counselling:Array.isArray(parsed.counselling)? parsed.counselling: [],
      followup:   Array.isArray(parsed.followup)   ? parsed.followup   : [],
      redFlags:     Array.isArray(parsed.redFlags)     ? parsed.redFlags     : [],
      differentials:Array.isArray(parsed.differentials)? parsed.differentials: [],
    };
  } catch {
    return { sections: [], questions: [], rules: [], treatments: [], counselling: [], followup: [], redFlags: [], differentials: [] };
  }
}

function normalizeStr(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function deduplicateRules(rules: ExtractedRule[]): ExtractedRule[] {
  const seen = new Set<string>();
  return rules.filter((r) => {
    if (!r?.condition || !r?.message) return false;
    const key = normalizeStr(`${r.condition}-${r.action}-${r.severity}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeObjects<T extends object>(base: T, override: T): T {
  const result = { ...base };
  for (const k of Object.keys(override) as (keyof T)[]) {
    const v = override[k];
    if (v !== null && v !== undefined && v !== '') result[k] = v;
    if (Array.isArray(v) && (v as unknown[]).length > 0) result[k] = v;
  }
  return result;
}

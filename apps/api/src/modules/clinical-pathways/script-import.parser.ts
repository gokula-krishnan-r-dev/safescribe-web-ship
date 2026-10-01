import type { ExtractedKnowledge, ExtractedQuestion } from './ai-pipeline.service';
import { normalizeQuestionType, normalizeSectionName } from './normalize-extracted';
import { detectLegacyTwoSectionImport } from '@safescript/shared';

export type ScriptImportSection =
  | 'diagnosisConfirmation'
  | 'additionalAssessment'
  | 'treatmentEligibility';

const SECTION_ALIASES: Record<string, ScriptImportSection> = {
  diagnosisconfirmation: 'diagnosisConfirmation',
  'diagnosis confirmation': 'diagnosisConfirmation',
  assessment: 'diagnosisConfirmation',
  'clinical assessment': 'diagnosisConfirmation',
  questions: 'diagnosisConfirmation',
  'presentation review': 'diagnosisConfirmation',
  presentationreview: 'diagnosisConfirmation',
  additionalassessment: 'additionalAssessment',
  'additional assessment': 'additionalAssessment',
  'custom assessment': 'additionalAssessment',
  customassessment: 'additionalAssessment',
  treatmenteligibility: 'treatmentEligibility',
  'treatment eligibility': 'treatmentEligibility',
  eligibility: 'treatmentEligibility',
  redflags: 'diagnosisConfirmation',
};

const TYPE_ALIASES: Record<string, ExtractedQuestion['type']> = {
  yes_no: 'YES_NO',
  'yes/no': 'YES_NO',
  yesno: 'YES_NO',
  boolean: 'YES_NO',
  yn: 'YES_NO',
  text: 'TEXT',
  short: 'TEXT',
  textarea: 'TEXTAREA',
  long: 'TEXTAREA',
  number: 'NUMBER',
  date: 'DATE',
  select: 'SELECT',
  dropdown: 'SELECT',
  'pick one': 'SELECT',
  multi_select: 'MULTI_SELECT',
  multiselect: 'MULTI_SELECT',
  'pick many': 'MULTI_SELECT',
  scale: 'SCALE',
};

const TYPE_TOKEN_RE =
  /YES_NO|YES\s*\/\s*NO|DATE|TEXT|TEXTAREA|NUMBER|SELECT|MULTI_SELECT|SCALE|BOOLEAN|YESNO/i;

const FIELD_LABEL_RE =
  /^(expected answer|why it matters|pharmacist tip|help text|help|clinical reason|description|notes?|type)\s*[:：]\s*(.*)$/i;

const INTERROGATIVE_RE =
  /^(Is|Did|Does|Do|Can|Could|Has|Have|Are|Was|Were|Should|Would|Will|When|Where|What|Who|Which|How)\b/;

export interface ParsedScriptImport {
  questions: ExtractedQuestion[];
  source: 'json' | 'markdown' | 'lines';
  legacyTwoSectionImport?: boolean;
}

function mapSection(raw: string | undefined, fallback: ScriptImportSection): ScriptImportSection {
  if (!raw?.trim()) return fallback;
  const key = raw.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  const compact = key.replace(/\s+/g, '');
  return (
    SECTION_ALIASES[key] ||
    SECTION_ALIASES[compact] ||
    (normalizeSectionName(raw) as ScriptImportSection) ||
    fallback
  );
}

function mapType(raw: string | undefined): ExtractedQuestion['type'] {
  if (!raw?.trim()) return 'YES_NO';
  const key = raw.trim().toLowerCase().replace(/[_-]+/g, ' ');
  return TYPE_ALIASES[key] || TYPE_ALIASES[key.replace(/\s+/g, '')] || normalizeQuestionType(raw);
}

function headingKey(raw: string): string {
  return raw
    .replace(/^#{1,6}\s+/, '')
    .replace(/[:：]\s*$/, '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

/** True when the line is a known Assessment section title (with or without ## / colon). */
function matchSectionHeading(line: string): ScriptImportSection | null {
  if (line.length > 80 || /^\d+[.)]/.test(line) || /^[-*•]/.test(line)) return null;
  if (line.includes('?')) return null;
  const key = headingKey(line);
  if (!key) return null;
  const compact = key.replace(/\s+/g, '');
  return SECTION_ALIASES[key] || SECTION_ALIASES[compact] || null;
}

function makeQuestion(
  text: string,
  section: ScriptImportSection,
  type?: string,
  extras?: Partial<ExtractedQuestion>,
): ExtractedQuestion | null {
  const question = text.replace(/^[\d]+[.)]\s*/, '').replace(/^[-*•]\s*/, '').trim();
  if (question.length < 5) return null;
  return {
    section,
    question,
    description: extras?.description || '',
    helpText: extras?.helpText || '',
    type: mapType(type || extras?.type),
    required: extras?.required !== false,
    options: extras?.options,
    confidence: extras?.confidence,
    clinicalReason: extras?.clinicalReason || 'Imported from ChatGPT / admin script',
    sourceReference: extras?.sourceReference || 'chatgpt-script-import',
  };
}

function applyField(q: ExtractedQuestion, label: string, value: string) {
  const key = label.toLowerCase().replace(/\s+/g, ' ').trim();
  const text = value.trim();
  if (!text) return;

  if (key.startsWith('why')) {
    q.description = [q.description, text].filter(Boolean).join(' ').trim();
    return;
  }
  if (key.startsWith('pharmacist') || key === 'help' || key === 'help text') {
    q.helpText = [q.helpText, text].filter(Boolean).join(' ').trim();
    return;
  }
  if (key.startsWith('expected')) {
    q.helpText = [`Expected answer: ${text}`, q.helpText].filter(Boolean).join(' ').trim();
    if (/^(yes|no)$/i.test(text)) q.type = 'YES_NO';
    return;
  }
  if (key === 'type') {
    q.type = mapType(text);
    return;
  }
  if (key.startsWith('description') || key.startsWith('note') || key.startsWith('clinical')) {
    q.description = [q.description, text].filter(Boolean).join(' ').trim();
  }
}

function applyRestFields(q: ExtractedQuestion, rest: string) {
  if (!rest.trim()) return;
  const re =
    /(expected answer|why it matters|pharmacist tip|help text|help|clinical reason|description|notes?|type)\s*[:：]\s*/gi;
  const matches = [...rest.matchAll(re)];
  if (!matches.length) {
    if (!q.description) q.description = rest.trim();
    return;
  }
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const valueStart = (current.index ?? 0) + current[0].length;
    const valueEnd = i + 1 < matches.length ? (matches[i + 1].index ?? rest.length) : rest.length;
    applyField(q, current[1], rest.slice(valueStart, valueEnd));
  }
}

/**
 * ChatGPT / Word paste often glues labels together:
 * `...? (YES_NO)Expected answer: YESWhy it matters: ... Pharmacist tip: ...`
 */
export function normalizeClinicalScript(text: string): string {
  let s = text
    .replace(/^\uFEFF/, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\r\n?/g, '\n');

  s = s.replace(new RegExp(`\\((${TYPE_TOKEN_RE.source})\\)(?=\\s*\\S)`, 'gi'), '($1)\n');

  const labels = [
    'Expected answer',
    'Why it matters',
    'Pharmacist tip',
    'Help text',
    'Clinical reason',
  ];
  for (const label of labels) {
    const escaped = label.replace(/ /g, '\\s+');
    // ChatGPT/Word often glues labels (`YESWhy it matters:`) or leaves them
    // mid-sentence after a space (`moderate. Pharmacist tip:`).
    s = s.replace(new RegExp(`(?:(?<=\\S)|\\s+)(${escaped}\\s*:)`, 'gi'), '\n$1');
  }

  s = s.replace(
    /([.!?])(?=(?:Is|Did|Does|Do|Can|Could|Has|Have|Are|Was|Were|Should|Would|Will|When|Where|What|Who|Which|How)\b)/g,
    '$1\n',
  );

  s = s.replace(
    /(Diagnosis Confirmation|Treatment Eligibility|Custom Assessment|Additional Assessment|Clinical Assessment)(?=\s*(?:Is|Did|Does|Do|Can|Could|Has|Have|Are)\b)/gi,
    '$1\n',
  );

  return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function parseQuestionLine(
  line: string,
): { question: string; type?: string; rest?: string } | null {
  let body = line.replace(/^(?:\d+[.)]\s+|[-*•]\s+)/, '').trim();
  if (body.length < 8) return null;
  if (FIELD_LABEL_RE.test(body)) return null;

  const withType = body.match(
    new RegExp(
      `^([\\s\\S]*?\\?)\\s*\\((${TYPE_TOKEN_RE.source})\\)\\s*([\\s\\S]*)$`,
      'i',
    ),
  );
  if (withType) {
    return {
      question: withType[1].trim(),
      type: withType[2],
      rest: withType[3].trim() || undefined,
    };
  }

  const qMark = body.indexOf('?');
  if (qMark >= 7) {
    const question = body.slice(0, qMark + 1).trim();
    const rest = body.slice(qMark + 1).trim();
    if (question.length >= 8) {
      return { question, rest: rest || undefined };
    }
  }

  if (INTERROGATIVE_RE.test(body) && body.length >= 12) {
    return { question: body };
  }

  return null;
}

/** Try to parse a JSON blob (full ExtractedKnowledge or { questions: [...] }). */
function parseJsonScript(text: string): ParsedScriptImport | null {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence?.[1]?.trim() || trimmed;
  if (!candidate.startsWith('{') && !candidate.startsWith('[')) return null;

  try {
    const data = JSON.parse(candidate) as
      | ExtractedKnowledge
      | ExtractedQuestion[]
      | { questions?: ExtractedQuestion[] };

    const rawQuestions = Array.isArray(data)
      ? data
      : Array.isArray((data as { questions?: ExtractedQuestion[] }).questions)
        ? (data as { questions: ExtractedQuestion[] }).questions
        : null;

    if (!rawQuestions?.length) return null;

    const questions = rawQuestions
      .map((q) =>
        makeQuestion(
          String((q as ExtractedQuestion).question ?? (q as { text?: string }).text ?? ''),
          mapSection(String((q as ExtractedQuestion).section ?? ''), 'diagnosisConfirmation'),
          (q as ExtractedQuestion).type,
          q as ExtractedQuestion,
        ),
      )
      .filter((q): q is ExtractedQuestion => Boolean(q));

    return questions.length ? { questions, source: 'json' } : null;
  } catch {
    if (!fence && trimmed.includes('```')) {
      const nested = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (nested?.[1]) return parseJsonScript(nested[1]);
    }
    return null;
  }
}

/**
 * Structured ChatGPT / pharmacist scripts:
 * - ## Diagnosis Confirmation  OR  plain "Diagnosis Confirmation"
 * - numbered lists, bullets, or unnumbered YES/NO blocks
 * - trailing "Expected answer" / "Why it matters" / "Pharmacist tip"
 */
function parseStructuredScript(text: string): ParsedScriptImport | null {
  const lines = text.split('\n');
  let currentSection: ScriptImportSection = 'diagnosisConfirmation';
  const questions: ExtractedQuestion[] = [];
  let last: ExtractedQuestion | null = null;

  const pushQuestion = (
    parsed: { question: string; type?: string; rest?: string },
    extras?: Partial<ExtractedQuestion>,
  ) => {
    const q = makeQuestion(parsed.question, currentSection, parsed.type, extras);
    if (!q) return;
    if (parsed.rest) applyRestFields(q, parsed.rest);
    questions.push(q);
    last = q;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const section = matchSectionHeading(line.replace(/^\*+|\*+$/g, '').trim());
    if (section) {
      currentSection = section;
      last = null;
      continue;
    }

    const field = line.match(FIELD_LABEL_RE);
    if (field && last) {
      applyRestFields(last, line);
      continue;
    }

    const markdownHeading = line.match(/^#{1,3}\s+(.+)$/) || line.match(/^(.+):\s*$/);
    if (
      markdownHeading &&
      !FIELD_LABEL_RE.test(line) &&
      !/^\d+[.)]/.test(line) &&
      !/^[-*•]/.test(line) &&
      !line.includes('?')
    ) {
      const title = markdownHeading[1].replace(/^\*+|\*+$/g, '').trim();
      if (/red\s*flag|differential|treatment option|patient education|clinical rule/i.test(title)) {
        last = null;
        continue;
      }
      const mapped = matchSectionHeading(title);
      if (mapped) {
        currentSection = mapped;
        last = null;
        continue;
      }
      currentSection = mapSection(title, currentSection);
      last = null;
      continue;
    }

    const numbered = /^(?:\d+[.)]\s+|[-*•]\s+)/.test(line);
    const parsed = parseQuestionLine(line);
    if (parsed) {
      pushQuestion(parsed, { confidence: numbered ? 90 : 88 });
      continue;
    }
  }

  return questions.length ? { questions, source: 'markdown' } : null;
}

/** Last-resort: one question per line that contains a question mark. */
function parseLineScript(text: string): ParsedScriptImport | null {
  const questions: ExtractedQuestion[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.length < 8 || !line.includes('?')) continue;
    const parsed = parseQuestionLine(line);
    if (!parsed) continue;
    const q = makeQuestion(parsed.question, 'diagnosisConfirmation', parsed.type);
    if (!q) continue;
    if (parsed.rest) applyRestFields(q, parsed.rest);
    questions.push(q);
  }
  return questions.length ? { questions, source: 'lines' } : null;
}

/**
 * Deterministic ChatGPT / admin script parser.
 * Prefer JSON → structured pharmacist/markdown scripts → question-like lines.
 */
export function parseQuestionScript(text: string): ParsedScriptImport | null {
  const cleaned = normalizeClinicalScript(text);
  if (cleaned.length < 8) return null;

  const parsed = parseJsonScript(cleaned) || parseStructuredScript(cleaned) || parseLineScript(cleaned);
  if (!parsed) return null;
  return {
    ...parsed,
    legacyTwoSectionImport:
      detectLegacyTwoSectionImport(text) || detectLegacyTwoSectionImport(cleaned),
  };
}

/**
 * Coerce LLM-invented enum strings / messy payloads into Prisma-safe values.
 * Models often emit synonyms or alternate field names that are not in the schema.
 */

import {
  QuestionType,
  RecommendationLevel,
  RuleAction,
  RuleSeverity,
  TreatmentCategory,
} from '@prisma/client';

const RULE_ACTIONS = new Set<string>(Object.values(RuleAction));
const RULE_SEVERITIES = new Set<string>(Object.values(RuleSeverity));
const QUESTION_TYPES = new Set<string>(Object.values(QuestionType));
const TREATMENT_CATEGORIES = new Set<string>(Object.values(TreatmentCategory));

const ACTION_ALIASES: Array<{ match: RegExp; action: RuleAction }> = [
  { match: /refer|specialist|emergency\s*care|urgent\s*care|ed\b|hospital/i, action: RuleAction.URGENT_REFERRAL },
  { match: /contra.?indic|do\s*not\s*treat|not\s*eligible/i, action: RuleAction.CONTRAINDICATED },
  { match: /stop\s*(prescrib|treatment)|do\s*not\s*prescrib|discontinu/i, action: RuleAction.STOP_PRESCRIBING },
  { match: /adjust\s*dose|dose\s*adjust|reduce\s*dose|titrat/i, action: RuleAction.ADJUST_DOSE },
  { match: /document|chart|record|notes?\b/i, action: RuleAction.REQUIRE_DOCUMENTATION },
  { match: /warn|caution|monitor|alert|advise/i, action: RuleAction.SHOW_WARNING },
];

const SEVERITY_ALIASES: Array<{ match: RegExp; severity: RuleSeverity }> = [
  { match: /stop|halt|absolute/i, severity: RuleSeverity.STOP },
  { match: /critical|severe|emergenc|life.?threat/i, severity: RuleSeverity.CRITICAL },
  { match: /info|note|mild|low/i, severity: RuleSeverity.INFO },
  { match: /warn|caution|moderate/i, severity: RuleSeverity.WARNING },
];

function asKey(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
}

function firstString(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (c == null) continue;
    const s = String(c).trim();
    if (s) return s;
  }
  return null;
}

export function normalizeRuleAction(raw: unknown): RuleAction {
  const key = asKey(raw);
  if (RULE_ACTIONS.has(key)) return key as RuleAction;

  const text = String(raw ?? '');
  for (const { match, action } of ACTION_ALIASES) {
    if (match.test(key) || match.test(text)) return action;
  }
  return RuleAction.SHOW_WARNING;
}

export function normalizeRuleSeverity(raw: unknown): RuleSeverity {
  const key = asKey(raw);
  if (RULE_SEVERITIES.has(key)) return key as RuleSeverity;

  const text = String(raw ?? '');
  for (const { match, severity } of SEVERITY_ALIASES) {
    if (match.test(key) || match.test(text)) return severity;
  }
  return RuleSeverity.WARNING;
}

export function normalizeQuestionType(raw: unknown): QuestionType {
  const key = asKey(raw);
  if (QUESTION_TYPES.has(key)) return key as QuestionType;

  const lower = String(raw ?? '').toLowerCase();
  if (/yes.?no|boolean|true.?false/.test(lower)) return QuestionType.YES_NO;
  if (/multi.?select|checkbox/.test(lower)) return QuestionType.MULTI_SELECT;
  if (/select|dropdown|choice|enum/.test(lower)) return QuestionType.SELECT;
  if (/textarea|long.?text|paragraph/.test(lower)) return QuestionType.TEXTAREA;
  if (/number|numeric|integer|float/.test(lower)) return QuestionType.NUMBER;
  if (/date|dob|birth/.test(lower)) return QuestionType.DATE;
  if (/scale|likert|rating|score/.test(lower)) return QuestionType.SCALE;
  return QuestionType.TEXT;
}

export function normalizeRuleOperator(raw: unknown): string {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  const allowed = new Set([
    'equals',
    'not_equals',
    'greater_than',
    'less_than',
    'contains',
    'yes',
    'no',
  ]);
  if (allowed.has(v)) return v;
  if (v === 'eq' || v === '==' || v === '=') return 'equals';
  if (v === 'neq' || v === '!=' || v === '<>') return 'not_equals';
  if (v === 'gt' || v === '>') return 'greater_than';
  if (v === 'lt' || v === '<') return 'less_than';
  if (v === 'true') return 'yes';
  if (v === 'false') return 'no';
  return 'equals';
}

/** Resolve medication/treatment display name from messy LLM payloads. */
export function normalizeMedicationName(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') {
    return firstString(raw);
  }
  const t = raw as Record<string, unknown>;
  return firstString(
    t.medicationName,
    t.medication_name,
    t.drugName,
    t.drug_name,
    t.productName,
    t.product_name,
    t.treatmentName,
    t.treatment_name,
    t.name,
    t.label,
    t.treatment,
    t.therapy,
  );
}

export function normalizeTreatmentCategory(raw: unknown): TreatmentCategory {
  const key = asKey(raw);
  if (TREATMENT_CATEGORIES.has(key)) return key as TreatmentCategory;
  const lower = String(raw ?? '').toLowerCase();
  if (/otc|over.?the.?counter|non.?prescription/.test(lower)) return TreatmentCategory.OTC;
  if (/supplement|vitamin|mineral|probiotic|omega|herbal|nutraceut/.test(lower)) {
    return TreatmentCategory.SUPPLEMENT;
  }
  if (/non.?drug|non.?pharm|lifestyle|self.?care|non.?med|behaviour|hygiene|watch.?wait/.test(lower)) {
    return TreatmentCategory.NON_DRUG;
  }
  return TreatmentCategory.PRESCRIPTION;
}

export function normalizeRecommendationLevel(raw: unknown): RecommendationLevel {
  const key = asKey(raw);
  const allowed = new Set<string>(Object.values(RecommendationLevel));
  if (allowed.has(key)) return key as RecommendationLevel;

  const lower = String(raw ?? '').toLowerCase();
  if (/first|1st|preferred|preferred.?line/.test(lower)) return RecommendationLevel.FIRST_LINE;
  if (/second|2nd/.test(lower)) return RecommendationLevel.SECOND_LINE;
  if (/adjunct/.test(lower)) return RecommendationLevel.ADJUNCTIVE;
  if (/support/.test(lower)) return RecommendationLevel.SUPPORTIVE_CARE;
  if (/specialist|refer/.test(lower)) return RecommendationLevel.SPECIALIST;
  if (/alt/.test(lower)) return RecommendationLevel.ALTERNATIVE;
  return RecommendationLevel.FIRST_LINE;
}

export function normalizeStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x ?? '').trim()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

const PATIENT_EDUCATION_CATEGORIES = [
  'Medication counselling',
  'Non-drug advice',
  'Prevention',
  'Follow-up',
  'When to seek urgent care',
  'Handouts',
] as const;

const RED_FLAG_ACTIONS = new Set([
  'IMMEDIATE_REFERRAL',
  'SAME_DAY_PHYSICIAN',
  'EMERGENCY',
  'PATHWAY_EXCLUDED',
  'PHARMACIST_DISCRETION',
]);

/** Map LLM / rule-style actions onto pathway red-flag action enums. */
export function normalizeRedFlagAction(raw: unknown): string | null {
  const key = asKey(raw);
  if (RED_FLAG_ACTIONS.has(key)) return key;

  const text = String(raw ?? '').toLowerCase();
  if (!text.trim()) return null;
  if (/emergenc|911|ed\b|hospital|life.?threat/.test(text)) return 'EMERGENCY';
  if (/same.?day|urgent\s*physician|see\s*(a\s*)?doctor\s*today/.test(text)) {
    return 'SAME_DAY_PHYSICIAN';
  }
  if (/exclud|not\s*eligible|do\s*not\s*treat|pathway\s*not/.test(text)) {
    return 'PATHWAY_EXCLUDED';
  }
  if (/discretion|pharmacist\s*judg|clinical\s*judg/.test(text)) {
    return 'PHARMACIST_DISCRETION';
  }
  if (/refer|urgent|specialist|stop\s*prescrib|contra.?indic/.test(text)) {
    return 'IMMEDIATE_REFERRAL';
  }
  // RuleAction synonym used by older prompts
  if (key === 'URGENT_REFERRAL') return 'IMMEDIATE_REFERRAL';
  return 'IMMEDIATE_REFERRAL';
}

export function normalizeCounsellingCategory(raw: unknown): string {
  const text = String(raw ?? '').trim();
  if (!text) return 'Non-drug advice';
  const exact = PATIENT_EDUCATION_CATEGORIES.find(
    (c) => c.toLowerCase() === text.toLowerCase(),
  );
  if (exact) return exact;

  const lower = text.toLowerCase();
  if (/urgent|emergency|seek\s*care|red\s*flag/.test(lower)) return 'When to seek urgent care';
  if (/follow.?up|return|reassess/.test(lower)) return 'Follow-up';
  if (/prevent|hygiene|lifestyle|avoid/.test(lower)) return 'Prevention';
  if (/handout|leaflet|brochure|written/.test(lower)) return 'Handouts';
  if (/medication|drug|dose|tablet|cream|ointment/.test(lower)) return 'Medication counselling';
  if (/medication|lifestyle|hygiene|prevention|other/.test(lower)) {
    // Legacy Python categories → UI categories
    if (lower.includes('medication')) return 'Medication counselling';
    if (lower.includes('prevention')) return 'Prevention';
    if (lower.includes('hygiene') || lower.includes('lifestyle')) return 'Non-drug advice';
  }
  return 'Non-drug advice';
}

export function normalizeCounsellingPoint(
  raw: unknown,
): { category: string; point: string; detail: string | null } | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const point = firstString(c.point, c.text, c.label, c.title, c.advice);
  if (!point) return null;
  return {
    category: normalizeCounsellingCategory(firstString(c.category, c.type)),
    point,
    detail: firstString(c.detail, c.description, c.notes),
  };
}

export function normalizeFollowupItem(raw: unknown): {
  timeframe: string;
  condition: string;
  action: string;
  urgency: string;
} | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Record<string, unknown>;
  const timeframe = firstString(f.timeframe, f.when, f.timing) || 'As needed';
  const condition = firstString(f.condition, f.trigger, f.reason) || 'Routine follow-up';
  const action = firstString(f.action, f.plan, f.recommendation);
  if (!action) return null;
  const urgencyRaw = firstString(f.urgency, f.priority)?.toUpperCase() || 'ROUTINE';
  const urgency = ['ROUTINE', 'URGENT', 'EMERGENCY'].includes(urgencyRaw)
    ? urgencyRaw
    : 'ROUTINE';
  return { timeframe, condition, action, urgency };
}

const STANDARD_SECTION_NAMES = new Set([
  'diagnosisConfirmation',
  'additionalAssessment',
  'treatmentEligibility',
]);

export function normalizeSectionName(raw: unknown): string {
  const name = String(raw ?? '').trim();
  if (STANDARD_SECTION_NAMES.has(name)) return name;
  const low = name.toLowerCase().replace(/[^a-z]/g, '');
  if (/presentationreview/.test(low) || /diagnos|confirm|present/.test(low)) return 'diagnosisConfirmation';
  if (/eligib|treat|safety|contra/.test(low)) return 'treatmentEligibility';
  return 'additionalAssessment';
}

export function normalizeQuestionText(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return firstString(raw);
  const q = raw as Record<string, unknown>;
  const text = firstString(q.question, q.text, q.prompt, q.label);
  if (!text || text.length < 5) return null;
  return text;
}

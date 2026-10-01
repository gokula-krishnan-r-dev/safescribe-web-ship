import { randomUUID } from 'crypto';
import type { ExtractedQuestion } from './ai-pipeline.service';
import { parseQuestionScript } from './script-import.parser';
import {
  normalizeQuestionType,
  normalizeRuleAction,
  normalizeRuleOperator,
  normalizeRuleSeverity,
  normalizeTreatmentCategory,
  normalizeRecommendationLevel,
  normalizeSectionName,
  normalizeStringArray,
} from './normalize-extracted';
import {
  extractRenalDosingFromMarkdown,
  normalizeClinicalYesNo,
  type RenalDosingRule,
} from '@safescript/shared';

export type ChatGptImportTarget =
  | 'overview'
  | 'concepts'
  | 'assessment'
  | 'red-flags'
  | 'differentials'
  | 'rules'
  | 'treatments'
  | 'counselling'
  | 'references';

function splitBlocks(text: string, heading: RegExp): string[] {
  const parts = text.split(heading).map((p) => p.trim()).filter(Boolean);
  return parts;
}

function field(block: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${escaped}\\s*[:：]\\s*(.+)$`, 'im');
  const m = block.match(re);
  return m?.[1]?.trim() ?? '';
}

function fieldAny(block: string, names: string[]): string {
  for (const name of names) {
    const value = field(block, name);
    if (value) return value;
  }
  return '';
}

function nullIfBlank(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  return v ? v : null;
}

/** Map common ChatGPT route shorthand onto editor routes. */
export function normalizeTreatmentRoute(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  const key = value.toLowerCase().replace(/[._]/g, ' ').replace(/\s+/g, ' ');
  const map: Record<string, string> = {
    po: 'Oral',
    oral: 'Oral',
    bymouth: 'Oral',
    'by mouth': 'Oral',
    'p.o': 'Oral',
    'p.o.': 'Oral',
    topical: 'Topical',
    top: 'Topical',
    cutaneous: 'Topical',
    ophthalmic: 'Ophthalmic',
    eye: 'Ophthalmic',
    ou: 'Ophthalmic',
    otic: 'Otic',
    ear: 'Otic',
    nasal: 'Nasal',
    intranasal: 'Nasal',
    inhalation: 'Inhalation',
    inhaled: 'Inhalation',
    inh: 'Inhalation',
    transdermal: 'Transdermal',
    td: 'Transdermal',
    rectal: 'Rectal',
    pr: 'Rectal',
    intramuscular: 'Intramuscular',
    im: 'Intramuscular',
    subcutaneous: 'Subcutaneous',
    sc: 'Subcutaneous',
    sq: 'Subcutaneous',
    subq: 'Subcutaneous',
  };
  const compact = key.replace(/\s+/g, '');
  return map[key] ?? map[compact] ?? value.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Infer product form from free text when ChatGPT omits Product form. */
export function inferTreatmentProductForm(
  rawForm: string | null | undefined,
  dose: string | null | undefined,
  route: string | null | undefined,
  medicationName: string | null | undefined,
): string | null {
  const hay = [rawForm, dose, route, medicationName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!hay) return null;
  if (/\bfoams?\b/.test(hay)) return 'Foam';
  if (/\bcreams?\b/.test(hay)) return 'Cream';
  if (/\bointments?\b/.test(hay)) return 'Ointment';
  if (/\bgels?\b/.test(hay)) return 'Gel';
  if (/\b(mdi|metered[-\s]?dose|inhalers?)\b/.test(hay)) return 'Metered-dose inhaler';
  if (/\bnasal\s+sprays?\b/.test(hay)) return 'Nasal spray';
  if (/\bpatches?\b|\btransdermal\b/.test(hay)) return 'Patch';
  if (/\bsuppositor/.test(hay)) return 'Suppository';
  if (/\blozenges?\b/.test(hay)) return 'Lozenge';
  if (/\bdrops?\b/.test(hay)) return 'Drop';
  if (/\bsprays?\b/.test(hay)) return 'Spray';
  if (/\b(solutions?|suspensions?)\b/.test(hay)) return 'Solution';
  if (/\b(inject|vial|intramuscular|subcut)\b/.test(hay)) return 'Injection';
  if (/\bcapsules?\b/.test(hay)) return 'Capsule';
  if (/\b(tablets?|caplets?)\b/.test(hay)) return 'Tablet';
  if (rawForm?.trim()) {
    return rawForm.trim().replace(/\b\w/g, (c) => c.toUpperCase());
  }
  // Route-only soft defaults — only when form is truly missing
  const rt = (route ?? '').toLowerCase();
  if (rt === 'topical') return 'Cream';
  if (rt === 'oral') return 'Tablet';
  if (rt === 'ophthalmic' || rt === 'otic') return 'Drop';
  if (rt === 'nasal') return 'Nasal spray';
  if (rt === 'inhalation') return 'Metered-dose inhaler';
  if (rt === 'transdermal') return 'Patch';
  if (rt === 'rectal') return 'Suppository';
  if (rt === 'intramuscular' || rt === 'subcutaneous') return 'Injection';
  return null;
}

export function preferredAdministrationUnitFor(
  productForm: string | null,
  route: string | null,
): string | null {
  const form = (productForm ?? '').toLowerCase();
  const rt = (route ?? '').toLowerCase();
  if (form === 'tablet') return 'Tablet(s)';
  if (form === 'capsule') return 'Capsule(s)';
  if (['cream', 'ointment', 'gel', 'foam'].includes(form)) return 'Application(s)';
  if (form === 'drop' || form === 'solution') return 'Drop(s)';
  if (form === 'nasal spray') return 'Spray(s)';
  if (form === 'spray') return rt === 'nasal' ? 'Spray(s)' : 'Spray(s)';
  if (form === 'metered-dose inhaler') return 'Puff(s)';
  if (form === 'patch') return 'Patch(es)';
  if (form === 'suppository') return 'Suppository(ies)';
  if (form === 'lozenge') return 'Lozenge(s)';
  if (form === 'injection') return 'mL';
  return null;
}

function composeImportDirections(input: {
  dose: string | null;
  administrationUnit: string | null;
  route: string | null;
  frequency: string | null;
  duration: string | null;
  productForm: string | null;
}): string | null {
  if (!input.dose && !input.frequency) return null;
  const dose = (input.dose ?? '').trim();
  const freq = (input.frequency ?? '').replace(/\s*\([^)]*\)/g, '').trim().toLowerCase();
  const duration = (input.duration ?? '').trim();
  const durationPhrase = duration
    ? /^\d/.test(duration)
      ? `for ${duration}`
      : duration
    : '';

  // Clinical instruction already written as prose
  if (dose && /[a-zA-Z]/.test(dose) && !/^\d/.test(dose)) {
    const parts = [dose.replace(/\.$/, '')];
    if (freq && !dose.toLowerCase().includes(freq.split(' ')[0] ?? '')) parts.push(freq);
    if (durationPhrase) parts.push(durationPhrase);
    const sentence = parts.filter(Boolean).join(' ');
    return sentence.endsWith('.') ? sentence : `${sentence}.`;
  }

  const form = (input.productForm ?? '').toLowerCase();
  const verb =
    form.includes('cream') ||
    form.includes('ointment') ||
    form.includes('gel') ||
    form.includes('foam') ||
    form.includes('patch')
      ? 'Apply'
      : form.includes('drop') || form.includes('solution')
        ? 'Instill'
        : form.includes('spray')
          ? 'Spray'
          : form.includes('inhaler')
            ? 'Inhale'
            : form.includes('suppositor')
              ? 'Insert'
              : form.includes('injection')
                ? 'Inject'
                : 'Take';

  const parts = [
    verb,
    dose,
    input.administrationUnit?.toLowerCase(),
    input.route ? input.route.toLowerCase() : null,
    freq || null,
    durationPhrase || null,
  ].filter(Boolean);
  if (!parts.length) return null;
  const sentence = parts.join(' ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + (sentence.endsWith('.') ? '' : '.');
}

function parseDurationParts(raw: string | null): {
  durationValue: string;
  durationUnit: string;
} {
  const value = (raw ?? '').trim();
  if (!value) return { durationValue: '', durationUnit: '' };
  const match = /^(\d+(?:\.\d+)?)\s*(day|days|week|weeks|month|months)\b/i.exec(value);
  if (match) {
    const n = match[1];
    const unit = match[2].toLowerCase();
    if (unit.startsWith('week')) return { durationValue: n, durationUnit: 'Weeks' };
    if (unit.startsWith('month')) return { durationValue: n, durationUnit: 'Months' };
    return { durationValue: n, durationUnit: 'Days' };
  }
  return { durationValue: value, durationUnit: 'Days' };
}

export type ParsedChatGptTreatment = {
  medicationName: string;
  genericName: string | null;
  brandName: string | null;
  category: ReturnType<typeof normalizeTreatmentCategory>;
  recommendationLevel: ReturnType<typeof normalizeRecommendationLevel>;
  strength: string | null;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  duration: string | null;
  quantity: string | null;
  directions: string | null;
  clinicalIndication: string | null;
  clinicalNotes: string | null;
  eligibility: string | null;
  ageRestriction: string | null;
  provinceAvailability: string;
  guidelineReference: string | null;
  evidenceStrength: string | null;
  pregnancyNotes: string | null;
  pregnancyReason: string | null;
  breastfeedingNotes: string | null;
  renalAdjustment: string | null;
  renalAdjustmentReason: string | null;
  renalSourceBasis: string | null;
  renalDosingBasis: string | null;
  renalDosingRules: RenalDosingRule[];
  hepaticAdjustment: string | null;
  hepaticAdjustmentReason: string | null;
  monitoring: string | null;
  monitoringReason: string | null;
  counsellingNotes: string | null;
  followUpAdvice: string | null;
  warnings: string[];
  interactions: string[];
  metadata: {
    editorVersion: number;
    productUseMappingVersion: number;
    source: 'chatgpt-import';
    productForm: string | null;
    lactationReason: string | null;
    population: 'ADULT';
    matchStatus: 'UNMATCHED';
    renalDosingRulesParseError: string | null;
    renalEgfrMappingStatus?: string | null;
    renalMappingReviewRequired?: boolean;
    regimens: Array<{
      id: string;
      label: string;
      dose: string;
      administrationUnit: string;
      unit: string;
      productForm: string;
      frequency: string;
      route: string;
      durationValue: string;
      durationUnit: string;
      duration: string;
    }>;
  };
};

/** Stop treatment blocks before Section Evidence / Reference Library headings. */
export function isolateTreatmentsMarkdown(text: string): string {
  const cleaned = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const cut = cleaned.search(/^##\s*(?:Section\s+Evidence|Reference\s+Library)\b/im);
  return cut >= 0 ? cleaned.slice(0, cut).trimEnd() : cleaned;
}

export function parseTreatmentsScript(text: string): ParsedChatGptTreatment[] {
  const blocks = splitBlocks(isolateTreatmentsMarkdown(text), /##\s*Treatment\b/i);
  return blocks
    .map((block): ParsedChatGptTreatment | null => {
      const medicationName =
        fieldAny(block, ['Medication', 'Name', 'Drug', 'Treatment name']) || '';
      if (!medicationName || medicationName.length < 2) return null;

      const warningsRaw = fieldAny(block, ['Warnings', 'Warning']);
      const contraindications = fieldAny(block, [
        'Contraindications',
        'Contraindication',
        'Cautions',
      ]);
      const interactionsRaw = fieldAny(block, ['Interactions', 'Interaction']);
      const pregnancyFlag = fieldAny(block, [
        'Pregnancy',
        'Pregnancy / lactation',
        'Pregnancy flag',
      ]);
      const breastfeedingFlag = fieldAny(block, [
        'Breastfeeding',
        'Lactation',
        'Breastfeeding flag',
      ]);
      const renalFlag = fieldAny(block, ['Renal adjustment', 'Renal flag']);
      const hepaticFlag = fieldAny(block, ['Hepatic adjustment', 'Hepatic flag']);
      const monitoringFlag = fieldAny(block, ['Monitoring', 'Monitoring flag']);

      const dose = nullIfBlank(fieldAny(block, ['Dose', 'Dosing']));
      const route = normalizeTreatmentRoute(
        fieldAny(block, ['Route', 'Administration route']),
      );
      const frequency = nullIfBlank(fieldAny(block, ['Frequency', 'Freq']));
      const durationValueRaw = nullIfBlank(fieldAny(block, ['Duration', 'Course']));
      const durationUnitRaw = nullIfBlank(fieldAny(block, ['Duration unit']));
      const duration =
        durationValueRaw &&
        durationUnitRaw &&
        /^\d+(\.\d+)?$/.test(durationValueRaw.trim())
          ? `${durationValueRaw.trim()} ${durationUnitRaw.trim()}`
          : durationValueRaw;
      const productForm = inferTreatmentProductForm(
        fieldAny(block, ['Product form', 'Dosage form', 'Form', 'Formulation']),
        dose,
        route,
        medicationName,
      );
      const administrationUnit =
        nullIfBlank(
          fieldAny(block, [
            'Administration unit',
            'Admin unit',
            'Unit',
            'Dose unit',
          ]),
        ) || preferredAdministrationUnitFor(productForm, route);

      const directionsExplicit = nullIfBlank(
        fieldAny(block, ['Directions', 'SIG', 'Patient directions', 'Instructions']),
      );
      const directions =
        directionsExplicit ||
        composeImportDirections({
          dose,
          administrationUnit,
          route,
          frequency,
          duration,
          productForm,
        });

      const warningList = [
        ...normalizeStringArray(contraindications ? [contraindications] : []),
        ...normalizeStringArray(warningsRaw ? warningsRaw.split(/[,;]/) : []),
      ];
      // Dedupe case-insensitively while preserving first casing
      const seenWarnings = new Set<string>();
      const warnings = warningList.filter((w) => {
        const key = w.toLowerCase();
        if (seenWarnings.has(key)) return false;
        seenWarnings.add(key);
        return true;
      });

      const durationParts = parseDurationParts(duration);
      const renalExtract = extractRenalDosingFromMarkdown(block);
      const lactationReason = nullIfBlank(
        fieldAny(block, [
          'Breastfeeding reason',
          'Lactation reason',
          'Breastfeeding warning reason',
        ]),
      );

      return {
        medicationName,
        genericName: nullIfBlank(fieldAny(block, ['Generic', 'Generic name', 'Ingredient'])),
        brandName: nullIfBlank(fieldAny(block, ['Brand', 'Brand name', 'Trade name'])),
        category: normalizeTreatmentCategory(
          fieldAny(block, ['Category', 'Type']) || 'PRESCRIPTION',
        ),
        recommendationLevel: normalizeRecommendationLevel(
          fieldAny(block, ['Recommendation', 'Line', 'Recommendation level']) ||
            'FIRST_LINE',
        ),
        strength: nullIfBlank(fieldAny(block, ['Strength', 'Concentration'])),
        dose,
        route,
        frequency,
        duration,
        quantity: nullIfBlank(fieldAny(block, ['Quantity', 'Qty', 'Dispense'])),
        directions,
        clinicalIndication: nullIfBlank(
          fieldAny(block, ['Clinical indication', 'Indication', 'When to use']),
        ),
        clinicalNotes: nullIfBlank(
          fieldAny(block, [
            'Why this option?',
            'Why this option',
            'Clinical rationale',
            'Clinical notes',
            'Notes',
          ]),
        ),
        eligibility: nullIfBlank(fieldAny(block, ['Eligibility', 'Eligible patients'])),
        ageRestriction: nullIfBlank(fieldAny(block, ['Age restriction', 'Age', 'Age limit'])),
        provinceAvailability:
          nullIfBlank(fieldAny(block, ['Province availability', 'Provinces', 'Province'])) ||
          'ALL',
        guidelineReference: nullIfBlank(
          fieldAny(block, ['Guideline reference', 'Guideline', 'Reference']),
        ),
        evidenceStrength: nullIfBlank(
          fieldAny(block, ['Evidence strength', 'Evidence']),
        ),
        pregnancyNotes: normalizeClinicalYesNo(pregnancyFlag) || null,
        pregnancyReason: nullIfBlank(
          fieldAny(block, ['Pregnancy reason', 'Pregnancy warning reason']),
        ),
        breastfeedingNotes: normalizeClinicalYesNo(breastfeedingFlag) || null,
        renalAdjustment: normalizeClinicalYesNo(renalFlag) || renalExtract.renalAdjustment || null,
        renalAdjustmentReason: renalExtract.renalAdjustmentReason || null,
        renalSourceBasis: renalExtract.renalSourceBasis,
        renalDosingBasis: renalExtract.renalDosingBasis,
        renalDosingRules: renalExtract.renalDosingRules,
        hepaticAdjustment: normalizeClinicalYesNo(hepaticFlag) || null,
        hepaticAdjustmentReason: nullIfBlank(
          fieldAny(block, ['Hepatic reason', 'Hepatic adjustment reason']),
        ),
        monitoring: normalizeClinicalYesNo(monitoringFlag) || null,
        monitoringReason: nullIfBlank(
          fieldAny(block, ['Monitoring reason', 'Monitoring warning reason']),
        ),
        counsellingNotes: nullIfBlank(
          fieldAny(block, ['Counselling notes', 'Counselling', 'Counseling notes']),
        ),
        followUpAdvice: nullIfBlank(
          fieldAny(block, ['Follow-up advice', 'Follow up advice', 'Follow-up']),
        ),
        warnings,
        interactions: normalizeStringArray(
          interactionsRaw ? interactionsRaw.split(/[,;]/) : [],
        ),
        metadata: {
          editorVersion: 2,
          productUseMappingVersion: 1,
          source: 'chatgpt-import',
          productForm,
          lactationReason:
            normalizeClinicalYesNo(breastfeedingFlag) === 'Yes' ? lactationReason : null,
          population: 'ADULT',
          matchStatus: 'UNMATCHED',
          renalDosingRulesParseError: renalExtract.parseError,
          regimens: [
            {
              id: randomUUID(),
              label: 'Standard',
              dose: dose ?? '',
              administrationUnit: administrationUnit ?? '',
              unit: administrationUnit ?? '',
              productForm: productForm ?? '',
              frequency: frequency ?? '',
              route: route ?? '',
              durationValue: durationParts.durationValue,
              durationUnit: durationParts.durationUnit,
              duration: duration ?? '',
            },
          ],
        },
      };
    })
    .filter((t): t is ParsedChatGptTreatment => Boolean(t));
}

function bullets(sectionBody: string): Array<{ point: string; detail?: string }> {
  const items: Array<{ point: string; detail?: string }> = [];
  for (const line of sectionBody.split(/\r?\n/)) {
    const m = line.trim().match(/^[-*•]\s+(.+)$/);
    if (!m) continue;
    const raw = m[1].trim();
    const [point, ...rest] = raw.split(/\s+[—–-]\s+/);
    items.push({
      point: point.trim(),
      detail: rest.join(' — ').trim() || undefined,
    });
  }
  return items;
}

export function parseOverviewScript(text: string) {
  const description =
    text.match(/##\s*Description\s*\n([\s\S]*?)(?=\n##\s|\s*$)/i)?.[1]?.trim() || '';
  const notes = text.match(/##\s*Notes\s*\n([\s\S]*?)(?=\n##\s|\s*$)/i)?.[1]?.trim() || '';
  const ageBlock = text.match(/##\s*Age\s*range\s*\n([\s\S]*?)(?=\n##\s|\s*$)/i)?.[1] || '';
  const ageMinRaw = ageBlock.match(/Min\s*[:：]\s*(\d+)/i)?.[1];
  const ageMaxRaw = ageBlock.match(/Max\s*[:：]\s*(\d+)/i)?.[1];
  return {
    description: description || undefined,
    notes: notes || undefined,
    ageMin: ageMinRaw ? Number(ageMinRaw) : undefined,
    ageMax: ageMaxRaw ? Number(ageMaxRaw) : undefined,
  };
}

const CONCEPT_CATEGORIES = [
  'SYMPTOM',
  'RED_FLAG',
  'DIAGNOSIS',
  'TREATMENT',
  'DRUG',
  'COUNSELLING',
  'FOLLOW_UP',
  'LAB',
  'OTHER',
] as const;

function mapConceptCategory(
  raw: string,
): (typeof CONCEPT_CATEGORIES)[number] | 'TREATMENT' | 'OTHER' {
  const u = raw.toUpperCase().replace(/\s+/g, '_');
  if (u === 'DRUG') return 'TREATMENT';
  if ((CONCEPT_CATEGORIES as readonly string[]).includes(u)) return u as (typeof CONCEPT_CATEGORIES)[number];
  return 'OTHER';
}

export function parseConceptsScript(text: string) {
  const concepts: Array<{
    category: string;
    label: string;
    description?: string;
  }> = [];

  for (const cat of CONCEPT_CATEGORIES) {
    const re = new RegExp(`##\\s*${cat}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i');
    const body = text.match(re)?.[1] ?? '';
    for (const item of bullets(body)) {
      if (item.point.length < 2) continue;
      concepts.push({
        category: mapConceptCategory(cat),
        label: item.point,
        description: item.detail,
      });
    }
  }
  return concepts;
}

function normalizeImportedRedFlagAction(raw: string): string {
  const compact = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
  const aliases: Record<string, string> = {
    IMMEDIATE_REFERRAL: 'IMMEDIATE_REFERRAL',
    SAME_DAY_PHYSICIAN: 'SAME_DAY_PHYSICIAN',
    SAME_DAY: 'SAME_DAY_PHYSICIAN',
    EMERGENCY: 'EMERGENCY',
    PATHWAY_EXCLUDED: 'PATHWAY_EXCLUDED',
    EXCLUDED: 'PATHWAY_EXCLUDED',
    PHARMACIST_DISCRETION: 'PHARMACIST_DISCRETION',
  };
  return aliases[compact] ?? (compact || 'IMMEDIATE_REFERRAL');
}

function parseImportedRequired(raw: string): boolean {
  if (!raw.trim()) return true;
  return !/^(no|false|optional|0)$/i.test(raw.trim());
}

export function parseRedFlagsScript(text: string) {
  const blocks = splitBlocks(text, /##\s*Red\s*Flag\b/i);
  const flags = blocks
    .map((block) => {
      const title = field(block, 'Title') || block.split('\n')[0]?.replace(/^[-*•]\s*/, '').trim();
      if (!title || title.length < 2) return null;
      const severityRaw = field(block, 'Severity').toUpperCase();
      const severity =
        severityRaw === 'EMERGENCY' || severityRaw === 'WARNING' || severityRaw === 'CRITICAL'
          ? severityRaw
          : 'CRITICAL';
      const question = field(block, 'Question') || field(block, 'Description') || null;
      const description = field(block, 'Description') || question;
      return {
        id: randomUUID(),
        title,
        severity,
        question,
        description: description || null,
        whyItMatters: field(block, 'Why it matters') || field(block, 'Why this matters') || null,
        actionNote: field(block, 'Action note') || null,
        action: normalizeImportedRedFlagAction(field(block, 'Action') || field(block, 'Recommended action')),
        required: parseImportedRequired(field(block, 'Required')),
        approved: false,
        source: 'USER' as const,
        evidenceRefIds: [] as string[],
      };
    })
    .filter(Boolean);
  return flags as Array<{
    id: string;
    title: string;
    severity: string;
    question: string | null;
    description: string | null;
    whyItMatters: string | null;
    actionNote: string | null;
    action: string;
    required: boolean;
    approved: boolean;
    source: 'USER';
    evidenceRefIds: string[];
  }>;
}

export function parseDifferentialsScript(text: string) {
  const blocks = splitBlocks(text, /##\s*Differential\b/i);
  return blocks
    .map((block) => {
      const condition =
        field(block, 'Condition') || block.split('\n')[0]?.replace(/^[-*•]\s*/, '').trim();
      if (!condition || condition.length < 2) return null;
      const likelihoodRaw = field(block, 'Likelihood').toUpperCase().replace(/\s+/g, '_');
      const likelihood =
        likelihoodRaw === 'COMMON' ||
        likelihoodRaw === 'LESS_COMMON' ||
        likelihoodRaw === 'RARE'
          ? likelihoodRaw
          : undefined;
      return {
        id: randomUUID(),
        condition,
        question: field(block, 'Question') || null,
        whyItMatters: field(block, 'Why it matters') || null,
        suggestedPathway: field(block, 'Suggested pathway') || null,
        keySymptoms: field(block, 'Key symptoms') || null,
        distinguishingFeatures: field(block, 'Distinguishing features') || null,
        recommendedAction: field(block, 'Recommended action') || null,
        likelihood: likelihood ?? null,
        required: true,
        approved: false,
        source: 'USER' as const,
        evidenceRefIds: [],
      };
    })
    .filter(Boolean) as Array<Record<string, unknown>>;
}

export function parseRulesScript(text: string) {
  const blocks = splitBlocks(text, /##\s*Rule\b/i);
  return blocks
    .map((block) => {
      const condition = field(block, 'Condition');
      const message = field(block, 'Message');
      if (!condition || !message) return null;
      return {
        condition,
        operator: normalizeRuleOperator(field(block, 'Operator') || 'equals'),
        value: field(block, 'Value') || 'true',
        action: normalizeRuleAction(field(block, 'Action') || 'SHOW_WARNING'),
        severity: normalizeRuleSeverity(field(block, 'Severity') || 'WARNING'),
        message,
        details: field(block, 'Details') || null,
      };
    })
    .filter(Boolean) as Array<{
    condition: string;
    operator: string;
    value: string;
    action: ReturnType<typeof normalizeRuleAction>;
    severity: ReturnType<typeof normalizeRuleSeverity>;
    message: string;
    details: string | null;
  }>;
}

export function parseCounsellingScript(text: string) {
  const sections: Array<{
    heading: string;
    category: string;
    outputSection: 'what_to_expect' | 'self_care' | 'follow_up' | null;
  }> = [
    { heading: 'Education & what to expect', category: 'What to expect', outputSection: 'what_to_expect' },
    { heading: 'What to expect', category: 'What to expect', outputSection: 'what_to_expect' },
    { heading: 'Self-care & non-drug measures', category: 'Non-drug advice', outputSection: 'self_care' },
    { heading: 'Self-care', category: 'Non-drug advice', outputSection: 'self_care' },
    { heading: 'Follow-up & when to seek care', category: 'Follow-up', outputSection: 'follow_up' },
    { heading: 'Medication counselling', category: 'Medication counselling', outputSection: 'what_to_expect' },
    { heading: 'Non-drug advice', category: 'Non-drug advice', outputSection: 'self_care' },
    { heading: 'Prevention', category: 'Prevention', outputSection: 'self_care' },
    { heading: 'Follow-up', category: 'Follow-up', outputSection: 'follow_up' },
    { heading: 'When to seek urgent care', category: 'When to seek urgent care', outputSection: 'follow_up' },
  ];
  const items: Array<{
    category: string;
    point: string;
    detail?: string;
    outputSection: 'what_to_expect' | 'self_care' | 'follow_up' | null;
  }> = [];
  const seen = new Set<string>();
  for (const section of sections) {
    const re = new RegExp(
      `##\\s*${section.heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`,
      'i',
    );
    const body = text.match(re)?.[1] ?? '';
    for (const b of bullets(body)) {
      if (b.point.length < 2) continue;
      const key = b.point.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        category: section.category,
        point: b.point,
        detail: b.detail,
        outputSection: section.outputSection,
      });
    }
  }
  if (!items.length) {
    const headingRe = /##\s+([^\n]+)\n([\s\S]*?)(?=\n##\s|$)/gi;
    let m: RegExpExecArray | null;
    while ((m = headingRe.exec(text))) {
      const cat = m[1].trim();
      if (/handout/i.test(cat)) continue;
      for (const b of bullets(m[2])) {
        if (b.point.length < 2) continue;
        items.push({
          category: cat,
          point: b.point,
          detail: b.detail,
          outputSection: null,
        });
      }
    }
  }
  return items;
}

export function parseAssessmentQuestions(text: string): ExtractedQuestion[] {
  const parsed = parseQuestionScript(text);
  return (parsed?.questions ?? []).map((q) => ({
    ...q,
    section: normalizeSectionName(q.section),
    type: normalizeQuestionType(q.type),
  }));
}

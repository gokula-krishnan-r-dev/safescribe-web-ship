import type { Consultation, TreatmentRecommendation } from './types';
import {
  composeCounsellingSections,
  clampCounsellingSentences,
  compactCounsellingLine,
  buildHowToUseEntries,
  MAX_COUNSELLING_CARD_BULLETS,
  MAX_HOW_TO_USE_TREATMENTS,
  asMedicationUseBullet,
  isCounsellingUiPlaceholder,
  isMislabelledPregnancyAsAllergy,
  resolveGuidanceSection,
  resolveGuidancePriority,
  selectFollowupsForCounselling,
  selectPathwayGuidanceForCounselling,
  isUsablePatientGuidanceText,
  sanitizeMedicationUseBullets,
  toSelectedTreatmentPayload,
  type CounsellingCardKey,
  type GuidancePriority,
} from '@safescript/shared';

export type CounsellingPanelStatus =
  | 'NOT_READY'
  | 'LOCKED'
  | 'GENERATING'
  | 'READY'
  | 'PHARMACIST_MODIFIED'
  | 'OUTDATED'
  | 'GENERATION_FAILED'
  | 'REVIEWED'
  | 'SAFETY_BLOCKED';

/** SCREEN = concise review card; HANDOUT = detailed patient document only */
export type CounsellingItemVisibility = 'SCREEN' | 'HANDOUT';

export type CounsellingSectionKey =
  | 'MEDICATION_USE'
  | 'EXPECTED_RESPONSE'
  | 'SELF_CARE'
  | 'FOLLOW_UP';

export type CounsellingItemPriority = 'REQUIRED' | 'RECOMMENDED' | 'OPTIONAL';

export type CounsellingSourceType =
  | 'SELECTED_REGIMEN'
  | 'PATHWAY_COUNSELLING'
  | 'PATIENT_FACTOR'
  | 'CDS'
  | 'PHARMACIST_ADDED'
  | 'DETERMINISTIC_DEFAULT'
  | 'AI_GENERATED';

export interface CounsellingContextFactor {
  type: string;
  display_text: string;
  material_to_guidance: boolean;
}

export interface CounsellingGuidanceItem {
  item_id: string;
  text: string;
  priority: CounsellingItemPriority;
  source_type: CounsellingSourceType;
  source_id?: string;
  editable: boolean;
  removable: boolean;
  pharmacist_modified: boolean;
  pharmacist_added?: boolean;
  /** Defaults to SCREEN when omitted (legacy plans). */
  visibility?: CounsellingItemVisibility;
  document_targets: Array<'CLINICAL_NOTE' | 'PATIENT_HANDOUT' | 'PRESCRIBER_COMM'>;
  /** Pathway Patient Guidance headline — shown separately from detail. */
  headline?: string;
  /** Pathway Patient Guidance supporting detail. */
  detail?: string | null;
  guidancePriority?: GuidancePriority;
}

export interface CounsellingSection {
  section_key: CounsellingSectionKey;
  title: string;
  items: CounsellingGuidanceItem[];
}

export interface CounsellingPlan {
  consultation_id: string;
  source_revision: string;
  pathway_id?: string;
  status: CounsellingPanelStatus;
  context_factors: CounsellingContextFactor[];
  sections: CounsellingSection[];
  include_detailed_handout: boolean;
  reviewed_at?: string;
  generated_at: string;
  /** Original AI draft, kept separate from pharmacist edits. */
  ai_draft?: CounsellingSection[];
  /** Handout language preference only — never regenerates this panel. */
  handoutLanguage?: string;
  /** Legacy shape for documentation generators */
  keyMessages?: string[];
  /** Present when status === GENERATION_FAILED */
  failure_reason?: string;
}

const SECTION_META: Array<{
  key: CounsellingSectionKey;
  title: string;
}> = [
  { key: 'MEDICATION_USE', title: 'How to use the treatment' },
  { key: 'EXPECTED_RESPONSE', title: 'What to expect' },
  { key: 'SELF_CARE', title: 'Self-care and non-drug measures' },
  { key: 'FOLLOW_UP', title: 'Follow-up and when to seek care' },
];

/** Display titles aligned with the counselling review mock */
export const SECTION_DISPLAY_TITLE: Record<CounsellingSectionKey, string> = {
  MEDICATION_USE: 'How to use your medicine',
  EXPECTED_RESPONSE: 'What to expect',
  SELF_CARE: 'Self-care & non-drug measures',
  FOLLOW_UP: 'Follow-up & when to seek care',
};

export const SECTION_CARD_NUMBER: Record<CounsellingSectionKey, number> = {
  MEDICATION_USE: 1,
  EXPECTED_RESPONSE: 2,
  SELF_CARE: 3,
  FOLLOW_UP: 4,
};

export const SECTION_FOOTER_HINT: Record<CounsellingSectionKey, string> = {
  MEDICATION_USE: 'Patient-friendly directions from the confirmed prescription',
  EXPECTED_RESPONSE: 'From Patient Guidance on this pathway',
  SELF_CARE: 'From Patient Guidance on this pathway',
  FOLLOW_UP: 'From Patient Guidance on this pathway',
};

/** Cards 2–4 show the full approved pathway list; card 1 is one line per selected treatment. */
export const PATHWAY_GUIDANCE_DISPLAY_MAX = 16;

export const PATHWAY_CARD_KEYS: CounsellingSectionKey[] = [
  'EXPECTED_RESPONSE',
  'SELF_CARE',
  'FOLLOW_UP',
];

export function sectionBulletLimit(key: CounsellingSectionKey): number {
  return MAX_COUNSELLING_CARD_BULLETS[key as CounsellingCardKey];
}

/** Pharmacist can keep every approved pathway item visible on cards 2–4. */
export function sectionItemCap(key: CounsellingSectionKey): number {
  return key === 'MEDICATION_USE'
    ? MAX_HOW_TO_USE_TREATMENTS
    : PATHWAY_GUIDANCE_DISPLAY_MAX;
}

export { HANDOUT_LANGUAGE_OPTIONS } from './documents/handout-format';

type PathwayCounsellingRow = {
  id?: string;
  category?: string;
  point?: string;
  detail?: string | null;
  outputSection?: string | null;
  archivedAt?: string | Date | null;
  approved?: boolean;
  displayOrder?: number;
  priority?: string | null;
  descriptor?: string | null;
};

function uid(prefix: string, seed: string): string {
  return `${prefix}-${seed}`.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 48);
}

function displayMedName(t: TreatmentRecommendation): string {
  return (
    t.displayName ||
    t.genericName ||
    t.medicationName ||
    'the medicine'
  ).trim();
}

/** True when a selected treatment still conflicts with a recorded allergy. */
export function hasUnresolvedTreatmentAllergyConflict(
  selected: TreatmentRecommendation[],
): boolean {
  return selected.some(
    (t) =>
      Boolean(t.allergyBlocked) &&
      !isMislabelledPregnancyAsAllergy(t.allergyWarning?.reason) &&
      !(t.clinicalOverride?.acknowledgedRisk && t.clinicalOverride.reason?.trim()),
  );
}

/** Reject raw assessment questions — counselling must be patient instructions. */
export function isClinicalAssessmentQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/\?\s*$/.test(t)) return true;
  if (
    /^(does|do|is|are|has|have|was|were|can|could|should|would|did|will)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Normalize dose/unit variants so "2 g" and "2,000 mg" collide for dedupe.
 */
export function normalizeCounsellingText(text: string): string {
  let t = text.toLowerCase().replace(/\s+/g, ' ').trim();
  t = t.replace(/(\d),(\d{3})/g, '$1$2');
  t = t.replace(
    /(\d+(?:\.\d+)?)\s*g\b/g,
    (_, n: string) => `${Math.round(parseFloat(n) * 1000)} mg`,
  );
  t = t.replace(/(\d+)\s*mg\b/g, '$1mg');
  t = t.replace(/[.,;:]+$/g, '');
  return t;
}

function isShortCourseDuration(duration?: string): boolean {
  if (!duration?.trim()) return false;
  const d = duration.trim().toLowerCase();
  if (/^(1|one)(\s|-)?(day|d)\b/.test(d)) return true;
  if (/^1$/.test(d)) return true;
  if (/single\s*dose|one[\s-]time|stat\b/.test(d)) return true;
  return false;
}

function looksLikeAdverseEffect(text: string): boolean {
  return /side effect|adverse|nausea|upset|loose stool|diarrh|dizz|rash|headache|vomit/i.test(
    text,
  );
}

function looksLikeStorageAdvice(text: string): boolean {
  return /store (medicines?|medication)|out of reach of children|keep .*labelled/i.test(
    text,
  );
}

function isPediatric(age?: string, ageUnit?: string): boolean {
  if (!age?.trim()) return false;
  const n = Number(age);
  if (!Number.isFinite(n)) return false;
  if (ageUnit === 'months') return true;
  return n < 18;
}

function formatAgeChip(age?: string, ageUnit?: string): string | null {
  if (!age?.trim()) return null;
  const unit = ageUnit === 'months' ? 'months' : Number(age) === 1 ? 'year' : 'years';
  return `${age.trim()} ${unit}`;
}

function extractAllergies(consultation: Consultation): string[] {
  const raw = consultation.demographics?.allergies?.trim();
  if (!raw || /^nkda|none|n\/a|no known/i.test(raw)) return [];
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 60)
    .slice(0, 3);
}

function extractConditions(consultation: Consultation): string[] {
  if (consultation.demographics?.noKnownConditions) return [];
  const raw = consultation.demographics?.medicalConditions?.trim();
  if (!raw) return [];
  const material = raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 40);
  // Prefer conditions that often change counselling
  const priority = material.filter((c) =>
    /asthma|diabetes|renal|kidney|hepatic|liver|pregnancy|heart|copd|immunocompromis/i.test(
      c,
    ),
  );
  return (priority.length ? priority : material).slice(0, 2);
}

/**
 * Compact fingerprint of inputs that must invalidate the counselling plan.
 */
export function buildCounsellingSourceRevision(
  consultation: Consultation,
  selected: TreatmentRecommendation[],
): string {
  const demo = consultation.demographics;
  const parts = [
    consultation.id,
    consultation.selectedPathwayId ?? '',
    demo?.age ?? '',
    demo?.ageUnit ?? '',
    demo?.pregnancyStatus ?? '',
    demo?.breastfeedingStatus ?? '',
    demo?.allergies ?? '',
    demo?.weight ?? '',
    demo?.medicalConditions ?? '',
    demo?.currentMedications ?? '',
    ...selected.map(
      (t) =>
        `${t.pathwayTreatmentId ?? t.medicationName}|${t.dose ?? ''}|${t.frequency ?? ''}|${t.duration ?? ''}|${t.route ?? ''}|${t.category ?? ''}|${compactCounsellingLine(t.patientDirections ?? t.instructions ?? '')}`,
    ),
  ];
  // Simple stable hash — not cryptographic
  let h = 0;
  const s = parts.join('||');
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return `rev-${h.toString(16)}`;
}

export function buildContextFactors(
  consultation: Consultation,
  selected: TreatmentRecommendation[],
): CounsellingContextFactor[] {
  // Preferred mock order: age → pathway → allergy/safety → selected treatment
  const factors: CounsellingContextFactor[] = [];

  const age = formatAgeChip(
    consultation.demographics?.age,
    consultation.demographics?.ageUnit,
  );
  if (age) {
    factors.push({
      type: 'AGE',
      display_text: age,
      material_to_guidance: true,
    });
  }

  const pathwayLabel =
    consultation.pathway?.condition?.trim() ||
    consultation.pathway?.name?.trim() ||
    null;
  if (pathwayLabel) {
    factors.push({
      type: 'PATHWAY',
      display_text: pathwayLabel,
      material_to_guidance: true,
    });
  }

  for (const allergy of extractAllergies(consultation).slice(0, 1)) {
    factors.push({
      type: 'ALLERGY',
      display_text: /allerg/i.test(allergy) ? allergy : `${allergy} allergy`,
      material_to_guidance: true,
    });
  }

  // Surface selected-treatment allergy conflicts in the context strip too
  const blocked = selected.find((t) => t.allergyBlocked && t.allergyWarning);
  if (
    blocked?.allergyWarning?.patientAllergy &&
    !factors.some((f) => f.type === 'ALLERGY')
  ) {
    const allergy = blocked.allergyWarning.patientAllergy.trim();
    factors.push({
      type: 'ALLERGY',
      display_text: /allerg/i.test(allergy) ? allergy : `${allergy} allergy`,
      material_to_guidance: true,
    });
  }

  const primary = selected[0];
  if (primary) {
    factors.push({
      type: 'SELECTED_TREATMENT',
      display_text: displayMedName(primary),
      material_to_guidance: true,
    });
  }

  return factors.slice(0, 4);
}

function mapPathwayCategory(category: string): CounsellingSectionKey | null {
  const c = category.toLowerCase();
  if (/medication|dose|administration|how to use|directions|adherence/i.test(c)) {
    return 'MEDICATION_USE';
  }
  if (/expect|response|side effect|outcome|prognosis/i.test(c)) {
    return 'EXPECTED_RESPONSE';
  }
  if (/self.?care|home|lifestyle|non.?drug|non.?pharmac|supportive/i.test(c)) {
    return 'SELF_CARE';
  }
  if (/follow|seek|warning|escalat|return|monitor/i.test(c)) {
    return 'FOLLOW_UP';
  }
  return null;
}

function mapPathwayRowSection(row: PathwayCounsellingRow): CounsellingSectionKey | null {
  if (row.outputSection === 'what_to_expect') return 'EXPECTED_RESPONSE';
  if (row.outputSection === 'self_care') return 'SELF_CARE';
  if (row.outputSection === 'follow_up') return 'FOLLOW_UP';
  if (row.outputSection) {
    const mapped = resolveGuidanceSection(row.outputSection, row.category);
    if (mapped === 'what_to_expect') return 'EXPECTED_RESPONSE';
    if (mapped === 'self_care') return 'SELF_CARE';
    if (mapped === 'follow_up') return 'FOLLOW_UP';
  }
  return mapPathwayCategory(row.category ?? '');
}

function guidanceItemText(point: string, detail?: string | null): string {
  const headline = point.trim();
  const extra = (detail ?? '').trim();
  if (!headline) return extra;
  if (!extra) return /[.!?]$/.test(headline) ? headline : `${headline}.`;
  if (normalizeCounsellingText(headline) === normalizeCounsellingText(extra)) {
    return /[.!?]$/.test(headline) ? headline : `${headline}.`;
  }
  if (extra.toLowerCase().startsWith(headline.toLowerCase())) {
    return /[.!?]$/.test(extra) ? extra : `${extra}.`;
  }
  const joined = `${headline.replace(/[.!?]$/, '')}. ${extra}`;
  return /[.!?]$/.test(joined) ? joined : `${joined}.`;
}

export function parsePathwayCounsellingRows(raw: unknown): PathwayCounsellingRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: PathwayCounsellingRow[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const r = entry as Record<string, unknown>;
    if (r.archivedAt) continue;
    const point = String(r.point ?? '').trim();
    const detailRaw = r.detail == null ? '' : String(r.detail).trim();
    if (!point && !detailRaw) continue;
    rows.push({
      id: typeof r.id === 'string' ? r.id : undefined,
      category: String(r.category ?? ''),
      point,
      detail: detailRaw || null,
      outputSection: typeof r.outputSection === 'string' ? r.outputSection : null,
      archivedAt: (r.archivedAt as string | Date | null | undefined) ?? null,
      approved: r.approved === true,
      displayOrder:
        typeof r.displayOrder === 'number'
          ? r.displayOrder
          : Number.parseInt(String(r.displayOrder ?? '0'), 10) || 0,
      priority: typeof r.priority === 'string' ? r.priority : null,
      descriptor: typeof r.descriptor === 'string' ? r.descriptor : null,
    });
  }
  return rows.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
}

function toPathwayGuidanceItem(
  row: PathwayCounsellingRow,
  index: number,
  sectionKey: CounsellingSectionKey,
): CounsellingGuidanceItem | null {
  const headline = (row.point ?? '').trim();
  const detail = (row.detail ?? '').trim() || null;
  const text = guidanceItemText(headline, detail);
  if (!text || !isUsablePatientGuidanceText(text)) return null;
  const prefix =
    sectionKey === 'EXPECTED_RESPONSE' ? 'EXP' : sectionKey === 'SELF_CARE' ? 'SC' : 'FU';
  return {
    item_id: uid(prefix, row.id ?? `p-${index}`),
    text,
    headline: headline || text,
    detail,
    guidancePriority: resolveGuidancePriority(row.priority),
    priority: sectionKey === 'FOLLOW_UP' ? 'REQUIRED' : 'RECOMMENDED',
    source_type: 'PATHWAY_COUNSELLING',
    source_id: row.id,
    editable: true,
    removable: true,
    pharmacist_modified: false,
    visibility: 'SCREEN',
    document_targets:
      sectionKey === 'FOLLOW_UP'
        ? ['CLINICAL_NOTE', 'PATIENT_HANDOUT', 'PRESCRIBER_COMM']
        : ['CLINICAL_NOTE', 'PATIENT_HANDOUT'],
  };
}

/**
 * Patient Guidance rows grouped into counselling cards 2–4.
 * Approved items win per section; authored drafts fill a section when nothing
 * is approved yet. Does not invent copy.
 */
export function approvedPathwayGuidanceBySection(
  consultation: Consultation,
): Record<CounsellingSectionKey, CounsellingGuidanceItem[]> {
  const empty: Record<CounsellingSectionKey, CounsellingGuidanceItem[]> = {
    MEDICATION_USE: [],
    EXPECTED_RESPONSE: [],
    SELF_CARE: [],
    FOLLOW_UP: [],
  };

  const rows = selectPathwayGuidanceForCounselling(
    parsePathwayCounsellingRows(consultation.pathway?.counsellings),
  );

  for (const [index, row] of rows.entries()) {
    const section = mapPathwayRowSection(row);
    if (!section || section === 'MEDICATION_USE') continue;
    const item = toPathwayGuidanceItem(row, index, section);
    if (!item) continue;
    empty[section].push(item);
  }

  if (!empty.FOLLOW_UP.length) {
    const followups = selectFollowupsForCounselling(
      consultation.pathway?.followups ?? [],
    );
    empty.FOLLOW_UP = followups
      .map((f, i) =>
        toPathwayGuidanceItem(
          {
            id: `fu-${i}`,
            category: 'Follow-up',
            outputSection: 'follow_up',
            point: [f.action, f.condition, f.timeframe].filter(Boolean).join(' — '),
            detail: null,
            approved: f.approved === true,
            displayOrder: i,
          },
          i,
          'FOLLOW_UP',
        ),
      )
      .filter((item): item is CounsellingGuidanceItem => Boolean(item));
  }

  for (const key of PATHWAY_CARD_KEYS) {
    empty[key] = empty[key].slice(0, PATHWAY_GUIDANCE_DISPLAY_MAX);
  }
  return empty;
}

function mergePathwayItemsWithPharmacist(
  pathwayItems: CounsellingGuidanceItem[],
  current: CounsellingGuidanceItem[],
): CounsellingGuidanceItem[] {
  const edited = new Map(
    current
      .filter((item) => item.pharmacist_modified && !item.pharmacist_added)
      .map((item) => [item.source_id || item.item_id, item]),
  );
  const merged = pathwayItems.map((item) => {
    const prior = edited.get(item.source_id || item.item_id);
    if (!prior) return item;
    return {
      ...item,
      text: prior.text,
      headline: prior.headline || item.headline,
      detail: prior.detail ?? item.detail,
      pharmacist_modified: true,
    };
  });
  const added = current.filter((item) => item.pharmacist_added);
  return [...merged, ...added].slice(0, PATHWAY_GUIDANCE_DISPLAY_MAX);
}

/** Prefer the full pathway Patient Guidance list on cards 2–4 over AI/composed filler. */
export function overlayApprovedPathwayGuidance(
  plan: CounsellingPlan,
  consultation: Consultation,
): CounsellingPlan {
  const grouped = approvedPathwayGuidanceBySection(consultation);
  let changed = false;
  const sections = plan.sections.map((section) => {
    if (!PATHWAY_CARD_KEYS.includes(section.section_key)) return section;
    const pathwayItems = grouped[section.section_key];
    if (!pathwayItems.length) return section;
    const visible = screenItems(section.items);
    const usableVisible = visible.filter((item) =>
      isUsablePatientGuidanceText(item.text),
    );
    const hasPathwaySource = section.items.some(
      (item) => item.source_type === 'PATHWAY_COUNSELLING',
    );
    if (hasPathwaySource && usableVisible.length) return section;
    const pharmacistTouched = section.items.some(
      (item) => item.pharmacist_modified || item.pharmacist_added,
    );
    if (visible.length && pharmacistTouched && !hasPathwaySource) {
      changed = true;
      return {
        ...section,
        title: SECTION_DISPLAY_TITLE[section.section_key],
        items: mergePathwayItemsWithPharmacist(pathwayItems, section.items),
      };
    }
    changed = true;
    return {
      ...section,
      title: SECTION_DISPLAY_TITLE[section.section_key],
      items: mergePathwayItemsWithPharmacist(pathwayItems, section.items),
    };
  });
  return changed ? { ...plan, sections } : plan;
}

function treatmentsForHowToUse(selected: TreatmentRecommendation[]) {
  return selected.map((t) => ({
    id: t.pathwayTreatmentId ?? t.medicationName,
    displayName: displayMedName(t),
    category: t.category,
    dose: t.dose,
    route: t.route,
    frequency: t.frequency,
    duration: t.duration,
    instructions: t.instructions ?? t.counsellingNotes,
    patientDirections: t.patientDirections ?? t.instructions,
  }));
}

function howToUseItemsFromTreatments(
  consultation: Consultation,
  selected: TreatmentRecommendation[],
  previous?: CounsellingPlan | null,
): CounsellingGuidanceItem[] {
  const pediatric = isPediatric(
    consultation.demographics?.age,
    consultation.demographics?.ageUnit,
  );
  const entries = buildHowToUseEntries({
    conditionName: '',
    pediatric,
    treatments: treatmentsForHowToUse(selected),
    pathwayRows: [],
  });
  const prevSection = previous?.sections.find(
    (s) => s.section_key === 'MEDICATION_USE',
  );
  const edited = new Map(
    (prevSection?.items ?? [])
      .filter((item) => item.pharmacist_modified && !item.pharmacist_added)
      .map((item) => [item.source_id || item.item_id, item]),
  );
  const items = entries.map((entry) => {
    const prior = edited.get(entry.treatmentId);
    return {
      item_id: uid('REG', `${entry.treatmentId}-use`),
      text: compactCounsellingLine(prior?.text ?? entry.line),
      headline: entry.displayName,
      detail: compactCounsellingLine(prior?.detail ?? entry.directions),
      priority: 'REQUIRED' as const,
      source_type: 'SELECTED_REGIMEN' as const,
      source_id: entry.treatmentId,
      editable: true,
      removable: false,
      pharmacist_modified: Boolean(prior?.pharmacist_modified),
      visibility: 'SCREEN' as const,
      document_targets: [
        'CLINICAL_NOTE',
        'PATIENT_HANDOUT',
      ] as CounsellingGuidanceItem['document_targets'],
    };
  });
  const added = (prevSection?.items ?? [])
    .filter((item) => item.pharmacist_added)
    .map((item) => ({
      ...item,
      text: compactCounsellingLine(item.text),
      detail: item.detail ? compactCounsellingLine(item.detail) : item.detail,
      visibility: 'SCREEN' as const,
    }));
  return [...items, ...added].slice(0, MAX_HOW_TO_USE_TREATMENTS);
}

/** Replace card 1 with one compact line per selected treatment (no 3-bullet AI cap). */
export function overlayHowToUseFromTreatments(
  plan: CounsellingPlan,
  consultation: Consultation,
  selected: TreatmentRecommendation[],
): CounsellingPlan {
  if (
    plan.status === 'SAFETY_BLOCKED' ||
    plan.status === 'LOCKED' ||
    plan.status === 'NOT_READY'
  ) {
    return plan;
  }
  const items = howToUseItemsFromTreatments(consultation, selected, plan);
  const sections = plan.sections.map((section) => {
    if (section.section_key !== 'MEDICATION_USE') return section;
    return {
      ...section,
      title: SECTION_DISPLAY_TITLE.MEDICATION_USE,
      items,
    };
  });
  if (!sections.some((s) => s.section_key === 'MEDICATION_USE')) {
    sections.unshift({
      section_key: 'MEDICATION_USE',
      title: SECTION_DISPLAY_TITLE.MEDICATION_USE,
      items,
    });
  }
  return { ...plan, sections };
}

function dedupeItems(
  items: CounsellingGuidanceItem[],
  max = 6,
): CounsellingGuidanceItem[] {
  const seen = new Set<string>();
  const out: CounsellingGuidanceItem[] = [];
  for (const item of items) {
    const raw = item.text.trim();
    if (!raw || isClinicalAssessmentQuestion(raw)) continue;
    const key = normalizeCounsellingText(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      ...item,
      text: raw,
      visibility: item.visibility ?? 'SCREEN',
    });
  }
  return out.slice(0, max);
}

/** Cap screen-visible points at 1–3; surplus becomes handout-only. */
function applyScreenBudget(
  items: CounsellingGuidanceItem[],
  maxScreen = 3,
): CounsellingGuidanceItem[] {
  let screenCount = 0;
  return items.map((item) => {
    const visibility = item.visibility ?? 'SCREEN';
    if (visibility === 'HANDOUT') return { ...item, visibility: 'HANDOUT' };
    if (screenCount < maxScreen) {
      screenCount += 1;
      return { ...item, visibility: 'SCREEN' };
    }
    return { ...item, visibility: 'HANDOUT' };
  });
}

export function screenItems(
  items: CounsellingGuidanceItem[],
): CounsellingGuidanceItem[] {
  return items.filter(
    (i) =>
      (i.visibility ?? 'SCREEN') === 'SCREEN' &&
      !isCounsellingUiPlaceholder(i.text),
  );
}

export function handoutItems(
  items: CounsellingGuidanceItem[],
  includeDetailed: boolean,
): CounsellingGuidanceItem[] {
  const usable = items.filter((i) => !isCounsellingUiPlaceholder(i.text));
  if (includeDetailed) return usable;
  return screenItems(usable);
}

function regimenUsePoints(
  selected: TreatmentRecommendation[],
  pediatric: boolean,
): CounsellingGuidanceItem[] {
  const ordered = [
    ...selected.filter((t) => (t.category ?? 'PRESCRIPTION') === 'PRESCRIPTION'),
    ...selected.filter((t) => t.category === 'OTC'),
    ...selected.filter((t) => t.category === 'SUPPLEMENT'),
  ];
  const seen = new Set(ordered);
  for (const t of selected) {
    if (!seen.has(t)) ordered.push(t);
  }

  const items: CounsellingGuidanceItem[] = [];
  for (const t of ordered) {
    const name = displayMedName(t);
    const verb = pediatric ? 'Give' : 'Take';
    const parts: string[] = [];
    if (t.dose) parts.push(t.dose);
    if (t.route) parts.push(`by ${t.route.toLowerCase()}`);
    if (t.frequency) parts.push(t.frequency.toLowerCase());
    if (t.duration) {
      const duration = /^\d+(\.\d+)?$/.test(t.duration.trim())
        ? `${t.duration.trim()} days`
        : t.duration;
      parts.push(`for ${duration}`);
    }

    const regimenLine = parts.length
      ? `${verb} ${name} ${parts.join(' ')}.`.replace(/\s+/g, ' ')
      : `${verb} ${name} exactly as prescribed.`;

    items.push({
      item_id: uid('REG', `${t.pathwayTreatmentId ?? name}-use`),
      text: regimenLine,
      priority: 'REQUIRED',
      source_type: 'SELECTED_REGIMEN',
      source_id: t.pathwayTreatmentId ?? name,
      editable: true,
      removable: false,
      pharmacist_modified: false,
      visibility: 'SCREEN',
      document_targets: ['CLINICAL_NOTE', 'PATIENT_HANDOUT'],
    });

    // Skip low-value "complete the course" when the regimen is already a short/single course
    if (
      t.duration &&
      /day|week|course/i.test(t.duration) &&
      !isShortCourseDuration(t.duration)
    ) {
      items.push({
        item_id: uid('REG', `${t.pathwayTreatmentId ?? name}-course`),
        text: `Complete the full ${name} course unless advised otherwise.`,
        priority: 'RECOMMENDED',
        source_type: 'SELECTED_REGIMEN',
        source_id: t.pathwayTreatmentId ?? name,
        editable: true,
        removable: true,
        pharmacist_modified: false,
        visibility: 'HANDOUT',
        document_targets: ['PATIENT_HANDOUT'],
      });
    }

    if (t.instructions?.trim()) {
      const sig = t.instructions.trim();
      // Skip instructions that merely restate the regimen line
      if (
        normalizeCounsellingText(sig) !== normalizeCounsellingText(regimenLine)
      ) {
        items.push({
          item_id: uid('REG', `${t.pathwayTreatmentId ?? name}-sig`),
          text: sig,
          priority: 'RECOMMENDED',
          source_type: 'SELECTED_REGIMEN',
          source_id: t.pathwayTreatmentId ?? name,
          editable: true,
          removable: true,
          pharmacist_modified: false,
          visibility: 'HANDOUT',
          document_targets: ['PATIENT_HANDOUT'],
        });
      }
    }

    if (t.monitoring?.trim()) {
      items.push({
        item_id: uid('REG', `${t.pathwayTreatmentId ?? name}-mon`),
        text: t.monitoring.trim(),
        priority: 'OPTIONAL',
        source_type: 'SELECTED_REGIMEN',
        source_id: t.pathwayTreatmentId ?? name,
        editable: true,
        removable: true,
        pharmacist_modified: false,
        visibility: 'HANDOUT',
        document_targets: ['PATIENT_HANDOUT'],
      });
    }
  }
  return applyScreenBudget(dedupeItems(items), 2);
}

function expectedResponsePoints(
  _consultation: Consultation,
  _selected: TreatmentRecommendation[],
  pathwayRows: PathwayCounsellingRow[],
): CounsellingGuidanceItem[] {
  // Symptom improvement only — adverse effects belong under medication counselling
  const fromPathway = pathwayRows
    .filter((r) => mapPathwayRowSection(r) === 'EXPECTED_RESPONSE')
    .map((r, i) => {
      const text = (r.detail?.trim() || r.point?.trim() || '').trim();
      return {
        item_id: uid('EXP', r.id ?? `p-${i}`),
        text,
        priority: 'RECOMMENDED' as const,
        source_type: 'PATHWAY_COUNSELLING' as const,
        source_id: r.id,
        editable: true,
        removable: true,
        pharmacist_modified: false,
        visibility: 'SCREEN' as const,
        document_targets: [
          'CLINICAL_NOTE',
          'PATIENT_HANDOUT',
        ] as CounsellingGuidanceItem['document_targets'],
      };
    })
    .filter((i) => i.text && !looksLikeAdverseEffect(i.text));

  if (fromPathway.length) return applyScreenBudget(dedupeItems(fromPathway), 2);

  // Empty is valid — never invent a 48–72h response timeline.
  return [];
}

/** Adverse-effect points routed into medication counselling (not expected response). */
function medicationEffectPoints(
  pathwayRows: PathwayCounsellingRow[],
): CounsellingGuidanceItem[] {
  return pathwayRows
    .filter((r) => {
      const text = (r.detail?.trim() || r.point?.trim() || '').trim();
      const cat = mapPathwayRowSection(r);
      return (
        text &&
        looksLikeAdverseEffect(text) &&
        (cat === 'EXPECTED_RESPONSE' || cat === 'MEDICATION_USE')
      );
    })
    .map((r, i) => ({
      item_id: uid('AE', r.id ?? `p-${i}`),
      text: (r.detail?.trim() || r.point?.trim() || '').trim(),
      priority: 'RECOMMENDED' as const,
      source_type: 'PATHWAY_COUNSELLING' as const,
      source_id: r.id,
      editable: true,
      removable: true,
      pharmacist_modified: false,
      visibility: 'HANDOUT' as const,
      document_targets: [
        'PATIENT_HANDOUT',
      ] as CounsellingGuidanceItem['document_targets'],
    }));
}

function selfCarePoints(
  _consultation: Consultation,
  _pediatric: boolean,
  pathwayRows: PathwayCounsellingRow[],
): CounsellingGuidanceItem[] {
  const fromPathway = pathwayRows
    .filter((r) => mapPathwayRowSection(r) === 'SELF_CARE')
    .map((r, i) => {
      const text = (r.detail?.trim() || r.point?.trim() || '').trim();
      return {
        item_id: uid('SC', r.id ?? `p-${i}`),
        text,
        priority: 'RECOMMENDED' as const,
        source_type: 'PATHWAY_COUNSELLING' as const,
        source_id: r.id,
        editable: true,
        removable: true,
        pharmacist_modified: false,
        visibility: 'SCREEN' as const,
        document_targets: [
          'PATIENT_HANDOUT',
        ] as CounsellingGuidanceItem['document_targets'],
      };
    })
    .filter((i) => i.text && !looksLikeStorageAdvice(i.text));

  if (fromPathway.length) return applyScreenBudget(dedupeItems(fromPathway), 3);

  // Empty is valid — never invent rest/fluids or condition-generic self-care.
  return [];
}

function containsSystemTerminology(text: string): boolean {
  return /\b(safescribe|safety engine|safety alert|rules engine|eligibility (?:module|check)|confidence score|clinical pathway|internal alert)\b/i.test(
    text,
  ) || /\bAI[- ]generated\b/i.test(text);
}

function toPatientInstruction(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  if (!isUsablePatientGuidanceText(t)) return null;
  if (containsSystemTerminology(t)) return null;
  if (!isClinicalAssessmentQuestion(t)) return t;

  // Convert common assessment questions into patient-facing instructions
  const fever = t.match(/fever|temperature/i);
  if (fever) {
    return 'Seek care if fever develops or worsens, or if you feel increasingly unwell.';
  }
  if (/worsen|not improv|getting worse/i.test(t)) {
    return 'Return for review if symptoms are not improving or are getting worse.';
  }
  if (/breath|chest pain|swelling|rash/i.test(t)) {
    return 'Seek urgent care for breathing difficulty, chest pain, swelling, or a spreading rash.';
  }
  // Unconvertible clinical question — drop it
  return null;
}

function followUpPoints(
  _consultation: Consultation,
  pathwayRows: PathwayCounsellingRow[],
): CounsellingGuidanceItem[] {
  const mapRow = (
    r: PathwayCounsellingRow,
    i: number,
    prefix: string,
  ): CounsellingGuidanceItem | null => {
    const raw = (r.detail?.trim() || r.point?.trim() || '').trim();
    const text = toPatientInstruction(raw);
    if (!text) return null;
    return {
      item_id: uid(prefix, r.id ?? `p-${i}`),
      text,
      priority: 'REQUIRED',
      source_type: 'PATHWAY_COUNSELLING',
      source_id: r.id,
      editable: true,
      removable: false,
      pharmacist_modified: false,
      visibility: 'SCREEN',
      document_targets: ['CLINICAL_NOTE', 'PATIENT_HANDOUT', 'PRESCRIBER_COMM'],
    };
  };

  const fromPathway = pathwayRows
    .filter((r) => mapPathwayRowSection(r) === 'FOLLOW_UP')
    .map((r, i) => mapRow(r, i, 'FU'))
    .filter((i): i is CounsellingGuidanceItem => Boolean(i));

  const genericFollow = pathwayRows
    .filter(
      (r) =>
        !mapPathwayCategory(r.category ?? '') &&
        /return|worsen|seek|follow/i.test(r.point ?? ''),
    )
    .map((r, i) => mapRow(r, i, 'FUg'))
    .filter((i): i is CounsellingGuidanceItem => Boolean(i));

  const combined = applyScreenBudget(
    dedupeItems([...fromPathway, ...genericFollow]),
    3,
  );
  if (combined.length) return combined;

  // Empty is valid — never invent a 48–72h urgent-care default.
  return [];
}

function mapAiCategoryToSectionKey(
  raw: string | undefined,
): CounsellingSectionKey | null {
  const t = (raw ?? '').trim().toLowerCase();
  if (!t) return null;
  if (
    t === 'medication_use' ||
    /medication|how to use|dose|regimen|side effect/.test(t)
  ) {
    return 'MEDICATION_USE';
  }
  if (
    t === 'expected_response' ||
    /expect|response|what to expect|improv/.test(t)
  ) {
    return 'EXPECTED_RESPONSE';
  }
  if (
    t === 'self_care' ||
    /self.?care|home care|non-drug|lifestyle|diet|comfort/.test(t)
  ) {
    return 'SELF_CARE';
  }
  if (
    t === 'follow_up' ||
    /follow|seek|return|warning|urgent|when to/.test(t)
  ) {
    return 'FOLLOW_UP';
  }
  return null;
}

function extractAiBullets(section: Record<string, unknown>): string[] {
  const bullets = section.bullets;
  if (Array.isArray(bullets)) {
    return bullets
      .map((b) =>
        typeof b === 'string'
          ? b
          : String((b as { point?: string })?.point ?? ''),
      )
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const points = section.points;
  if (Array.isArray(points)) {
    return points
      .map((p) => {
        if (typeof p === 'string') return p;
        if (p && typeof p === 'object' && 'point' in p) {
          return String((p as { point?: string }).point ?? '');
        }
        return '';
      })
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const items = section.items;
  if (Array.isArray(items)) {
    return items
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const row = item as { point?: string; text?: string };
          return String(row.point ?? row.text ?? '');
        }
        return '';
      })
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Map AI counselling JSON → CounsellingPlan (4 bullet sections).
 * Filters clinical assessment questions so screening text never lands on the panel.
 */
export function mapAiCounsellingToPlan(
  consultation: Consultation,
  selected: TreatmentRecommendation[],
  ai: unknown,
  previous?: CounsellingPlan | null,
): CounsellingPlan | null {
  if (!ai || typeof ai !== 'object') return null;
  const raw = ai as {
    sections?: Array<Record<string, unknown>>;
    keyMessages?: string[];
    whenToSeekHelp?: string[];
    followUpAdvice?: string;
  };

  const source_revision = buildCounsellingSourceRevision(consultation, selected);
  const context_factors = buildContextFactors(consultation, selected);
  const byKey: Record<CounsellingSectionKey, string[]> = {
    MEDICATION_USE: [],
    EXPECTED_RESPONSE: [],
    SELF_CARE: [],
    FOLLOW_UP: [],
  };

  for (const section of raw.sections ?? []) {
    const key = mapAiCategoryToSectionKey(
      String(section.section_key ?? section.category ?? ''),
    );
    if (!key) continue;
    for (const bullet of extractAiBullets(section)) {
      const cleaned = toPatientInstruction(bullet);
      if (!cleaned) continue;
      byKey[key].push(
        key === 'MEDICATION_USE'
          ? asMedicationUseBullet(cleaned) || cleaned
          : cleaned,
      );
    }
  }

  const treatmentPayloads = selected
    .map((t, i) =>
      toSelectedTreatmentPayload(
        {
          genericName: t.genericName || t.medicationName || t.displayName,
          dose: t.dose,
          route: t.route,
          frequency: t.frequency,
          duration: t.duration,
          patientDirections: t.patientDirections,
          directions: t.instructions,
          instructions: t.instructions,
          pathwayTreatmentId: t.pathwayTreatmentId,
          id: t.pathwayTreatmentId,
        },
        i,
      ),
    )
    .filter((t): t is NonNullable<typeof t> => Boolean(t));
  if (treatmentPayloads.length) {
    byKey.MEDICATION_USE = sanitizeMedicationUseBullets(
      byKey.MEDICATION_USE,
      treatmentPayloads,
    );
  }

  for (const tip of raw.whenToSeekHelp ?? []) {
    const cleaned = toPatientInstruction(String(tip));
    if (cleaned) byKey.FOLLOW_UP.push(cleaned);
  }
  if (raw.followUpAdvice?.trim()) {
    const cleaned = toPatientInstruction(raw.followUpAdvice.trim());
    if (cleaned) byKey.FOLLOW_UP.push(cleaned);
  }

  // Empty cards 2–4 are filled from related approved/confirmed sources, then
  // consultation-grounded fallbacks. A reason is shown only if nothing applies.

  const composedFallback = generateCounsellingPlan(consultation, selected, previous);

  const sections: CounsellingSection[] = SECTION_META.map(({ key, title }) => {
    let items = applyScreenBudget(
      dedupeItems(
        clampCounsellingSentences(byKey[key], sectionBulletLimit(key)).map(
          (text, i) => ({
            item_id: uid('AI', `${key}-${i}`),
            text,
            priority: (i === 0
              ? 'REQUIRED'
              : 'RECOMMENDED') as CounsellingItemPriority,
            source_type: 'AI_GENERATED' as const,
            editable: true,
            removable: true,
            pharmacist_modified: false,
            visibility: 'SCREEN' as const,
            document_targets: [
              'CLINICAL_NOTE',
              'PATIENT_HANDOUT',
              'PRESCRIBER_COMM',
            ] as CounsellingGuidanceItem['document_targets'],
          }),
        ),
      ),
      sectionBulletLimit(key),
    );

    if (!items.length) {
      const fbSection = composedFallback.sections.find((s) => s.section_key === key);
      items = (fbSection?.items ?? [])
        .slice(0, sectionBulletLimit(key))
        .map((i) => ({
          ...i,
          source_type:
            key === 'MEDICATION_USE' ? ('SELECTED_REGIMEN' as const) : i.source_type,
        }));
    }

    if (previous) {
      const prevSection = previous.sections.find((s) => s.section_key === key);
      const preserved = (prevSection?.items ?? []).filter(
        (i) => i.pharmacist_modified || i.pharmacist_added,
      );
      if (preserved.length) {
        items = applyScreenBudget(
          dedupeItems([...items, ...preserved]),
          sectionBulletLimit(key),
        );
      }
    }

    return {
      section_key: key,
      title: SECTION_DISPLAY_TITLE[key] || title,
      items: items.slice(0, sectionItemCap(key)),
    };
  });

  const keyMessages = (raw.keyMessages ?? [])
    .map((m) => toPatientInstruction(String(m)))
    .filter((m): m is string => Boolean(m))
    .slice(0, 5);

  const plan: CounsellingPlan = {
    consultation_id: consultation.id,
    source_revision,
    pathway_id: consultation.selectedPathwayId,
    status: 'READY',
    context_factors,
    sections,
    include_detailed_handout: previous?.include_detailed_handout ?? true,
    generated_at: new Date().toISOString(),
    ai_draft: sections.map((s) => ({
      ...s,
      items: s.items.map((item) => ({ ...item })),
    })),
    handoutLanguage: previous?.handoutLanguage ?? 'en',
    keyMessages,
  };

  return overlayHowToUseFromTreatments(
    overlayApprovedPathwayGuidance(plan, consultation),
    consultation,
    selected,
  );
}

/**
 * Build a deterministic counselling plan from confirmed consultation + selection.
 * Four cards in fixed order. Related approved pathway/treatment content is
 * classified into the matching card; a card stays empty only when no related
 * source exists.
 */
export function generateCounsellingPlan(
  consultation: Consultation,
  selected: TreatmentRecommendation[],
  previous?: CounsellingPlan | null,
): CounsellingPlan {
  const source_revision = buildCounsellingSourceRevision(consultation, selected);
  const context_factors = buildContextFactors(consultation, selected);

  if (hasUnresolvedTreatmentAllergyConflict(selected)) {
    return {
      consultation_id: consultation.id,
      source_revision,
      pathway_id: consultation.selectedPathwayId,
      status: 'SAFETY_BLOCKED',
      context_factors,
      sections: [],
      include_detailed_handout: previous?.include_detailed_handout ?? true,
      generated_at: new Date().toISOString(),
      keyMessages: [],
    };
  }

  const pediatric = isPediatric(
    consultation.demographics?.age,
    consultation.demographics?.ageUnit,
  );

  const pathwayRows = (
    (consultation.pathway?.counsellings ?? []) as PathwayCounsellingRow[]
  ).filter(
    (r) =>
      !r.archivedAt && (r.point?.trim() || r.detail?.trim()),
  );
  const usableRows = selectPathwayGuidanceForCounselling(pathwayRows);

  const hasFollowUpGuidance = usableRows.some(
    (r) => mapPathwayRowSection(r) === 'FOLLOW_UP',
  );
  const allFollowups = hasFollowUpGuidance
    ? []
    : consultation.pathway?.followups ?? [];
  const followupSource = selectFollowupsForCounselling(allFollowups);
  const followupRows = followupSource
    .map((f, i) => ({
      id: `fu-${i}`,
      category: /urgent|emergency|immediate/i.test(f.urgency ?? '')
        ? 'When to seek urgent care'
        : 'Follow-up',
      point: [f.action, f.condition, f.timeframe].filter(Boolean).join(' — '),
      detail: null as string | null,
    }))
    .filter((r) => r.point.trim());

  const composed = composeCounsellingSections({
    conditionName:
      consultation.pathway?.condition?.trim() ||
      consultation.pathway?.name?.trim() ||
      consultation.chiefComplaint?.trim() ||
      'your symptoms',
    pediatric,
    treatments: selected.map((t) => ({
      id: t.pathwayTreatmentId ?? t.medicationName,
      displayName: displayMedName(t),
      category: t.category,
      dose: t.dose,
      route: t.route,
      frequency: t.frequency,
      duration: t.duration,
      instructions: t.instructions ?? t.counsellingNotes,
      patientDirections: t.patientDirections ?? t.instructions,
    })),
    pathwayRows: [
      ...usableRows.map((r) => ({
        id: r.id,
        category: r.category ?? '',
        point: r.point ?? '',
        detail: r.detail,
        outputSection: r.outputSection,
        archivedAt: r.archivedAt,
      })),
      ...followupRows,
      ...selected.flatMap((t, i) => {
        const rows: Array<{
          id: string;
          category: string;
          point: string;
          detail: string | null;
        }> = [];
        const followUpAdvice = t.followUpAdvice?.trim();
        if (followUpAdvice && isUsablePatientGuidanceText(followUpAdvice)) {
          rows.push({
            id: `t-fu-${i}`,
            category: 'Follow-up',
            point: followUpAdvice,
            detail: null,
          });
        }
        if (
          t.counsellingNotes?.trim() &&
          t.counsellingNotes.trim() !== (t.instructions ?? '').trim()
        ) {
          rows.push({
            id: `t-c-${i}`,
            category: 'Medication counselling',
            point: t.counsellingNotes.trim(),
            detail: null,
          });
        }
        return rows;
      }),
    ],
  });

  const sectionKeyMap: Record<
    keyof typeof composed,
    CounsellingSectionKey
  > = {
    howToUse: 'MEDICATION_USE',
    whatToExpect: 'EXPECTED_RESPONSE',
    selfCare: 'SELF_CARE',
    followUp: 'FOLLOW_UP',
  };

  const sections: CounsellingSection[] = (
    Object.keys(sectionKeyMap) as Array<keyof typeof composed>
  ).map((composeKey) => {
    const key = sectionKeyMap[composeKey];
    const sentences =
      key === 'MEDICATION_USE'
        ? composed[composeKey].map((s) => compactCounsellingLine(s)).filter(Boolean)
        : clampCounsellingSentences(
            composed[composeKey],
            sectionBulletLimit(key),
          );

    let items: CounsellingGuidanceItem[] = sentences.map((text, i) => ({
      item_id: uid(key.slice(0, 2), `${composeKey}-${i}`),
      text,
      priority: (i === 0 ? 'REQUIRED' : 'RECOMMENDED') as CounsellingItemPriority,
      source_type: 'DETERMINISTIC_DEFAULT' as const,
      editable: true,
      removable: i > 0,
      pharmacist_modified: false,
      visibility: 'SCREEN' as const,
      document_targets: [
        'CLINICAL_NOTE',
        'PATIENT_HANDOUT',
        'PRESCRIBER_COMM',
      ] as CounsellingGuidanceItem['document_targets'],
    }));

    // Preserve pharmacist edits / added points when regenerating for a new revision
    if (previous && previous.source_revision !== source_revision) {
      const prevSection = previous.sections.find((s) => s.section_key === key);
      const preserved = (prevSection?.items ?? []).filter(
        (i) => i.pharmacist_modified || i.pharmacist_added,
      );
      if (preserved.length) {
        items = clampCounsellingSentences(
          [
            ...items.map((item) => {
              const match = prevSection?.items.find(
                (p) => p.item_id === item.item_id && p.pharmacist_modified,
              );
              return match?.text ?? item.text;
            }),
            ...preserved.filter((p) => p.pharmacist_added).map((p) => p.text),
          ],
          sectionBulletLimit(key),
        ).map((text, i) => ({
          item_id: uid(key.slice(0, 2), `m-${i}`),
          text,
          priority: (i === 0 ? 'REQUIRED' : 'RECOMMENDED') as CounsellingItemPriority,
          source_type: 'DETERMINISTIC_DEFAULT' as const,
          editable: true,
          removable: true,
          pharmacist_modified: true,
          visibility: 'SCREEN' as const,
          document_targets: [
            'CLINICAL_NOTE',
            'PATIENT_HANDOUT',
            'PRESCRIBER_COMM',
          ] as CounsellingGuidanceItem['document_targets'],
        }));
      }
    } else if (previous && previous.source_revision === source_revision) {
      const prevSection = previous.sections.find((s) => s.section_key === key);
      const prevItems = prevSection?.items ?? [];
      // Keep pharmacist-reviewed copy for this revision, including empty cards 2–4.
      if (prevItems.length > 0) {
        items = prevItems.slice(0, sectionItemCap(key));
      }
    }

    // Empty cards 2–4 are valid when the pathway has no Patient Guidance.

    return {
      section_key: key,
      title: SECTION_DISPLAY_TITLE[key],
      items: items.slice(0, sectionItemCap(key)),
    };
  });

  const keyMessages = sections
    .flatMap((s) => screenItems(s.items).filter((i) => i.priority === 'REQUIRED'))
    .map((i) => i.text)
    .slice(0, 5);

  const plan: CounsellingPlan = {
    consultation_id: consultation.id,
    source_revision,
    pathway_id: consultation.selectedPathwayId,
    status: 'READY',
    context_factors,
    sections,
    include_detailed_handout: previous?.include_detailed_handout ?? true,
    generated_at: new Date().toISOString(),
    keyMessages,
  };

  return overlayHowToUseFromTreatments(
    overlayApprovedPathwayGuidance(plan, consultation),
    consultation,
    selected,
  );
}

/**
 * Backfill empty counselling cards 2–4 from pathway Patient Guidance.
 * Does not invent filler copy when the pathway has no matching items.
 * Clinical Judgment visits without a pathway stay on AI-generated copy.
 */
export function fillEmptyCounsellingCards(
  plan: CounsellingPlan,
  consultation: Consultation,
  selected: TreatmentRecommendation[],
): CounsellingPlan {
  if (
    plan.status === 'SAFETY_BLOCKED' ||
    plan.status === 'GENERATING' ||
    plan.status === 'LOCKED' ||
    plan.status === 'NOT_READY' ||
    plan.status === 'GENERATION_FAILED'
  ) {
    return plan;
  }
  if (!plan.sections.length) return plan;
  return overlayHowToUseFromTreatments(
    overlayApprovedPathwayGuidance(plan, consultation),
    consultation,
    selected,
  );
}

/** Map structured plan → legacy counsellingNotes for documentation */
export function toLegacyCounsellingNotes(plan: CounsellingPlan) {
  const confirmed = plan.status === 'REVIEWED';
  return {
    sections: plan.sections.map((s) => ({
      category: s.title,
      section_key: s.section_key,
      bullets: handoutItems(s.items, plan.include_detailed_handout).map((i) => i.text),
      points: handoutItems(s.items, plan.include_detailed_handout).map((i) => ({
        point: i.text,
        important: i.priority === 'REQUIRED',
      })),
    })),
    keyMessages: plan.keyMessages ?? [],
    plan,
    reviewedAt: plan.reviewed_at,
    includeDetailedHandout: plan.include_detailed_handout,
    sourceRevision: plan.source_revision,
    handoutLanguage: plan.handoutLanguage ?? 'en',
    counselling_status: confirmed ? 'confirmed' : 'review_required',
    ai_draft: plan.ai_draft,
    confirmed_counselling: confirmed ? plan.sections : undefined,
  };
}

export function canContinueFromCounselling(plan: CounsellingPlan | null): {
  ok: boolean;
  reason?: string;
} {
  if (!plan) return { ok: false, reason: 'COUNSELLING_REQUIRED' };
  if (plan.status === 'NOT_READY' || plan.status === 'LOCKED') {
    return { ok: false, reason: 'COUNSELLING_REQUIRED' };
  }
  if (plan.status === 'SAFETY_BLOCKED') {
    return { ok: false, reason: 'SAFETY_BLOCKED' };
  }
  if (plan.status === 'OUTDATED') return { ok: false, reason: 'OUTDATED' };
  if (plan.status === 'GENERATING') {
    return { ok: false, reason: 'GENERATING' };
  }
  if (plan.status === 'GENERATION_FAILED') {
    return { ok: false, reason: 'GENERATION_FAILED' };
  }
  if (
    plan.status === 'REVIEWED' ||
    plan.status === 'READY' ||
    plan.status === 'PHARMACIST_MODIFIED'
  ) {
    return { ok: true };
  }
  return { ok: false, reason: 'COUNSELLING_REQUIRED' };
}

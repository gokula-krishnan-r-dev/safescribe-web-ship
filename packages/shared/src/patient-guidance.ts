/**
 * Patient Guidance — pathway-authored education, self-care, and follow-up.
 * Source of pharmacist-facing cards 2–4. Card 1 (how to use) stays on the
 * confirmed prescription.
 */

export const GUIDANCE_OUTPUT_SECTIONS = [
  'what_to_expect',
  'self_care',
  'follow_up',
] as const;

export type GuidanceOutputSection = (typeof GUIDANCE_OUTPUT_SECTIONS)[number];

export const WHAT_TO_EXPECT_TYPES = [
  'condition_education',
  'expected_course',
  'expected_treatment_response',
] as const;

export const SELF_CARE_TYPES = [
  'lifestyle',
  'hygiene',
  'symptom_relief',
  'prevention',
  'transmission_reduction',
  'behavioural_measure',
] as const;

export const FOLLOW_UP_TYPES = [
  'routine_reassessment',
  'treatment_failure',
  'monitoring',
  'seek_care',
  'urgent_care',
] as const;

export type WhatToExpectGuidanceType = (typeof WHAT_TO_EXPECT_TYPES)[number];
export type SelfCareGuidanceType = (typeof SELF_CARE_TYPES)[number];
export type FollowUpGuidanceType = (typeof FOLLOW_UP_TYPES)[number];
export type GuidanceType =
  | WhatToExpectGuidanceType
  | SelfCareGuidanceType
  | FollowUpGuidanceType;

export const GUIDANCE_PRIORITIES = ['first_line', 'alternative', 'optional'] as const;
export type GuidancePriority = (typeof GUIDANCE_PRIORITIES)[number];

export const GUIDANCE_STATUSES = ['draft', 'approved', 'archived'] as const;
export type GuidanceStatus = (typeof GUIDANCE_STATUSES)[number];

export const GUIDANCE_SECTION_META: Record<
  GuidanceOutputSection,
  {
    title: string;
    subtitle: string;
    mappingLabel: string;
    filterLabel: string;
    addLabel: string;
    types: readonly GuidanceType[];
    defaultType: GuidanceType;
    categoryLegacy: string;
  }
> = {
  what_to_expect: {
    title: 'Education & what to expect',
    subtitle: 'Condition education, expected course, and treatment response',
    mappingLabel: 'Generates: What to expect',
    filterLabel: 'What to expect',
    addLabel: 'Add education item',
    types: WHAT_TO_EXPECT_TYPES,
    defaultType: 'condition_education',
    categoryLegacy: 'What to expect',
  },
  self_care: {
    title: 'Self-care & non-drug measures',
    subtitle: 'Lifestyle, hygiene, symptom relief, and prevention',
    mappingLabel: 'Generates: Self-care & non-drug measures',
    filterLabel: 'Self-care',
    addLabel: 'Add self-care item',
    types: SELF_CARE_TYPES,
    defaultType: 'lifestyle',
    categoryLegacy: 'Non-drug advice',
  },
  follow_up: {
    title: 'Follow-up & when to seek care',
    subtitle: 'Routine reassessment, treatment failure, escalation, and urgent-care guidance',
    mappingLabel: 'Generates: Follow-up & when to seek care',
    filterLabel: 'Follow-up',
    addLabel: 'Add follow-up item',
    types: FOLLOW_UP_TYPES,
    defaultType: 'routine_reassessment',
    categoryLegacy: 'Follow-up',
  },
};

export const GUIDANCE_TYPE_LABELS: Record<GuidanceType, string> = {
  condition_education: 'Condition education',
  expected_course: 'Expected course',
  expected_treatment_response: 'Expected treatment response',
  lifestyle: 'Lifestyle',
  hygiene: 'Hygiene',
  symptom_relief: 'Symptom relief',
  prevention: 'Prevention',
  transmission_reduction: 'Transmission reduction',
  behavioural_measure: 'Behavioural measure',
  routine_reassessment: 'Routine reassessment',
  treatment_failure: 'Treatment failure',
  monitoring: 'Monitoring',
  seek_care: 'Seek care',
  urgent_care: 'Urgent care',
};

export const GUIDANCE_PRIORITY_LABELS: Record<GuidancePriority, string> = {
  first_line: 'First-line',
  alternative: 'Alternative',
  optional: 'Optional',
};

export function isGuidanceOutputSection(value: string | null | undefined): value is GuidanceOutputSection {
  return GUIDANCE_OUTPUT_SECTIONS.includes(value as GuidanceOutputSection);
}

export function typesForOutputSection(section: GuidanceOutputSection): readonly GuidanceType[] {
  return GUIDANCE_SECTION_META[section].types;
}

export function isTypeCompatible(section: GuidanceOutputSection, type: string): boolean {
  return (GUIDANCE_SECTION_META[section].types as readonly string[]).includes(type);
}

/** Map legacy Patient Education category strings onto an output section. */
export function mapLegacyCategoryToSection(
  category: string | null | undefined,
): GuidanceOutputSection {
  const c = (category ?? '').trim().toLowerCase();
  if (!c) return 'what_to_expect';
  if (
    /follow[- ]?up|reassess|seek\s*care|urgent|emergency|worsen|escalat/.test(c)
  ) {
    return 'follow_up';
  }
  if (
    /non[- ]?drug|self[- ]?care|hygiene|lifestyle|diet|exercise|prevention|transmission|sitz|behaviour|behavior/.test(
      c,
    )
  ) {
    return 'self_care';
  }
  return 'what_to_expect';
}

export function mapLegacyCategoryToType(
  category: string | null | undefined,
  section: GuidanceOutputSection,
): GuidanceType {
  const c = (category ?? '').trim().toLowerCase();
  if (section === 'follow_up') {
    if (/urgent|emergency/.test(c)) return 'urgent_care';
    if (/worsen|failure|not\s+improv/.test(c)) return 'treatment_failure';
    if (/monitor/.test(c)) return 'monitoring';
    return 'routine_reassessment';
  }
  if (section === 'self_care') {
    if (/hygiene/.test(c)) return 'hygiene';
    if (/prevention/.test(c)) return 'prevention';
    if (/transmission|abstinen|condom|barrier/.test(c)) return 'transmission_reduction';
    if (/sitz|relief|bath|compress/.test(c)) return 'symptom_relief';
    return 'lifestyle';
  }
  if (/response|expect/.test(c)) return 'expected_treatment_response';
  if (/course|typical/.test(c)) return 'expected_course';
  return 'condition_education';
}

export function mapRecommendationToPriority(
  level: string | null | undefined,
): GuidancePriority {
  const v = (level ?? '').toUpperCase();
  if (v === 'FIRST_LINE') return 'first_line';
  if (v === 'OPTIONAL' || v === 'SUPPORTIVE_CARE' || v === 'ADJUNCTIVE') return 'optional';
  return 'alternative';
}

export function resolveGuidanceSection(
  outputSection: string | null | undefined,
  category: string | null | undefined,
): GuidanceOutputSection {
  if (isGuidanceOutputSection(outputSection)) return outputSection;
  return mapLegacyCategoryToSection(category);
}

export function resolveGuidanceType(
  guidanceType: string | null | undefined,
  outputSection: GuidanceOutputSection,
  category?: string | null,
): GuidanceType {
  if (guidanceType && isTypeCompatible(outputSection, guidanceType)) {
    return guidanceType as GuidanceType;
  }
  return mapLegacyCategoryToType(category, outputSection);
}

export function resolveGuidancePriority(
  priority: string | null | undefined,
): GuidancePriority {
  if (priority && GUIDANCE_PRIORITIES.includes(priority as GuidancePriority)) {
    return priority as GuidancePriority;
  }
  return 'alternative';
}

/** Combine headline + supporting detail the way counselling cards display it. */
export function pathwayGuidanceBody(row: {
  point?: string | null;
  detail?: string | null;
}): string {
  const headline = (row.point ?? '').replace(/\s+/g, ' ').trim();
  const extra = (row.detail ?? '').replace(/\s+/g, ' ').trim();
  if (!headline) return extra;
  if (!extra) return headline;
  if (headline.toLowerCase() === extra.toLowerCase()) return headline;
  if (extra.toLowerCase().startsWith(headline.toLowerCase())) return extra;
  return `${headline.replace(/[.!?]$/, '')}. ${extra}`;
}

/**
 * Reject yes/no flags, N/A, and other non-instruction fragments that should
 * never appear as counselling bullets (e.g. monitoring = "No.").
 */
export function isUsablePatientGuidanceText(
  text: string | null | undefined,
): boolean {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return false;
  const stripped = t.replace(/[.!?]+$/g, '').trim();
  if (
    /^(yes|no|y|n|n\/?a|none|nil|unknown|tbd|ok|true|false|-|—)$/i.test(stripped)
  ) {
    return false;
  }
  if (t.length < 12) return false;
  if (stripped.split(/\s+/).filter(Boolean).length < 3) return false;
  return true;
}

export type PathwayGuidanceSelectRow = {
  approved?: boolean | null;
  archivedAt?: string | Date | null;
  outputSection?: string | null;
  category?: string | null;
  point?: string | null;
  detail?: string | null;
};

function sectionOfGuidanceRow(row: PathwayGuidanceSelectRow): GuidanceOutputSection {
  return resolveGuidanceSection(row.outputSection, row.category);
}

/**
 * Patient Guidance rows that may appear on counselling cards 2–4.
 * Prefer approved items per section. If a live pathway has authored drafts
 * but nothing approved in that section, use the drafts so the pharmacist
 * still sees the pathway content. Archived and junk rows stay out.
 */
export function selectPathwayGuidanceForCounselling<T extends PathwayGuidanceSelectRow>(
  rows: T[],
): T[] {
  const live = rows.filter((row) => {
    if (row.archivedAt) return false;
    return isUsablePatientGuidanceText(pathwayGuidanceBody(row));
  });
  if (!live.length) return [];

  const out: T[] = [];
  for (const section of GUIDANCE_OUTPUT_SECTIONS) {
    const inSection = live.filter((row) => sectionOfGuidanceRow(row) === section);
    if (!inSection.length) continue;
    const approved = inSection.filter((row) => row.approved === true);
    out.push(...(approved.length ? approved : inSection));
  }
  return out;
}

export type PathwayFollowupSelectRow = {
  approved?: boolean | null;
  timeframe?: string | null;
  condition?: string | null;
  action?: string | null;
  urgency?: string | null;
};

export function followupGuidanceText(row: {
  action?: string | null;
  condition?: string | null;
  timeframe?: string | null;
}): string {
  return [row.action, row.condition, row.timeframe]
    .map((part) => (part ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' — ');
}

export function selectFollowupsForCounselling<T extends PathwayFollowupSelectRow>(
  rows: T[],
): T[] {
  const live = rows.filter((row) => isUsablePatientGuidanceText(followupGuidanceText(row)));
  if (!live.length) return [];
  const approved = live.filter((row) => row.approved === true);
  return approved.length ? approved : live;
}

/** True when a NON_DRUG treatment already has a Patient Guidance twin. */
export function isNonDrugTreatmentMigrated(
  treatmentId: string,
  guidanceItems: Array<{ id?: string | null; legacyId?: string | null }>,
): boolean {
  const prefixed = `nd_${treatmentId}`;
  return guidanceItems.some(
    (item) =>
      item.legacyId === treatmentId ||
      item.legacyId === prefixed ||
      item.id === prefixed,
  );
}

/** Infer self-care guidance type from a legacy non-drug treatment name. */
export function guidanceTypeForNonDrugName(name: string | null | undefined): SelfCareGuidanceType {
  const n = (name ?? '').toLowerCase();
  if (/sitz|bath|compress|relief|hydrat/.test(n)) return 'symptom_relief';
  if (/abstinen|condom|barrier|transmission|dental.?dam|intercourse|sexual/.test(n)) {
    return 'transmission_reduction';
  }
  if (/hygiene|wash/.test(n)) return 'hygiene';
  if (/prevent|void|bladder|urinat/.test(n)) return 'prevention';
  if (/behaviour|behavior|lifestyle|fluid|intake/.test(n)) return 'behavioural_measure';
  return 'lifestyle';
}

/** Patient wording for converting a NON_DRUG treatment into self-care guidance. */
export function patientWordingFromNonDrugTreatment(treatment: {
  medicationName?: string | null;
  directions?: string | null;
  clinicalIndication?: string | null;
  counsellingNotes?: string | null;
  clinicalNotes?: string | null;
}): string {
  const detail = [
    treatment.directions,
    treatment.clinicalIndication,
    treatment.counsellingNotes,
    treatment.clinicalNotes,
    treatment.medicationName,
  ]
    .map((part) => (part ?? '').replace(/\s+/g, ' ').trim())
    .find((part) => part.length >= 10);
  if (detail) return detail;
  const name = (treatment.medicationName ?? 'Self-care measure').trim() || 'Self-care measure';
  return `${name}. Follow the pathway guidance discussed with your pharmacist.`;
}

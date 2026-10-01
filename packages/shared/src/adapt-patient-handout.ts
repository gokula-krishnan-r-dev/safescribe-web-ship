/**
 * SafeScribe Adapt — Patient Handout / Patient Care Summary.
 *
 * Patient-facing medication-change summary from the frozen Adapt snapshot.
 * Medication identity, SIG, quantity, refills, patient header, and pharmacy
 * contact are always deterministic. AI may only simplify confirmed narrative
 * fields (what changed / why / counselling / follow-up / when to get help).
 */

import { displayDob } from './referral-letter-document';
import { formatDocumentFaxNumber } from './pcp-communication';
import type {
  AdaptPatientDocumentInfo,
  AdaptStepOne,
  AdaptStepThreeOptionA,
  AdaptStepThreeOptionB,
  AdaptStepTwoOptionA,
  AdaptStepTwoOptionB,
  ProposedPrescription,
} from './adapt';
import type { AdaptDapGenerationContext } from './adapt-dap-note';
import { ADAPT_PATIENT_HANDOUT_PROMPT_VERSION } from './adapt-patient-handout-prompt';
import type { RenewMedication } from './renew';

export const ADAPT_PATIENT_HANDOUT_TITLE = 'YOUR UPDATED MEDICATION PLAN';
export const ADAPT_PATIENT_HANDOUT_UI_TITLE = 'Patient Care Summary & Handout';
export const ADAPT_PATIENT_HANDOUT_SCHEMA_VERSION = '1';
export { ADAPT_PATIENT_HANDOUT_PROMPT_VERSION };

/** Deterministic patient-friendly reason templates for common adaptation codes. */
export const ADAPT_PATIENT_REASON_TEMPLATES: Record<string, string> = {
  DOSE_RENAL:
    'Your dose was changed because your kidney function can affect how your body handles this medicine.',
  DOSE_WEIGHT_AGE: 'Your dose was adjusted based on your age and/or weight.',
  FORM_SWALLOWING: 'The form of your medicine was changed to make it easier to take.',
  REGIMEN_ADHERENCE:
    'Your dosing schedule was adjusted to make the medicine easier to take as directed.',
  DOSE_ADJUSTMENT:
    'Your dose was adjusted based on your pharmacist\'s clinical assessment.',
  THERAPEUTIC_SUBSTITUTION:
    'Your pharmacist selected an alternative medicine that fits your treatment plan.',
};

export interface AdaptConfirmedPatientCounselling {
  medicationUse: string[];
  administration: string[];
  expectedCourse: string[];
  adverseEffectsDiscussed: string[];
  precautions: string[];
  selfCare: string[];
  followUp: string[];
  whenToSeekCare: string[];
}

export interface AdaptPatientHandoutDraft {
  what_changed: string;
  why_it_changed: string;
  how_to_use_additional_guidance: string[];
  what_to_expect: string[];
  follow_up: string[];
  when_to_get_help: string[];
}

export interface AdaptPatientHandoutSource {
  schemaVersion: string;
  workflow: 'ADAPT';
  jurisdiction: string;
  language: string;
  promptVersion: string;
  documentDate: string;
  documentDateIso: string;
  patient: {
    fullName: string;
    dateOfBirth: string | null;
  };
  medication: {
    displayName: string;
    strength: string | null;
    dosageForm: string | null;
    confirmedSig: string;
    quantityDisplay: string;
    refills: string;
  };
  changeSummary: {
    before: string;
    after: string;
    changedFields: string[];
    patientFacingWhatChanged: string;
  };
  adaptation: {
    adaptationType: string;
    reasonCode: string;
    reasonLabel: string;
    patientFriendlyReason: string;
    pharmacistConfirmedRationale: string;
  };
  counselling: AdaptConfirmedPatientCounselling;
  monitoringFollowUp: {
    required: boolean;
    plan: string;
    timing: string;
    responsibleParty: string;
    monitor: string[];
  };
  escalationInstructions: string[];
  pharmacy: {
    name: string | null;
    phone: string | null;
    fax: string | null;
    address: string | null;
    pharmacistName: string | null;
  };
  validation: {
    readyForRender: boolean;
    blockingIssues: string[];
  };
}

export interface AdaptPatientHandoutBuildInput {
  step1: AdaptStepOne;
  step2A?: AdaptStepTwoOptionA;
  step2B?: AdaptStepTwoOptionB;
  step3A?: AdaptStepThreeOptionA;
  step3B?: AdaptStepThreeOptionB;
  patientInfo?: Partial<AdaptPatientDocumentInfo>;
  context?: AdaptDapGenerationContext;
  /** Optional AI narrative draft. Invalid drafts fall back deterministically. */
  aiDraft?: AdaptPatientHandoutDraft | null;
}

const FORBIDDEN_CLAIM_CHECKS: Array<{
  id: string;
  re: RegExp;
  allowed: (source: AdaptPatientHandoutSource) => boolean;
}> = [
  {
    id: 'invented_emergency',
    re: /\b(?:call 911|go to (?:the )?emergency|er\/ed|seek (?:immediate )?emergency)\b/i,
    allowed: (source) =>
      source.escalationInstructions.some((t) =>
        /911|emergency|er\/ed|urgent/i.test(t),
      ) ||
      source.counselling.whenToSeekCare.some((t) =>
        /911|emergency|er\/ed|urgent/i.test(t),
      ),
  },
  {
    id: 'doctor_notified',
    re: /doctor (?:has been|was) (?:notified|sent)|prescriber (?:has been|was) notified|fax (?:has been |was )?sent/i,
    allowed: () => false,
  },
  {
    id: 'unsafe_original',
    re: /(?:previous|original) (?:dose|prescription) was (?:unsafe|dangerous)|medications? (?:are|is) unsafe/i,
    allowed: () => false,
  },
  {
    id: 'internal_terms',
    re: /\bstep\s*[1234]\b|AdaptReferenceSelector|safety engine|\bllm\b|confidence score|rule id|drug therapy problem|\bdtp\b/i,
    allowed: () => false,
  },
  {
    id: 'reference',
    re: /\b(?:product monograph|cps|ecps|bugs\s*&\s*drugs|clinical practice guideline)\b/i,
    allowed: () => false,
  },
  {
    id: 'missing_data_language',
    re: /not (?:yet )?(?:been )?documented|data unavailable|not provided in (?:the )?(?:payload|supplied)|field missing/i,
    allowed: () => false,
  },
];

export function buildAdaptPatientHandoutSource(
  input: AdaptPatientHandoutBuildInput,
): AdaptPatientHandoutSource {
  const { step1, step2A, step3A, step3B, patientInfo, context } = input;
  const prop = step3A?.proposedPrescription;
  const orig = step1.originalPrescription;
  const dateIso = (
    step3B?.confirmedAt ||
    context?.confirmedAt ||
    context?.dateString ||
    new Date().toISOString()
  ).slice(0, 10);
  const jurisdiction = (step1.jurisdiction || 'AB').trim().toUpperCase() || 'AB';

  const displayName = formatMedicationDisplayName(prop);
  const confirmedSig = prop?.sig?.trim() || '';
  const quantityDisplay = formatQuantityDisplay(prop);
  const refills =
    prop?.refills === null || prop?.refills === undefined || prop?.refills === ''
      ? ''
      : String(prop.refills).trim();

  const changeSummary = buildDeterministicChangeSummary(orig, prop, step3A?.changeSummary);
  const reasonCode = step1.adaptationReason?.code?.trim() || '';
  const reasonLabel = step1.adaptationReason?.label?.trim() || '';
  const patientFriendlyReason =
    resolvePatientFriendlyReason(reasonCode, reasonLabel) || '';
  const pharmacistRationale =
    step3B?.clinicalRationale?.trim() ||
    step3A?.rationaleDraft?.trim() ||
    '';

  const counselling = classifyConfirmedCounselling(
    step3A?.confirmed ? step3A.counsellingPreview : undefined,
  );
  const monitoring = buildHandoutMonitoring(step3B);
  const escalation = [...counselling.whenToSeekCare];

  const rawDob = sanitizePlaceholder(
    patientInfo?.dateOfBirth || step2A?.demographics?.dateOfBirth,
    ['1958-04-12'],
  );
  const blockingIssues: string[] = [];
  const patientName = sanitizePlaceholder(patientInfo?.name, ['Jane Doe', 'John Doe']);
  if (!patientName) blockingIssues.push('Patient name is required.');
  if (!confirmedSig) blockingIssues.push('Adapted prescription directions (SIG) are required.');
  if (!displayName) blockingIssues.push('Adapted medication name is required.');

  return {
    schemaVersion: ADAPT_PATIENT_HANDOUT_SCHEMA_VERSION,
    workflow: 'ADAPT',
    jurisdiction,
    language: 'en-CA',
    promptVersion: ADAPT_PATIENT_HANDOUT_PROMPT_VERSION,
    documentDate: formatHandoutDate(dateIso),
    documentDateIso: dateIso,
    patient: {
      fullName: patientName,
      dateOfBirth: rawDob ? displayDob(rawDob) || rawDob : null,
    },
    medication: {
      displayName: displayName || 'Medication',
      strength: prop?.strength?.trim() || null,
      dosageForm: prop?.dosageForm?.trim() || null,
      confirmedSig,
      quantityDisplay: quantityDisplay || '',
      refills,
    },
    changeSummary,
    adaptation: {
      adaptationType: step1.adaptationType || '',
      reasonCode,
      reasonLabel,
      patientFriendlyReason,
      pharmacistConfirmedRationale: pharmacistRationale,
    },
    counselling,
    monitoringFollowUp: monitoring,
    escalationInstructions: escalation,
    pharmacy: {
      name: context?.pharmacyName?.trim() || null,
      phone: formatDocumentFaxNumber(context?.pharmacyPhone) || context?.pharmacyPhone?.trim() || null,
      fax: formatDocumentFaxNumber(context?.pharmacyFax) || context?.pharmacyFax?.trim() || null,
      address: context?.pharmacyAddress?.trim() || null,
      pharmacistName: context?.pharmacistName?.trim() || null,
    },
    validation: {
      readyForRender: blockingIssues.length === 0,
      blockingIssues,
    },
  };
}

/** Prompt payload for optional AI simplification (narrative fields only). */
export function buildAdaptPatientHandoutPromptPayload(
  source: AdaptPatientHandoutSource,
): Record<string, unknown> {
  return {
    document_type: 'adapt_patient_handout',
    adaptation_reason: {
      type: source.adaptation.adaptationType,
      reason: source.adaptation.reasonLabel,
      patient_friendly_reason: source.adaptation.patientFriendlyReason,
    },
    confirmed_change_summary: {
      before: source.changeSummary.before,
      after: source.changeSummary.after,
      changed_fields: source.changeSummary.changedFields,
      patient_facing: source.changeSummary.patientFacingWhatChanged,
    },
    pharmacist_confirmed_rationale: source.adaptation.pharmacistConfirmedRationale,
    confirmed_counselling: {
      medication_use: source.counselling.medicationUse,
      administration: source.counselling.administration,
      expected_course: source.counselling.expectedCourse,
      adverse_effects_discussed: source.counselling.adverseEffectsDiscussed,
      precautions: source.counselling.precautions,
      self_care: source.counselling.selfCare,
      follow_up: source.counselling.followUp,
      when_to_seek_care: source.counselling.whenToSeekCare,
    },
    monitoring_follow_up: {
      required: source.monitoringFollowUp.required,
      plan: source.monitoringFollowUp.plan,
      timing: source.monitoringFollowUp.timing,
      responsible_party: source.monitoringFollowUp.responsibleParty,
      monitor: source.monitoringFollowUp.monitor,
    },
    escalation_instructions: source.escalationInstructions,
    provenance: {
      promptVersion: source.promptVersion,
      schemaVersion: source.schemaVersion,
    },
  };
}

export function composeAdaptPatientHandoutFallback(
  source: AdaptPatientHandoutSource,
): AdaptPatientHandoutDraft {
  const howToUse = uniqueStrings([
    ...source.counselling.administration,
    ...source.counselling.medicationUse.filter((t) => !isMostlySigDuplicate(t, source.medication.confirmedSig)),
  ]).filter((t) => !isMostlySigDuplicate(t, source.medication.confirmedSig));

  const whatToExpect = uniqueStrings([
    ...source.counselling.expectedCourse,
    ...source.counselling.adverseEffectsDiscussed,
    ...source.counselling.precautions,
    ...source.counselling.selfCare,
  ]);

  const followUp = uniqueStrings([
    ...source.counselling.followUp,
    ...buildFollowUpLines(source),
  ]);

  const whenToGetHelp = uniqueStrings([
    ...source.counselling.whenToSeekCare,
    ...source.escalationInstructions,
  ]);

  return {
    what_changed: source.changeSummary.patientFacingWhatChanged,
    why_it_changed:
      source.adaptation.patientFriendlyReason ||
      simplifyRationaleDeterministically(source.adaptation.pharmacistConfirmedRationale) ||
      '',
    how_to_use_additional_guidance: howToUse,
    what_to_expect: whatToExpect,
    follow_up: followUp,
    when_to_get_help: whenToGetHelp,
  };
}

export function acceptAdaptPatientHandoutDraft(
  draft: AdaptPatientHandoutDraft,
  source: AdaptPatientHandoutSource,
): { ok: boolean; draft: AdaptPatientHandoutDraft; warnings: string[] } {
  const warnings: string[] = [];
  const normalized: AdaptPatientHandoutDraft = {
    what_changed: String(draft.what_changed ?? '').trim(),
    why_it_changed: String(draft.why_it_changed ?? '').trim(),
    how_to_use_additional_guidance: normalizeStringArray(draft.how_to_use_additional_guidance),
    what_to_expect: normalizeStringArray(draft.what_to_expect),
    follow_up: normalizeStringArray(draft.follow_up),
    when_to_get_help: normalizeStringArray(draft.when_to_get_help),
  };

  const allText = [
    normalized.what_changed,
    normalized.why_it_changed,
    ...normalized.how_to_use_additional_guidance,
    ...normalized.what_to_expect,
    ...normalized.follow_up,
    ...normalized.when_to_get_help,
  ].join(' ');

  for (const check of FORBIDDEN_CLAIM_CHECKS) {
    if (check.re.test(allText) && !check.allowed(source)) {
      warnings.push(`Unsupported handout claim: ${check.id}`);
    }
  }

  // Reject drafts that invent follow-up / help content when source has none.
  if (
    normalized.follow_up.length > 0 &&
    source.counselling.followUp.length === 0 &&
    !source.monitoringFollowUp.required &&
    !source.monitoringFollowUp.plan
  ) {
    warnings.push('Invented follow-up content');
  }
  if (
    normalized.when_to_get_help.length > 0 &&
    source.counselling.whenToSeekCare.length === 0 &&
    source.escalationInstructions.length === 0
  ) {
    warnings.push('Invented when-to-get-help content');
  }
  if (
    normalized.what_to_expect.length > 0 &&
    source.counselling.expectedCourse.length === 0 &&
    source.counselling.adverseEffectsDiscussed.length === 0 &&
    source.counselling.precautions.length === 0 &&
    source.counselling.selfCare.length === 0
  ) {
    warnings.push('Invented what-to-expect content');
  }

  if (warnings.length) {
    return { ok: false, draft: normalized, warnings };
  }
  return { ok: true, draft: normalized, warnings };
}

export function renderAdaptPatientHandout(
  source: AdaptPatientHandoutSource,
  draft: AdaptPatientHandoutDraft,
): { plainText: string; html: string } {
  const plainParts: string[] = [
    ADAPT_PATIENT_HANDOUT_TITLE,
    '',
    `Patient: ${source.patient.fullName || '—'}`,
    `Date: ${source.documentDate || '—'}`,
  ];
  if (source.patient.dateOfBirth) {
    plainParts.push(`DOB: ${source.patient.dateOfBirth}`);
  }

  plainParts.push('', 'YOUR UPDATED MEDICATION', source.medication.displayName, '');
  if (source.medication.confirmedSig) {
    plainParts.push(source.medication.confirmedSig);
  }
  const qtyRefill: string[] = [];
  if (source.medication.quantityDisplay) {
    qtyRefill.push(`Quantity: ${source.medication.quantityDisplay}`);
  }
  if (source.medication.refills !== '') {
    qtyRefill.push(`Refills: ${source.medication.refills}`);
  }
  if (qtyRefill.length) plainParts.push('', ...qtyRefill);

  if (draft.what_changed.trim()) {
    plainParts.push('', 'WHAT CHANGED', draft.what_changed.trim());
  }
  if (draft.why_it_changed.trim()) {
    plainParts.push('', 'WHY IT WAS CHANGED', draft.why_it_changed.trim());
  }

  plainParts.push('', 'HOW TO USE YOUR MEDICATION');
  if (source.medication.confirmedSig) {
    plainParts.push(source.medication.confirmedSig);
  }
  for (const tip of draft.how_to_use_additional_guidance) {
    plainParts.push(`• ${tip}`);
  }

  if (draft.what_to_expect.length) {
    plainParts.push('', 'WHAT TO WATCH FOR / WHAT TO EXPECT');
    for (const item of draft.what_to_expect) {
      plainParts.push(`• ${item}`);
    }
  }
  if (draft.follow_up.length) {
    plainParts.push('', 'FOLLOW-UP');
    for (const item of draft.follow_up) {
      plainParts.push(`• ${item}`);
    }
  }
  if (draft.when_to_get_help.length) {
    plainParts.push('', 'WHEN TO GET HELP');
    for (const item of draft.when_to_get_help) {
      plainParts.push(`• ${item}`);
    }
  }

  const contact = renderPharmacyContactPlain(source);
  if (contact) {
    plainParts.push('', 'QUESTIONS?', contact);
  }

  const plainText = plainParts
    .filter((line, idx, arr) => !(line === '' && arr[idx - 1] === ''))
    .join('\n')
    .trim();

  const htmlParts = [
    '<div class="patient-care-summary-container adapt-patient-handout">',
    `<h2>${escapeHtml(ADAPT_PATIENT_HANDOUT_TITLE)}</h2>`,
    `<p><strong>Patient:</strong> ${escapeHtml(source.patient.fullName || '—')} | <strong>Date:</strong> ${escapeHtml(source.documentDate || '—')}${
      source.patient.dateOfBirth
        ? ` | <strong>DOB:</strong> ${escapeHtml(source.patient.dateOfBirth)}`
        : ''
    }</p>`,
    '<hr />',
    '<h3>Your updated medication</h3>',
    `<p><strong>${escapeHtml(source.medication.displayName)}</strong></p>`,
  ];
  if (source.medication.confirmedSig) {
    htmlParts.push(`<p>${escapeHtml(source.medication.confirmedSig)}</p>`);
  }
  if (qtyRefill.length) {
    htmlParts.push(`<p>${escapeHtml(qtyRefill.join('  ·  '))}</p>`);
  }
  if (draft.what_changed.trim()) {
    htmlParts.push('<h3>What changed</h3>', `<p>${escapeHtml(draft.what_changed.trim())}</p>`);
  }
  if (draft.why_it_changed.trim()) {
    htmlParts.push(
      '<h3>Why it was changed</h3>',
      `<p>${escapeHtml(draft.why_it_changed.trim())}</p>`,
    );
  }
  htmlParts.push('<h3>How to use your medication</h3>');
  if (source.medication.confirmedSig) {
    htmlParts.push(`<p>${escapeHtml(source.medication.confirmedSig)}</p>`);
  }
  if (draft.how_to_use_additional_guidance.length) {
    htmlParts.push('<ul>');
    for (const tip of draft.how_to_use_additional_guidance) {
      htmlParts.push(`<li>${escapeHtml(tip)}</li>`);
    }
    htmlParts.push('</ul>');
  }
  if (draft.what_to_expect.length) {
    htmlParts.push('<h3>What to watch for / what to expect</h3>', '<ul>');
    for (const item of draft.what_to_expect) {
      htmlParts.push(`<li>${escapeHtml(item)}</li>`);
    }
    htmlParts.push('</ul>');
  }
  if (draft.follow_up.length) {
    htmlParts.push('<h3>Follow-up</h3>', '<ul>');
    for (const item of draft.follow_up) {
      htmlParts.push(`<li>${escapeHtml(item)}</li>`);
    }
    htmlParts.push('</ul>');
  }
  if (draft.when_to_get_help.length) {
    htmlParts.push('<h3>When to get help</h3>', '<ul>');
    for (const item of draft.when_to_get_help) {
      htmlParts.push(`<li>${escapeHtml(item)}</li>`);
    }
    htmlParts.push('</ul>');
  }
  const contactHtml = renderPharmacyContactHtml(source);
  if (contactHtml) {
    htmlParts.push('<h3>Questions?</h3>', contactHtml);
  }
  htmlParts.push('</div>');

  return { plainText, html: htmlParts.join('\n') };
}

/** Merge AI narrative with deterministic fallback — empty AI fields keep Nest phrasing. */
export function mergeAdaptPatientHandoutDraft(
  ai: AdaptPatientHandoutDraft,
  fallback: AdaptPatientHandoutDraft,
): AdaptPatientHandoutDraft {
  return {
    what_changed: ai.what_changed.trim() || fallback.what_changed,
    why_it_changed: ai.why_it_changed.trim() || fallback.why_it_changed,
    how_to_use_additional_guidance:
      ai.how_to_use_additional_guidance.length > 0
        ? ai.how_to_use_additional_guidance
        : fallback.how_to_use_additional_guidance,
    what_to_expect:
      ai.what_to_expect.length > 0 ? ai.what_to_expect : fallback.what_to_expect,
    follow_up: ai.follow_up.length > 0 ? ai.follow_up : fallback.follow_up,
    when_to_get_help:
      ai.when_to_get_help.length > 0 ? ai.when_to_get_help : fallback.when_to_get_help,
  };
}

export function adaptPatientHandoutDraftHasContent(draft: AdaptPatientHandoutDraft): boolean {
  return Boolean(
    draft.what_changed.trim() ||
      draft.why_it_changed.trim() ||
      draft.how_to_use_additional_guidance.length ||
      draft.what_to_expect.length ||
      draft.follow_up.length ||
      draft.when_to_get_help.length,
  );
}

/** Parse Assist Engine / Document Session JSON into an Adapt patient-handout draft. */
export function assembleAdaptPatientHandoutDraftFromAi(
  raw: unknown,
): { draft: AdaptPatientHandoutDraft; ok: boolean } {
  const fields = handoutFieldsFromUnknown(raw);
  const draft: AdaptPatientHandoutDraft = {
    what_changed: String(fields.what_changed ?? '').trim(),
    why_it_changed: String(fields.why_it_changed ?? '').trim(),
    how_to_use_additional_guidance: stringArrayFromUnknown(
      fields.how_to_use_additional_guidance ?? fields.howToUseAdditionalGuidance,
    ),
    what_to_expect: stringArrayFromUnknown(
      fields.what_to_expect ?? fields.whatToExpect,
    ),
    follow_up: stringArrayFromUnknown(fields.follow_up ?? fields.followUp),
    when_to_get_help: stringArrayFromUnknown(
      fields.when_to_get_help ?? fields.whenToGetHelp ?? fields.seekCare,
    ),
  };
  const hasShape =
    'what_changed' in fields ||
    'why_it_changed' in fields ||
    'how_to_use_additional_guidance' in fields ||
    'what_to_expect' in fields ||
    'follow_up' in fields ||
    'followUp' in fields ||
    'when_to_get_help' in fields ||
    'whenToGetHelp' in fields;
  const ok = hasShape || adaptPatientHandoutDraftHasContent(draft);
  return { draft, ok };
}

function handoutFieldsFromUnknown(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  const nested =
    (raw as { patient_care_summary?: unknown }).patient_care_summary ??
    (raw as { handout?: unknown }).handout ??
    (raw as { patient_handout?: unknown }).patient_handout;
  if (nested && typeof nested === 'object') {
    for (const [key, value] of Object.entries(nested as Record<string, unknown>)) {
      if (out[key] === undefined) out[key] = value;
    }
  }
  return out;
}

function stringArrayFromUnknown(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? '').trim())
      .filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
  }
  return [];
}

export function buildAdaptPatientHandout(input: AdaptPatientHandoutBuildInput): {
  source: AdaptPatientHandoutSource;
  draft: AdaptPatientHandoutDraft;
  plainText: string;
  html: string;
  warnings: string[];
  usedAiDraft: boolean;
} {
  const source = buildAdaptPatientHandoutSource(input);
  const fallback = composeAdaptPatientHandoutFallback(source);
  if (!input.aiDraft) {
    const rendered = renderAdaptPatientHandout(source, fallback);
    return {
      source,
      draft: fallback,
      plainText: rendered.plainText,
      html: rendered.html,
      warnings: [],
      usedAiDraft: false,
    };
  }

  const accepted = acceptAdaptPatientHandoutDraft(input.aiDraft, source);
  if (!accepted.ok) {
    const rendered = renderAdaptPatientHandout(source, fallback);
    return {
      source,
      draft: fallback,
      plainText: rendered.plainText,
      html: rendered.html,
      warnings: [...accepted.warnings, 'Handout draft rejected; deterministic fallback used'],
      usedAiDraft: false,
    };
  }

  const draft = mergeAdaptPatientHandoutDraft(accepted.draft, fallback);
  const rendered = renderAdaptPatientHandout(source, draft);
  return {
    source,
    draft,
    plainText: rendered.plainText,
    html: rendered.html,
    warnings: accepted.warnings,
    usedAiDraft: adaptPatientHandoutDraftHasContent(accepted.draft),
  };
}

export function validateAdaptPatientHandoutBody(body: string): string[] {
  const warnings: string[] = [];
  if (/safety engine|\bllm\b|confidence score|drug therapy problem|AdaptReferenceSelector/i.test(body)) {
    warnings.push('Unsupported clinical documentation content on patient handout');
  }
  if (/\b(?:product monograph|cps|ecps|bugs\s*&\s*drugs)\b/i.test(body)) {
    warnings.push('Clinical references must not appear on the patient handout');
  }
  if (!/YOUR UPDATED MEDICATION PLAN/i.test(body)) {
    warnings.push('Missing patient handout title');
  }
  return warnings;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildDeterministicChangeSummary(
  orig: RenewMedication | null | undefined,
  prop: ProposedPrescription | null | undefined,
  pharmacistChangeSummary?: string,
): AdaptPatientHandoutSource['changeSummary'] {
  const beforeSig =
    orig?.normalized?.directions?.trim() ||
    orig?.raw?.directionsText?.trim() ||
    '';
  const afterSig = prop?.sig?.trim() || '';
  const beforeDrug =
    orig?.normalized?.genericName?.trim() ||
    orig?.normalized?.brandName?.trim() ||
    orig?.raw?.medicationText?.trim() ||
    '';
  const afterDrug =
    prop?.drugName?.trim() ||
    prop?.genericName?.trim() ||
    prop?.brandName?.trim() ||
    '';
  const beforeForm = orig?.normalized?.dosageForm?.trim() || '';
  const afterForm = prop?.dosageForm?.trim() || '';
  const beforeStrength = orig?.normalized?.strength?.trim() || '';
  const afterStrength = prop?.strength?.trim() || '';
  const beforeRoute = orig?.normalized?.route?.trim() || '';
  const afterRoute = prop?.route?.trim() || '';
  const beforeFreq = extractFrequencyHint(beforeSig);
  const afterFreq = prop?.frequency?.trim() || extractFrequencyHint(afterSig);

  const changedFields: string[] = [];
  if (
    beforeDrug &&
    afterDrug &&
    !afterDrug.toLowerCase().includes(beforeDrug.toLowerCase()) &&
    !beforeDrug.toLowerCase().includes(afterDrug.toLowerCase())
  ) {
    changedFields.push('drug');
  }
  if (beforeStrength && afterStrength && beforeStrength.toLowerCase() !== afterStrength.toLowerCase()) {
    changedFields.push('strength');
  }
  if (beforeForm && afterForm && beforeForm.toLowerCase() !== afterForm.toLowerCase()) {
    changedFields.push('dosage_form');
  }
  if (beforeRoute && afterRoute && beforeRoute.toLowerCase() !== afterRoute.toLowerCase()) {
    changedFields.push('route');
  }
  if (
    beforeFreq &&
    afterFreq &&
    normalizeFreq(beforeFreq) !== normalizeFreq(afterFreq)
  ) {
    changedFields.push('frequency');
  } else if (beforeSig && afterSig && normalizeSig(beforeSig) !== normalizeSig(afterSig)) {
    changedFields.push('SIG');
  }

  const beforeLine = [beforeDrug, beforeStrength].filter(Boolean).join(' ');
  const afterLine = [afterDrug, afterStrength || afterForm].filter(Boolean).join(' ');
  const before =
    beforeSig
      ? `${beforeLine ? `${beforeLine} — ` : ''}${beforeSig}`
      : beforeForm || beforeLine || '';
  const after =
    afterSig
      ? `${afterLine ? `${afterLine} — ` : ''}${afterSig}`
      : afterForm || afterLine || '';

  let patientFacing = '';
  if (changedFields.includes('frequency') && beforeFreq && afterFreq) {
    patientFacing = `Your dosing schedule changed from ${beforeFreq.toLowerCase()} to ${afterFreq.toLowerCase()}.`;
  } else if (changedFields.includes('dosage_form') && beforeForm && afterForm) {
    patientFacing = `Your medicine was changed from a ${beforeForm.toLowerCase()} to a ${afterForm.toLowerCase()} form.`;
  } else if (changedFields.includes('drug') && beforeDrug && afterDrug) {
    patientFacing = `Your medicine was changed from ${beforeDrug} to ${afterDrug}.`;
  } else if (changedFields.includes('strength') && beforeStrength && afterStrength) {
    patientFacing = `Your dose strength changed from ${beforeStrength} to ${afterStrength}.`;
  } else if (changedFields.includes('route') && beforeRoute && afterRoute) {
    patientFacing = `How you take this medicine changed from ${beforeRoute.toLowerCase()} to ${afterRoute.toLowerCase()}.`;
  } else if (changedFields.includes('SIG') && beforeSig && afterSig) {
    patientFacing = 'Your dosing instructions were updated.';
  } else if (pharmacistChangeSummary?.trim()) {
    patientFacing = simplifyRationaleDeterministically(pharmacistChangeSummary.trim());
  }

  return {
    before,
    after,
    changedFields,
    patientFacingWhatChanged: patientFacing,
  };
}

function resolvePatientFriendlyReason(code: string, label: string): string {
  const upper = code.toUpperCase();
  if (ADAPT_PATIENT_REASON_TEMPLATES[upper]) {
    return ADAPT_PATIENT_REASON_TEMPLATES[upper]!;
  }
  const lower = `${code} ${label}`.toLowerCase();
  if (/renal|kidney|egfr|creatinine/.test(lower)) {
    return ADAPT_PATIENT_REASON_TEMPLATES.DOSE_RENAL!;
  }
  if (/swallow|dysphagia|liquid|formulation|dosage.?form/.test(lower)) {
    return ADAPT_PATIENT_REASON_TEMPLATES.FORM_SWALLOWING!;
  }
  if (/adherence|simplif|regimen|compliance/.test(lower)) {
    return ADAPT_PATIENT_REASON_TEMPLATES.REGIMEN_ADHERENCE!;
  }
  if (/weight|age|pediatric|geriatric/.test(lower)) {
    return ADAPT_PATIENT_REASON_TEMPLATES.DOSE_WEIGHT_AGE!;
  }
  if (/substitut|therapeutic/.test(lower)) {
    return ADAPT_PATIENT_REASON_TEMPLATES.THERAPEUTIC_SUBSTITUTION!;
  }
  if (/dose|renal function/.test(lower) && /function|adjust/.test(lower)) {
    return ADAPT_PATIENT_REASON_TEMPLATES.DOSE_RENAL!;
  }
  if (/renal function|kidney function/.test(label.toLowerCase())) {
    return ADAPT_PATIENT_REASON_TEMPLATES.DOSE_RENAL!;
  }
  return '';
}

function classifyConfirmedCounselling(
  points?: string[] | null,
): AdaptConfirmedPatientCounselling {
  const empty: AdaptConfirmedPatientCounselling = {
    medicationUse: [],
    administration: [],
    expectedCourse: [],
    adverseEffectsDiscussed: [],
    precautions: [],
    selfCare: [],
    followUp: [],
    whenToSeekCare: [],
  };
  if (!Array.isArray(points)) return empty;

  for (const raw of points) {
    const text = String(raw ?? '').trim();
    if (!text) continue;
    const lower = text.toLowerCase();
    if (
      /seek (?:urgent|immediate)|call (?:911|emergency)|go to (?:the )?(?:er|ed|emergency)|contact .{0,40}(?:if|when).{0,40}(?:worsen|severe|difficulty breathing|swelling)/i.test(
        text,
      ) ||
      /report any|contact (?:your )?(?:pharmacist|doctor|prescriber|pharmacy).{0,60}(?:if|when)/i.test(
        text,
      )
    ) {
      empty.whenToSeekCare.push(text);
    } else if (
      /lab|follow[- ]?up|reassess|months?|weeks?|scheduled|next (?:kidney|blood|appointment)/i.test(
        lower,
      )
    ) {
      empty.followUp.push(text);
    } else if (
      /take with|with food|with (?:your )?(?:largest )?meal|shake well|measuring (?:device|spoon)|same time each day|before use/i.test(
        lower,
      )
    ) {
      empty.administration.push(text);
    } else if (/hydrat|drink|fluids|self[- ]?care/i.test(lower)) {
      empty.selfCare.push(text);
    } else if (/stomach|nausea|side effect|upset|fatigue|muscle|breathing|tolerat/i.test(lower)) {
      empty.adverseEffectsDiscussed.push(text);
    } else if (/expect|improve|should (?:begin|start) to/i.test(lower)) {
      empty.expectedCourse.push(text);
    } else if (/protect|precaution|avoid|do not/i.test(lower)) {
      empty.precautions.push(text);
    } else {
      empty.medicationUse.push(text);
    }
  }
  return empty;
}

function buildHandoutMonitoring(
  step3B?: AdaptStepThreeOptionB,
): AdaptPatientHandoutSource['monitoringFollowUp'] {
  const checks = step3B?.checks ?? [];
  const monitoringChecks = checks.filter(
    (c) =>
      c.type === 'monitoring' ||
      c.status === 'monitoring_recommended' ||
      c.status === 'follow_up_required',
  );
  const plan =
    monitoringChecks[0]?.recommendation?.trim() ||
    monitoringChecks[0]?.summary?.trim() ||
    '';
  const timingMatch = plan.match(
    /(?:in|within|every)\s+[\d–\-]+\s*(?:to\s*[\d–\-]+\s*)?(?:days?|weeks?|months?)/i,
  );
  const monitor: string[] = [];
  if (/renal|kidney|egfr|creatinine/i.test(plan)) monitor.push('renal function');
  if (/glucose|glycemic|hba1c|blood sugar/i.test(plan)) monitor.push('blood sugar');
  return {
    required: Boolean(plan) || monitoringChecks.length > 0,
    plan,
    timing: timingMatch?.[0]?.trim() || '',
    responsibleParty: '',
    monitor,
  };
}

function buildFollowUpLines(source: AdaptPatientHandoutSource): string[] {
  const lines: string[] = [];
  const mon = source.monitoringFollowUp;
  if (!mon.required && !mon.plan) return lines;

  if (mon.monitor.includes('renal function') && /3|6|month/i.test(mon.plan || mon.timing)) {
    lines.push(
      mon.timing
        ? `Have your kidney function checked again ${mon.timing.toLowerCase().replace(/^in\s+/i, 'in ')}.`
        : 'Have your kidney function checked again in 3–6 months.',
    );
  } else if (mon.plan) {
    const simplified = simplifyRationaleDeterministically(mon.plan);
    if (simplified) lines.push(simplified);
  }
  return lines;
}

function simplifyRationaleDeterministically(text: string): string {
  let out = text.trim();
  if (!out) return '';
  out = out
    .replace(/\brenal (?:function|impairment)\b/gi, 'kidney function')
    .replace(/\beGFR\b/g, 'kidney function')
    .replace(/\bcreatinine\b/gi, 'kidney function')
    .replace(/\bpharmacokinetic[^.]*\./gi, '')
    .replace(/\bproduct monograph[^.]*\./gi, '')
    .replace(/\bclinical guidelines?[^.]*\./gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Keep short — first 1–2 sentences max.
  const sentences = out.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 2);
  return sentences.join(' ').trim();
}

function formatMedicationDisplayName(prop?: ProposedPrescription | null): string {
  if (!prop) return '';
  const brand = prop.brandName?.trim();
  const generic = prop.genericName?.trim();
  const drug = prop.drugName?.trim();
  const strength = prop.strength?.trim();
  const form = prop.dosageForm?.trim();
  const base = brand || drug || generic || '';
  if (!base) return [generic, strength, form].filter(Boolean).join(' ');
  const parts = [base];
  if (strength && !base.toLowerCase().includes(strength.toLowerCase())) {
    parts.push(strength);
  }
  if (form && !base.toLowerCase().includes(form.toLowerCase())) {
    parts.push(form);
  }
  return parts.join(' ').replace(/\s{2,}/g, ' ').trim();
}

function formatQuantityDisplay(prop?: ProposedPrescription | null): string {
  if (!prop) return '';
  const qty = prop.quantity;
  if (qty === null || qty === undefined || qty === '') return '';
  const text = String(qty).trim();
  if (!text) return '';
  const form = prop.dosageForm?.trim();
  if (/^\d+(\.\d+)?$/.test(text) && form) {
    const unit = /tablet/i.test(form)
      ? 'tablets'
      : /capsule/i.test(form)
        ? 'capsules'
        : form;
    return `${text} ${unit}`;
  }
  return text;
}

function formatHandoutDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sept',
    'Oct',
    'Nov',
    'Dec',
  ];
  const month = months[Number(m[2]) - 1] || m[2];
  return `${Number(m[3])}-${month}-${m[1]}`;
}

function sanitizePlaceholder(
  value: string | null | undefined,
  placeholders: string[],
): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (placeholders.some((p) => p.toLowerCase() === text.toLowerCase())) return '';
  return text;
}

function extractFrequencyHint(sig: string): string {
  const lower = sig.toLowerCase();
  if (/twice\s*(?:daily|a day|per day)|bid\b/.test(lower)) return 'twice daily';
  if (/once\s*(?:daily|a day|per day)|daily\b|od\b|qd\b/.test(lower)) return 'once daily';
  if (/three times|tid\b/.test(lower)) return 'three times daily';
  if (/four times|qid\b/.test(lower)) return 'four times daily';
  if (/every\s+other\s+day/.test(lower)) return 'every other day';
  if (/weekly|once a week/.test(lower)) return 'once weekly';
  return '';
}

function normalizeFreq(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeSig(value: string): string {
  return value.toLowerCase().replace(/[.\s]+/g, ' ').trim();
}

function isMostlySigDuplicate(text: string, sig: string): boolean {
  if (!sig.trim()) return false;
  const a = normalizeSig(text);
  const b = normalizeSig(sig);
  return a === b || a.includes(b) || b.includes(a);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.map((v) => String(v ?? '').trim()).filter(Boolean));
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function renderPharmacyContactPlain(source: AdaptPatientHandoutSource): string {
  const lines: string[] = [];
  if (source.pharmacy.name) lines.push(source.pharmacy.name);
  if (source.pharmacy.phone) lines.push(`Phone: ${source.pharmacy.phone}`);
  if (source.pharmacy.fax) lines.push(`Fax: ${source.pharmacy.fax}`);
  if (source.pharmacy.address) lines.push(source.pharmacy.address);
  if (source.pharmacy.pharmacistName) {
    lines.push(`Your pharmacist: ${source.pharmacy.pharmacistName}`);
  }
  return lines.join('\n');
}

function renderPharmacyContactHtml(source: AdaptPatientHandoutSource): string {
  const lines: string[] = [];
  if (source.pharmacy.name) {
    lines.push(`<p><strong>${escapeHtml(source.pharmacy.name)}</strong></p>`);
  }
  if (source.pharmacy.phone) {
    lines.push(`<p>Phone: ${escapeHtml(source.pharmacy.phone)}</p>`);
  }
  if (source.pharmacy.fax) {
    lines.push(`<p>Fax: ${escapeHtml(source.pharmacy.fax)}</p>`);
  }
  if (source.pharmacy.address) {
    lines.push(`<p>${escapeHtml(source.pharmacy.address)}</p>`);
  }
  if (source.pharmacy.pharmacistName) {
    lines.push(`<p>Your pharmacist: ${escapeHtml(source.pharmacy.pharmacistName)}</p>`);
  }
  return lines.join('\n');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

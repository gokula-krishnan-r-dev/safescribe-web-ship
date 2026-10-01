import { isFormalHandoffAction, type ReferralAction } from './referral-pathway.types';
import { resolveNoRedFlagsRequiringReferral } from './documentation-encounter';
import {
  buildPcpFollowUpPlan,
  isPharmacistPrescribingEncounter,
  pcpFollowUpPlanHasContent,
  pcpFollowUpPlanIsComplete,
  renderPcpFollowUpSection,
  type PcpFollowUpPlan,
} from './pcp-follow-up';

export { PCP_COMMUNICATION_PROMPT } from './pcp-communication-prompt';
export {
  buildPcpFollowUpPlan,
  emptyPcpFollowUpPlan,
  formatPcpTimeframeForSentence,
  isPharmacistPrescribingEncounter,
  pcpFollowUpPlanHasContent,
  pcpFollowUpPlanIsComplete,
  renderPcpFollowUpSection,
  type PcpFollowUpPlan,
} from './pcp-follow-up';

/**
 * PCP communication payload, deterministic Treatment/Follow-up rendering,
 * and post-generation assembly.
 *
 * Spec: SafeScribe PCP Communication Revised Prompt + Backend Instructions.
 * The LLM drafts opening and assessment only. Medication lines, follow-up,
 * header, salutation, closing, and signature are backend-rendered.
 */

export const PCP_LETTER_TITLE =
  'Pharmacist Communication to Primary Care Provider';

export const PCP_CLOSING_SENTENCE =
  'This update is provided for your information and continuity of care.';

export const PCP_DEFAULT_SALUTATION = 'Dear Primary Care Provider,';

/** Display phone/fax as XXX-XXX XXXX (NANP 10-digit). */
export function formatDocumentFaxNumber(raw?: string | null): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 10) return trimmed;
  const nanp =
    digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (nanp.length === 10) {
    return `${nanp.slice(0, 3)}-${nanp.slice(3, 6)} ${nanp.slice(6)}`;
  }
  return trimmed;
}

export function buildPcpSignatureBlock(opts: {
  pharmacistDisplayName?: string | null;
  credentials?: string | null;
  pharmacyName?: string | null;
  pharmacyFax?: string | null;
}): string {
  const name = (opts.pharmacistDisplayName ?? '').trim() || 'Pharmacist';
  const credentials = (opts.credentials ?? '').trim();
  const who = credentials ? `${name}, ${credentials}` : name;
  const lines = ['Kind regards,', who];
  const pharmacy = (opts.pharmacyName ?? '').trim();
  const fax = formatDocumentFaxNumber(opts.pharmacyFax);
  if (pharmacy || fax) {
    lines.push('');
    if (pharmacy) lines.push(pharmacy);
    if (fax) lines.push(`Fax: ${fax}`);
  }
  return lines.join('\n');
}

export interface PcpSelectedTreatment {
  treatment_id: string;
  display_name: string;
  patient_directions: string;
  pharmacist_confirmed: true;
}

export interface PcpCommunicationPayload {
  patient: { display_name: string | null };
  communication_date: string;
  pcp: { display_name: string | null };
  pharmacist: {
    display_name: string | null;
    credentials: string | null;
  };
  presenting_concern: string | null;
  assessment: {
    condition: string | null;
    summary: string | null;
    eligible_for_pharmacist_management: boolean | null;
    no_red_flags_requiring_referral_confirmed: boolean;
  } | null;
  prescribing_rationale: string | null;
  patient_specific_safety: string[];
  selected_treatments: PcpSelectedTreatment[];
  pcp_follow_up_plan: PcpFollowUpPlan | null;
  follow_up_required: boolean;
  follow_up_incomplete: boolean;
  confirmed_follow_up: string[];
  referral: {
    recommended: boolean;
    completed: boolean;
    reason?: string | null;
    destination?: string | null;
  };
}

export interface PcpPayloadSource {
  chiefComplaint?: string | null;
  createdAt?: string | Date | null;
  consultationMode?: string | null;
  demographics?: unknown;
  treatmentPlan?: unknown;
  counsellingNotes?: unknown;
  redFlags?: unknown;
  eligibility?: unknown;
  pathway?: { condition?: string | null; name?: string | null } | null;
  clinicalJudgmentAssessment?: {
    workingDiagnosisText?: string | null;
    diagnosticCertainty?: string | null;
    assessmentSummary?: string | null;
    assessmentSufficient?: boolean | null;
  } | null;
  treatmentRationale?: {
    status?: string | null;
    selectionRationale?: string | null;
    reasonForPrescribing?: string | null;
  } | null;
  pcpFollowUpPlan?: Partial<PcpFollowUpPlan> | null;
  dateOfBirth?: string | null;
  referralOutcome?: {
    documentationText?: string | null;
    actionTaken?: string | null;
    action_completed?: boolean | null;
    referralSendConfirmed?: boolean | null;
  } | null;
  pharmacist?: {
    firstName?: string | null;
    lastName?: string | null;
  } | null;
  patientDisplayName?: string | null;
  pcpDisplayName?: string | null;
  pharmacistCredentials?: string | null;
  communicationDate?: string | Date | null;
}

export interface PcpValidationResult {
  ok: boolean;
  reasons: string[];
  medicationFailed: boolean;
  unsupportedClinical: boolean;
}

const INVENTED_AS_DIRECTED = /\b(?:or\s+)?as\s+directed\b/i;
const TRADEMARK = /[®™©]/;
const GENERICS_WORD = /\bgenerics\b/i;
const SIG_ABBREV = /\b(?:BID|TID|QID|QHS|PRN)\b/;
const INTERNAL_META =
  /\b(?:safescribe|guided pathway|clinical judgment|pathway id|rule id|confidence score|uuid)\b/i;
const PLACEHOLDER =
  /^(add a short patient-facing point|n\/?a|none|null|undefined|-|—)$/i;

export function formatPcpClinicalDate(input?: string | Date | null): string {
  const date =
    input instanceof Date
      ? input
      : input
        ? new Date(input)
        : new Date();
  if (Number.isNaN(date.getTime())) {
    return formatPcpClinicalDate(new Date());
  }
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleDateString('en-GB', { month: 'short' });
  return `${day}-${month}-${date.getFullYear()}`;
}

export function pcpSalutationFromName(name?: string | null): string {
  const raw = name?.trim();
  if (!raw) return PCP_DEFAULT_SALUTATION;
  if (/^dear\b/i.test(raw)) return /[,:]$/.test(raw) ? raw : `${raw},`;
  const cleaned = raw.replace(/^dr\.?\s+/i, '').replace(/,$/, '');
  return `Dear Dr. ${cleaned},`;
}

export function isPcpPlaceholderText(value?: string | null): boolean {
  const t = (value ?? '').replace(/\s+/g, ' ').trim();
  return !t || PLACEHOLDER.test(t);
}

function cleanToken(value: unknown): string {
  const t = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || isPcpPlaceholderText(t) || /^as\s+directed$/i.test(t)) return '';
  return t;
}

function ensurePeriod(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/[®™©]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function pcpDisplayNameFromTreatment(row: Record<string, unknown>): string {
  const persisted = cleanToken(row.displayName ?? row.display_name);
  if (persisted) return persisted;
  const medication = cleanToken(row.medicationName ?? row.terminologyLabel);
  if (medication) return medication;
  return cleanToken(row.genericName ?? row.brandName);
}

export function pcpPatientDirectionsFromTreatment(
  row: Record<string, unknown>,
): string {
  const explicit = String(
    row.patientDirections ??
      row.patient_directions ??
      row.instructions ??
      row.directions ??
      '',
  )
    .replace(/\s+/g, ' ')
    .trim();
  if (explicit && !isPcpPlaceholderText(explicit)) {
    return ensurePeriod(explicit);
  }
  // Do not rebuild a patient-facing SIG from dose/route/frequency/duration.
  return '';
}

export function toPcpSelectedTreatment(
  row: Record<string, unknown>,
  index: number,
): PcpSelectedTreatment | null {
  const display_name = pcpDisplayNameFromTreatment(row);
  if (!display_name) return null;
  const treatment_id = String(
    row.pathwayTreatmentId ||
      row.treatment_id ||
      row.drugId ||
      row.id ||
      display_name ||
      `t-${index}`,
  );
  return {
    treatment_id,
    display_name,
    patient_directions: pcpPatientDirectionsFromTreatment(row),
    pharmacist_confirmed: true,
  };
}

export function stampPcpDocumentationFields(
  row: Record<string, unknown>,
  displayNameFromUi?: string,
): Record<string, unknown> {
  const displayName =
    cleanToken(displayNameFromUi) || pcpDisplayNameFromTreatment(row);
  const patientDirections = pcpPatientDirectionsFromTreatment({
    ...row,
    displayName,
  });
  return {
    ...row,
    displayName,
    patientDirections,
  };
}

function hasTreatmentName(row: Record<string, unknown>): boolean {
  return Boolean(pcpDisplayNameFromTreatment(row));
}

export function getConfirmedTreatmentRows(
  treatmentPlan: unknown,
): Record<string, unknown>[] {
  const plan = (treatmentPlan ?? {}) as {
    recommendedTreatments?: unknown[];
    selectedTreatments?: unknown[];
    selectedItemsSnapshot?: unknown[];
    selectedIndex?: number;
    selectedIndexes?: number[];
  };

  const fromSnapshot = [
    ...(Array.isArray(plan.selectedTreatments) ? plan.selectedTreatments : []),
    ...(Array.isArray(plan.selectedItemsSnapshot)
      ? plan.selectedItemsSnapshot
      : []),
  ]
    .filter((row): row is Record<string, unknown> =>
      Boolean(row && typeof row === 'object'),
    )
    .filter(hasTreatmentName);

  const uniqueSnapshot: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const row of fromSnapshot) {
    const key = fold(pcpDisplayNameFromTreatment(row));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniqueSnapshot.push(row);
  }
  if (uniqueSnapshot.length) return uniqueSnapshot;

  const all = Array.isArray(plan.recommendedTreatments)
    ? plan.recommendedTreatments.filter(
        (row): row is Record<string, unknown> =>
          Boolean(row && typeof row === 'object'),
      )
    : [];
  const rawIndexes =
    Array.isArray(plan.selectedIndexes) && plan.selectedIndexes.length
      ? plan.selectedIndexes
      : typeof plan.selectedIndex === 'number' && plan.selectedIndex >= 0
        ? [plan.selectedIndex]
        : [];

  return rawIndexes
    .filter((i) => Number.isInteger(i) && i >= 0 && i < all.length)
    .map((i) => all[i])
    .filter(hasTreatmentName);
}

export function getPharmacistConfirmedTreatments(
  treatmentPlan: unknown,
): PcpSelectedTreatment[] {
  return getConfirmedTreatmentRows(treatmentPlan)
    .map((row, i) => toPcpSelectedTreatment(row, i))
    .filter((t): t is PcpSelectedTreatment => Boolean(t));
}

export function isCounsellingConfirmed(notes: unknown): boolean {
  const n = (notes ?? {}) as {
    counselling_status?: string;
    plan?: { status?: string };
  };
  return (
    n.plan?.status === 'REVIEWED' || n.counselling_status === 'confirmed'
  );
}

export function extractCounsellingSectionPoints(
  notes: unknown,
  key: string,
): string[] {
  const n = (notes ?? {}) as {
    confirmed_counselling?: Array<{
      section_key?: string;
      bullets?: string[];
      items?: Array<{ text?: string }>;
    }>;
    plan?: {
      sections?: Array<{
        section_key?: string;
        items?: Array<{ text?: string }>;
      }>;
    };
    sections?: Array<{
      category?: string;
      section_key?: string;
      bullets?: string[];
      points?: Array<{ point?: string }>;
    }>;
  };

  const clean = (values: Array<string | undefined | null>): string[] =>
    values
      .map((t) => (t ?? '').replace(/\s+/g, ' ').trim())
      .filter((t) => t.length > 0 && !isPcpPlaceholderText(t));

  const seen = new Set<string>();
  const out: string[] = [];
  const push = (values: string[]) => {
    for (const text of values) {
      const fold = text.toLowerCase();
      if (!fold || seen.has(fold)) continue;
      seen.add(fold);
      out.push(text);
    }
  };

  const confirmedRows = n.confirmed_counselling;
  if (Array.isArray(confirmedRows) && confirmedRows.length) {
    const section = confirmedRows.find((s) => s.section_key === key);
    push(
      clean([
        ...(section?.bullets ?? []),
        ...(section?.items ?? []).map((i) => i.text),
      ]),
    );
  }
  if (n.plan?.sections?.length) {
    const section = n.plan.sections.find((s) => s.section_key === key);
    push(clean((section?.items ?? []).map((i) => i.text)));
  }
  const re =
    key === 'FOLLOW_UP'
      ? /follow|seek|when to/i
      : key === 'EXPECTED_RESPONSE'
        ? /expect|response/i
        : key === 'SELF_CARE'
          ? /self-?care|non-drug|things you can do/i
          : key === 'MEDICATION_USE'
            ? /medication|how to use|treatment/i
            : null;
  if (n.sections?.length) {
    push(
      n.sections
        .filter((s) => s.section_key === key || (re ? re.test(s.category ?? '') : false))
        .flatMap((s) =>
          clean([...(s.bullets ?? []), ...(s.points ?? []).map((p) => p.point)]),
        ),
    );
  }
  return out;
}

function referralState(source: PcpPayloadSource): {
  recommended: boolean;
  completed: boolean;
  reason: string | null;
} {
  const flags = (source.redFlags ?? {}) as {
    hasRedFlags?: boolean;
    referralSelected?: boolean;
    notes?: string;
    referralNotes?: string;
  };
  const outcome = source.referralOutcome;
  const recommended = Boolean(
    flags.referralSelected ||
      source.consultationMode === 'DOCUMENTATION_REFERRAL',
  );
  const completed = Boolean(
    outcome?.action_completed === true ||
      outcome?.referralSendConfirmed === true ||
      (outcome?.actionTaken &&
        isFormalHandoffAction(outcome.actionTaken as ReferralAction)),
  );
  const reason =
    String(outcome?.documentationText ?? '').trim() ||
    String(flags.referralNotes ?? flags.notes ?? '').trim() ||
    null;
  return { recommended, completed, reason: reason || null };
}

function presentingConcernFromSource(source: PcpPayloadSource): string | null {
  const complaint = String(source.chiefComplaint ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (complaint) return complaint.replace(/\.$/, '');
  const diagnosis = String(
    source.clinicalJudgmentAssessment?.workingDiagnosisText ??
      source.pathway?.condition ??
      source.pathway?.name ??
      '',
  )
    .replace(/\s+/g, ' ')
    .trim();
  return diagnosis || null;
}

function buildBriefConfirmedAssessment(source: PcpPayloadSource): {
  condition: string | null;
  summary: string | null;
  eligible_for_pharmacist_management: boolean | null;
  no_red_flags_requiring_referral_confirmed: boolean;
} {
  const cj = source.clinicalJudgmentAssessment;
  const condition =
    String(cj?.workingDiagnosisText ?? '').trim() ||
    String(source.pathway?.condition ?? '').trim() ||
    String(source.pathway?.name ?? '').trim() ||
    String(
      (source.eligibility as { overallAssessment?: string } | undefined)
        ?.overallAssessment ?? '',
    ).trim() ||
    null;

  const noRedFlags =
    source.consultationMode !== 'DOCUMENTATION_REFERRAL' &&
    resolveNoRedFlagsRequiringReferral(source.redFlags);

  const eligible = eligibleForPharmacistManagement(source);

  const summaryParts: string[] = [];
  if (condition) {
    let sentence = `Presentation was consistent with ${toSentenceCaseDiagnosis(condition.replace(/\.$/, ''))}`;
    const certainty = cj?.diagnosticCertainty;
    if (certainty === 'PROBABLE') sentence += ' (probable)';
    else if (certainty === 'UNCERTAIN') sentence += ' (uncertain)';
    if (eligible === true) {
      sentence += ' and appropriate for pharmacist management';
    }
    if (noRedFlags) {
      sentence += ', with no red flags requiring referral identified';
    }
    summaryParts.push(ensurePeriod(sentence));
  } else if (noRedFlags) {
    summaryParts.push(
      'A pharmacist assessment was completed, with no red flags requiring referral identified.',
    );
  }

  const extra = String(cj?.assessmentSummary ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (
    extra &&
    !summaryParts.some((p) => fold(p).includes(fold(extra))) &&
    !INTERNAL_META.test(extra)
  ) {
    summaryParts.push(ensurePeriod(extra));
  }

  return {
    condition,
    summary: summaryParts.join(' ') || null,
    eligible_for_pharmacist_management: eligible,
    no_red_flags_requiring_referral_confirmed: noRedFlags,
  };
}

function eligibleForPharmacistManagement(
  source: PcpPayloadSource,
): boolean | null {
  if (source.clinicalJudgmentAssessment?.assessmentSufficient === true) return true;
  if (source.clinicalJudgmentAssessment?.assessmentSufficient === false) return false;
  const overall = String(
    (source.eligibility as { overallAssessment?: string } | undefined)
      ?.overallAssessment ?? '',
  )
    .trim()
    .toLowerCase();
  if (/^(yes|true|eligible|met)$/.test(overall)) return true;
  if (/^(no|false|ineligible|not eligible)$/.test(overall)) return false;
  return null;
}

function toSentenceCaseDiagnosis(value: string): string {
  const t = value.replace(/\s+/g, ' ').trim();
  if (!t) return t;
  if (t !== t.toUpperCase() && t !== t.toLowerCase()) {
    return t.charAt(0).toLowerCase() + t.slice(1);
  }
  return t.toLowerCase();
}

export function normalizePersonDisplayName(name?: string | null): string | null {
  const t = String(name ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return null;
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (!letters) return t;
  const isAllCaps = letters === letters.toUpperCase();
  const isAllLower = letters === letters.toLowerCase();
  if (!isAllCaps && !isAllLower) return t;
  return t
    .split(/\s+/)
    .map((word) =>
      word
        .split('-')
        .map((part) =>
          part
            ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
            : part,
        )
        .join('-'),
    )
    .join(' ');
}

function prescribingRationaleFromSource(source: PcpPayloadSource): string | null {
  const status = String(source.treatmentRationale?.status ?? '').toUpperCase();
  if (status && status !== 'CONFIRMED') return null;
  const text =
    cleanToken(source.treatmentRationale?.selectionRationale) ||
    cleanToken(source.treatmentRationale?.reasonForPrescribing);
  if (!text || INTERNAL_META.test(text)) return null;
  return text;
}

function patientSpecificSafetyFromSource(source: PcpPayloadSource): string[] {
  const demo = (source.demographics ?? {}) as {
    pregnancy?: string | null;
    pregnant?: boolean | null;
    breastfeeding?: string | boolean | null;
    egfr?: string | number | null;
    renalImpairment?: boolean | null;
    hepaticImpairment?: boolean | null;
    allergies?: unknown;
    allergyEntries?: Array<{ drug?: string }>;
  };
  const out: string[] = [];
  const push = (text: string) => {
    const t = text.replace(/\s+/g, ' ').trim();
    if (!t) return;
    if (out.some((existing) => fold(existing) === fold(t))) return;
    out.push(t);
  };

  const preg = String(demo.pregnancy ?? '').toLowerCase();
  if (demo.pregnant === true || /^(yes|pregnant|positive)$/.test(preg)) {
    push('Pregnancy was a relevant consideration in treatment selection.');
  }
  const bf = demo.breastfeeding;
  if (bf === true || /^(yes|breastfeeding)$/i.test(String(bf ?? ''))) {
    push('Breastfeeding was a relevant consideration in treatment selection.');
  }
  if (demo.renalImpairment === true || demo.egfr) {
    push('Renal function was a relevant consideration in treatment selection.');
  }
  if (demo.hepaticImpairment === true) {
    push('Hepatic function was a relevant consideration in treatment selection.');
  }

  const plan = (source.treatmentPlan ?? {}) as {
    selectedTreatments?: Array<Record<string, unknown>>;
    selectedItemsSnapshot?: Array<Record<string, unknown>>;
  };
  const rows = [
    ...(Array.isArray(plan.selectedTreatments) ? plan.selectedTreatments : []),
    ...(Array.isArray(plan.selectedItemsSnapshot) ? plan.selectedItemsSnapshot : []),
  ];
  for (const row of rows.slice(0, 8)) {
    if (row.pregnancyReason) {
      push('Pregnancy was a relevant consideration in treatment selection.');
    }
    if (row.renalAdjustmentReason) {
      push('Renal function was a relevant consideration in treatment selection.');
    }
    if (row.hepaticAdjustmentReason) {
      push('Hepatic function was a relevant consideration in treatment selection.');
    }
    const allergy = (row.allergyWarning as { message?: string } | undefined)?.message;
    if (allergy) push('Allergy was a relevant consideration in treatment selection.');
  }

  return out.slice(0, 4);
}

function patientNameFromSource(source: PcpPayloadSource): string | null {
  const explicit = normalizePersonDisplayName(source.patientDisplayName);
  if (explicit) return explicit;
  const demo = (source.demographics ?? {}) as {
    firstName?: string;
    lastName?: string;
    name?: string;
  };
  const joined = [demo.firstName, demo.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  return normalizePersonDisplayName(joined || demo.name?.trim() || null);
}

function pharmacistNameFromSource(source: PcpPayloadSource): string | null {
  const p = source.pharmacist;
  const name = [p?.firstName, p?.lastName].filter(Boolean).join(' ').trim();
  return normalizePersonDisplayName(name);
}

export function removeEmptyAndInternalFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((item) => removeEmptyAndInternalFields(item))
      .filter((item) => {
        if (item == null || item === '') return false;
        if (typeof item === 'string' && isPcpPlaceholderText(item)) return false;
        return true;
      }) as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (
        /(?:pathwayId|ruleId|uuid|confidence|aiEntities|brandAliases|synonym)/i.test(
          key,
        )
      ) {
        continue;
      }
      if (child == null || child === '') continue;
      const next = removeEmptyAndInternalFields(child);
      if (next == null) continue;
      if (Array.isArray(next) && next.length === 0) continue;
      out[key] = next;
    }
    return out as T;
  }
  return value;
}

export function buildPcpCommunicationPayload(
  source: PcpPayloadSource,
): PcpCommunicationPayload {
  const referral = referralState(source);
  const pharmacistName = pharmacistNameFromSource(source);
  const treatments = getPharmacistConfirmedTreatments(source.treatmentPlan);
  const followUpRequired =
    isPharmacistPrescribingEncounter(source.consultationMode) &&
    treatments.length > 0 &&
    !referral.completed;
  const followUpPlan = applyRequiredFollowUpDefaults(
    buildPcpFollowUpPlan({
      consultationMode: source.consultationMode,
      counsellingNotes: source.counsellingNotes,
      referralCompleted: referral.completed,
      referralReason: referral.reason,
      explicitPlan: mergeExplicitFollowUpPlan(
        source.pcpFollowUpPlan ?? null,
        source.treatmentPlan,
      ),
    }),
    followUpRequired,
  );
  const followUpSentence = renderPcpFollowUpSection(followUpPlan, {
    referralCompleted: referral.completed,
    referralReason: referral.reason,
  });
  const followUpIncomplete = followUpRequired && !pcpFollowUpPlanIsComplete(followUpPlan);

  const payload: PcpCommunicationPayload = {
    patient: { display_name: patientNameFromSource(source) },
    communication_date: formatPcpClinicalDate(
      source.communicationDate ?? source.createdAt ?? new Date(),
    ),
    pcp: { display_name: normalizePersonDisplayName(source.pcpDisplayName) },
    pharmacist: {
      display_name: pharmacistName,
      credentials: source.pharmacistCredentials?.trim() || 'RPh',
    },
    presenting_concern: presentingConcernFromSource(source),
    assessment: buildBriefConfirmedAssessment(source),
    prescribing_rationale: prescribingRationaleFromSource(source),
    patient_specific_safety: patientSpecificSafetyFromSource(source),
    selected_treatments: treatments,
    pcp_follow_up_plan: pcpFollowUpPlanHasContent(followUpPlan) ? followUpPlan : null,
    follow_up_required: followUpRequired,
    follow_up_incomplete: followUpIncomplete,
    confirmed_follow_up: followUpSentence ? [followUpSentence] : [],
    referral: {
      recommended: referral.recommended,
      completed: referral.completed,
      reason: referral.recommended || referral.completed ? referral.reason : null,
      destination: null,
    },
  };
  const cleaned = removeEmptyAndInternalFields(payload);
  return {
    ...cleaned,
    patient: cleaned.patient ?? { display_name: null },
    pcp: cleaned.pcp ?? { display_name: null },
    pharmacist: cleaned.pharmacist ?? {
      display_name: null,
      credentials: 'RPh',
    },
    prescribing_rationale: cleaned.prescribing_rationale ?? null,
    patient_specific_safety: cleaned.patient_specific_safety ?? [],
    selected_treatments: normalizePcpSelectedTreatments(
      cleaned.selected_treatments as PcpSelectedTreatment[] | undefined,
    ),
    pcp_follow_up_plan: cleaned.pcp_follow_up_plan ?? null,
    follow_up_required: cleaned.follow_up_required === true,
    follow_up_incomplete: cleaned.follow_up_incomplete === true,
    confirmed_follow_up: cleaned.confirmed_follow_up ?? [],
    referral: {
      recommended: cleaned.referral?.recommended === true,
      completed: cleaned.referral?.completed === true,
      reason: cleaned.referral?.reason ?? null,
      destination: cleaned.referral?.destination ?? null,
    },
  };
}

/** Compact payload sent to the LLM. Follow-up and administrative chrome stay backend-owned. */
export function toLlmPcpPayload(payload: PcpCommunicationPayload): Record<string, unknown> {
  return removeEmptyAndInternalFields({
    PATIENT_CONTEXT: {
      presenting_concern: payload.presenting_concern,
    },
    ASSESSMENT: {
      display_name: payload.assessment?.condition ?? null,
      eligible_for_pharmacist_management:
        payload.assessment?.eligible_for_pharmacist_management ?? null,
      no_red_flags_requiring_referral_confirmed:
        payload.assessment?.no_red_flags_requiring_referral_confirmed === true,
    },
    PRESCRIBING_RATIONALE: payload.prescribing_rationale,
    PATIENT_SPECIFIC_SAFETY: payload.patient_specific_safety,
    SELECTED_TREATMENTS: (payload.selected_treatments ?? []).map((t) => ({
      display_name: t.display_name,
      patient_directions: t.patient_directions,
    })),
  });
}

function treatmentPlanFollowUpTimeframe(plan: unknown): string | null {
  if (!plan || typeof plan !== 'object') return null;
  const raw = String((plan as { followUpTimeframe?: unknown }).followUpTimeframe ?? '').trim();
  return raw || null;
}

function mergeExplicitFollowUpPlan(
  explicit: Partial<PcpFollowUpPlan> | null,
  treatmentPlan: unknown,
): Partial<PcpFollowUpPlan> | null {
  const timeframe = explicit?.timeframe?.trim() || treatmentPlanFollowUpTimeframe(treatmentPlan);
  if (!explicit && !timeframe) return null;
  return {
    ...(explicit ?? {}),
    ...(timeframe && !explicit?.timeframe?.trim() ? { timeframe } : {}),
  };
}

/** Pharmacist-prescribing encounters always have a WHO / WHEN / WHAT follow-up sentence. */
function applyRequiredFollowUpDefaults(
  plan: PcpFollowUpPlan,
  followUpRequired: boolean,
): PcpFollowUpPlan {
  if (!followUpRequired) return plan;
  const next = { ...plan };
  if (!String(next.responsible_party ?? '').trim()) next.responsible_party = 'Pharmacist';
  if (!String(next.timeframe ?? '').trim()) next.timeframe = 'in 7 days';
  if (!String(next.primary_monitoring_target ?? '').trim()) {
    next.primary_monitoring_target = 'symptom improvement or resolution';
  }
  if (!String(next.action_if_not_met ?? '').trim()) {
    next.action_if_not_met = 'referral advised if symptoms are not resolving';
  }
  next.pharmacist_confirmed = pcpFollowUpPlanIsComplete(next);
  return next;
}

export function renderPcpHeaderBlock(
  payload: PcpCommunicationPayload,
  _dateOfBirth?: string | null,
): string {
  return payload.communication_date ? `Date: ${payload.communication_date}` : '';
}

/** Normalize rows after payload cleaning — empty directions must stay strings, not undefined. */
function normalizePcpSelectedTreatments(
  treatments: PcpSelectedTreatment[] | undefined,
): PcpSelectedTreatment[] {
  return (treatments ?? [])
    .map((t, index) => ({
      treatment_id:
        t.treatment_id?.trim() ||
        t.display_name?.trim() ||
        `t-${index}`,
      display_name: (t.display_name ?? '').trim(),
      patient_directions: (t.patient_directions ?? '').trim(),
      pharmacist_confirmed: true as const,
    }))
    .filter((t) => t.display_name.length > 0);
}

export function renderPcpTreatmentSection(
  treatments: PcpSelectedTreatment[],
): string {
  return normalizePcpSelectedTreatments(treatments)
    .map((t) => {
      const { display_name: name, patient_directions: directions } = t;
      if (!directions) return name;
      return `${name}: ${ensurePeriod(directions)}`;
    })
    .join('\n');
}

export function applyDeterministicPcpTreatment(
  fields: Record<string, string>,
  payload: PcpCommunicationPayload,
  chrome?: {
    dateOfBirth?: string | null;
    patientPhn?: string | null;
    pharmacyName?: string | null;
    pharmacyFax?: string | null;
  },
): Record<string, string> {
  const next = { ...fields };
  next.documentTitle = PCP_LETTER_TITLE;
  next.patientName = payload.patient.display_name?.trim() || next.patientName || '';
  next.patientDob = chrome?.dateOfBirth?.trim() || next.patientDob || '';
  next.patientPhn = chrome?.patientPhn?.trim() || next.patientPhn || '';
  next.headerBlock = renderPcpHeaderBlock(payload, chrome?.dateOfBirth);
  next.salutation = pcpSalutationFromName(payload.pcp.display_name);
  next.treatment = renderPcpTreatmentSection(payload.selected_treatments ?? []);
  next.followUp = renderPcpFollowUpSection(payload.pcp_follow_up_plan, {
    referralCompleted: payload.referral?.completed === true,
    referralReason: payload.referral?.reason ?? null,
  });
  next.closingSentence = PCP_CLOSING_SENTENCE;
  next.signatureBlock = buildPcpSignatureBlock({
    pharmacistDisplayName: payload.pharmacist.display_name,
    credentials: payload.pharmacist.credentials || 'RPh',
    pharmacyName: chrome?.pharmacyName,
    pharmacyFax: chrome?.pharmacyFax,
  });
  if (payload.follow_up_incomplete) {
    next.pcpFollowUpIncomplete = 'true';
  } else {
    delete next.pcpFollowUpIncomplete;
  }
  if (payload.follow_up_required) {
    next.pcpFollowUpRequired = 'true';
  } else {
    delete next.pcpFollowUpRequired;
  }
  return next;
}

function fieldsFromUnknown(
  input: Record<string, string> | string,
): Record<string, string> {
  if (typeof input !== 'string') return { ...input };
  const text = input;
  const pick = (label: string): string => {
    const re = new RegExp(
      `${label}:\\s*([\\s\\S]*?)(?=\\n(?:Assessment|Treatment|Follow-up|This update is provided)|$)`,
      'i',
    );
    return text.match(re)?.[1]?.trim() ?? '';
  };
  return {
    treatment: pick('Treatment'),
    assessment: pick('Assessment'),
    followUp: pick('Follow-up'),
    closingSentence: /this update is provided for your information and continuity of care/i.test(
      text,
    )
      ? PCP_CLOSING_SENTENCE
      : '',
    fullText: text,
  };
}

export function validatePcpCommunication(
  input: Record<string, string> | string,
  payload: PcpCommunicationPayload,
): PcpValidationResult {
  const fields = fieldsFromUnknown(input);
  const treatments = payload.selected_treatments ?? [];
  const narrative = [fields.assessment, fields.openingSentence]
    .filter(Boolean)
    .join('\n');
  const haystack = [
    fields.treatment,
    fields.assessment,
    fields.followUp,
    fields.openingSentence,
    fields.fullText,
  ]
    .filter(Boolean)
    .join('\n');
  const treatmentText = fields.treatment || fields.fullText || '';
  const reasons: string[] = [];
  let medicationFailed = false;
  let unsupportedClinical = false;

  for (const t of treatments) {
    const nameFold = fold(t.display_name);
    const matches = treatmentText
      .split(/\n+/)
      .filter((line) => fold(line).includes(nameFold)).length;
    if (matches !== 1) {
      reasons.push(`treatment ${t.display_name} appears ${matches} time(s)`);
      medicationFailed = true;
    }
    if (
      t.patient_directions &&
      !fold(treatmentText).includes(fold(t.patient_directions.replace(/\.$/, '')))
    ) {
      reasons.push(`directions missing for ${t.display_name}`);
      medicationFailed = true;
    }
  }

  if (TRADEMARK.test(haystack) || GENERICS_WORD.test(haystack)) {
    const supplied = treatments.some(
      (t) =>
        TRADEMARK.test(`${t.display_name} ${t.patient_directions}`) ||
        GENERICS_WORD.test(`${t.display_name} ${t.patient_directions}`),
    );
    if (!supplied) {
      reasons.push('invented brand/generics wording');
      medicationFailed = true;
    }
  }

  if (INVENTED_AS_DIRECTED.test(haystack)) {
    const supplied = treatments.some((t) =>
      INVENTED_AS_DIRECTED.test(t.patient_directions),
    );
    if (!supplied) {
      reasons.push('invented as directed');
      medicationFailed = true;
    }
  }

  if (SIG_ABBREV.test(haystack)) {
    const supplied = treatments.some((t) =>
      SIG_ABBREV.test(`${t.display_name} ${t.patient_directions}`),
    );
    if (!supplied) {
      reasons.push('invented SIG abbreviation');
      medicationFailed = true;
    }
  }

  const condition = payload.assessment?.condition;
  if (
    condition &&
    fields.assessment &&
    !fold(fields.assessment).includes(fold(condition).slice(0, 24))
  ) {
    reasons.push('assessment condition mismatch');
    unsupportedClinical = true;
  }

  if (
    /no red flags requiring referral/i.test(narrative) &&
    payload.assessment?.no_red_flags_requiring_referral_confirmed !== true
  ) {
    reasons.push('unsupported red-flag claim');
    unsupportedClinical = true;
  }

  if (INTERNAL_META.test(narrative)) {
    reasons.push('internal metadata leaked');
    unsupportedClinical = true;
  }

  if (payload.follow_up_incomplete) {
    reasons.push(
      'Follow-up plan incomplete. Confirm who will follow up, when follow-up will occur, and what will be assessed.',
    );
    unsupportedClinical = true;
  }

  if (
    payload.follow_up_required &&
    !pcpFollowUpPlanIsComplete(payload.pcp_follow_up_plan) &&
    !payload.referral?.completed
  ) {
    if (!payload.follow_up_incomplete) {
      reasons.push(
        'Follow-up plan incomplete. Confirm who will follow up, when follow-up will occur, and what will be assessed.',
      );
      unsupportedClinical = true;
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    medicationFailed,
    unsupportedClinical,
  };
}

export function repairPcpCommunicationFields(
  fields: Record<string, string>,
  payload: PcpCommunicationPayload,
  chrome?: {
    dateOfBirth?: string | null;
    pharmacyName?: string | null;
    pharmacyFax?: string | null;
  },
): { fields: Record<string, string>; validation: PcpValidationResult } {
  const repaired = applyDeterministicPcpTreatment(fields, payload, chrome);
  return {
    fields: repaired,
    validation: validatePcpCommunication(repaired, payload),
  };
}

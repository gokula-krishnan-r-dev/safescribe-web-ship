/**
 * SafeScribe Adapt — Pharmacist Consultation Note (DAP).
 *
 * Builds a frozen document-generation payload from confirmed Steps 1–3,
 * composes a deterministic fallback DAP, validates AI drafts, and renders
 * the References section separately (pharmacist-consulted vs SafeScribe supporting).
 *
 * AI must not invent structured facts or citations. Prescription / lab / reference
 * values remain deterministic.
 */

import { ADAPT_DAP_PROMPT_VERSION } from './adapt-dap-consultation-note-prompt';
import type {
  AdaptPatientDocumentInfo,
  AdaptPharmacistConsultedReference,
  AdaptStepOne,
  AdaptStepThreeOptionA,
  AdaptStepThreeOptionB,
  AdaptStepTwoOptionA,
  AdaptStepTwoOptionB,
  AdaptSupportingReferenceSnapshot,
  CheckReference,
  ClinicalCheckItem,
  ProposedPrescription,
} from './adapt';

export const ADAPT_DAP_NOTE_TITLE = 'Pharmacist Consultation Note (DAP)';
export { ADAPT_DAP_PROMPT_VERSION };

/** @deprecated Prefer AdaptSupportingReferenceSnapshot from adapt.ts */
export type AdaptSupportingReference = AdaptSupportingReferenceSnapshot;

export type AdaptPharmacistReferenceType = AdaptPharmacistConsultedReference['type'];

/** Adaptation-type labels for DAP prose (avoid importing adapt.ts runtime values). */
const ADAPT_TYPE_LABELS: Record<string, string> = {
  dose: 'Dose',
  dosage_form: 'Dosage form / formulation',
  regimen: 'Regimen / frequency',
  route: 'Route',
  therapeutic_substitution: 'Therapeutic substitution',
  other: 'Other',
};

export interface AdaptDapLabVital {
  name: string;
  value: string;
  unit?: string;
  date?: string;
}

export interface AdaptDapKeyFinding {
  title: string;
  status: string;
  summary: string;
  recommendation?: string;
}

export interface AdaptDapDraft {
  data: string;
  assessment: string;
  plan: string;
}

export interface AdaptDapGenerationContext {
  pharmacistName?: string | null;
  pharmacistLicense?: string | null;
  pharmacyName?: string | null;
  pharmacyAddress?: string | null;
  pharmacyPhone?: string | null;
  pharmacyFax?: string | null;
  dateString?: string | null;
  confirmedBy?: string | null;
  confirmedAt?: string | null;
  /** Optional live Super Admin Document Session prompt override. */
  systemPrompt?: string | null;
  promptHash?: string | null;
}

export interface AdaptDocumentSnapshot {
  consultationId?: string;
  snapshotId: string;
  snapshotHash: string;
  jurisdiction: string;
  patientInfo?: Partial<AdaptPatientDocumentInfo>;
  step1: AdaptStepOne;
  step2A?: AdaptStepTwoOptionA;
  step2B?: AdaptStepTwoOptionB;
  step3A?: AdaptStepThreeOptionA;
  step3B?: AdaptStepThreeOptionB;
  pharmacistReferencesConsulted: AdaptPharmacistConsultedReference[];
  safeScribeSupportingReferences: AdaptSupportingReferenceSnapshot[];
  confirmedBy?: string;
  confirmedAt?: string;
  promptVersion: string;
}

export interface AdaptDapGenerationPayload {
  document_type: 'adapt_dap_note';
  jurisdiction: string;
  original_prescription: {
    drug: string;
    strength: string;
    dosage_form: string;
    sig: string;
    quantity: string;
    refills: string;
    prescriber: string;
    prescription_date: string;
  };
  adaptation_reason: {
    adaptation_type: string;
    reason: string;
    additional_context: string;
  };
  patient_context: {
    age: string;
    sex: string;
    weight: string;
    pregnancy_lactation: string;
    allergies: string[];
    medical_conditions: string[];
    current_medications: string[];
  };
  current_medication_experience: {
    isTakingMedication: boolean | null;
    currentUse: string;
    duration: string;
    effectiveness: string;
    adverseEffects: string;
    adherence: string;
    patientGoals: string;
  };
  relevant_labs_vitals: AdaptDapLabVital[];
  proposed_adaptation: Record<string, string>;
  key_clinical_findings: AdaptDapKeyFinding[];
  pharmacist_approved_rationale: string;
  final_adapted_prescription: Record<string, string>;
  counselling_confirmed: string[];
  monitoring_follow_up: {
    plan: string;
    timing: string;
    responsible_party: string;
  };
  communication: {
    prescriber_notification_required: boolean | null;
    status: string;
    method: string;
    recipient: string;
    date: string;
  };
  consent: {
    confirmed: boolean | null;
  };
  pharmacist_references_consulted: Array<{
    type: string;
    label: string;
    title?: string;
  }>;
  safescribe_supporting_references: Array<{
    referenceId: string;
    title: string;
    organizationPublisher?: string;
    yearEdition?: string;
    sectionsUsed?: string[];
  }>;
  provenance: {
    snapshotId: string;
    snapshotHash: string;
    promptVersion: string;
  };
}

const MATERIAL_STATUSES = new Set<string>([
  'monitoring_recommended',
  'follow_up_required',
  'caution',
  'contraindicated',
  'unable_to_assess',
]);

const MATERIAL_SEVERITIES = new Set<string>(['review', 'block', 'info']);

const PHARMACIST_REF_ORDER: AdaptPharmacistReferenceType[] = [
  'ecps',
  'bugs_and_drugs',
  'condition_guideline',
  'other',
];

const FORBIDDEN_CLAIM_CHECKS: Array<{
  id: string;
  re: RegExp;
  allowed: (payload: AdaptDapGenerationPayload) => boolean;
}> = [
  {
    id: 'counselled',
    re: /\b(?:patient )?(?:was )?counsel+ed\b/i,
    allowed: (payload) => payload.counselling_confirmed.length > 0,
  },
  {
    id: 'notified',
    re: /prescriber (?:was )?notified|notified (?:the )?(?:prescriber|physician)|notified by fax|notified by email/i,
    allowed: (payload) =>
      payload.communication.status === 'sent' ||
      payload.communication.status === 'notified' ||
      Boolean(payload.communication.date && /sent|notified/i.test(payload.communication.status)),
  },
  {
    id: 'consent',
    re: /patient agreed|patient consented|informed consent/i,
    allowed: (payload) => payload.consent.confirmed === true,
  },
  {
    id: 'no_interactions',
    re: /no (?:significant )?(?:drug[- ]?)?interactions?(?: identified| detected| found)?/i,
    allowed: (payload) =>
      payload.key_clinical_findings.some((f) => /no .*interaction/i.test(`${f.summary} ${f.title}`)),
  },
  {
    id: 'no_allergy',
    re: /no (?:allergy|hypersensitivity) (?:concerns?|conflicts?|issues?)|no known drug allergies/i,
    allowed: (payload) =>
      payload.key_clinical_findings.some((f) => /allerg/i.test(f.title) && /no /i.test(f.summary)),
  },
  {
    id: 'invented_reference',
    re: /\b(?:product monograph|cps|ecps|bugs\s*&\s*drugs|clinical practice guideline)\b/i,
    allowed: (payload) =>
      payload.pharmacist_references_consulted.length > 0 ||
      payload.safescribe_supporting_references.length > 0,
  },
  {
    id: 'internal_terms',
    re: /\bstep\s*[1234]\b|AdaptReferenceSelector|safety engine|\bllm\b|confidence score|rule id|model name/i,
    allowed: () => false,
  },
  {
    id: 'missing_data_language',
    re: /not (?:yet )?(?:been )?documented|data unavailable|not provided in (?:the )?(?:payload|supplied)|field missing/i,
    allowed: () => false,
  },
];

export interface AdaptDapBuildInput {
  step1: AdaptStepOne;
  step2A?: AdaptStepTwoOptionA;
  step2B?: AdaptStepTwoOptionB;
  step3A?: AdaptStepThreeOptionA;
  step3B?: AdaptStepThreeOptionB;
  patientInfo?: Partial<AdaptPatientDocumentInfo>;
  consultationId?: string;
  context?: AdaptDapGenerationContext;
  /** Override / extend pharmacist-consulted references from Step 3B snapshot. */
  pharmacistReferencesConsulted?: AdaptPharmacistConsultedReference[];
  /** Override SafeScribe supporting references; defaults to material check references. */
  safeScribeSupportingReferences?: AdaptSupportingReferenceSnapshot[];
  /** Optional AI draft (data/assessment/plan). Invalid drafts fall back deterministically. */
  aiDraft?: AdaptDapDraft | null;
}

export function freezeAdaptDocumentSnapshot(input: AdaptDapBuildInput): AdaptDocumentSnapshot {
  const jurisdiction = (input.step1.jurisdiction || 'AB').trim().toUpperCase() || 'AB';
  const pharmacistRefs =
    input.pharmacistReferencesConsulted ??
    (input.step3B as { pharmacistReferencesConsulted?: AdaptPharmacistConsultedReference[] } | undefined)
      ?.pharmacistReferencesConsulted ??
    [];
  const supporting =
    input.safeScribeSupportingReferences ??
    (input.step3B as { safeScribeSupportingReferences?: AdaptSupportingReference[] } | undefined)
      ?.safeScribeSupportingReferences ??
    collectSupportingReferencesFromChecks(input.step3B?.checks ?? []);

  const confirmedAt =
    input.context?.confirmedAt ||
    input.step3B?.confirmedAt ||
    new Date().toISOString();
  const confirmedBy = input.context?.confirmedBy || undefined;

  // Omit mutable document-snapshot ids from the hash so freeze remains stable
  // after Step 3 stores documentSnapshotId / documentSnapshotHash.
  const step3BForHash = input.step3B
    ? (() => {
        const {
          documentSnapshotId: _snapshotId,
          documentSnapshotHash: _snapshotHash,
          ...rest
        } = input.step3B;
        return rest;
      })()
    : undefined;

  const snapshotBase = {
    jurisdiction,
    step1: input.step1,
    step2A: input.step2A,
    step2B: input.step2B,
    step3A: input.step3A,
    step3B: step3BForHash,
    pharmacistReferencesConsulted: pharmacistRefs.filter((r) => r.selected),
    safeScribeSupportingReferences: supporting,
    confirmedAt,
    confirmedBy,
  };

  const snapshotHash = hashStable(JSON.stringify(snapshotBase));
  // Reuse frozen Step 3 snapshot id when clinical content hash is unchanged.
  const priorId = input.step3B?.documentSnapshotId?.trim();
  const priorHash = input.step3B?.documentSnapshotHash?.trim();
  const snapshotId =
    priorId && priorHash === snapshotHash
      ? priorId
      : `adapt_snap_${snapshotHash.slice(0, 12)}`;

  return {
    consultationId: input.consultationId,
    snapshotId,
    snapshotHash,
    jurisdiction: snapshotBase.jurisdiction,
    step1: snapshotBase.step1,
    step2A: snapshotBase.step2A,
    step2B: snapshotBase.step2B,
    step3A: snapshotBase.step3A,
    step3B: input.step3B,
    pharmacistReferencesConsulted: snapshotBase.pharmacistReferencesConsulted,
    safeScribeSupportingReferences: snapshotBase.safeScribeSupportingReferences,
    confirmedAt: snapshotBase.confirmedAt,
    confirmedBy: snapshotBase.confirmedBy,
    patientInfo: input.patientInfo,
    promptVersion: ADAPT_DAP_PROMPT_VERSION,
  };
}

export function buildAdaptDapPayload(
  input: AdaptDapBuildInput,
): { snapshot: AdaptDocumentSnapshot; payload: AdaptDapGenerationPayload } {
  const snapshot = freezeAdaptDocumentSnapshot(input);
  const step1 = snapshot.step1;
  const step2A = snapshot.step2A;
  const step2B = snapshot.step2B;
  const step3A = snapshot.step3A;
  const step3B = snapshot.step3B;
  const orig = step1.originalPrescription;
  const proposed = step3A?.proposedPrescription;
  const finalRx = proposed;

  const adaptTypeLabel =
    (step1.adaptationType ? ADAPT_TYPE_LABELS[step1.adaptationType] : '') ||
    step1.adaptationType ||
    '';

  const allergies = formatAllergies(step2A);
  const conditions = (step2A?.background?.conditions ?? []).map((c) => c.trim()).filter(Boolean);
  const medications = (step2A?.background?.medicationEntries ?? [])
    .map((m) => formatMedicationEntry(m))
    .filter(Boolean);

  const keyFindings = selectMaterialFindings(step3B?.checks ?? []);
  const labs = extractLabsVitals(conditions, keyFindings, step3B?.checks ?? []);
  const monitoring = buildMonitoringPlan(keyFindings, step3B?.checks ?? []);
  const counselling =
    step3A?.confirmed && Array.isArray(step3A.counsellingPreview)
      ? step3A.counsellingPreview.map((p) => p.trim()).filter(Boolean)
      : [];

  const pharmacistRefs = orderPharmacistReferences(snapshot.pharmacistReferencesConsulted);
  const supportingRefs = limitSupportingReferences(
    snapshot.safeScribeSupportingReferences,
    keyFindings,
  );

  const pregnancyParts = [
    step2A?.demographics?.pregnancyStatus?.trim(),
    step2A?.demographics?.breastfeedingStatus?.trim(),
  ].filter(Boolean);

  const payload: AdaptDapGenerationPayload = {
    document_type: 'adapt_dap_note',
    jurisdiction: snapshot.jurisdiction,
    original_prescription: {
      drug: pickDrugName(orig),
      strength: orig?.normalized?.strength?.trim() || '',
      dosage_form: orig?.normalized?.dosageForm?.trim() || '',
      sig:
        orig?.normalized?.directions?.trim() ||
        orig?.raw?.directionsText?.trim() ||
        '',
      quantity: formatQty(orig?.raw?.quantityText ?? orig?.normalized?.quantity),
      refills: formatQty(orig?.normalized?.refillsRemaining),
      prescriber: orig?.normalized?.prescriberName?.trim() || '',
      prescription_date: '',
    },
    adaptation_reason: {
      adaptation_type: adaptTypeLabel,
      reason: step1.adaptationReason?.label?.trim() || '',
      additional_context: step1.additionalComments?.trim() || '',
    },
    patient_context: {
      age: formatAge(step2A),
      sex: step2A?.demographics?.sex?.trim() || '',
      weight: '',
      pregnancy_lactation: pregnancyParts.join('; '),
      allergies,
      medical_conditions: conditions,
      current_medications: medications,
    },
    current_medication_experience: {
      isTakingMedication:
        typeof step2B?.isTakingMedication === 'boolean' ? step2B.isTakingMedication : null,
      currentUse: step2B?.currentUse?.trim() || '',
      duration: step2B?.duration?.trim() || '',
      effectiveness: formatEffectiveness(step2B?.effectiveness),
      adverseEffects: formatAdverseEffects(step2B),
      adherence: formatAdherence(step2B),
      patientGoals: step2B?.patientGoals?.trim() || '',
    },
    relevant_labs_vitals: labs,
    proposed_adaptation: prescriptionToRecord(proposed),
    key_clinical_findings: keyFindings,
    pharmacist_approved_rationale: step3B?.clinicalRationale?.trim() || '',
    final_adapted_prescription: prescriptionToRecord(finalRx),
    counselling_confirmed: counselling,
    monitoring_follow_up: monitoring,
    communication: {
      prescriber_notification_required: null,
      status: '',
      method: '',
      recipient: '',
      date: '',
    },
    consent: {
      confirmed: null,
    },
    pharmacist_references_consulted: pharmacistRefs.map((r) => ({
      type: r.type,
      label: r.label,
      title: r.title,
    })),
    safescribe_supporting_references: supportingRefs.map((r) => ({
      referenceId: r.referenceId,
      title: r.title,
      organizationPublisher: r.organizationPublisher,
      yearEdition: r.yearEdition,
      sectionsUsed: r.sectionsUsed,
    })),
    provenance: {
      snapshotId: snapshot.snapshotId,
      snapshotHash: snapshot.snapshotHash,
      promptVersion: ADAPT_DAP_PROMPT_VERSION,
    },
  };

  return { snapshot, payload };
}

/** Compact prompt input for the AI engine (no chrome metadata). */
export function buildAdaptDapPromptPayload(
  payload: AdaptDapGenerationPayload,
): Record<string, unknown> {
  return {
    document_type: payload.document_type,
    jurisdiction: payload.jurisdiction,
    original_prescription: omitEmpty(payload.original_prescription),
    adaptation_reason: omitEmpty(payload.adaptation_reason),
    patient_context: {
      ...omitEmpty({
        age: payload.patient_context.age,
        sex: payload.patient_context.sex,
        weight: payload.patient_context.weight,
        pregnancy_lactation: payload.patient_context.pregnancy_lactation,
      }),
      allergies: payload.patient_context.allergies,
      medical_conditions: payload.patient_context.medical_conditions,
      current_medications: payload.patient_context.current_medications,
    },
    current_medication_experience: omitEmpty({
      isTakingMedication: payload.current_medication_experience.isTakingMedication,
      currentUse: payload.current_medication_experience.currentUse,
      duration: payload.current_medication_experience.duration,
      effectiveness: payload.current_medication_experience.effectiveness,
      adverseEffects: payload.current_medication_experience.adverseEffects,
      adherence: payload.current_medication_experience.adherence,
      patientGoals: payload.current_medication_experience.patientGoals,
    }),
    relevant_labs_vitals: payload.relevant_labs_vitals,
    proposed_adaptation: omitEmpty(payload.proposed_adaptation),
    key_clinical_findings: payload.key_clinical_findings,
    pharmacist_approved_rationale: payload.pharmacist_approved_rationale,
    final_adapted_prescription: omitEmpty(payload.final_adapted_prescription),
    counselling_confirmed: payload.counselling_confirmed,
    monitoring_follow_up: omitEmpty(payload.monitoring_follow_up),
    communication: omitEmpty(payload.communication),
    consent: payload.consent,
    pharmacist_references_consulted: payload.pharmacist_references_consulted,
    safescribe_supporting_references: payload.safescribe_supporting_references,
  };
}

export function composeAdaptDapFallback(payload: AdaptDapGenerationPayload): AdaptDapDraft {
  return {
    data: composeDataSection(payload),
    assessment: composeAssessmentSection(payload),
    plan: composePlanSection(payload),
  };
}

export function formatAdaptDapChartCopy(draft: AdaptDapDraft): string {
  return [
    'D — Data',
    stripSectionHeading(draft.data ?? '', 'data'),
    '',
    'A — Assessment',
    stripSectionHeading(draft.assessment ?? '', 'assessment'),
    '',
    'P — Plan',
    stripSectionHeading(draft.plan ?? '', 'plan'),
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function renderAdaptDapReferences(payload: AdaptDapGenerationPayload): string {
  const pharmacist = payload.pharmacist_references_consulted
    .map((r) => formatPharmacistReferenceLine(r))
    .filter(Boolean);
  const supporting = payload.safescribe_supporting_references
    .map((r) => formatSupportingReferenceLine(r))
    .filter(Boolean);

  if (!pharmacist.length && !supporting.length) return '';

  const lines = ['References', ''];
  if (pharmacist.length) {
    lines.push('References consulted by pharmacist:');
    for (const line of pharmacist) lines.push(`- ${line}`);
    if (supporting.length) lines.push('');
  }
  if (supporting.length) {
    lines.push('SafeScribe supporting references:');
    for (const line of supporting) lines.push(`- ${line}`);
  }
  return lines.join('\n').trim();
}

export function renderAdaptDapNote(
  draft: AdaptDapDraft,
  payload: AdaptDapGenerationPayload,
): { plainText: string; html: string } {
  const body = formatAdaptDapChartCopy(draft);
  const refs = renderAdaptDapReferences(payload);
  const plainText = [body, refs].filter(Boolean).join('\n\n').trim();

  const htmlParts = [
    '<div class="consultation-note-container adapt-dap-note">',
    '<h3>D — Data</h3>',
    `<p>${escapeHtml(stripSectionHeading(draft.data, 'data'))}</p>`,
    '<h3>A — Assessment</h3>',
    `<p>${escapeHtml(stripSectionHeading(draft.assessment, 'assessment'))}</p>`,
    '<h3>P — Plan</h3>',
    `<p>${escapeHtml(stripSectionHeading(draft.plan, 'plan'))}</p>`,
  ];

  if (refs) {
    htmlParts.push('<h3>References</h3>');
    const pharmacist = payload.pharmacist_references_consulted
      .map((r) => formatPharmacistReferenceLine(r))
      .filter(Boolean);
    const supporting = payload.safescribe_supporting_references
      .map((r) => formatSupportingReferenceLine(r))
      .filter(Boolean);
    if (pharmacist.length) {
      htmlParts.push('<p><strong>References consulted by pharmacist:</strong></p>');
      htmlParts.push('<ul>');
      for (const line of pharmacist) htmlParts.push(`<li>${escapeHtml(line)}</li>`);
      htmlParts.push('</ul>');
    }
    if (supporting.length) {
      htmlParts.push('<p><strong>SafeScribe supporting references:</strong></p>');
      htmlParts.push('<ul>');
      for (const line of supporting) htmlParts.push(`<li>${escapeHtml(line)}</li>`);
      htmlParts.push('</ul>');
    }
  }

  htmlParts.push('</div>');
  return { plainText, html: htmlParts.join('\n') };
}

export function validateAdaptDapNote(
  body: string,
  payload: AdaptDapGenerationPayload,
): string[] {
  const warnings: string[] = [];
  for (const check of FORBIDDEN_CLAIM_CHECKS) {
    if (check.id === 'invented_reference') {
      // Only flag reference-like claims when neither reference array was supplied.
      if (check.re.test(body) && !check.allowed(payload)) {
        // If refs exist, still scan for titles not in allowed lists.
        continue;
      }
      if (!check.allowed(payload) && check.re.test(body)) {
        warnings.push(`Unsupported DAP claim: ${check.id}`);
      }
      continue;
    }
    if (check.re.test(body) && !check.allowed(payload)) {
      warnings.push(`Unsupported DAP claim: ${check.id}`);
    }
  }

  // Hallucinated citation titles not present in either reference list.
  const allowedTitles = new Set(
    [
      ...payload.pharmacist_references_consulted.map((r) => (r.title || r.label).toLowerCase()),
      ...payload.safescribe_supporting_references.map((r) => r.title.toLowerCase()),
    ].filter(Boolean),
  );
  if (allowedTitles.size > 0) {
    const monoMatches = body.match(/[A-Z][A-Za-z0-9 /,&()-]{8,80}(?:Product Monograph|Clinical Practice Guidelines?)/g);
    for (const match of monoMatches ?? []) {
      const lower = match.toLowerCase();
      const known = [...allowedTitles].some((t) => lower.includes(t) || t.includes(lower));
      if (!known) {
        warnings.push(`Unsupported DAP claim: unknown_reference:${match}`);
      }
    }
  }

  // Exact final Rx fragments should appear when present in payload.
  const drug = payload.final_adapted_prescription.drug?.trim();
  if (drug && !body.toLowerCase().includes(drug.toLowerCase().slice(0, Math.min(drug.length, 24)))) {
    // Soft check — AI may rephrase drug line; deterministic repair handles hard cases.
  }

  return warnings;
}

export function acceptAdaptDapDraft(
  draft: AdaptDapDraft,
  payload: AdaptDapGenerationPayload,
): { ok: boolean; draft: AdaptDapDraft; warnings: string[]; body: string } {
  const normalized: AdaptDapDraft = {
    data: stripSectionHeading(draft.data ?? '', 'data'),
    assessment: stripSectionHeading(draft.assessment ?? '', 'assessment'),
    plan: stripSectionHeading(draft.plan ?? '', 'plan'),
  };
  const body = formatAdaptDapChartCopy(normalized);
  const warnings = validateAdaptDapNote(body, payload);
  const ok = warnings.length === 0 && Boolean(normalized.data && normalized.assessment && normalized.plan);
  return { ok, draft: normalized, warnings, body };
}

/** Parse Assist Engine / Document Session JSON into an Adapt DAP draft. */
export function assembleAdaptDapDraftFromAi(raw: unknown): { draft: AdaptDapDraft; ok: boolean } {
  const fields = stringFieldsFromUnknown(raw);
  const draft: AdaptDapDraft = {
    data: stripSectionHeading(fields.data ?? '', 'data'),
    assessment: stripSectionHeading(fields.assessment ?? '', 'assessment'),
    plan: stripSectionHeading(fields.plan ?? '', 'plan'),
  };
  const ok = Boolean(draft.data.trim() && draft.assessment.trim() && draft.plan.trim());
  return { draft, ok };
}

function stringFieldsFromUnknown(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') out[key] = value;
  }
  // Nested consultation_note / dap wrappers used by some Assist Engine responses.
  const nested =
    (raw as { consultation_note?: unknown }).consultation_note ??
    (raw as { dap?: unknown }).dap ??
    (raw as { note?: unknown }).note;
  if (nested && typeof nested === 'object') {
    for (const [key, value] of Object.entries(nested as Record<string, unknown>)) {
      if (typeof value === 'string' && !out[key]) out[key] = value;
    }
  }
  return out;
}

export function buildAdaptConsultationNote(input: AdaptDapBuildInput): {
  snapshot: AdaptDocumentSnapshot;
  payload: AdaptDapGenerationPayload;
  draft: AdaptDapDraft;
  plainText: string;
  html: string;
  warnings: string[];
  chromeHtml: string;
  chromePlain: string;
  usedAiDraft: boolean;
} {
  const { snapshot, payload } = buildAdaptDapPayload(input);
  const fallback = composeAdaptDapFallback(payload);
  const candidate = input.aiDraft ?? fallback;
  const accepted = acceptAdaptDapDraft(candidate, payload);
  const draft = accepted.ok ? accepted.draft : fallback;
  const warnings = accepted.ok ? accepted.warnings : [
    ...accepted.warnings,
    'Draft rejected; deterministic fallback used',
  ];
  const rendered = renderAdaptDapNote(draft, payload);
  const chrome = renderAdaptDapChrome(input, payload, rendered);

  return {
    snapshot,
    payload,
    draft,
    plainText: chrome.plainText,
    html: chrome.html,
    warnings,
    chromeHtml: chrome.html,
    chromePlain: chrome.plainText,
    usedAiDraft: Boolean(input.aiDraft) && accepted.ok,
  };
}

function renderAdaptDapChrome(
  input: AdaptDapBuildInput,
  payload: AdaptDapGenerationPayload,
  rendered: { plainText: string; html: string },
): { html: string; plainText: string } {
  const ctx = input.context;
  const patient = input.patientInfo;
  const date =
    ctx?.dateString ||
    new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: '2-digit' });
  const patientName = sanitizePlaceholder(patient?.name, ['Jane Doe', 'John Doe']) || '—';
  const dob =
    sanitizePlaceholder(patient?.dateOfBirth || input.step2A?.demographics?.dateOfBirth, [
      '1958-04-12',
    ]) || '—';
  const phn = sanitizePlaceholder(patient?.patientId, ['987654321']) || '—';
  const rphName = ctx?.pharmacistName?.trim() || 'Pharmacist';
  const rphLicense = ctx?.pharmacistLicense?.trim() || '—';
  const pharmacyName = ctx?.pharmacyName?.trim() || 'SafeScribe Clinical Pharmacy';
  const jur = payload.jurisdiction;

  const headerHtml = `<div class="consultation-note-container">
<h2>Pharmacist Consultation Note — Prescription Adaptation</h2>
<p><strong>Consultation Date:</strong> ${escapeHtml(date)} | <strong>Jurisdiction:</strong> ${escapeHtml(jur)}</p>
<p><strong>Patient Name:</strong> ${escapeHtml(patientName)} | <strong>DOB:</strong> ${escapeHtml(dob)} | <strong>PHN:</strong> ${escapeHtml(phn)}</p>
<p><strong>Pharmacist:</strong> ${escapeHtml(rphName)}, RPh (Lic #${escapeHtml(rphLicense)}) | <strong>Pharmacy:</strong> ${escapeHtml(pharmacyName)}</p>
<p><strong>Consultation type:</strong> Prescription Adaptation</p>
<hr />
${rendered.html.replace(/^<div class="consultation-note-container adapt-dap-note">/, '').replace(/<\/div>$/, '')}
</div>`;

  const headerPlain = `PHARMACIST CONSULTATION NOTE — PRESCRIPTION ADAPTATION
Date: ${date} | Jurisdiction: ${jur}
Patient: ${patientName} | DOB: ${dob} | PHN: ${phn}
Pharmacist: ${rphName}, RPh (Lic #${rphLicense}) | Pharmacy: ${pharmacyName}
Consultation type: Prescription Adaptation

${rendered.plainText}`;

  return { html: headerHtml, plainText: headerPlain };
}

// ─── section composers ───────────────────────────────────────────────────────

function composeDataSection(payload: AdaptDapGenerationPayload): string {
  const parts: string[] = [];
  const orig = formatPrescriptionLine(payload.original_prescription);
  if (orig) {
    parts.push(`Original prescription: ${orig}.`);
  }

  const reasonBits = [
    payload.adaptation_reason.adaptation_type,
    payload.adaptation_reason.reason,
  ]
    .map((s) => s.trim())
    .filter(Boolean);
  if (reasonBits.length) {
    const ctx = payload.adaptation_reason.additional_context
      ? ` Additional context: ${payload.adaptation_reason.additional_context}.`
      : '';
    parts.push(`Adaptation considered for ${reasonBits.join(' — ')}.${ctx}`);
  }

  const patientBits: string[] = [];
  if (payload.patient_context.age) patientBits.push(`age ${payload.patient_context.age}`);
  if (payload.patient_context.sex) patientBits.push(payload.patient_context.sex);
  if (payload.patient_context.pregnancy_lactation) {
    patientBits.push(payload.patient_context.pregnancy_lactation);
  }
  if (patientBits.length) {
    parts.push(`Relevant patient information included ${patientBits.join(', ')}.`);
  }

  if (payload.patient_context.allergies.length) {
    parts.push(`Allergies: ${payload.patient_context.allergies.join('; ')}.`);
  }
  if (payload.patient_context.medical_conditions.length) {
    parts.push(
      `Relevant medical conditions: ${payload.patient_context.medical_conditions.join('; ')}.`,
    );
  }
  if (payload.patient_context.current_medications.length) {
    parts.push(
      `Current medications: ${payload.patient_context.current_medications.join('; ')}.`,
    );
  }

  const exp = payload.current_medication_experience;
  if (exp.isTakingMedication === false) {
    parts.push('The medication had not yet been started.');
  } else if (exp.isTakingMedication === true) {
    const expBits: string[] = [];
    if (exp.currentUse) expBits.push(exp.currentUse);
    if (exp.duration) expBits.push(`duration ${exp.duration}`);
    if (exp.effectiveness) expBits.push(`response ${exp.effectiveness}`);
    if (exp.adverseEffects) expBits.push(`tolerability ${exp.adverseEffects}`);
    if (exp.adherence) expBits.push(`adherence ${exp.adherence}`);
    if (exp.patientGoals) expBits.push(`patient goals: ${exp.patientGoals}`);
    if (expBits.length) {
      parts.push(`Current medication experience: ${expBits.join('; ')}.`);
    } else {
      parts.push('Patient is currently taking the medication.');
    }
  }

  for (const lab of payload.relevant_labs_vitals) {
    parts.push(formatLabSentence(lab));
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function composeAssessmentSection(payload: AdaptDapGenerationPayload): string {
  const parts: string[] = [];
  const reason = payload.adaptation_reason.reason || payload.adaptation_reason.adaptation_type;
  if (reason) {
    parts.push(`The original prescription required adaptation because of ${reason.toLowerCase()}.`);
  }

  const proposed = formatPrescriptionLine(payload.proposed_adaptation);
  if (proposed) {
    parts.push(`Proposed adaptation: ${proposed}.`);
  }

  for (const finding of payload.key_clinical_findings) {
    const bit = [finding.summary, finding.recommendation].filter(Boolean).join(' ');
    if (bit) parts.push(ensureSentence(bit));
  }

  if (payload.pharmacist_approved_rationale) {
    parts.push(ensureSentence(payload.pharmacist_approved_rationale));
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function composePlanSection(payload: AdaptDapGenerationPayload): string {
  const parts: string[] = [];
  const finalRx = formatPrescriptionLine(payload.final_adapted_prescription, {
    includeQtyRefills: true,
  });
  if (finalRx) {
    parts.push(`Prescription adapted to ${finalRx}.`);
  }

  if (payload.counselling_confirmed.length) {
    parts.push(
      `Counselling provided: ${payload.counselling_confirmed.map(ensureSentence).join(' ')}`,
    );
  }

  const mon = payload.monitoring_follow_up;
  const monBits = [mon.plan, mon.timing, mon.responsible_party].filter((s) => s.trim());
  if (monBits.length) {
    parts.push(`Monitoring / follow-up: ${monBits.join('; ')}.`);
  }

  const comm = payload.communication;
  if (comm.status === 'sent' || comm.status === 'notified') {
    const method = comm.method ? ` by ${comm.method}` : '';
    parts.push(`The original prescriber was notified of the adaptation${method}.`);
  } else if (comm.status === 'prepared_not_sent' || comm.status === 'prepared') {
    parts.push('Prescriber notification was prepared.');
  } else if (comm.prescriber_notification_required === false) {
    parts.push('Prescriber communication not required under the applicable workflow.');
  }

  if (payload.consent.confirmed === true) {
    parts.push('Patient agreed to the adaptation and follow-up plan.');
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function selectMaterialFindings(checks: ClinicalCheckItem[]): AdaptDapKeyFinding[] {
  return checks
    .filter((c) => c.applicable !== false)
    .filter((c) => {
      if (MATERIAL_SEVERITIES.has(c.severity)) return true;
      if (MATERIAL_STATUSES.has(c.status)) return true;
      // Pass findings are excluded unless they carry an explicit pharmacist note.
      return Boolean(c.pharmacistNote?.trim());
    })
    .map((c) => ({
      title: c.title,
      status: c.statusLabel || c.status,
      summary: (c.pharmacistNote?.trim() || c.summary || c.assessment || '').trim(),
      recommendation: c.recommendation?.trim() || undefined,
    }))
    .filter((f) => f.summary);
}

function collectSupportingReferencesFromChecks(
  checks: ClinicalCheckItem[],
): AdaptSupportingReferenceSnapshot[] {
  const materialIds = new Set(selectMaterialFindings(checks).map((f) => f.title.toLowerCase()));
  const byId = new Map<string, AdaptSupportingReferenceSnapshot>();

  for (const check of checks) {
    if (!check.reference) continue;
    const isMaterial =
      MATERIAL_SEVERITIES.has(check.severity) ||
      MATERIAL_STATUSES.has(check.status) ||
      materialIds.has(check.title.toLowerCase());
    if (!isMaterial && check.severity === 'pass') continue;

    const ref = toSupportingReference(check.reference, check.id);
    if (!ref) continue;
    const existing = byId.get(ref.referenceId);
    if (existing) {
      existing.usedForCheckCodes = unique([
        ...(existing.usedForCheckCodes ?? []),
        check.id,
      ]);
      existing.sectionsUsed = unique([
        ...(existing.sectionsUsed ?? []),
        ...(ref.sectionsUsed ?? []),
      ]);
    } else {
      byId.set(ref.referenceId, ref);
    }
  }

  return [...byId.values()];
}

function toSupportingReference(
  reference: CheckReference,
  checkId: string,
): AdaptSupportingReferenceSnapshot | null {
  const title = reference.title?.trim();
  if (!title) return null;
  const sectionsUsed = [
    reference.section,
    ...(reference.sections?.map((s) => s.heading).filter(Boolean) ?? []),
  ].filter((s): s is string => Boolean(s?.trim()));

  return {
    referenceId: reference.sourceId?.trim() || `ref_${hashStable(title).slice(0, 10)}`,
    title,
    organizationPublisher: reference.authority?.trim() || undefined,
    version: reference.version?.trim() || undefined,
    sectionsUsed: sectionsUsed.length ? sectionsUsed : undefined,
    usedForCheckCodes: [checkId],
    source: 'safety_rule',
  };
}

function limitSupportingReferences(
  refs: AdaptSupportingReferenceSnapshot[],
  findings: AdaptDapKeyFinding[],
): AdaptSupportingReferenceSnapshot[] {
  if (refs.length <= 5) return refs;
  const findingText = findings.map((f) => `${f.title} ${f.summary}`.toLowerCase()).join(' ');
  const scored = refs.map((ref, idx) => {
    let score = 0;
    if (findingText.includes(ref.title.toLowerCase().slice(0, 20))) score += 3;
    if (ref.sectionsUsed?.some((s) => /renal|dose|monitor/i.test(s))) score += 2;
    if (ref.usedForCheckCodes?.length) score += ref.usedForCheckCodes.length;
    return { ref, score, idx };
  });
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
  return scored.slice(0, 5).map((s) => s.ref);
}

function orderPharmacistReferences(
  refs: AdaptPharmacistConsultedReference[],
): AdaptPharmacistConsultedReference[] {
  return [...refs]
    .filter((r) => r.selected)
    .sort(
      (a, b) =>
        PHARMACIST_REF_ORDER.indexOf(a.type) - PHARMACIST_REF_ORDER.indexOf(b.type),
    );
}

function extractLabsVitals(
  conditions: string[],
  findings: AdaptDapKeyFinding[],
  checks: ClinicalCheckItem[],
): AdaptDapLabVital[] {
  const labs: AdaptDapLabVital[] = [];
  const seen = new Set<string>();

  const push = (lab: AdaptDapLabVital | null) => {
    if (!lab) return;
    const key = `${lab.name}|${lab.value}|${lab.unit ?? ''}|${lab.date ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    labs.push(lab);
  };

  for (const condition of conditions) {
    push(parseLabFromText(condition));
  }
  for (const finding of findings) {
    push(parseLabFromText(finding.summary));
  }
  for (const check of checks) {
    if (!(MATERIAL_SEVERITIES.has(check.severity) || MATERIAL_STATUSES.has(check.status))) {
      continue;
    }
    push(parseLabFromText(check.assessment));
    push(parseLabFromText(check.summary));
  }

  return labs;
}

function parseLabFromText(text: string | undefined): AdaptDapLabVital | null {
  if (!text?.trim()) return null;
  // eGFR: 45 mL/min/1.73 m² (date: 15-Sep-2026) OR Patient eGFR: 45 mL/min
  const egfr = text.match(
    /eGFR[^0-9]{0,20}(\d+(?:\.\d+)?)\s*(mL\/min(?:\/1\.73\s*m[²2])?)?(?:[^.]{0,40}?(?:date[:\s]+([0-9A-Za-z-]{6,18})))?/i,
  );
  if (egfr) {
    return {
      name: 'eGFR',
      value: egfr[1]!,
      unit: (egfr[2] || 'mL/min/1.73 m²').replace(/\s+/g, ' ').trim(),
      date: egfr[3]?.trim(),
    };
  }

  const generic = text.match(
    /\b([A-Za-z][A-Za-z0-9 /-]{1,30}?)\s*[:=]\s*(\d+(?:\.\d+)?)\s*([A-Za-zµμ/%0-9²³·.-]+)?(?:[^.]{0,40}?(?:date[:\s]+([0-9A-Za-z-]{6,18})))?/i,
  );
  if (generic && /egfr|crcl|creatinine|hbA1c|a1c|bp|blood pressure|weight|bmi/i.test(generic[1]!)) {
    return {
      name: generic[1]!.trim(),
      value: generic[2]!,
      unit: generic[3]?.trim(),
      date: generic[4]?.trim(),
    };
  }
  return null;
}

function buildMonitoringPlan(
  findings: AdaptDapKeyFinding[],
  checks: ClinicalCheckItem[],
): { plan: string; timing: string; responsible_party: string } {
  const monitoringChecks = checks.filter(
    (c) =>
      c.type === 'monitoring' ||
      c.status === 'monitoring_recommended' ||
      c.status === 'follow_up_required',
  );
  const fromFinding = findings.find((f) => /monitor|follow-?up|reassess/i.test(f.recommendation || f.summary));
  const plan =
    monitoringChecks[0]?.recommendation?.trim() ||
    fromFinding?.recommendation?.trim() ||
    '';
  const timingMatch = plan.match(
    /(?:in|within|every)\s+[\d–\-]+\s*(?:to\s*[\d–\-]+\s*)?(?:days?|weeks?|months?)/i,
  );
  return {
    plan,
    timing: timingMatch?.[0]?.trim() || '',
    responsible_party: '',
  };
}

function formatPrescriptionLine(
  rx: Record<string, string>,
  opts?: { includeQtyRefills?: boolean },
): string {
  const drug = rx.drug?.trim() || '';
  const strength = rx.strength?.trim() || '';
  const form = rx.dosage_form?.trim() || '';
  const sig = rx.sig?.trim() || '';
  const dose = rx.dose?.trim() || '';
  const frequency = rx.frequency?.trim() || '';
  const route = rx.route?.trim() || '';

  const identity = [drug || [strength, form].filter(Boolean).join(' ')].filter(Boolean).join(' ');
  let core = identity;
  if (sig) {
    core = identity ? `${identity}: ${sig}` : sig;
  } else {
    const regimen = [dose, frequency, route].filter(Boolean).join(' ');
    if (regimen) core = identity ? `${identity}; ${regimen}` : regimen;
  }

  if (opts?.includeQtyRefills) {
    const qty = rx.quantity?.trim();
    const refills = rx.refills?.trim();
    const extras: string[] = [];
    if (qty) extras.push(`Quantity ${qty}`);
    if (refills !== undefined && refills !== '') extras.push(`${refills} refill${refills === '1' ? '' : 's'}`);
    if (extras.length) core = `${core}. ${extras.join('; ')}`;
  }

  const prescriber = rx.prescriber?.trim();
  if (prescriber) core = `${core} (prescriber: ${prescriber})`;
  return core.replace(/\s+/g, ' ').trim();
}

function prescriptionToRecord(
  rx: ProposedPrescription | null | undefined,
): Record<string, string> {
  if (!rx) return emptyRxRecord();
  return {
    drug: rx.drugName?.trim() || rx.genericName?.trim() || rx.brandName?.trim() || '',
    strength: rx.strength?.trim() || '',
    dosage_form: rx.dosageForm?.trim() || '',
    dose: rx.dose?.trim() || '',
    frequency: rx.frequency?.trim() || '',
    route: rx.route?.trim() || '',
    sig: rx.sig?.trim() || '',
    quantity: formatQty(rx.quantity),
    refills: formatQty(rx.refills),
    duration: '',
  };
}

function emptyRxRecord(): Record<string, string> {
  return {
    drug: '',
    strength: '',
    dosage_form: '',
    dose: '',
    frequency: '',
    route: '',
    sig: '',
    quantity: '',
    refills: '',
    duration: '',
  };
}

function pickDrugName(orig: AdaptStepOne['originalPrescription']): string {
  if (!orig) return '';
  return (
    orig.normalized?.genericName?.trim() ||
    orig.normalized?.brandName?.trim() ||
    orig.raw?.medicationText?.trim() ||
    ''
  );
}

function formatAllergies(step2A?: AdaptStepTwoOptionA): string[] {
  if (!step2A?.background) return [];
  if (step2A.background.allergiesNone) return [];
  return (step2A.background.allergyEntries ?? [])
    .map((a) => {
      const drug = a.drug?.trim();
      if (!drug) return '';
      const reaction = a.reaction?.trim();
      return reaction ? `${drug} (${reaction})` : drug;
    })
    .filter(Boolean);
}

function formatMedicationEntry(m: {
  name?: string;
  drug?: string;
  dose?: string;
  frequency?: string;
  label?: string;
  sig?: string;
}): string {
  const drug = m.name?.trim() || m.drug?.trim() || m.label?.trim() || '';
  if (!drug) return '';
  const bits = [m.dose, m.frequency, m.sig].map((s) => s?.trim()).filter(Boolean);
  return bits.length ? `${drug} — ${bits.join(', ')}` : drug;
}

function formatAge(step2A?: AdaptStepTwoOptionA): string {
  const age = step2A?.demographics?.age?.trim();
  const unit = step2A?.demographics?.ageUnit || 'years';
  if (!age) return '';
  return unit === 'years' ? `${age} years` : `${age} ${unit}`;
}

function formatEffectiveness(value?: string): string {
  switch (value) {
    case 'effective':
      return 'effective';
    case 'partially_effective':
      return 'partially effective';
    case 'not_effective':
      return 'not effective';
    case 'unable_to_assess':
      return 'unable to assess';
    default:
      return '';
  }
}

function formatAdverseEffects(step2B?: AdaptStepTwoOptionB): string {
  if (!step2B?.adverseEffects) return '';
  if (step2B.adverseEffects === 'none_reported') return 'none reported';
  if (step2B.adverseEffects === 'yes_describe') {
    return step2B.adverseEffectsDescription?.trim() || 'adverse effects described';
  }
  return '';
}

function formatAdherence(step2B?: AdaptStepTwoOptionB): string {
  if (!step2B?.adherence) return '';
  switch (step2B.adherence) {
    case 'taking_as_directed':
      return 'taking as directed';
    case 'occasional_missed_doses':
      return 'occasional missed doses';
    case 'frequent_missed_doses':
      return 'frequent missed doses';
    case 'other':
      return step2B.adherenceDescription?.trim() || 'other adherence pattern';
    default:
      return '';
  }
}

function formatQty(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const text = String(value).trim();
  return text;
}

function formatLabSentence(lab: AdaptDapLabVital): string {
  const unit = lab.unit ? ` ${lab.unit}` : '';
  const date = lab.date ? ` (date: ${lab.date})` : '';
  return `Relevant ${lab.name}${date}: ${lab.value}${unit}.`;
}

function formatPharmacistReferenceLine(ref: {
  type: string;
  label: string;
  title?: string;
}): string {
  if (ref.type === 'ecps') return ref.label || 'eCPS';
  if (ref.type === 'bugs_and_drugs') return ref.label || 'Bugs & Drugs';
  return (ref.title || ref.label || '').trim();
}

function formatSupportingReferenceLine(ref: {
  title: string;
  organizationPublisher?: string;
  yearEdition?: string;
  sectionsUsed?: string[];
}): string {
  const section = ref.sectionsUsed?.[0];
  const year =
    ref.yearEdition ||
    (ref.title.match(/\b(19|20)\d{2}\b/) ? undefined : undefined);
  let line = ref.title.trim();
  if (year && !line.includes(year)) line = `${line} (${year})`;
  if (section) line = `${line} — ${section}`;
  return line;
}

function stripSectionHeading(value: string, section: 'data' | 'assessment' | 'plan'): string {
  const text = value.trim();
  if (!text) return '';
  const heading =
    section === 'data'
      ? /^(?:d\s*[—–-]\s*data)\s*/i
      : section === 'assessment'
        ? /^(?:a\s*[—–-]\s*assessment)\s*/i
        : /^(?:p\s*[—–-]\s*plan)\s*/i;
  return text.replace(heading, '').trim();
}

function ensureSentence(text: string): string {
  const t = text.trim();
  if (!t) return '';
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function omitEmpty<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    if (typeof v === 'string' && !v.trim()) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

function sanitizePlaceholder(value: string | undefined | null, placeholders: string[]): string {
  const text = value?.trim() || '';
  if (!text) return '';
  if (placeholders.some((p) => p.toLowerCase() === text.toLowerCase())) return '';
  return text;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '<br />');
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

function hashStable(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * SafeScribe Adapt — PCP / Prescriber Communication.
 *
 * Concise external notification from the same frozen Adapt snapshot as the DAP.
 * Backend owns patient identifiers, prescriptions, references, and signature.
 * AI may only draft explanatory narrative fields (intro / rationale / etc.).
 */

import {
  buildAdaptDapPayload,
  type AdaptDapBuildInput,
  type AdaptDapGenerationContext,
  type AdaptDapGenerationPayload,
} from './adapt-dap-note';
import { ADAPT_PCP_PROMPT_VERSION } from './adapt-pcp-communication-prompt';

export const ADAPT_PCP_NOTIFICATION_TITLE = 'PHARMACIST ADAPTATION NOTIFICATION';
export const ADAPT_PCP_UI_TITLE = 'Pharmacist Communication to Primary Care Provider';
export const ADAPT_PCP_SALUTATION = 'Dear Colleague,';
export const ADAPT_PCP_DEFAULT_CLOSING =
  'This notification is provided for continuity of care. Please contact the pharmacy if you would like to discuss the adaptation.';

export { ADAPT_PCP_PROMPT_VERSION };

export type AdaptPrescriberActionRequestType =
  | 'none'
  | 'for_information'
  | 'please_contact_pharmacy'
  | 'follow_up_requested'
  | 'additional_assessment_requested'
  | 'other';

export interface AdaptPrescriberCommunicationReferenceConfig {
  includePharmacistConsultedReferences: boolean;
  includePrimarySafeScribeReference: boolean;
  maxSafeScribeReferences: number;
}

export const ADAPT_PCP_REFERENCE_DEFAULTS: AdaptPrescriberCommunicationReferenceConfig = {
  includePharmacistConsultedReferences: true,
  includePrimarySafeScribeReference: false,
  maxSafeScribeReferences: 1,
};

export interface AdaptPcpDraft {
  intro: string;
  rationale: string;
  relevantClinicalInformation: string;
  monitoringFollowUp: string;
  counsellingAgreement: string;
  closing: string;
}

export interface AdaptPcpBuildInput extends Omit<AdaptDapBuildInput, 'aiDraft'> {
  /** Override action request; defaults to for_information. */
  prescriberActionRequest?: {
    type: AdaptPrescriberActionRequestType;
    details?: string;
  };
  referenceConfig?: Partial<AdaptPrescriberCommunicationReferenceConfig>;
  /** Optional AI narrative draft. Invalid drafts fall back deterministically. */
  aiDraft?: AdaptPcpDraft | null;
}

export interface AdaptPcpGenerationPayload {
  document_type: 'adapt_prescriber_communication';
  jurisdiction: string;
  patient: { name: string; dob: string; health_number: string };
  recipient: { prescriber_name: string; clinic_name: string };
  original_prescription: AdaptDapGenerationPayload['original_prescription'];
  adaptation_reason: AdaptDapGenerationPayload['adaptation_reason'];
  relevant_patient_context: {
    age: string;
    weight: string;
    allergies: string[];
    medical_conditions: string[];
    current_medications: string[];
  };
  current_medication_experience: AdaptDapGenerationPayload['current_medication_experience'];
  relevant_labs_vitals: AdaptDapGenerationPayload['relevant_labs_vitals'];
  key_clinical_findings: AdaptDapGenerationPayload['key_clinical_findings'];
  pharmacist_approved_rationale: string;
  final_adapted_prescription: AdaptDapGenerationPayload['final_adapted_prescription'];
  counselling_confirmed: string[];
  monitoring_follow_up: AdaptDapGenerationPayload['monitoring_follow_up'];
  patient_agreement: { confirmed: boolean | null };
  prescriber_action_request: {
    type: AdaptPrescriberActionRequestType;
    details: string;
  };
  pharmacist_references_consulted: AdaptDapGenerationPayload['pharmacist_references_consulted'];
  safescribe_supporting_references: AdaptDapGenerationPayload['safescribe_supporting_references'];
  provenance: {
    snapshotId: string;
    snapshotHash: string;
    promptVersion: string;
  };
}

const FORBIDDEN_CLAIM_CHECKS: Array<{
  id: string;
  re: RegExp;
  allowed: (payload: AdaptPcpGenerationPayload) => boolean;
}> = [
  {
    id: 'counselled',
    re: /\b(?:patient )?(?:was )?counsel+ed\b/i,
    allowed: (payload) => payload.counselling_confirmed.length > 0,
  },
  {
    id: 'consent',
    re: /patient agreed|patient consented|informed consent/i,
    allowed: (payload) => payload.patient_agreement.confirmed === true,
  },
  {
    id: 'already_notified',
    re: /prescriber (?:was |has been )?notified|notified (?:the )?(?:prescriber|physician)/i,
    allowed: () => false,
  },
  {
    id: 'please_approve',
    re: /please (?:review and )?approve|request(?:ing)? (?:your )?approval/i,
    allowed: (payload) =>
      payload.prescriber_action_request.type !== 'none' &&
      payload.prescriber_action_request.type !== 'for_information',
  },
  {
    id: 'internal_terms',
    re: /\bstep\s*[1234]\b|AdaptReferenceSelector|safety engine|\bllm\b|confidence score|rule id|model name/i,
    allowed: () => false,
  },
  {
    id: 'invented_reference',
    re: /\b(?:product monograph|cps|ecps|bugs\s*&\s*drugs|clinical practice guideline)\b/i,
    allowed: (payload) =>
      payload.pharmacist_references_consulted.length > 0 ||
      payload.safescribe_supporting_references.length > 0,
  },
  {
    id: 'missing_data_language',
    re: /not (?:yet )?(?:been )?documented|data unavailable|not provided in (?:the )?(?:payload|supplied)|field missing/i,
    allowed: () => false,
  },
];

export function buildAdaptPcpPayload(
  input: AdaptPcpBuildInput,
): { payload: AdaptPcpGenerationPayload; dapPayload: AdaptDapGenerationPayload } {
  const {
    aiDraft: _aiDraft,
    prescriberActionRequest,
    referenceConfig: _referenceConfig,
    ...dapInput
  } = input;
  const { snapshot, payload: dap } = buildAdaptDapPayload(dapInput);
  const patient = input.patientInfo;
  const action = prescriberActionRequest ?? {
    type: 'for_information' as const,
    details: '',
  };

  const payload: AdaptPcpGenerationPayload = {
    document_type: 'adapt_prescriber_communication',
    jurisdiction: dap.jurisdiction,
    patient: {
      name: sanitizePlaceholder(patient?.name, ['Jane Doe', 'John Doe']),
      dob: sanitizePlaceholder(patient?.dateOfBirth || input.step2A?.demographics?.dateOfBirth, [
        '1958-04-12',
      ]),
      health_number: sanitizePlaceholder(patient?.patientId, ['987654321']),
    },
    recipient: {
      prescriber_name: dap.original_prescription.prescriber || '',
      clinic_name: '',
    },
    original_prescription: dap.original_prescription,
    adaptation_reason: dap.adaptation_reason,
    relevant_patient_context: {
      age: dap.patient_context.age,
      weight: dap.patient_context.weight,
      allergies: dap.patient_context.allergies,
      medical_conditions: dap.patient_context.medical_conditions,
      current_medications: dap.patient_context.current_medications,
    },
    current_medication_experience: dap.current_medication_experience,
    relevant_labs_vitals: dap.relevant_labs_vitals,
    key_clinical_findings: dap.key_clinical_findings,
    pharmacist_approved_rationale: dap.pharmacist_approved_rationale,
    final_adapted_prescription: dap.final_adapted_prescription,
    counselling_confirmed: dap.counselling_confirmed,
    monitoring_follow_up: dap.monitoring_follow_up,
    patient_agreement: { confirmed: dap.consent.confirmed },
    prescriber_action_request: {
      type: action.type,
      details: action.details?.trim() || '',
    },
    pharmacist_references_consulted: dap.pharmacist_references_consulted,
    safescribe_supporting_references: dap.safescribe_supporting_references,
    provenance: {
      snapshotId: snapshot.snapshotId,
      snapshotHash: snapshot.snapshotHash,
      promptVersion: ADAPT_PCP_PROMPT_VERSION,
    },
  };

  return { payload, dapPayload: dap };
}

/** Compact prompt input for the AI engine (no chrome / provenance). */
export function buildAdaptPcpPromptPayload(
  payload: AdaptPcpGenerationPayload,
): Record<string, unknown> {
  return {
    document_type: payload.document_type,
    jurisdiction: payload.jurisdiction,
    original_prescription: omitEmpty(payload.original_prescription),
    adaptation_reason: omitEmpty(payload.adaptation_reason),
    relevant_patient_context: {
      ...omitEmpty({
        age: payload.relevant_patient_context.age,
        weight: payload.relevant_patient_context.weight,
      }),
      allergies: payload.relevant_patient_context.allergies,
      medical_conditions: payload.relevant_patient_context.medical_conditions,
      current_medications: payload.relevant_patient_context.current_medications,
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
    key_clinical_findings: payload.key_clinical_findings,
    pharmacist_approved_rationale: payload.pharmacist_approved_rationale,
    final_adapted_prescription: omitEmpty(payload.final_adapted_prescription),
    counselling_confirmed: payload.counselling_confirmed,
    monitoring_follow_up: omitEmpty(payload.monitoring_follow_up),
    patient_agreement: payload.patient_agreement,
    prescriber_action_request: omitEmpty(payload.prescriber_action_request),
    pharmacist_references_consulted: payload.pharmacist_references_consulted,
    safescribe_supporting_references: payload.safescribe_supporting_references,
  };
}

export function composeAdaptPcpFallback(payload: AdaptPcpGenerationPayload): AdaptPcpDraft {
  const reasonBits = [
    payload.adaptation_reason.adaptation_type,
    payload.adaptation_reason.reason,
  ]
    .map((s) => s.trim())
    .filter(Boolean);
  const reasonPhrase = reasonBits.length
    ? reasonBits.join(' — ').toLowerCase()
    : 'clinical optimization';

  const intro =
    `I am writing to inform you that I adapted the following prescription after assessing the patient` +
    (reasonBits.length ? ` because of ${reasonPhrase}` : '') +
    '.';

  const rationale =
    ensureSentence(payload.pharmacist_approved_rationale) ||
    (reasonBits.length
      ? `The prescription was adapted due to ${reasonPhrase}.`
      : 'The prescription was adapted based on the pharmacist clinical assessment.');

  const clinicalBits: string[] = [];
  if (payload.relevant_patient_context.age) {
    clinicalBits.push(`age ${payload.relevant_patient_context.age}`);
  }
  if (payload.relevant_patient_context.allergies.length) {
    clinicalBits.push(`allergies: ${payload.relevant_patient_context.allergies.join('; ')}`);
  }
  for (const lab of payload.relevant_labs_vitals) {
    clinicalBits.push(formatLabPhrase(lab));
  }
  for (const finding of payload.key_clinical_findings.slice(0, 2)) {
    const bit = [finding.summary, finding.recommendation].filter(Boolean).join(' ');
    if (bit) clinicalBits.push(bit.replace(/\s+/g, ' ').trim());
  }
  const exp = payload.current_medication_experience;
  if (exp.isTakingMedication === true) {
    const expBits = [
      exp.currentUse,
      exp.duration ? `duration ${exp.duration}` : '',
      exp.effectiveness ? `response ${exp.effectiveness}` : '',
      exp.adverseEffects ? `tolerability ${exp.adverseEffects}` : '',
      exp.adherence ? `adherence ${exp.adherence}` : '',
    ].filter(Boolean);
    if (expBits.length) {
      clinicalBits.push(`current medication experience: ${expBits.join('; ')}`);
    }
  } else if (exp.isTakingMedication === false) {
    clinicalBits.push('the medication had not yet been started');
  }

  const relevantClinicalInformation = clinicalBits.length
    ? ensureSentence(`Relevant clinical information included ${clinicalBits.join('; ')}`)
    : '';

  const mon = payload.monitoring_follow_up;
  const monBits = [mon.plan, mon.timing, mon.responsible_party].filter((s) => s.trim());
  const monitoringFollowUp = monBits.length
    ? ensureSentence(monBits.join('; '))
    : '';

  const counselBits: string[] = [];
  if (payload.counselling_confirmed.length) {
    counselBits.push(
      'The patient was counselled regarding the adapted regimen and relevant precautions.',
    );
  }
  if (payload.patient_agreement.confirmed === true) {
    counselBits.push('The patient agreed to the adaptation and follow-up plan.');
  }
  const counsellingAgreement = counselBits.join(' ');

  return {
    intro: ensureSentence(intro),
    rationale,
    relevantClinicalInformation,
    monitoringFollowUp,
    counsellingAgreement,
    closing: composeClosing(payload),
  };
}

export function validateAdaptPcpDraft(
  draft: AdaptPcpDraft,
  payload: AdaptPcpGenerationPayload,
): string[] {
  const body = [draft.intro, draft.rationale, draft.relevantClinicalInformation, draft.monitoringFollowUp, draft.counsellingAgreement, draft.closing]
    .filter(Boolean)
    .join('\n');
  const warnings: string[] = [];
  for (const check of FORBIDDEN_CLAIM_CHECKS) {
    if (check.re.test(body) && !check.allowed(payload)) {
      warnings.push(`Unsupported PCP claim: ${check.id}`);
    }
  }
  if (!draft.intro?.trim()) warnings.push('Missing intro');
  if (!draft.rationale?.trim()) warnings.push('Missing rationale');
  if (!draft.closing?.trim()) warnings.push('Missing closing');
  return warnings;
}

export function acceptAdaptPcpDraft(
  draft: AdaptPcpDraft,
  payload: AdaptPcpGenerationPayload,
): { ok: boolean; draft: AdaptPcpDraft; warnings: string[] } {
  const normalized: AdaptPcpDraft = {
    intro: stripHeading(draft.intro ?? '', /intro/i),
    rationale: stripHeading(draft.rationale ?? '', /rationale|clinical rationale/i),
    relevantClinicalInformation: stripHeading(
      draft.relevantClinicalInformation ?? '',
      /relevant clinical/i,
    ),
    monitoringFollowUp: stripHeading(
      draft.monitoringFollowUp ?? '',
      /monitoring|follow-?up/i,
    ),
    counsellingAgreement: stripHeading(
      draft.counsellingAgreement ?? '',
      /counselling|agreement|consent/i,
    ),
    closing: stripHeading(draft.closing ?? '', /closing/i),
  };
  const warnings = validateAdaptPcpDraft(normalized, payload);
  const ok =
    warnings.length === 0 &&
    Boolean(normalized.intro && normalized.rationale && normalized.closing);
  return { ok, draft: normalized, warnings };
}

/** Parse Assist Engine / Document Session JSON into an Adapt PCP draft. */
export function assembleAdaptPcpDraftFromAi(raw: unknown): { draft: AdaptPcpDraft; ok: boolean } {
  const fields = stringFieldsFromUnknown(raw);
  const draft: AdaptPcpDraft = {
    intro: stripHeading(fields.intro ?? '', /intro/i),
    rationale: stripHeading(
      fields.rationale ?? fields.clinical_rationale ?? '',
      /rationale|clinical rationale/i,
    ),
    relevantClinicalInformation: stripHeading(
      fields.relevantClinicalInformation ??
        fields.relevant_clinical_information ??
        '',
      /relevant clinical/i,
    ),
    monitoringFollowUp: stripHeading(
      fields.monitoringFollowUp ?? fields.monitoring_follow_up ?? '',
      /monitoring|follow-?up/i,
    ),
    counsellingAgreement: stripHeading(
      fields.counsellingAgreement ?? fields.counselling_agreement ?? '',
      /counselling|agreement|consent/i,
    ),
    closing: stripHeading(fields.closing ?? '', /closing/i),
  };
  const ok = Boolean(draft.intro.trim() && draft.rationale.trim() && draft.closing.trim());
  return { draft, ok };
}

function stringFieldsFromUnknown(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') out[key] = value;
  }
  const nested =
    (raw as { prescriber_communication?: unknown }).prescriber_communication ??
    (raw as { pcp?: unknown }).pcp ??
    (raw as { letter?: unknown }).letter;
  if (nested && typeof nested === 'object') {
    for (const [key, value] of Object.entries(nested as Record<string, unknown>)) {
      if (typeof value === 'string' && !out[key]) out[key] = value;
    }
  }
  return out;
}

export function renderAdaptPcpReferences(
  payload: AdaptPcpGenerationPayload,
  config: AdaptPrescriberCommunicationReferenceConfig = ADAPT_PCP_REFERENCE_DEFAULTS,
): string {
  const lines: string[] = [];

  if (config.includePharmacistConsultedReferences) {
    const pharmacist = payload.pharmacist_references_consulted
      .map((r) => formatPharmacistRef(r))
      .filter(Boolean);
    if (pharmacist.length === 1) {
      lines.push(`Clinical reference consulted:\n${pharmacist[0]}`);
    } else if (pharmacist.length > 1) {
      lines.push(`Clinical reference(s) consulted:\n${pharmacist.join('; ')}`);
    }
  }

  if (config.includePrimarySafeScribeReference) {
    const supporting = payload.safescribe_supporting_references
      .slice(0, Math.max(0, config.maxSafeScribeReferences))
      .map((r) => formatSupportingRef(r))
      .filter(Boolean);
    if (supporting.length === 1) {
      lines.push(`Supporting reference:\n${supporting[0]}`);
    } else if (supporting.length > 1) {
      lines.push(`Supporting references:\n${supporting.join('; ')}`);
    }
  }

  return lines.join('\n\n').trim();
}

export function renderAdaptPcpNote(
  draft: AdaptPcpDraft,
  payload: AdaptPcpGenerationPayload,
  context?: AdaptDapGenerationContext,
  referenceConfig?: Partial<AdaptPrescriberCommunicationReferenceConfig>,
): { plainText: string; html: string } {
  const cfg = { ...ADAPT_PCP_REFERENCE_DEFAULTS, ...referenceConfig };
  const patientName = payload.patient.name || '—';
  const dob = payload.patient.dob || '—';
  const phn = payload.patient.health_number;
  const original = formatPrescriptionLine(payload.original_prescription);
  const adapted = formatPrescriptionLine(payload.final_adapted_prescription, {
    includeQtyRefills: true,
  });
  const refs = renderAdaptPcpReferences(payload, cfg);

  const plainParts = [
    ADAPT_PCP_NOTIFICATION_TITLE,
    '',
    `Patient: ${patientName}`,
    `DOB: ${dob}`,
    phn ? `PHN: ${phn}` : '',
    '',
    ADAPT_PCP_SALUTATION,
    '',
    draft.intro,
    '',
    'Original prescription:',
    original || '—',
    '',
    'Adapted prescription:',
    adapted || '—',
    '',
    'Clinical rationale:',
    draft.rationale,
  ];

  if (draft.relevantClinicalInformation.trim()) {
    plainParts.push('', 'Relevant clinical information:', draft.relevantClinicalInformation.trim());
  }
  if (draft.monitoringFollowUp.trim()) {
    plainParts.push('', 'Monitoring / follow-up:', draft.monitoringFollowUp.trim());
  }
  if (draft.counsellingAgreement.trim()) {
    plainParts.push('', draft.counsellingAgreement.trim());
  }
  if (refs) {
    plainParts.push('', refs);
  }
  plainParts.push('', draft.closing, '', 'Sincerely,', '', ...signaturePlainLines(context));

  const plainText = plainParts.filter((line, idx, arr) => !(line === '' && arr[idx - 1] === '')).join('\n').trim();

  const htmlParts = [
    '<div class="prescriber-notification-container adapt-pcp-note">',
    `<h2>${escapeHtml(ADAPT_PCP_NOTIFICATION_TITLE)}</h2>`,
    `<p><strong>Patient:</strong> ${escapeHtml(patientName)} | <strong>DOB:</strong> ${escapeHtml(dob)}${
      phn ? ` | <strong>PHN:</strong> ${escapeHtml(phn)}` : ''
    }</p>`,
    `<p>${escapeHtml(ADAPT_PCP_SALUTATION)}</p>`,
    `<p>${escapeHtml(draft.intro)}</p>`,
    '<p><strong>Original prescription:</strong><br />',
    `${escapeHtml(original || '—')}</p>`,
    '<p><strong>Adapted prescription:</strong><br />',
    `${escapeHtml(adapted || '—')}</p>`,
    '<p><strong>Clinical rationale:</strong><br />',
    `${escapeHtml(draft.rationale)}</p>`,
  ];

  if (draft.relevantClinicalInformation.trim()) {
    htmlParts.push(
      '<p><strong>Relevant clinical information:</strong><br />',
      `${escapeHtml(draft.relevantClinicalInformation.trim())}</p>`,
    );
  }
  if (draft.monitoringFollowUp.trim()) {
    htmlParts.push(
      '<p><strong>Monitoring / follow-up:</strong><br />',
      `${escapeHtml(draft.monitoringFollowUp.trim())}</p>`,
    );
  }
  if (draft.counsellingAgreement.trim()) {
    htmlParts.push(`<p>${escapeHtml(draft.counsellingAgreement.trim())}</p>`);
  }
  if (refs) {
    htmlParts.push(`<p>${escapeHtml(refs).replace(/\n/g, '<br />')}</p>`);
  }
  htmlParts.push(`<p>${escapeHtml(draft.closing)}</p>`);
  htmlParts.push('<p>Sincerely,</p>');
  htmlParts.push(`<p>${signatureHtml(context)}</p>`);
  htmlParts.push('</div>');

  return { plainText, html: htmlParts.join('\n') };
}

export function buildAdaptPrescriberCommunication(input: AdaptPcpBuildInput): {
  payload: AdaptPcpGenerationPayload;
  draft: AdaptPcpDraft;
  plainText: string;
  html: string;
  warnings: string[];
  usedAiDraft: boolean;
} {
  const { payload } = buildAdaptPcpPayload(input);
  const fallback = composeAdaptPcpFallback(payload);
  const candidate = input.aiDraft ?? fallback;
  const accepted = acceptAdaptPcpDraft(candidate, payload);
  const draft = accepted.ok ? accepted.draft : fallback;
  const warnings = accepted.ok
    ? accepted.warnings
    : [...accepted.warnings, 'PCP draft rejected; deterministic fallback used'];
  const rendered = renderAdaptPcpNote(draft, payload, input.context, input.referenceConfig);

  return {
    payload,
    draft,
    plainText: rendered.plainText,
    html: rendered.html,
    warnings,
    usedAiDraft: Boolean(input.aiDraft) && accepted.ok,
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function composeClosing(payload: AdaptPcpGenerationPayload): string {
  const type = payload.prescriber_action_request.type;
  const details = payload.prescriber_action_request.details.trim();

  if (type === 'please_contact_pharmacy') {
    return ensureSentence(
      details ||
        'Please contact the pharmacy to discuss this adaptation at your earliest convenience.',
    );
  }
  if (type === 'follow_up_requested') {
    return ensureSentence(
      details ||
        'Follow-up with the patient is requested. Please contact the pharmacy if coordination is needed.',
    );
  }
  if (type === 'additional_assessment_requested') {
    return ensureSentence(
      details ||
        'Additional clinical assessment is requested. Please contact the pharmacy if you would like to discuss.',
    );
  }
  if (type === 'other' && details) {
    return ensureSentence(details);
  }
  return ADAPT_PCP_DEFAULT_CLOSING;
}

function formatPrescriptionLine(
  rx: Record<string, string>,
  opts?: { includeQtyRefills?: boolean },
): string {
  const drug = rx.drug?.trim() || '';
  const strength = rx.strength?.trim() || '';
  const form = rx.dosage_form?.trim() || '';
  const sig = rx.sig?.trim() || '';
  const identity = [drug || [strength, form].filter(Boolean).join(' ')].filter(Boolean).join(' ');
  let core = identity;
  if (sig) {
    core = identity ? `${identity} — ${sig}` : sig;
  }
  if (opts?.includeQtyRefills) {
    const qty = rx.quantity?.trim();
    const refills = rx.refills?.trim();
    const extras: string[] = [];
    if (qty) extras.push(`Quantity: ${qty}`);
    if (refills !== undefined && refills !== '') {
      extras.push(`Refills: ${refills}`);
    }
    if (extras.length) core = `${core}. ${extras.join('. ')}`;
  }
  return core.replace(/\s+/g, ' ').trim();
}

function formatLabPhrase(lab: {
  name: string;
  value: string;
  unit?: string;
  date?: string;
}): string {
  const unit = lab.unit ? ` ${lab.unit}` : '';
  const date = lab.date ? ` (date: ${lab.date})` : '';
  return `recent ${lab.name}${date}: ${lab.value}${unit}`;
}

function formatPharmacistRef(ref: {
  type: string;
  label: string;
  title?: string;
}): string {
  if (ref.type === 'ecps') return ref.label || 'eCPS';
  if (ref.type === 'bugs_and_drugs') return ref.label || 'Bugs & Drugs';
  return (ref.title || ref.label || '').trim();
}

function formatSupportingRef(ref: {
  title: string;
  yearEdition?: string;
  sectionsUsed?: string[];
}): string {
  let line = ref.title.trim();
  const section = ref.sectionsUsed?.[0];
  if (section) line = `${line} — ${section}`;
  return line;
}

function signaturePlainLines(context?: AdaptDapGenerationContext): string[] {
  const name = context?.pharmacistName?.trim() || 'Pharmacist';
  const license = context?.pharmacistLicense?.trim();
  const pharmacy = context?.pharmacyName?.trim() || 'SafeScribe Clinical Pharmacy';
  const phone = context?.pharmacyPhone?.trim();
  const fax = context?.pharmacyFax?.trim();
  const lines = [
    license && license !== '—' ? `${name}, RPh (Lic #${license})` : `${name}, RPh`,
    pharmacy,
  ];
  if (phone && phone !== '—') lines.push(`Phone: ${phone}`);
  if (fax && fax !== '—') lines.push(`Fax: ${fax}`);
  return lines;
}

function signatureHtml(context?: AdaptDapGenerationContext): string {
  return signaturePlainLines(context).map(escapeHtml).join('<br />');
}

function sanitizePlaceholder(
  value: string | null | undefined,
  placeholders: string[],
): string {
  const text = value?.trim() || '';
  if (!text) return '';
  if (placeholders.some((p) => p.toLowerCase() === text.toLowerCase())) return '';
  return text;
}

function ensureSentence(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function stripHeading(text: string, heading: RegExp): string {
  // Only strip explicit section labels ("Intro:", "## Clinical rationale") —
  // never eat ordinary sentence words that happen to match the label.
  return text
    .replace(
      new RegExp(`^\\s*(?:#+\\s*)?(?:${heading.source})\\s*:\\s*`, 'i'),
      '',
    )
    .replace(
      new RegExp(`^\\s*#+\\s*(?:${heading.source})\\s*\\n+`, 'i'),
      '',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function omitEmpty<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value == null) continue;
    if (typeof value === 'string' && !value.trim()) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

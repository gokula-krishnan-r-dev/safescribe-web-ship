import {
  acceptAutomatedReasonDraft,
  assessmentRequestForConcern,
  buildApprovedRequestSentence,
  buildDeterministicReferralReasonDraft,
  isUnwantedClinicalProse,
  REFERRAL_REASON_DRAFT_PROMPT_VERSION,
  sanitizePresentingConcern,
  toProviderConcernPhrase,
  type ReferralReasonDraftOrigin,
} from '@safescript/shared';
import type { ReferralDestination, ReferralUrgencyCode } from '@safescript/shared';
import type { ReferralTriggerSnapshotItem } from '@safescript/shared';

export const REFERRAL_REASON_DRAFT_QUALITY_CODES = {
  NEEDS_MANUAL_REASON: 'NEEDS_MANUAL_REASON',
  EMPTY_DRAFT: 'EMPTY_DRAFT',
  DRAFT_TOO_LONG: 'DRAFT_TOO_LONG',
  MISSING_REQUEST_SENTENCE: 'MISSING_REQUEST_SENTENCE',
  MISSING_REQUIRED_CONCERN: 'MISSING_REQUIRED_CONCERN',
  UNKNOWN_REASON_ID: 'UNKNOWN_REASON_ID',
  UNKNOWN_FACT_ID: 'UNKNOWN_FACT_ID',
  INCOMPLETE_REASON_IDS: 'INCOMPLETE_REASON_IDS',
  INVALID_SCHEMA: 'INVALID_SCHEMA',
  FORBIDDEN_CLAIM: 'FORBIDDEN_CLAIM',
  UNSOURCED_VALUE: 'UNSOURCED_VALUE',
  GENERIC_COMPLAINT_ONLY: 'GENERIC_COMPLAINT_ONLY',
  GENERIC_FROM_RICH_SOURCE: 'GENERIC_FROM_RICH_SOURCE',
} as const;

export type ReferralDraftFactStatus =
  | 'CONFIRMED'
  | 'PHARMACIST_REVIEWED_NARRATIVE'
  | 'PATIENT_REPORTED_CANDIDATE'
  | 'EXPLICIT_UNKNOWN';

export interface ReferralReasonDraftFact {
  id: string;
  renderedText: string;
  provenance: string;
  category?:
    | 'PRESENTING_CONCERN'
    | 'SYMPTOM'
    | 'PERTINENT_NEGATIVE'
    | 'OBSERVATION'
    | 'MEASUREMENT'
    | 'CONDITION'
    | 'MEDICATION'
    | 'ALLERGY'
    | 'TREATMENT_TRIED'
    | 'CARE_PROVIDED'
    | 'OTHER';
  assertion?: 'PRESENT' | 'ABSENT' | 'UNKNOWN';
  status?: ReferralDraftFactStatus;
  source?:
    | 'PATIENT_REPORTED'
    | 'PHARMACIST_OBSERVED'
    | 'PROFILE_REVIEW'
    | 'CONSULTATION_TRANSCRIPT'
    | 'PATHWAY_RESPONSE';
  materiality?: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface ReferralReasonDraftPackage {
  consultationId: string;
  sourceRevision: number;
  requestId: string;
  promptVersion: string;
  pathway: {
    id: string | null;
    name: string | null;
    condition: string | null;
    version: number | null;
  };
  workingImpression: string | null;
  workingImpressionCertainty: 'CONFIRMED' | 'PROBABLE' | 'POSSIBLE' | null;
  presentingConcern: string;
  destination: ReferralDestination | null;
  destinationOtherText: string | null;
  urgency: { code: ReferralUrgencyCode; display: string };
  approvedRequestSentence: string;
  approvedAssessmentRequest: string;
  patientContext: {
    ageYears: number | null;
    sexOrGenderText: string | null;
    pregnancyStatus: string | null;
  };
  selectedReferralReasons: Array<{
    id: string;
    label: string;
    urgencyCode: ReferralUrgencyCode;
    required: true;
    certainty: 'SUSPECTED' | 'POSSIBLE' | 'CONFIRMED' | 'CONCERN_FOR' | 'NOT_APPLICABLE';
  }>;
  otherScreeningAnswers: Array<{ id: string; label: string; answer: string }>;
  confirmedFacts: ReferralReasonDraftFact[];
  reviewedNarrative: string | null;
}

export interface ReferralReasonDraftResult {
  draftReason: string;
  origin: ReferralReasonDraftOrigin;
  needsManualReason: boolean;
  approvedRequestSentence: string;
  usedReferralReasonIds: string[];
  usedFactIds: string[];
  sourceRevision: number;
  requestId: string;
  promptVersion: string | null;
  consultationId: string;
  referralId: string | null;
  qualityCode?: string;
  insufficientContext?: boolean;
}

function certaintyFromLabel(
  label: string,
): 'SUSPECTED' | 'POSSIBLE' | 'CONFIRMED' | 'CONCERN_FOR' | 'NOT_APPLICABLE' {
  if (/\bconfirmed\b/i.test(label)) return 'CONFIRMED';
  if (/\bsuspected\b/i.test(label)) return 'SUSPECTED';
  if (/\bpossible\b/i.test(label)) return 'POSSIBLE';
  if (/\bconcern for\b/i.test(label)) return 'CONCERN_FOR';
  return 'POSSIBLE';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function fact(
  id: string,
  text: string,
  provenance: string,
  extra?: Partial<ReferralReasonDraftFact>,
): ReferralReasonDraftFact | null {
  const renderedText = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!renderedText) return null;
  return {
    id,
    renderedText: renderedText.slice(0, 240),
    provenance,
    materiality: extra?.materiality ?? 'MEDIUM',
    status: extra?.status ?? 'CONFIRMED',
    assertion: extra?.assertion ?? 'PRESENT',
    category: extra?.category,
    source: extra?.source,
  };
}

const HIGH_MATERIALITY_RE =
  /\b(duration|onset|location|eye|ocular|vision|photophobia|light|lesion|pain|fever|swell|contact lens|treatment|tried|worse|better|discharge|rash|cluster|lip|mouth|herpes|sore|irritat|sensitiv)\b/i;

const SCREENING_QUESTION_RE =
  /\b(can an appropriate .{0,80}be selected|after reviewing (?:age|pregnancy|allergies|renal)|safely after reviewing|eligibility|inclusion criteria|differential review acknowledgment)\b/i;

function materialityForQuestion(label: string): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (HIGH_MATERIALITY_RE.test(label)) return 'HIGH';
  if (/\b(eligib|inclusion|criteria)\b/i.test(label)) return 'LOW';
  return 'MEDIUM';
}

function isScreeningQuestion(question: string): boolean {
  if (SCREENING_QUESTION_RE.test(question)) return true;
  return (
    question.length > 140 &&
    /\b(allergies|current medications|renal function|cardiovascular risk)\b/i.test(
      question,
    )
  );
}

function skipNoiseValue(text: string): boolean {
  return /^(nkda|none|n\/a|na|unknown|not assessed|null|-)$/i.test(text.trim());
}

export function collectQuestionResponseFacts(responses: unknown): ReferralReasonDraftFact[] {
  const map =
    responses && typeof responses === 'object' && !Array.isArray(responses)
      ? (responses as Record<string, unknown>)
      : {};
  const facts: ReferralReasonDraftFact[] = [];
  let i = 0;
  for (const [key, raw] of Object.entries(map)) {
    if (facts.length >= 16) break;
    const rec = asRecord(raw);
    if (!rec) continue;
    const answer = String(rec.answerText ?? rec.answer ?? rec.documentationValue ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!answer || skipNoiseValue(answer)) continue;
    const question = String(rec.question ?? rec.label ?? rec.description ?? '')
      .replace(/^Is the following present:\s*/i, '')
      .replace(/\?$/, '')
      .replace(/\s+/g, ' ')
      .trim();
    const isUnknown = /^(unknown|unable|not sure|uncertain)$/i.test(answer);
    const isNo = /^(no|false|n|absent|negative)$/i.test(answer);
    const isYes = /^(yes|true|y|present|positive)$/i.test(answer);
    const label = question || `Finding ${i + 1}`;
    if (isScreeningQuestion(label) || isUnwantedClinicalProse(label)) continue;
    if (/^(reviewed|acknowledged|completed)$/i.test(answer)) continue;
    const rendered = isYes
      ? `Patient reported ${label.charAt(0).toLowerCase()}${label.slice(1)}.`
      : isNo
        ? `No ${label.charAt(0).toLowerCase()}${label.slice(1)} identified.`
        : isUnknown
          ? `${label} could not be confirmed.`
          : question
            ? `${label}: ${answer}`
            : answer;
    const sourceIsManual = String(rec.source ?? '').toLowerCase() === 'manual';
    i += 1;
    if (isUnwantedClinicalProse(rendered)) continue;
    const added = fact(`pathway-${key || i}`, rendered, 'pathway_response', {
      category: isNo ? 'PERTINENT_NEGATIVE' : 'SYMPTOM',
      assertion: isNo ? 'ABSENT' : isUnknown ? 'UNKNOWN' : 'PRESENT',
      status: isUnknown
        ? 'EXPLICIT_UNKNOWN'
        : sourceIsManual
          ? 'CONFIRMED'
          : 'PATIENT_REPORTED_CANDIDATE',
      source: sourceIsManual ? 'PATHWAY_RESPONSE' : 'CONSULTATION_TRANSCRIPT',
      materiality: materialityForQuestion(`${label} ${answer}`),
    });
    if (added) facts.push(added);
  }
  return facts;
}

export function collectSymptomFacts(symptoms: unknown): ReferralReasonDraftFact[] {
  if (!Array.isArray(symptoms)) return [];
  const facts: ReferralReasonDraftFact[] = [];
  symptoms.slice(0, 8).forEach((row, i) => {
    const rec = asRecord(row);
    const name = String(
      rec?.symptom ?? rec?.name ?? rec?.text ?? (typeof row === 'string' ? row : ''),
    )
      .replace(/\s+/g, ' ')
      .trim();
    if (!name || skipNoiseValue(name)) return;
    const duration = String(rec?.duration ?? rec?.onset ?? '').trim();
    const location = String(rec?.location ?? '').trim();
    const text = [name, location, duration].filter(Boolean).join(', ');
    const added = fact(`symptom-${i + 1}`, text, 'extracted_symptom', {
      category: 'SYMPTOM',
      status: 'PATIENT_REPORTED_CANDIDATE',
      source: 'CONSULTATION_TRANSCRIPT',
      materiality: 'HIGH',
    });
    if (added) facts.push(added);
  });
  return facts;
}

function collectPatientContext(demographics: unknown): ReferralReasonDraftPackage['patientContext'] {
  const demo = asRecord(demographics);
  if (!demo) {
    return { ageYears: null, sexOrGenderText: null, pregnancyStatus: null };
  }
  const n = Number(demo.age);
  const unit = String(demo.ageUnit ?? 'years').toLowerCase();
  let ageYears: number | null = Number.isFinite(n) ? n : null;
  if (ageYears != null) {
    if (unit.startsWith('m')) ageYears = Math.max(0, Math.round(ageYears / 12));
    else if (unit.startsWith('d')) ageYears = 0;
  }
  const sex = String(demo.sex ?? demo.gender ?? '').trim() || null;
  const pregnancyRaw = String(demo.pregnancyStatus ?? '').trim();
  const pregnancyStatus =
    pregnancyRaw && !/unknown|not assessed|n\/a/i.test(pregnancyRaw) ? pregnancyRaw : null;
  return { ageYears, sexOrGenderText: sex, pregnancyStatus };
}

export function collectConfirmedFacts(input: {
  conditions?: unknown;
  allergies?: unknown;
  medications?: unknown;
  demographics?: unknown;
  symptoms?: unknown;
  questionResponses?: unknown;
  treatmentsTried?: unknown;
}): ReferralReasonDraftFact[] {
  const facts: ReferralReasonDraftFact[] = [];
  const demo = asRecord(input.demographics);

  const demoAllergies = Array.isArray(demo?.allergyEntries) ? demo.allergyEntries : [];
  const allergiesNone =
    demo?.allergiesNone === true ||
    /^(no known (drug )?allergies|nkda|nka|none)$/i.test(
      String(demo?.allergies ?? '').trim(),
    );
  if (allergiesNone && !demoAllergies.length) {
    const added = fact('allergy-nkda', 'No known drug allergies.', 'confirmed_allergy', {
      category: 'ALLERGY',
      assertion: 'ABSENT',
      source: 'PROFILE_REVIEW',
      materiality: 'MEDIUM',
    });
    if (added) facts.push(added);
  } else {
    demoAllergies.slice(0, 8).forEach((row, i) => {
      const rec = asRecord(row);
      const allergen = String(rec?.drug ?? rec?.allergen ?? rec?.name ?? '').trim();
      if (!allergen || skipNoiseValue(allergen) || isUnwantedClinicalProse(allergen)) return;
      const reaction = String(rec?.reaction ?? '').trim();
      const text = reaction ? `${allergen} — ${reaction}` : allergen;
      const added = fact(`allergy-demo-${i + 1}`, text, 'confirmed_allergy', {
        category: 'ALLERGY',
        source: 'PROFILE_REVIEW',
        materiality: 'MEDIUM',
      });
      if (added) facts.push(added);
    });
    if (!facts.some((f) => f.category === 'ALLERGY')) {
      const raw = String(demo?.allergies ?? '').trim();
      if (raw && !isUnwantedClinicalProse(raw)) {
        raw.split(/;\s*/).forEach((part, i) => {
          const [drug, reaction] = part.split('|').map((s) => s.trim());
          if (!drug || skipNoiseValue(drug) || isUnwantedClinicalProse(drug)) return;
          const text = reaction ? `${drug} — ${reaction}` : drug;
          const added = fact(`allergy-demo-text-${i + 1}`, text, 'confirmed_allergy', {
            category: 'ALLERGY',
            source: 'PROFILE_REVIEW',
            materiality: 'MEDIUM',
          });
          if (added) facts.push(added);
        });
      }
    }
  }

  const demoMeds = Array.isArray(demo?.medicationEntries) ? demo.medicationEntries : [];
  const recordedMeds = String(demo?.currentMedications ?? '').trim();
  if (
    (demo?.medsNone === true || /^(none|n\/a|no current medications?( reported)?)$/i.test(recordedMeds)) &&
    !demoMeds.length
  ) {
    const added = fact(
      'medication-none',
      'No current medications reported.',
      'confirmed_medication',
      { category: 'MEDICATION', assertion: 'ABSENT', source: 'PROFILE_REVIEW', materiality: 'LOW' },
    );
    if (added) facts.push(added);
  } else {
    demoMeds.slice(0, 8).forEach((row, i) => {
      const rec = asRecord(row);
      const name = String(
        rec?.label ?? rec?.name ?? rec?.brandName ?? rec?.genericName ?? '',
      ).trim();
      if (!name || skipNoiseValue(name) || isUnwantedClinicalProse(name)) return;
      const added = fact(`medication-demo-${i + 1}`, name, 'confirmed_medication', {
        category: 'MEDICATION',
        source: 'PROFILE_REVIEW',
        materiality: 'MEDIUM',
      });
      if (added) facts.push(added);
    });
    if (!facts.some((f) => f.category === 'MEDICATION') && recordedMeds && !isUnwantedClinicalProse(recordedMeds)) {
      recordedMeds.split(/[,;]\s*/).forEach((part, i) => {
        const name = part.trim();
        if (!name || skipNoiseValue(name) || isUnwantedClinicalProse(name)) return;
        const added = fact(`medication-demo-text-${i + 1}`, name, 'confirmed_medication', {
          category: 'MEDICATION',
          source: 'PROFILE_REVIEW',
          materiality: 'MEDIUM',
        });
        if (added) facts.push(added);
      });
    }
  }

  if (demo?.noKnownConditions === true) {
    const added = fact(
      'condition-none',
      'No known medical conditions.',
      'confirmed_history',
      { category: 'CONDITION', assertion: 'ABSENT', source: 'PROFILE_REVIEW', materiality: 'LOW' },
    );
    if (added) facts.push(added);
  } else if (typeof demo?.medicalConditions === 'string' && demo.medicalConditions.trim()) {
    for (const [i, part] of demo.medicalConditions.split(/[,;]/).entries()) {
      const name = part.trim();
      if (!name || skipNoiseValue(name) || /^no known conditions$/i.test(name)) continue;
      const added = fact(`condition-demo-${i + 1}`, name, 'confirmed_history', {
        category: 'CONDITION',
        source: 'PROFILE_REVIEW',
        materiality: 'MEDIUM',
      });
      if (added) facts.push(added);
    }
  }

  facts.push(...collectQuestionResponseFacts(input.questionResponses));
  facts.push(...collectSymptomFacts(input.symptoms));

  const conditions = Array.isArray(input.conditions) ? input.conditions : [];
  conditions.slice(0, 4).forEach((row, i) => {
    const rec = asRecord(row);
    const name = String(rec?.condition ?? rec?.name ?? '').trim();
    if (skipNoiseValue(name)) return;
    if (facts.some((f) => f.category === 'CONDITION' && f.renderedText.toLowerCase() === name.toLowerCase())) {
      return;
    }
    const added = fact(`condition-${i + 1}`, name, 'confirmed_history', {
      category: 'CONDITION',
      source: 'PROFILE_REVIEW',
      materiality: 'MEDIUM',
    });
    if (added) facts.push(added);
  });

  const allergies = Array.isArray(input.allergies) ? input.allergies : [];
  allergies.slice(0, 4).forEach((row, i) => {
    const rec = asRecord(row);
    const allergen = String(rec?.allergen ?? rec?.name ?? rec?.drug ?? '').trim();
    if (!allergen || skipNoiseValue(allergen) || isUnwantedClinicalProse(allergen)) return;
    if (facts.some((f) => f.category === 'ALLERGY' && f.renderedText.toLowerCase().includes(allergen.toLowerCase()))) {
      return;
    }
    const reaction = String(rec?.reaction ?? '').trim();
    const text = reaction ? `${allergen} — ${reaction}` : allergen;
    const added = fact(`allergy-${i + 1}`, text, 'confirmed_allergy', {
      category: 'ALLERGY',
      source: 'PROFILE_REVIEW',
      materiality: 'MEDIUM',
    });
    if (added) facts.push(added);
  });

  const medications = Array.isArray(input.medications) ? input.medications : [];
  medications.slice(0, 4).forEach((row, i) => {
    const rec = asRecord(row);
    const name = String(rec?.name ?? rec?.drugName ?? rec?.label ?? '').trim();
    if (!name || skipNoiseValue(name) || isUnwantedClinicalProse(name)) return;
    if (facts.some((f) => f.category === 'MEDICATION' && f.renderedText.toLowerCase().includes(name.toLowerCase()))) {
      return;
    }
    const added = fact(`medication-${i + 1}`, name, 'confirmed_medication', {
      category: 'MEDICATION',
      source: 'PROFILE_REVIEW',
      materiality: 'MEDIUM',
    });
    if (added) facts.push(added);
  });

  const tried = Array.isArray(input.treatmentsTried) ? input.treatmentsTried : [];
  tried.slice(0, 4).forEach((row, i) => {
    const rec = asRecord(row);
    const name = String(
      rec?.name ?? rec?.treatment ?? rec?.text ?? (typeof row === 'string' ? row : ''),
    ).trim();
    if (!name || skipNoiseValue(name)) return;
    const response = String(rec?.response ?? rec?.result ?? '').trim();
    const text = response ? `${name} (${response})` : name;
    const added = fact(`treatment-tried-${i + 1}`, text, 'treatment_tried', {
      category: 'TREATMENT_TRIED',
      status: 'PATIENT_REPORTED_CANDIDATE',
      source: 'PATIENT_REPORTED',
      materiality: 'HIGH',
    });
    if (added) facts.push(added);
  });

  return facts.slice(0, 28);
}

export function collectOtherScreeningAnswers(redFlags: unknown): Array<{
  id: string;
  label: string;
  answer: string;
}> {
  const rf = asRecord(redFlags);
  const acks = Array.isArray(rf?.acknowledgments) ? rf.acknowledgments : [];
  const out: Array<{ id: string; label: string; answer: string }> = [];
  for (const raw of acks) {
    const ack = asRecord(raw);
    if (!ack) continue;
    const answer = String(ack.answer ?? '').trim().toLowerCase();
    const action = String(ack.action ?? '').trim().toLowerCase();
    if (action === 'refer') continue;
    if (answer !== 'no' && answer !== 'unknown') continue;
    const id = String(ack.flagId ?? '').trim();
    const label = String(ack.flag ?? '')
      .replace(/^Is the following present:\s*/i, '')
      .replace(/\?$/, '')
      .trim();
    if (!id && !label) continue;
    out.push({ id: id || `ack-${out.length + 1}`, label: label || 'Screening finding', answer });
  }
  return out.slice(0, 12);
}

export function buildReferralReasonDraftPackage(input: {
  consultationId: string;
  sourceRevision: number;
  requestId: string;
  pathwayId?: string | null;
  pathwayName?: string | null;
  pathwayCondition?: string | null;
  pathwayVersion?: number | null;
  presentingConcern?: string | null;
  destination?: ReferralDestination | '' | null;
  destinationOtherText?: string | null;
  urgencyCode: ReferralUrgencyCode;
  urgencyDisplay: string;
  triggers: ReferralTriggerSnapshotItem[];
  redFlags?: unknown;
  confirmedFacts?: ReferralReasonDraftFact[];
  demographics?: unknown;
  reviewedNarrative?: string | null;
}): ReferralReasonDraftPackage {
  const presentingConcern = sanitizePresentingConcern(input.presentingConcern);
  const workingImpression = String(input.pathwayCondition ?? input.pathwayName ?? '')
    .replace(/\s+/g, ' ')
    .trim() || null;
  const selectedReferralReasons = input.triggers.map((t) => ({
    id: t.questionId || t.ruleId,
    label: t.label,
    urgencyCode: t.urgencyCode,
    required: true as const,
    certainty: certaintyFromLabel(t.label),
  }));
  const primary = selectedReferralReasons[0];
  const approvedRequestSentence = primary
    ? buildApprovedRequestSentence({
        destination: input.destination || null,
        destinationOtherText: input.destinationOtherText,
        urgencyCode: primary.urgencyCode ?? input.urgencyCode,
        primaryConcern: primary.label,
      })
    : '';
  const approvedAssessmentRequest = primary
    ? assessmentRequestForConcern(toProviderConcernPhrase(primary.label))
    : '';

  const facts = [...(input.confirmedFacts ?? [])];
  if (presentingConcern && !facts.some((f) => f.id === 'context-1')) {
    facts.unshift({
      id: 'context-1',
      renderedText: presentingConcern,
      provenance: 'presenting_concern',
      category: 'PRESENTING_CONCERN',
      status: 'CONFIRMED',
      source: 'PATIENT_REPORTED',
      materiality: 'HIGH',
      assertion: 'PRESENT',
    });
  }

  const narrative = String(input.reviewedNarrative ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 800);

  return {
    consultationId: input.consultationId,
    sourceRevision: input.sourceRevision,
    requestId: input.requestId,
    promptVersion: REFERRAL_REASON_DRAFT_PROMPT_VERSION,
    pathway: {
      id: input.pathwayId ?? null,
      name: input.pathwayName ?? null,
      condition: input.pathwayCondition ?? null,
      version: input.pathwayVersion ?? null,
    },
    workingImpression,
    workingImpressionCertainty: workingImpression ? 'POSSIBLE' : null,
    presentingConcern,
    destination: input.destination || null,
    destinationOtherText: input.destinationOtherText?.trim() || null,
    urgency: { code: input.urgencyCode, display: input.urgencyDisplay },
    approvedRequestSentence,
    approvedAssessmentRequest,
    patientContext: collectPatientContext(input.demographics),
    selectedReferralReasons,
    otherScreeningAnswers: collectOtherScreeningAnswers(input.redFlags),
    confirmedFacts: facts,
    reviewedNarrative: narrative || null,
  };
}

/** Minimized payload for the model — no consultation/tenant identifiers. */
export function toReferralReasonLlmPayload(pkg: ReferralReasonDraftPackage): Record<string, unknown> {
  return {
    promptVersion: pkg.promptVersion,
    approvedLeadSentence: pkg.approvedRequestSentence,
    approvedAssessmentRequest: pkg.approvedAssessmentRequest,
    pathway: {
      presentingConcernLabel: pkg.presentingConcern || null,
      workingImpression: pkg.workingImpression,
      workingImpressionCertainty: pkg.workingImpressionCertainty,
    },
    patientContext: pkg.patientContext,
    activeReferralTriggers: pkg.selectedReferralReasons.map((r, i) => ({
      id: r.id,
      clinicalLabel: r.label,
      certainty: r.certainty,
      requiredToMention: r.required,
      priority: i + 1,
    })),
    facts: pkg.confirmedFacts.map((f) => ({
      id: f.id,
      category: f.category ?? 'OTHER',
      text: f.renderedText,
      assertion: f.assertion ?? 'PRESENT',
      status: f.status ?? 'CONFIRMED',
      source: f.source ?? 'PROFILE_REVIEW',
      materiality: f.materiality ?? 'MEDIUM',
    })),
    relevantReviewedNarrative: pkg.reviewedNarrative,
    pharmacistReferralRationale: null,
  };
}

export function allowedSourceTextForDraft(pkg: ReferralReasonDraftPackage): string {
  return [
    pkg.approvedRequestSentence,
    pkg.approvedAssessmentRequest,
    pkg.presentingConcern,
    pkg.workingImpression,
    pkg.selectedReferralReasons.map((r) => r.label).join(' '),
    pkg.confirmedFacts.map((f) => f.renderedText).join(' '),
    pkg.reviewedNarrative,
    pkg.patientContext.ageYears != null ? String(pkg.patientContext.ageYears) : '',
    pkg.patientContext.sexOrGenderText,
    pkg.patientContext.pregnancyStatus,
  ]
    .filter(Boolean)
    .join(' ');
}

export function highMaterialityFactTexts(pkg: ReferralReasonDraftPackage): string[] {
  return pkg.confirmedFacts
    .filter((f) => f.materiality === 'HIGH' && f.id !== 'context-1')
    .map((f) => f.renderedText);
}

export function fallbackReferralReasonDraft(
  pkg: ReferralReasonDraftPackage,
  extra: { consultationId: string; referralId: string | null; requestId: string },
): ReferralReasonDraftResult {
  const built = buildDeterministicReferralReasonDraft({
    destination: pkg.destination,
    destinationOtherText: pkg.destinationOtherText,
    urgencyCode: pkg.urgency.code,
    presentingConcern: pkg.presentingConcern,
    pathwayCondition: pkg.workingImpression,
    triggers: pkg.selectedReferralReasons.map((r) => ({
      id: r.id,
      label: r.label,
      urgencyCode: r.urgencyCode,
    })),
  });
  return {
    draftReason: built.draftReason,
    origin: built.origin,
    needsManualReason: built.needsManualReason,
    approvedRequestSentence: built.approvedRequestSentence || pkg.approvedRequestSentence,
    usedReferralReasonIds: built.usedReferralReasonIds,
    usedFactIds: pkg.confirmedFacts.map((f) => f.id).slice(0, 4),
    sourceRevision: pkg.sourceRevision,
    requestId: extra.requestId,
    promptVersion: null,
    consultationId: extra.consultationId,
    referralId: extra.referralId,
    qualityCode: built.needsManualReason ? 'NEEDS_MANUAL_REASON' : undefined,
    insufficientContext: pkg.confirmedFacts.filter((f) => f.id !== 'context-1').length === 0,
  };
}

export function parseAiReferralReasonDraft(
  raw: unknown,
  pkg: ReferralReasonDraftPackage,
): {
  draftReason: string;
  usedFactIds: string[];
  usedReferralReasonIds: string[];
  needsManualReason: boolean;
  insufficientContext: boolean;
} | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const draftReason = String(rec.draftReason ?? rec.draft_reason ?? '').trim();
  const needsManualReason = rec.needsManualReason === true || rec.needs_manual_reason === true;
  const insufficientContext =
    rec.insufficientContext === true || rec.insufficient_context === true;
  const usedFactIds = Array.isArray(rec.usedFactIds)
    ? rec.usedFactIds.map((id) => String(id))
    : Array.isArray(rec.used_fact_ids)
      ? rec.used_fact_ids.map((id) => String(id))
      : [];
  const usedReferralReasonIds = Array.isArray(rec.usedReferralTriggerIds)
    ? rec.usedReferralTriggerIds.map((id) => String(id))
    : Array.isArray(rec.used_referral_trigger_ids)
      ? rec.used_referral_trigger_ids.map((id) => String(id))
      : Array.isArray(rec.usedReferralReasonIds)
        ? rec.usedReferralReasonIds.map((id) => String(id))
        : Array.isArray(rec.used_referral_reason_ids)
          ? rec.used_referral_reason_ids.map((id) => String(id))
          : [];
  if (needsManualReason && !draftReason) {
    return {
      draftReason: '',
      usedFactIds: [],
      usedReferralReasonIds: [],
      needsManualReason: true,
      insufficientContext: true,
    };
  }
  void pkg;
  return {
    draftReason,
    usedFactIds,
    usedReferralReasonIds,
    needsManualReason,
    insufficientContext,
  };
}

export function resolveReferralReasonFromAi(
  raw: unknown,
  pkg: ReferralReasonDraftPackage,
): {
  ok: true;
  draftReason: string;
  usedFactIds: string[];
  usedReferralReasonIds: string[];
  insufficientContext: boolean;
} | { ok: false; code: string } {
  const parsed = parseAiReferralReasonDraft(raw, pkg);
  if (!parsed) return { ok: false, code: REFERRAL_REASON_DRAFT_QUALITY_CODES.INVALID_SCHEMA };
  if (parsed.needsManualReason && pkg.selectedReferralReasons.length > 0) {
    return { ok: false, code: REFERRAL_REASON_DRAFT_QUALITY_CODES.NEEDS_MANUAL_REASON };
  }
  const requiredReasonIds = pkg.selectedReferralReasons.map((r) => r.id);
  const knownReasonIds = requiredReasonIds;
  const knownFactIds = pkg.confirmedFacts.map((f) => f.id);
  const usedReasons = parsed.usedReferralReasonIds.length
    ? parsed.usedReferralReasonIds
    : requiredReasonIds;
  const check = acceptAutomatedReasonDraft({
    draftReason: parsed.draftReason,
    approvedRequestSentence: pkg.approvedRequestSentence,
    requiredConcernLabels: pkg.selectedReferralReasons.map((r) => r.label),
    requiredReasonIds,
    usedReferralReasonIds: usedReasons,
    usedReferralTriggerIds: usedReasons,
    usedFactIds: parsed.usedFactIds,
    knownFactIds,
    knownReasonIds,
    needsManualReason: parsed.needsManualReason,
    allowedSourceText: allowedSourceTextForDraft(pkg),
    highMaterialityFactTexts: highMaterialityFactTexts(pkg),
  });
  if (!check.ok) return check;
  return {
    ok: true,
    draftReason: parsed.draftReason.trim(),
    usedFactIds: parsed.usedFactIds,
    usedReferralReasonIds: usedReasons,
    insufficientContext: parsed.insufficientContext,
  };
}

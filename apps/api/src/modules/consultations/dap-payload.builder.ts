import {
  buildDapFollowUpPlan,
  buildDapObjectiveData,
  buildDapPatientSpecificSafety,
  buildDapTreatmentsFromPlan,
  confirmedCounsellingFromNotes,
  emptyDapPayload,
  isPatientHandoutProvided,
  normalizeDapFinding,
  stripInternalDapFields,
  toClinicalScreeningPhrase,
  type DapDocumentationFinding,
  type DapPayload,
} from '@safescript/shared';
import { isCounsellingConfirmed } from '@safescript/shared';
import {
  isPcpCommunicationCompleted,
  readConsentObtained,
  resolveNoRedFlagsRequiringReferral,
  stripDuplicateMedicationUse,
} from '@safescript/shared';

type Demo = Record<string, unknown>;

type PathwayQuestion = {
  id?: string;
  question?: string;
  description?: string | null;
  section?: { name?: string | null; displayName?: string | null } | null;
};

type QuestionResponse = {
  questionId?: string;
  question?: string;
  answer?: unknown;
  answerText?: string;
};

export type DapPayloadSource = {
  chiefComplaint?: string | null;
  demographics?: unknown;
  questionResponses?: unknown;
  redFlags?: unknown;
  eligibility?: unknown;
  treatmentPlan?: unknown;
  counsellingNotes?: unknown;
  documentation?: unknown;
  pathway?: {
    name?: string | null;
    condition?: string | null;
    questions?: PathwayQuestion[];
    differentials?: Array<{ name?: string | null; condition?: string | null }>;
  } | null;
  clinicalJudgmentAssessment?: {
    workingDiagnosisText?: string | null;
    diagnosticCertainty?: string | null;
    assessmentSummary?: string | null;
    assessmentSufficient?: boolean | null;
    unresolvedRedFlags?: boolean | null;
    redFlagChecks?: Array<{
      questions?: Array<{
        canonicalLabel?: string | null;
        questionText?: string | null;
        answer?: string | null;
        answerNotes?: string | null;
      }>;
    }>;
  } | null;
  treatmentRationale?: {
    status?: string | null;
    selectionRationale?: string | null;
    reasonForPrescribing?: string | null;
    alternatives?: Array<{
      selected?: boolean;
      details?: string | null;
      notSelectedReason?: string | null;
      category?: string | null;
    }>;
  } | null;
  referralOutcome?: {
    documentationText?: string | null;
    actionTaken?: string | null;
    destination?: string | null;
    action_completed?: boolean | null;
    status?: string | null;
    completedAt?: Date | string | null;
    letterExternalSendConfirmed?: boolean | null;
  } | null;
  consentObtained?: boolean;
  consultationMode?: string | null;
  presentingConcern?: string | null;
  followUpPlan?: {
    responsible_party?: string | null;
    timeframe?: string | null;
    primary_monitoring_target?: string | null;
    clinically_important_additional_parameter?: string | null;
    expected_outcome?: string | null;
    action_if_not_met?: string | null;
    responsibility_override_confirmed?: boolean;
    pharmacist_confirmed?: boolean;
  } | null;
  followUpRequired?: boolean;
};

function splitList(raw: unknown, max = 6): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((x) => String(x ?? '').trim())
      .filter((s) => s.length > 1 && !/^(nkda|none|n\/a|no known)/i.test(s))
      .slice(0, max);
  }
  const text = String(raw ?? '').trim();
  if (!text || /^(nkda|none|n\/a|no known)$/i.test(text)) return [];
  return text
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 80)
    .slice(0, max);
}

function ageYears(demo: Demo): number | null {
  const n = Number(demo.age);
  if (!Number.isFinite(n)) return null;
  const unit = String(demo.ageUnit ?? 'years').toLowerCase();
  if (unit.startsWith('m')) return Math.max(0, Math.round(n / 12));
  if (unit.startsWith('d')) return 0;
  return n;
}

function isYes(value: unknown): boolean {
  const t = String(value ?? '').trim().toLowerCase();
  return t === 'yes' || t === 'true' || t === 'y';
}

function isNo(value: unknown): boolean {
  const t = String(value ?? '').trim().toLowerCase();
  return t === 'no' || t === 'false' || t === 'n';
}

function isEligibilityQuestion(q: PathwayQuestion | undefined): boolean {
  const name = `${q?.section?.name ?? ''} ${q?.section?.displayName ?? ''}`.toLowerCase();
  return /eligib|treatment criteria|inclusion/.test(name);
}

function findQuestion(
  questions: PathwayQuestion[] | undefined,
  id?: string,
): PathwayQuestion | undefined {
  if (!id || !questions?.length) return undefined;
  return questions.find((q) => q.id === id);
}

function findingsFromResponses(
  responses: unknown,
  questions: PathwayQuestion[] | undefined,
  eligibility: boolean,
): DapDocumentationFinding[] {
  const map =
    responses && typeof responses === 'object'
      ? (responses as Record<string, QuestionResponse>)
      : {};
  const out: DapDocumentationFinding[] = [];
  for (const row of Object.values(map)) {
    if (!row) continue;
    const q = findQuestion(questions, row.questionId);
    if (isEligibilityQuestion(q) !== eligibility) continue;
    const finding = normalizeDapFinding({
      label: q?.description || q?.question || row.question,
      question: q?.question || row.question,
      answer: row.answer,
      documentationValue: row.answerText,
    });
    if (finding) out.push(finding);
  }
  return out.slice(0, 12);
}

function labsFromObjective(objective: ReturnType<typeof buildDapObjectiveData>): string[] {
  return objective.map((item) => {
    const unit = item.unit ? ` ${item.unit}` : '';
    return `${item.type} ${item.value}${unit}`.replace(/\s+/g, ' ').trim();
  });
}

function vitalsFromDemo(demo: Demo): string[] {
  const out: string[] = [];
  const bpSys = String(demo.bloodPressureSystolic ?? '').trim();
  const bpDia = String(demo.bloodPressureDiastolic ?? '').trim();
  if (bpSys && bpDia) out.push(`BP ${bpSys}/${bpDia}`);
  const hr = String(demo.heartRate ?? demo.pulse ?? '').trim();
  if (hr) out.push(`HR ${hr}`);
  const temp = String(demo.temperature ?? '').trim();
  if (temp) out.push(`Temp ${temp}`);
  const rr = String(demo.respiratoryRate ?? '').trim();
  if (rr) out.push(`RR ${rr}`);
  const spo2 = String(demo.oxygenSaturation ?? demo.spo2 ?? '').trim();
  if (spo2) out.push(`SpO2 ${spo2}`);
  return out;
}

function pregnancyLabel(demo: Demo): string | null {
  const p = String(demo.pregnancyStatus ?? '').trim();
  if (!p || /unknown|not assessed|n\/a/i.test(p)) return null;
  return p;
}

function breastfeedingLabel(demo: Demo): string | null {
  const p = String(demo.breastfeedingStatus ?? '').trim();
  if (!p || /unknown|not assessed|n\/a/i.test(p)) return null;
  return p;
}

function normalizePathwayRedFlags(redFlags: unknown): DapPayload['red_flags'] {
  const flags = (redFlags ?? {}) as {
    hasRedFlags?: boolean;
    referralSelected?: boolean;
    screeningAnswers?: Record<string, string>;
    acknowledgments?: Array<{
      flag?: string;
      answer?: string;
      action?: string;
    }>;
    redFlags?: Array<{ flag?: string; description?: string }>;
  };
  const negative: string[] = [];
  const positive: string[] = [];
  const uncertain: string[] = [];

  for (const ack of flags.acknowledgments ?? []) {
    const label =
      toClinicalScreeningPhrase(ack.flag) ||
      String(ack.flag ?? '').trim();
    if (!label) continue;
    const answer = String(ack.answer ?? '').toLowerCase();
    if (answer === 'yes' || ack.action === 'refer') positive.push(label);
    else if (answer === 'no' || ack.action === 'clear') negative.push(label);
    else if (answer === 'unable_to_confirm' || answer === 'unknown') {
      uncertain.push(label);
    }
  }

  if (!negative.length && !positive.length) {
    for (const [id, answer] of Object.entries(flags.screeningAnswers ?? {})) {
      const label = toClinicalScreeningPhrase(id);
      if (!label) continue;
      if (answer === 'yes') positive.push(label);
      else if (answer === 'no') negative.push(label);
    }
  }

  const screening_completed = Boolean(
    (flags.acknowledgments ?? []).length ||
      Object.keys(flags.screeningAnswers ?? {}).length ||
      flags.hasRedFlags === false,
  );

  return {
    screening_completed,
    negative_findings: [...new Set(negative)].slice(0, 8),
    positive_findings: [...new Set(positive)].slice(0, 8),
    uncertain_findings: [...new Set(uncertain)].slice(0, 6),
    referral_required: flags.referralSelected === true || flags.hasRedFlags === true,
    no_red_flags_requiring_referral_confirmed: resolveNoRedFlagsRequiringReferral(redFlags),
  };
}

function normalizeCjRedFlags(
  assessment: DapPayloadSource['clinicalJudgmentAssessment'],
): DapPayload['red_flags'] | null {
  const questions = assessment?.redFlagChecks?.[0]?.questions ?? [];
  if (!questions.length) return null;
  const negative: string[] = [];
  const positive: string[] = [];
  const uncertain: string[] = [];
  for (const q of questions) {
    const label =
      toClinicalScreeningPhrase(q.canonicalLabel) ||
      toClinicalScreeningPhrase(q.questionText);
    if (!label) continue;
    const answer = String(q.answer ?? '').toUpperCase();
    if (answer === 'YES') positive.push(label);
    else if (answer === 'NO') negative.push(label);
    else if (answer === 'UNABLE_TO_CONFIRM') uncertain.push(label);
  }
  return {
    screening_completed: true,
    negative_findings: [...new Set(negative)].slice(0, 8),
    positive_findings: [...new Set(positive)].slice(0, 8),
    uncertain_findings: [...new Set(uncertain)].slice(0, 6),
    referral_required: assessment?.unresolvedRedFlags === true,
    no_red_flags_requiring_referral_confirmed:
      assessment?.unresolvedRedFlags !== true && positive.length === 0 && questions.length > 0,
  };
}

function referralFromSource(source: DapPayloadSource): DapPayload['referral'] {
  const flags = (source.redFlags ?? {}) as {
    referralSelected?: boolean;
    referralCompleted?: boolean;
  };
  const outcome = source.referralOutcome;
  const completed = Boolean(
    outcome?.action_completed === true ||
      outcome?.status === 'COMPLETED' ||
      outcome?.completedAt ||
      outcome?.letterExternalSendConfirmed === true ||
      flags.referralCompleted === true,
  );
  return {
    recommended: flags.referralSelected === true || completed,
    action_completed: completed,
    reason: outcome?.documentationText || outcome?.actionTaken || null,
    destination: outcome?.destination || null,
  };
}

function pcpCompleted(documentation: unknown): boolean {
  return isPcpCommunicationCompleted(documentation);
}

function treatmentPlanFollowUpTimeframe(plan: unknown): string | null {
  if (!plan || typeof plan !== 'object') return null;
  const raw = String(
    (plan as { followUpTimeframe?: unknown }).followUpTimeframe ?? '',
  ).trim();
  return raw || null;
}

function mergeDapExplicitFollowUpPlan(
  explicit: DapPayloadSource['followUpPlan'],
  treatmentPlan: unknown,
): DapPayloadSource['followUpPlan'] {
  const timeframe =
    explicit?.timeframe?.trim() || treatmentPlanFollowUpTimeframe(treatmentPlan);
  if (!explicit && !timeframe) return null;
  return {
    ...(explicit ?? {}),
    ...(timeframe && !explicit?.timeframe?.trim() ? { timeframe } : {}),
  };
}

/**
 * Server-side DAP preprocessor. Never pass the raw consultation object
 * to the documentation model.
 */
export function buildDapPayloadFromConsultation(source: DapPayloadSource): DapPayload {
  const demo = (source.demographics ?? {}) as Demo;
  const payload = emptyDapPayload();
  const mode = String(source.consultationMode ?? '');
  const cj =
    mode === 'CLINICAL_JUDGMENT' ||
    mode === 'DOCUMENTATION_REFERRAL' ||
    Boolean(source.clinicalJudgmentAssessment?.workingDiagnosisText);

  if (readConsentObtained(source)) payload.consent_obtained = true;

  const objectiveData = buildDapObjectiveData({
    demographics: demo,
    treatmentPlan: source.treatmentPlan,
  });
  const patientSpecificSafety = buildDapPatientSpecificSafety({
    demographics: demo,
    treatmentPlan: source.treatmentPlan,
    objectiveData,
  });

  payload.patient_context = {
    age_years: ageYears(demo),
    sex: String(demo.sex ?? '').trim() || null,
    allergies: splitList(
      Array.isArray(demo.allergyEntries)
        ? (demo.allergyEntries as Array<{ drug?: string }>).map((a) => a.drug)
        : demo.allergies,
    ),
    conditions: demo.noKnownConditions ? [] : splitList(demo.medicalConditions),
    current_medications: splitList(
      Array.isArray(demo.medicationEntries)
        ? (demo.medicationEntries as Array<{ name?: string }>).map((m) => m.name)
        : demo.currentMedications,
    ),
    pregnancy: pregnancyLabel(demo),
    breastfeeding: breastfeedingLabel(demo),
    labs: labsFromObjective(objectiveData),
    vitals: vitalsFromDemo(demo),
  };
  payload.objective_data = objectiveData;
  payload.patient_specific_safety = patientSpecificSafety;

  payload.presenting_concern =
    String(source.chiefComplaint ?? '').trim() ||
    source.pathway?.condition?.trim() ||
    source.pathway?.name?.trim() ||
    null;

  if (cj) {
    const summary = String(
      source.clinicalJudgmentAssessment?.assessmentSummary ?? '',
    ).trim();
    payload.clinical_findings =
      summary && !/has the patient|does the patient|\?$/.test(summary)
        ? [
            {
              clinical_label: 'Assessment findings',
              status: 'present',
              documentation_value: summary,
            },
          ]
        : [];
    payload.eligibility_findings = [];
    payload.red_flags =
      normalizeCjRedFlags(source.clinicalJudgmentAssessment) ?? payload.red_flags;
    payload.assessment = {
      condition:
        source.clinicalJudgmentAssessment?.workingDiagnosisText?.trim() ||
        payload.presenting_concern,
      eligible_for_pharmacist_management:
        source.clinicalJudgmentAssessment?.assessmentSufficient ?? null,
      diagnostic_certainty:
        source.clinicalJudgmentAssessment?.diagnosticCertainty ?? null,
    };
    const alts = (source.treatmentRationale?.alternatives ?? [])
      .filter((a) => !a.selected && (a.notSelectedReason || a.details))
      .map((a) => String(a.details || a.category || '').trim())
      .filter(Boolean);
    payload.meaningful_differentials = alts.slice(0, 5);
    const rationaleConfirmed =
      source.treatmentRationale?.status === 'CONFIRMED';
    payload.treatment_rationale = rationaleConfirmed
      ? source.treatmentRationale?.selectionRationale ||
        source.treatmentRationale?.reasonForPrescribing ||
        null
      : null;
  } else {
    payload.clinical_findings = findingsFromResponses(
      source.questionResponses,
      source.pathway?.questions,
      false,
    );
    payload.eligibility_findings = findingsFromResponses(
      source.questionResponses,
      source.pathway?.questions,
      true,
    );
    const eligibility = (source.eligibility ?? {}) as { overallAssessment?: string };
    if (isYes(eligibility.overallAssessment) && !payload.eligibility_findings.length) {
      const extra = normalizeDapFinding({
        label: 'Treatment eligibility',
        answer: 'yes',
        documentationValue: 'Patient met the assessed criteria for pharmacist treatment.',
      });
      if (extra) payload.eligibility_findings.push(extra);
    }
    payload.red_flags = normalizePathwayRedFlags(source.redFlags);
    payload.assessment = {
      condition:
        source.pathway?.condition?.trim() ||
        source.pathway?.name?.trim() ||
        payload.presenting_concern,
      eligible_for_pharmacist_management: isYes(
        (source.eligibility as { overallAssessment?: string } | null)?.overallAssessment,
      )
        ? true
        : isNo(
              (source.eligibility as { overallAssessment?: string } | null)
                ?.overallAssessment,
            )
          ? false
          : null,
    };
    payload.meaningful_differentials = (source.pathway?.differentials ?? [])
      .map((d) => String(d.condition || d.name || '').trim())
      .filter(Boolean)
      .slice(0, 5);
    payload.treatment_rationale = null;
  }

  payload.treatment_safety = {
    review_completed: patientSpecificSafety.length > 0,
    clinically_significant_findings: patientSpecificSafety.map(
      (item) => item.documentation_summary,
    ),
  };
  payload.selected_treatments = buildDapTreatmentsFromPlan(source.treatmentPlan);
  payload.counselling_confirmed = isCounsellingConfirmed(source.counsellingNotes);
  if (payload.counselling_confirmed) {
    const counselling = confirmedCounsellingFromNotes(source.counsellingNotes);
    if (counselling) {
      counselling.medication_use = stripDuplicateMedicationUse(
        counselling.medication_use,
        payload.selected_treatments,
      );
    }
    payload.confirmed_counselling = counselling;
  }
  const followUp = buildDapFollowUpPlan({
    consultationMode: source.consultationMode,
    counsellingNotes: source.counsellingNotes,
    counsellingConfirmed: payload.counselling_confirmed,
    followUpRequired: source.followUpRequired,
    presentingConcern: source.chiefComplaint || source.pathway?.condition || source.pathway?.name,
    explicitPlan: mergeDapExplicitFollowUpPlan(source.followUpPlan, source.treatmentPlan),
  });
  payload.follow_up_plan = followUp.plan;
  payload.follow_up_incomplete = followUp.incomplete || undefined;
  payload.patient_handout_provided = isPatientHandoutProvided(
    source.counsellingNotes,
    source.documentation,
  );
  payload.referral = referralFromSource(source);
  payload.pcp_communication = {
    planned: payload.referral.recommended,
    completed: pcpCompleted(source.documentation),
  };

  return stripInternalDapFields(payload);
}

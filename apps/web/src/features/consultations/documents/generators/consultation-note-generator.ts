import { isNkdaText } from '../../ai-prefill';
import { usesClinicalJudgmentDap } from '../../types';
import type {
  Consultation,
  ClinicalQuestion,
  Demographics,
  PathwayDifferential,
  PathwayRedFlag,
  QuestionResponse,
  TreatmentRecommendation,
} from '../../types';
import type { PatientDocumentInfo } from '../types';
import {
  ALTERNATIVE_CATEGORY_LABELS,
  type AlternativeCategory,
  toClinicalScreeningPhrase,
  clinicalJudgementNoteFragment,
  formatClinicalReferences,
  NO_TREATMENT_NOTE_FRAGMENT,
  partitionLabAndVitalResults,
  buildDapTreatmentsFromPlan,
  renderDapPlanTreatments,
  buildPcpCommunicationPayload,
  buildDapFollowUpPlan,
  renderDapFollowUpPlan,
  containsPlannedFollowUpLanguage,
} from '@safescript/shared';
import {
  DAP_NOTE_TITLE,
  applyDapClinicalReferencesSentence,
  applyDapAttestationToFields,
  buildDapNotePlainText,
  clinicalReferencesFromDocumentation,
  upgradeDapNoteFields,
} from '../dap-note-format';
import { formatPrescribeDocumentChrome } from '../pathway-document-citations';
import {
  omitIfEmpty,
  projectConsultationSource,
  type ConsultationSourceProjection,
} from './source-projection';

export { buildDapNotePlainText as buildConsultationNotePlainText };

/**
 * Pharmacist Consultation Note — visible DAP (D / A / P).
 * Guided Pathway and Clinical Judgment share the same headings; content sources differ.
 *
 * Specs: Guided Pathway DAP Developer Package v1.0 · Clinical Judgment DAP Developer Package v1.0
 * Visual: Pharmacist Consultation Note sample.docx
 */
export function generateConsultationNoteFields(
  consultation: Consultation,
  patientInfo?: PatientDocumentInfo,
): Record<string, string> {
  const src = projectConsultationSource(consultation, patientInfo);
  const cj = usesClinicalJudgmentDap(consultation);
  const data = cj
    ? buildCjDataSection(consultation, src)
    : buildDataSection(consultation, src);
  const assessment = cj
    ? buildCjAssessmentSection(consultation, src)
    : buildAssessmentSection(consultation, src);
  const plan = buildPlanSection(consultation, src, {
    completedActionsOnly: cj,
  });

  const picker = clinicalReferencesFromDocumentation(consultation.documentation);
  return applyDapAttestationToFields(
    applyDapClinicalReferencesSentence(
      upgradeDapNoteFields({
        documentTitle: DAP_NOTE_TITLE,
        data,
        assessment,
        plan,
      }),
      formatPrescribeDocumentChrome(consultation) ??
        formatClinicalReferences(picker?.selections, picker?.consultedOn ?? ''),
    ),
    consultation,
  );
}

// ── Clinical Judgment D / A ───────────────────────────────────────────────────

function buildCjDataSection(
  consultation: Consultation,
  src: ConsultationSourceProjection,
): string {
  const paragraphs: string[] = [];
  const demo = consultation.demographics;

  const opening = buildCjOpeningNarrative(consultation, src, demo);
  if (opening) paragraphs.push(opening);

  const pregnancy = buildPregnancySentence(demo);
  if (pregnancy) paragraphs.push(pregnancy);

  const measurements = buildMeasurementsSentence(demo);
  if (measurements) paragraphs.push(measurements);

  const labs = buildLabsSentence(demo);
  if (labs) paragraphs.push(labs);

  const background = buildBackgroundSentence(demo);
  if (background) paragraphs.push(background);

  const summary = omitIfEmpty(src.assessmentSummaryNote);
  if (summary) paragraphs.push(ensurePeriod(summary));

  for (const sentence of buildCjRedFlagDataSentences(consultation)) {
    paragraphs.push(sentence);
  }

  return uniqueParagraphs(paragraphs).join('\n\n').trim();
}

function buildCjOpeningNarrative(
  consultation: Consultation,
  src: ConsultationSourceProjection,
  demo: Demographics | undefined,
): string {
  const concern =
    omitIfEmpty(src.chiefComplaint) || omitIfEmpty(src.workingDiagnosis);
  const lead = patientLead(demo);
  if (!concern) return `${lead} assessed during a pharmacist consultation.`;
  return `${lead} assessed for ${articleFor(lowerIfSentence(concern.replace(/\.$/, '')))}.`;
}

function buildCjRedFlagDataSentences(consultation: Consultation): string[] {
  const review = cjRedFlagReview(consultation);
  if (!review.screened) return [];

  const out: string[] = [];
  if (review.absent.length) {
    out.push(
      `Safety screening was negative for ${oxfordJoin(
        review.absent.slice(0, 6).map((p) => lowerIfSentence(p)),
      )}.`,
    );
  } else if (review.screened && !review.present.length && !review.unable.length) {
    out.push('Safety screening was negative. No red flags requiring referral were identified.');
  }
  if (review.present.length) {
    out.push(
      `Safety screening identified ${oxfordJoin(
        review.present.map((p) => lowerIfSentence(p)),
      )}.`,
    );
  }
  if (review.unable.length) {
    out.push(
      `Presence of ${oxfordJoin(
        review.unable.map((p) => lowerIfSentence(p)),
      )} could not be confirmed.`,
    );
  }
  for (const concern of review.manualUnresolved) {
    out.push(ensurePeriod(concern));
  }
  return out;
}

function buildCjAssessmentSection(
  consultation: Consultation,
  src: ConsultationSourceProjection,
): string {
  const paragraphs: string[] = [];
  const cj = consultation.clinicalJudgmentAssessment;
  const diagnosis = omitIfEmpty(src.workingDiagnosis);

  const impression = buildCjImpressionSentence(
    diagnosis,
    src.diagnosticCertainty,
  );
  if (impression) paragraphs.push(impression);

  const readiness = buildCjReadinessSentence(consultation, src);
  if (readiness) paragraphs.push(readiness);

  const unresolved = buildCjUnresolvedConcernSentence(consultation);
  if (unresolved) paragraphs.push(unresolved);

  const safety = buildSafetyConsiderations(src, consultation.demographics);
  if (safety) paragraphs.push(safety);

  const override = buildCjSafetyActionSentence(src);
  if (override) paragraphs.push(override);

  const mitigation =
    consultation.treatmentRationale?.safetyConfirmed
      ? omitIfEmpty(consultation.treatmentRationale.safetyMitigationSummary)
      : undefined;
  if (mitigation) paragraphs.push(ensurePeriod(mitigation));

  const rationale = omitIfEmpty(src.treatmentRationale);
  if (rationale) {
    paragraphs.push(ensurePeriod(rationale));
  }

  const alternatives = meaningfulCjAlternatives(consultation);
  if (alternatives.length) {
    paragraphs.push(ensurePeriod(alternatives.join(' ')));
  }

  if (
    referralActionCompleted(consultation) &&
    (cj?.unresolvedRedFlags === true || cj?.assessmentSufficient === false)
  ) {
    paragraphs.push(
      'Referral for further medical assessment was indicated based on the assessment findings.',
    );
  }

  return uniqueParagraphs(paragraphs).join('\n\n').trim();
}

function buildCjImpressionSentence(
  diagnosis: string | undefined,
  certainty: string | undefined,
): string {
  if (!diagnosis) return '';
  const name = diagnosis.replace(/\.$/, '');
  if (certainty === 'PROBABLE') {
    return `Assessment most consistent with probable ${lowerIfSentence(name)}.`;
  }
  if (certainty === 'UNCERTAIN') {
    return `Working diagnosis of ${lowerIfSentence(name)} remains uncertain based on the information available.`;
  }
  if (certainty === 'CONFIRMED') {
    return `Clinical impression of ${lowerIfSentence(name)} was confirmed based on the assessment.`;
  }
  return `Presentation is consistent with ${lowerIfSentence(name)}.`;
}

function buildCjReadinessSentence(
  consultation: Consultation,
  src: ConsultationSourceProjection,
): string {
  const cj = consultation.clinicalJudgmentAssessment;
  if (!cj) return '';
  const sufficient = cj.assessmentSufficient;
  const unresolved = cj.unresolvedRedFlags;

  if (sufficient === true && unresolved === false) {
    return 'Assessment was sufficient to support prescribing, with no unresolved red flags requiring referral.';
  }
  if (sufficient === true && unresolved === true) {
    return 'Assessment was considered sufficient to support safe prescribing. Unresolved red flags requiring referral were identified after pharmacist review.';
  }
  if (sufficient === false) {
    const detail =
      omitIfEmpty(cj.insufficiencyDetail) || omitIfEmpty(cj.readinessReason);
    return detail
      ? ensurePeriod(
          `Assessment was not considered sufficient to support safe prescribing. ${detail}`,
        )
      : 'Assessment was not considered sufficient to support safe prescribing.';
  }
  if (unresolved === false) {
    return 'No unresolved red flags requiring referral were identified after pharmacist review.';
  }
  if (unresolved === true && !src.treatments.length) {
    return 'Unresolved red flags requiring referral were identified after pharmacist review.';
  }
  return '';
}

function buildCjUnresolvedConcernSentence(consultation: Consultation): string {
  const cj = consultation.clinicalJudgmentAssessment;
  if (cj?.unresolvedRedFlags !== true) return '';
  const review = consultation.clinicalJudgmentRedFlagReview;
  const detail =
    omitIfEmpty(review?.otherConcernDetails) ||
    omitIfEmpty(cj.readinessReason) ||
    omitIfEmpty(cj.insufficiencyDetail);
  if (detail) return ensurePeriod(detail);

  const present = cjRedFlagReview(consultation).present;
  if (present.length) {
    return ensurePeriod(
      `Unresolved concerns included ${oxfordJoin(
        present.map((p) => lowerIfSentence(p)),
      )}`,
    );
  }
  return '';
}

function buildCjSafetyActionSentence(src: ConsultationSourceProjection): string {
  const selected = src.treatments[0];
  const reason = selected?.clinicalOverride?.reason?.trim();
  if (!reason) return '';
  return ensurePeriod(
    `Treatment selection accounted for ${lowerIfSentence(reason)}`,
  );
}

function meaningfulCjAlternatives(consultation: Consultation): string[] {
  const rationale = consultation.treatmentRationale;
  if (!rationale || rationale.noAlternativesDocumented) return [];
  const confirmed =
    rationale.status === 'CONFIRMED' || Boolean(rationale.alternativesConfirmed);
  if (!confirmed) return [];

  return (rationale.alternatives ?? [])
    .filter(
      (alt) =>
        !alt.selected &&
        Boolean(alt.notSelectedReason?.trim() || alt.details?.trim()),
    )
    .slice(0, 4)
    .map((alt) => {
      const categoryLabel =
        ALTERNATIVE_CATEGORY_LABELS[alt.category as AlternativeCategory] ??
        'another option';
      const name = omitIfEmpty(alt.details) || categoryLabel;
      const reason = omitIfEmpty(alt.notSelectedReason);
      return reason
        ? `${name} was considered and not selected (${lowerIfSentence(reason)}).`
        : `${name} was considered and not selected.`;
    });
}

function cjRedFlagReview(consultation: Consultation): {
  present: string[];
  absent: string[];
  unable: string[];
  manualUnresolved: string[];
  screened: boolean;
} {
  const review = consultation.clinicalJudgmentRedFlagReview;
  const present: string[] = [];
  const absent: string[] = [];
  const unable: string[] = [];
  const manualUnresolved: string[] = [];

  for (const q of review?.questions ?? []) {
    const label = toClinicalScreeningPhrase(q.canonicalLabel || q.question);
    if (!label || !q.answer) continue;
    const answer = String(q.answer).toUpperCase();
    if (answer === 'YES') present.push(label);
    else if (answer === 'NO') absent.push(label);
    else if (answer === 'UNABLE_TO_CONFIRM') unable.push(label);
  }

  for (const concern of review?.manualConcerns ?? []) {
    const text = concern.concernText?.trim();
    if (!text) continue;
    const status = concern.responseStatus?.toUpperCase();
    if (status === 'UNRESOLVED' || status === 'MORE_INFORMATION_REQUIRED') {
      manualUnresolved.push(text);
    }
  }

  if (review?.otherUnresolvedConcern && review.otherConcernDetails?.trim()) {
    const extra = review.otherConcernDetails.trim();
    if (!manualUnresolved.some((m) => m.toLowerCase() === extra.toLowerCase())) {
      manualUnresolved.push(extra);
    }
  }

  const screened = Boolean(
    review &&
      ((review.questions?.length ?? 0) > 0 ||
        (review.manualConcerns?.length ?? 0) > 0 ||
        review.status === 'CONFIRMED_CLEAR' ||
        review.status === 'REFERRAL_REQUIRED'),
  );

  return { present, absent, unable, manualUnresolved, screened };
}

function referralActionCompleted(consultation: Consultation): boolean {
  return Boolean(
    consultation.redFlags?.referralCompleted ||
      consultation.referralOutcome?.status === 'COMPLETED',
  );
}

function patientHandoutReviewed(consultation: Consultation): boolean {
  const docs = consultation.documentation as
    | {
        documentReviews?: {
          patient_care_summary?: { status?: string };
        };
      }
    | undefined;
  return docs?.documentReviews?.patient_care_summary?.status === 'REVIEWED';
}

function pcpCommunicationCompleted(consultation: Consultation): boolean {
  const docs = consultation.documentation as
    | {
        documentReviews?: {
          prescriber_communication?: { status?: string };
        };
      }
    | undefined;
  return docs?.documentReviews?.prescriber_communication?.status === 'REVIEWED';
}

// ── D — Data ──────────────────────────────────────────────────────────────────

function buildDataSection(
  consultation: Consultation,
  src: ConsultationSourceProjection,
): string {
  const paragraphs: string[] = [];
  const demo = consultation.demographics;

  const opening = buildOpeningNarrative(consultation, src, demo);
  if (opening) paragraphs.push(opening);

  const pregnancy = buildPregnancySentence(demo);
  if (pregnancy) paragraphs.push(pregnancy);

  const measurements = buildMeasurementsSentence(demo);
  if (measurements) paragraphs.push(measurements);

  const labs = buildLabsSentence(demo);
  if (labs) paragraphs.push(labs);

  const background = buildBackgroundSentence(demo);
  if (background) paragraphs.push(background);

  const findings = buildClinicalFindingsSentence(consultation, src);
  if (findings) paragraphs.push(findings);

  const differentials = buildDifferentialSentence(consultation);
  if (differentials) paragraphs.push(differentials);

  const redFlags = buildRedFlagDataSentence(consultation);
  if (redFlags) paragraphs.push(redFlags);

  const eligibility = buildEligibilityEvidenceSentence(consultation);
  if (eligibility) paragraphs.push(eligibility);

  return paragraphs.join('\n\n').trim();
}

function buildOpeningNarrative(
  consultation: Consultation,
  src: ConsultationSourceProjection,
  demo: Demographics | undefined,
): string {
  const concern =
    omitIfEmpty(src.chiefComplaint) ||
    omitIfEmpty(src.pathwayLabel) ||
    omitIfEmpty(src.workingDiagnosis);
  const lead = patientLead(demo);
  const concernPhrase = concern ? lowerIfSentence(concern.replace(/\.$/, '')) : '';
  const first = concernPhrase
    ? `${lead} assessed for ${articleFor(concernPhrase)}.`
    : `${lead} assessed during a pharmacist consultation.`;

  const positives = classifiedAnswers(consultation).diagnosisYes;
  if (!positives.length) return first;

  const including = oxfordJoin(positives.slice(0, 5).map((p) => lowerIfSentence(p)));
  return `${first} Patient reported ${including}.`;
}

function buildPregnancySentence(demo: Demographics | undefined): string {
  if (!demo) return '';
  const preg = polarity(demo.pregnancyStatus);
  const bf = polarity(demo.breastfeedingStatus);
  const bits: string[] = [];
  if (preg === 'yes') bits.push('Pregnancy recorded');
  else if (preg === 'unknown') bits.push('Pregnancy status recorded as unknown');
  if (bf === 'no' && preg !== 'empty') bits.push('patient is not breastfeeding');
  else if (bf === 'yes') bits.push('patient is breastfeeding');
  if (!bits.length) return '';
  const [head, ...rest] = bits;
  if (!rest.length) return ensurePeriod(head);
  return ensurePeriod(`${head}; ${rest.join('; ')}`);
}

function buildMeasurementsSentence(demo: Demographics | undefined): string {
  if (!demo) return '';
  const parts: string[] = [];
  const height = withUnit(demo.height, 'cm');
  const weight = withUnit(demo.weight, 'kg');
  if (height) parts.push(`height ${height}`);
  if (weight) parts.push(`weight ${weight}`);
  const sys = demo.bloodPressureSystolic?.trim();
  const dia = demo.bloodPressureDiastolic?.trim();
  if (sys && dia) parts.push(`blood pressure ${sys}/${dia} mmHg`);
  const pulse = demo.pulse?.trim();
  if (pulse) parts.push(`pulse ${/bpm/i.test(pulse) ? pulse : `${pulse} bpm`}`);
  if (!parts.length) return '';
  return `Relevant clinical measurements entered during the assessment: ${oxfordJoin(parts)}.`;
}

function buildLabsSentence(demo: Demographics | undefined): string {
  const items = labItems(demo);
  if (!items.length) return '';
  return `Recent laboratory values entered included ${oxfordJoin(items)}.`;
}

function buildBackgroundSentence(demo: Demographics | undefined): string {
  if (!demo) return '';
  const parts: string[] = [];

  const allergyText = demo.allergies?.trim();
  const allergyEntries = demo.allergyEntries?.filter((e) => e.drug?.trim()) ?? [];
  if (allergyEntries.length) {
    const listed = allergyEntries.slice(0, 4).map((e) => {
      const reaction = e.reaction?.trim();
      return reaction ? `${e.drug.trim()} (${reaction})` : e.drug.trim();
    });
    parts.push(`Allergies: ${oxfordJoin(listed)}`);
  } else if (allergyText && isNkdaText(allergyText)) {
    parts.push('No known drug allergies reported');
  } else if (allergyText) {
    parts.push(`Allergies: ${allergyText}`);
  }

  const meds = demo.medicationEntries?.filter((m) => m.label?.trim() || m.genericName?.trim()) ?? [];
  if (meds.length) {
    parts.push(
      `Current medications include ${oxfordJoin(
        meds.slice(0, 6).map((m) => (m.label || m.genericName || '').trim()),
      )}`,
    );
  } else if (demo.currentMedications?.trim() && !/^none\b/i.test(demo.currentMedications)) {
    parts.push(`Current medications: ${demo.currentMedications.trim()}`);
  }

  if (demo.noKnownConditions) {
    // Explicitly confirmed empty problem list — still omit a dump; a brief NKC is useful
    parts.push('No known medical conditions reported');
  } else if (demo.medicalConditions?.trim()) {
    parts.push(`Relevant medical history: ${demo.medicalConditions.trim()}`);
  }

  if (!parts.length) return '';
  return ensurePeriod(parts.join('. '));
}

function buildClinicalFindingsSentence(
  consultation: Consultation,
  src: ConsultationSourceProjection,
): string {
  const condition =
    omitIfEmpty(src.workingDiagnosis) || omitIfEmpty(src.pathwayLabel);
  const positives = classifiedAnswers(consultation).diagnosisYes;
  if (!condition && !positives.length) return '';
  if (!condition) {
    return ensurePeriod(
      `Clinical assessment findings included ${oxfordJoin(
        positives.slice(0, 6).map((p) => lowerIfSentence(p)),
      )}`,
    );
  }
  return `Clinical assessment findings supported the presentation of ${lowerIfSentence(condition)}.`;
}

function buildDifferentialSentence(consultation: Consultation): string {
  const alts = meaningfulDifferentials(consultation);
  if (!alts.length) return '';
  return `Alternative causes considered included ${oxfordJoin(alts)}.`;
}

function buildRedFlagDataSentence(consultation: Consultation): string {
  const { present, absent, screened } = redFlagReview(consultation);
  if (present.length) {
    return `Safety screening identified ${oxfordJoin(present.map((p) => lowerIfSentence(p)))}.`;
  }
  if (!screened) return '';
  if (!absent.length) {
    return 'Safety screening was negative. No red flags requiring referral were identified.';
  }
  return `Safety screening was negative for ${oxfordJoin(
    absent.slice(0, 6).map((p) => lowerIfSentence(p)),
  )}. No red flags requiring referral were identified.`;
}

function buildEligibilityEvidenceSentence(consultation: Consultation): string {
  const yes = classifiedAnswers(consultation).eligibilityYes;
  if (!yes.length) return '';
  const eligible = consultation.eligibility?.eligible;
  const lead =
    eligible === false
      ? 'The patient did not meet all assessed criteria for pharmacist treatment'
      : 'Patient met the assessed criteria for treatment';
  return `${lead}, including ${oxfordJoin(yes.slice(0, 5).map((p) => lowerIfSentence(p)))}.`;
}

// ── A — Assessment ────────────────────────────────────────────────────────────

function buildAssessmentSection(
  consultation: Consultation,
  src: ConsultationSourceProjection,
): string {
  const paragraphs: string[] = [];
  const cj = consultation.pathwayClinicalJudgement;
  if (cj?.noTreatmentInitiated) {
    paragraphs.push(NO_TREATMENT_NOTE_FRAGMENT);
  } else if (cj?.status === 'CONFIRMED' && cj.rationaleApproved) {
    paragraphs.push(
      clinicalJudgementNoteFragment({
        reason: cj.reason,
        workingDiagnosis: cj.workingDiagnosisDisplay || src.workingDiagnosis || src.pathwayLabel || '',
        diagnosticCertainty: cj.diagnosticCertainty,
        rationale: cj.rationaleApproved,
      }),
    );
  }

  const condition =
    omitIfEmpty(src.workingDiagnosis) ||
    omitIfEmpty(src.pathwayLabel) ||
    omitIfEmpty(src.clinicalImpression);

  if (condition && cj?.status !== 'CONFIRMED' && !cj?.noTreatmentInitiated) {
    const eligible = consultation.eligibility?.eligible !== false && !src.referralSelected;
    paragraphs.push(
      eligible
        ? `Presentation is consistent with ${lowerIfSentence(condition.replace(/\.$/, ''))} and appropriate for pharmacist management based on the history and assessment findings obtained.`
        : `Presentation is consistent with ${lowerIfSentence(condition.replace(/\.$/, ''))}. Pharmacist prescribing was not continued based on the assessment findings.`,
    );
  } else if (condition && cj?.status === 'CONFIRMED' && !cj.noTreatmentInitiated) {
    paragraphs.push(
      `Presentation is consistent with ${lowerIfSentence(condition.replace(/\.$/, ''))}. Care is continuing under documented clinical judgement.`,
    );
  }

  const { present, screened } = redFlagReview(consultation);
  if (present.length) {
    paragraphs.push(
      `Identified safety concerns (${oxfordJoin(present.map((p) => lowerIfSentence(p)))}) were material to the care decision.`,
    );
  } else if (screened) {
    paragraphs.push('No red flags requiring referral were identified.');
  }

  const safety = buildSafetyConsiderations(src, consultation.demographics);
  if (safety) paragraphs.push(safety);

  const rationale = omitIfEmpty(src.treatmentRationale);
  if (src.treatments.length && !src.referralSelected) {
    const name = treatmentDisplayName(src.treatments[0]);
    if (rationale) {
      paragraphs.push(ensurePeriod(rationale));
    } else {
      paragraphs.push(
        `${name} was selected as the treatment plan following assessment of clinical suitability and patient-specific safety considerations.`,
      );
    }
  } else if (rationale) {
    paragraphs.push(ensurePeriod(rationale));
  }

  const rejected = treatmentsConsideredNotSelected(consultation, src.treatments);
  if (rejected.length) {
    paragraphs.push(
      `${oxfordJoin(rejected)} ${rejected.length === 1 ? 'was' : 'were'} considered and not selected based on patient-specific safety or suitability.`,
    );
  }

  return uniqueParagraphs(paragraphs).join('\n\n').trim();
}

function buildSafetyConsiderations(
  src: ConsultationSourceProjection,
  demo: Demographics | undefined,
): string {
  const bits: string[] = [];
  if (src.pregnancyRecorded) bits.push('pregnancy');
  if (src.renalConsidered) {
    const egfr = labItems(demo).find((l) => /egfr/i.test(l));
    bits.push(
      egfr
        ? `significantly reduced renal function (${egfr})`
        : 'reduced renal function',
    );
  }
  if (src.hepaticConsidered) bits.push('hepatic impairment');

  const allergy = demo?.allergies?.trim();
  if (allergy && !isNkdaText(allergy)) bits.push(`allergy to ${allergy}`);
  else if ((demo?.allergyEntries?.length ?? 0) > 0) {
    bits.push(
      `allergy to ${oxfordJoin(
        (demo?.allergyEntries ?? []).map((e) => e.drug.trim()).filter(Boolean),
      )}`,
    );
  }

  if (!bits.length) return '';
  return `Relevant patient-specific treatment considerations included ${oxfordJoin(bits)}. Available treatment options were reviewed with these factors in mind.`;
}

function treatmentDisplayName(t: TreatmentRecommendation): string {
  const brand = t.medicationName?.trim() || t.brandName?.trim() || '';
  const generic = t.genericName?.trim() || '';
  if (brand && generic && brand.toLowerCase() !== generic.toLowerCase()) {
    return `${brand} (${generic})`;
  }
  return brand || generic || 'Selected treatment';
}

// ── P — Plan ──────────────────────────────────────────────────────────────────

function buildPlanSection(
  consultation: Consultation,
  src: ConsultationSourceProjection,
  options?: { completedActionsOnly?: boolean },
): string {
  const paragraphs: string[] = [];
  const completedOnly = Boolean(options?.completedActionsOnly);

  const confirmedTreatmentBlock = renderDapPlanTreatments(
    buildDapTreatmentsFromPlan(consultation.treatmentPlan),
  );
  if (confirmedTreatmentBlock && !src.referralSelected) {
    paragraphs.push(confirmedTreatmentBlock);
  }

  const counselling = clinicalNoteCounselling(consultation);
  if (counselling.medication.length || counselling.expected.length) {
    const bits: string[] = [];
    if (counselling.medication.length) {
      bits.push('Medication use and expected treatment response were reviewed with the patient');
    } else {
      bits.push('Expected treatment response was reviewed with the patient');
    }
    if (counselling.expected[0]) {
      bits.push(lowerIfSentence(counselling.expected[0].replace(/\.$/, '')));
    }
    paragraphs.push(ensurePeriod(bits.join('. ')));
  }

  if (counselling.selfCare.length) {
    paragraphs.push(
      ensurePeriod(
        `Self-care counselling included ${oxfordJoin(
          counselling.selfCare.slice(0, 4).map((p) => lowerIfSentence(p.replace(/\.$/, ''))),
        )}`,
      ),
    );
  }

  const { seek, follow } = splitSeekAndFollow(counselling.followUp);
  if (seek.length || follow.length) {
    const parts: string[] = [];
    if (seek.length) {
      parts.push(
        `Patient was advised to seek urgent medical attention for ${oxfordJoin(
          seek.slice(0, 3).map((p) => stripSeekLead(p)),
        )}`,
      );
    }
    if (follow.length) {
      parts.push(ensurePeriod(follow.slice(0, 2).join(' ')).replace(/\.$/, ''));
    }
    const timeframe = omitIfEmpty(src.followUpTimeframe);
    if (timeframe && !parts.some((p) => p.toLowerCase().includes(timeframe.toLowerCase()))) {
      parts.push(`Further assessment was advised if symptoms fail to improve within approximately ${timeframe}`);
    }
    paragraphs.push(ensurePeriod(parts.join('. ')));
  } else if (src.followUpTimeframe) {
    paragraphs.push(
      ensurePeriod(
        `The patient was advised to seek further care if symptoms worsen or do not improve within ${src.followUpTimeframe}`,
      ),
    );
  }

  const pcpPayload = buildPcpCommunicationPayload({
    chiefComplaint: consultation.chiefComplaint,
    consultationMode: consultation.consultationMode,
    pathway: consultation.pathway
      ? {
          condition: consultation.pathway.condition,
          name: consultation.pathway.name,
        }
      : null,
    treatmentPlan: consultation.treatmentPlan,
    counsellingNotes: consultation.counsellingNotes,
    redFlags: consultation.redFlags,
    referralOutcome: consultation.referralOutcome
      ? {
          documentationText: consultation.referralOutcome.documentationText,
          actionTaken: consultation.referralOutcome.actionTaken,
          action_completed:
            consultation.referralOutcome.status === 'COMPLETED' ||
            Boolean(consultation.referralOutcome.completedAt) ||
            consultation.referralOutcome.letterExternalSendConfirmed === true,
          referralSendConfirmed:
            consultation.referralOutcome.letterExternalSendConfirmed,
        }
      : null,
  });
  const dapFollowUp = buildDapFollowUpPlan({
    consultationMode: consultation.consultationMode,
    counsellingNotes: consultation.counsellingNotes,
    counsellingConfirmed:
      pcpPayload.pcp_follow_up_plan?.pharmacist_confirmed === true,
    followUpRequired: pcpPayload.follow_up_required,
    presentingConcern: pcpPayload.presenting_concern,
    explicitPlan: pcpPayload.pcp_follow_up_plan,
  });
  const followUp = renderDapFollowUpPlan(dapFollowUp.plan);
  if (followUp && !containsPlannedFollowUpLanguage(paragraphs.join('\n'))) {
    paragraphs.push(followUp);
  }

  if (src.includeCounsellingInHandout && patientHandoutReviewed(consultation)) {
    paragraphs.push('Patient education/handout provided.');
  }

  const referralCompleted = referralActionCompleted(consultation);
  if (referralCompleted) {
    const notes = omitIfEmpty(src.redFlagNotes);
    paragraphs.push(
      notes
        ? ensurePeriod(notes)
        : 'Referral for further medical assessment was completed.',
    );
  } else if (!completedOnly && src.referralSelected && !src.treatments.length) {
    paragraphs.push(
      'The patient was advised regarding referral for further assessment and interim safety-net instructions.',
    );
  }

  if (completedOnly && pcpCommunicationCompleted(consultation)) {
    paragraphs.push(
      'A consultation update was sent to the primary care provider.',
    );
  }

  return uniqueParagraphs(paragraphs).join('\n\n').trim();
}

function treatmentsConsideredNotSelected(
  consultation: Consultation,
  selected: TreatmentRecommendation[],
): string[] {
  const plan = consultation.treatmentPlan;
  const all = plan?.recommendedTreatments ?? [];
  if (all.length < 2) return [];
  const selectedNames = new Set(
    selected.map((t) => (t.medicationName || t.genericName || '').trim().toLowerCase()),
  );
  // Only mention alternatives that had an active safety warning — otherwise they were merely displayed.
  return all
    .filter((t) => {
      const name = (t.medicationName || t.genericName || '').trim();
      if (!name || selectedNames.has(name.toLowerCase())) return false;
      return Boolean(
        t.renalWarning?.active ||
          t.hepaticWarning?.active ||
          t.pregnancyWarning?.active ||
          t.allergyBlocked,
      );
    })
    .slice(0, 3)
    .map((t) => treatmentDisplayName(t));
}

// ── Counselling ───────────────────────────────────────────────────────────────

function clinicalNoteCounselling(consultation: Consultation): {
  medication: string[];
  expected: string[];
  selfCare: string[];
  followUp: string[];
} {
  const empty = { medication: [], expected: [], selfCare: [], followUp: [] };
  const notes = consultation.counsellingNotes as
    | {
        counselling_status?: string;
        plan?: {
          status?: string;
          sections?: Array<{
            section_key?: string;
            items?: Array<{
              text?: string;
              visibility?: string;
              document_targets?: string[];
            }>;
          }>;
        };
      }
    | undefined;
  const reviewed =
    notes?.plan?.status === 'REVIEWED' ||
    notes?.counselling_status === 'confirmed';
  if (!reviewed || !notes?.plan?.sections?.length) {
    return empty;
  }

  const pick = (key: string): string[] => {
    const section = notes.plan!.sections!.find((s) => s.section_key === key);
    return (section?.items ?? [])
      .filter((i) => {
        const targets = i.document_targets ?? ['CLINICAL_NOTE'];
        if (i.visibility === 'HANDOUT' && !targets.includes('CLINICAL_NOTE')) {
          return false;
        }
        return targets.includes('CLINICAL_NOTE') || targets.includes('PRESCRIBER_COMM');
      })
      .map((i) => i.text?.trim() ?? '')
      .filter(
        (t) =>
          t &&
          !/\?\s*$/.test(t) &&
          !/^add a short patient-facing point/i.test(t),
      );
  };

  return {
    medication: pick('MEDICATION_USE'),
    expected: pick('EXPECTED_RESPONSE'),
    selfCare: pick('SELF_CARE'),
    followUp: pick('FOLLOW_UP'),
  };
}

const SEEK_CARE_RE =
  /worsen|urgent|emergency|eye|breathing|swelling|rash|spread|seek medical|get medical|immediately|severe|tongue|face|allergic|chest pain/i;

function splitSeekAndFollow(points: string[]): { seek: string[]; follow: string[] } {
  const seek: string[] = [];
  const follow: string[] = [];
  for (const point of points) {
    if (SEEK_CARE_RE.test(point)) seek.push(point);
    else follow.push(point);
  }
  return { seek, follow };
}

function stripSeekLead(text: string): string {
  return text
    .replace(/^patient was advised to seek (?:urgent )?medical attention for\s+/i, '')
    .replace(/^seek (?:urgent )?medical (?:attention|help|care) for\s+/i, '')
    .replace(/^seek reassessment if\s+/i, '')
    .replace(/\.$/, '')
    .trim();
}

// ── Questions / red flags ─────────────────────────────────────────────────────

function classifiedAnswers(consultation: Consultation): {
  diagnosisYes: string[];
  eligibilityYes: string[];
} {
  const responses = consultation.questionResponses ?? {};
  const questions = consultation.pathway?.questions ?? [];
  const byId = new Map(questions.map((q) => [q.id, q]));
  const diagnosisYes: string[] = [];
  const eligibilityYes: string[] = [];

  for (const r of Object.values(responses)) {
    if (polarity(responseValue(r)) !== 'yes') continue;
    const q = byId.get(r.questionId);
    const phrase = findingPhrase(r, q);
    if (!phrase) continue;
    if (isEligibilityQuestion(q)) eligibilityYes.push(phrase);
    else diagnosisYes.push(phrase);
  }
  return { diagnosisYes, eligibilityYes };
}

function isEligibilityQuestion(q: ClinicalQuestion | undefined): boolean {
  const name = `${q?.section?.name ?? ''} ${q?.section?.displayName ?? ''}`.toLowerCase();
  return /eligib|treatment criteria|inclusion/.test(name);
}

function findingPhrase(r: QuestionResponse, q: ClinicalQuestion | undefined): string {
  const explicit = r.answerText?.trim();
  if (explicit && !/^(yes|no|true|false|y|n)$/i.test(explicit)) {
    return stripQuestionLead(explicit);
  }
  const raw = (q?.question || r.question || '').trim();
  return stripQuestionLead(raw);
}

function stripQuestionLead(text: string): string {
  return text
    .replace(/\?+$/, '')
    .replace(
      /^(does|did|has|have|is|are|was|were|can|could)\s+the\s+patient\s+(have|had|report|experience|show|present with)?\s*/i,
      '',
    )
    .replace(/^(does|did)\s+/i, '')
    .replace(/^(patient\s+)?(has|had|reports?|experiences?)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function responseValue(r: QuestionResponse): string {
  if (r.answerText?.trim()) return r.answerText.trim();
  if (typeof r.answer === 'boolean') return r.answer ? 'yes' : 'no';
  return String(r.answer ?? '').trim();
}

function pushUniquePhrase(bucket: string[], raw: string | null | undefined) {
  const label = toClinicalScreeningPhrase(raw);
  if (!label) return;
  if (bucket.some((p) => p.toLowerCase() === label.toLowerCase())) return;
  bucket.push(label);
}

function redFlagReview(consultation: Consultation): {
  present: string[];
  absent: string[];
  screened: boolean;
} {
  const result = consultation.redFlags;
  const pathwayFlags = (consultation.pathway?.redFlags ?? []) as PathwayRedFlag[];
  const byId = new Map<string, string>();
  for (const f of pathwayFlags) {
    if (!f.id || !f.title?.trim()) continue;
    byId.set(f.id, f.title.trim());
    byId.set(`pathway:${f.id}`, f.title.trim());
  }
  const acks = result?.acknowledgments ?? [];
  const ackByFlagId = new Map(
    acks
      .filter((a) => a.flagId)
      .map((a) => [a.flagId as string, a] as const),
  );

  const present: string[] = [];
  const absent: string[] = [];

  const resolveLabel = (id: string, fallback?: string | null) =>
    byId.get(id) ||
    byId.get(id.replace(/^pathway:/i, '')) ||
    ackByFlagId.get(id)?.flag ||
    ackByFlagId.get(`pathway:${id.replace(/^pathway:/i, '')}`)?.flag ||
    fallback ||
    null;

  const answers = result?.screeningAnswers ?? {};
  for (const [id, ans] of Object.entries(answers)) {
    const label = resolveLabel(id);
    if (ans === 'yes') pushUniquePhrase(present, label);
    else if (ans === 'no') pushUniquePhrase(absent, label);
  }

  for (const ack of acks) {
    const label = resolveLabel(ack.flagId ?? '', ack.flag);
    if (ack.answer === 'yes' || ack.action === 'refer') {
      pushUniquePhrase(present, label);
    } else if (ack.answer === 'no' || ack.action === 'clear') {
      pushUniquePhrase(absent, label);
    }
  }

  const screened = Boolean(
    result &&
      (Object.keys(answers).length > 0 ||
        (result.acknowledgments?.length ?? 0) > 0 ||
        result.hasRedFlags === false),
  );

  if (result?.hasRedFlags && present.length === 0) {
    for (const flag of result.redFlags ?? []) {
      pushUniquePhrase(present, flag.flag);
    }
  }

  return { present, absent, screened };
}

function meaningfulDifferentials(consultation: Consultation): string[] {
  const rows = (consultation.pathway?.differentials ?? []) as PathwayDifferential[];
  if (!rows.length) return [];
  // Pharmacist reached assessment; include pathway differentials that were available for review.
  return rows
    .map((d) => d.condition?.trim())
    .filter((c): c is string => Boolean(c))
    .slice(0, 4);
}

function labItems(demo: Demographics | undefined): string[] {
  if (!demo) return [];
  if (demo.extractedLabValues?.length) {
    const { labs } = partitionLabAndVitalResults(demo.extractedLabValues);
    return labs
      .filter((l) => l.test?.trim() && l.value?.trim())
      .slice(0, 6)
      .map((l) => {
        const unit = l.unit?.trim();
        return unit ? `${l.test.trim()} ${l.value.trim()} ${unit}` : `${l.test.trim()} ${l.value.trim()}`;
      });
  }
  const raw = demo.labValues?.trim();
  if (!raw) return [];
  return raw
    .split(/\n|;/)
    .map((line) => line.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 6);
}

function polarity(value?: string | boolean | null): 'yes' | 'no' | 'unknown' | 'empty' {
  if (value == null) return 'empty';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  const v = String(value).trim().toLowerCase();
  if (!v) return 'empty';
  if (/^(yes|y|true|pregnant|present)$/.test(v)) return 'yes';
  if (/^(no|n|false|absent|not pregnant|none)$/.test(v)) return 'no';
  if (/unknown|unsure|not sure/.test(v)) return 'unknown';
  return 'empty';
}

function patientLead(demo: Demographics | undefined): string {
  const age = demo?.age?.trim();
  const unit = demo?.ageUnit === 'months' ? 'month-old' : 'year-old';
  const sex = demo?.sex?.trim().toLowerCase();
  const sexWord =
    sex === 'female' || sex === 'f' ? 'female' : sex === 'male' || sex === 'm' ? 'male' : '';
  if (age && sexWord) return `${age}-${unit} ${sexWord}`;
  if (age) return `${age}-${unit} patient`;
  if (sexWord) return `${capitalize(sexWord)} patient`;
  return 'Patient';
}

function withUnit(raw: string | undefined, unit: string): string | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  if (new RegExp(unit, 'i').test(v)) return v;
  return `${v} ${unit}`;
}

function oxfordJoin(items: string[]): string {
  const clean = items.map((i) => i.trim()).filter(Boolean);
  if (!clean.length) return '';
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')}, and ${clean[clean.length - 1]}`;
}

function articleFor(phrase: string): string {
  const trimmed = phrase.trim();
  if (/^(a|an|the)\s/i.test(trimmed)) return trimmed;
  if (/^[aeiou]/i.test(trimmed)) return `an ${trimmed}`;
  return `a ${trimmed}`;
}

function lowerIfSentence(text: string): string {
  const t = text.trim();
  if (!t) return t;
  if (t === t.toUpperCase() && t.length > 2) return t;
  return t.charAt(0).toLowerCase() + t.slice(1);
}

function capitalize(text: string): string {
  const t = text.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function ensurePeriod(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return '';
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function uniqueParagraphs(paragraphs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paragraphs) {
    const t = p.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

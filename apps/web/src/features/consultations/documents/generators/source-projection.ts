import type { Consultation, TreatmentRecommendation } from '../../types';
import type { PatientDocumentInfo } from '../types';
import { finalizePatientDocumentInfo } from '../patient-address';

/** Shared confirmed facts for document generators — no invention beyond these. */
export interface ConsultationSourceProjection {
  consultationId: string;
  consultationRef: string;
  encounterDateLabel: string;
  encounterMethod?: string;
  pathwayLabel?: string;
  serviceTypeLabel: string;
  chiefComplaint?: string;
  clinicalImpression?: string;
  eligibilitySummary?: string;
  hasRedFlags: boolean;
  referralSelected: boolean;
  redFlagNotes?: string;
  treatments: TreatmentRecommendation[];
  counsellingPoints: string[];
  followUpPoints: string[];
  expectedResponsePoints: string[];
  selfCarePoints: string[];
  medicationUsePoints: string[];
  includeCounsellingInHandout: boolean;
  counsellingReviewed: boolean;
  handoutLanguage: string;
  workingDiagnosis?: string;
  diagnosticCertainty?: string;
  assessmentSummaryNote?: string;
  treatmentRationale?: string;
  redFlagsReviewedNegative: boolean;
  pregnancyRecorded: boolean;
  renalConsidered: boolean;
  hepaticConsidered: boolean;
  followUpTimeframe?: string;
  pcpFollowUpPoints: string[];
  pcpExpectedResponsePoints: string[];
  patient: PatientDocumentInfo;
  pharmacistName?: string;
  pharmacistCredentials?: string;
  pharmacyName?: string;
  pharmacyPhone?: string;
  pharmacyAddress?: string;
  pharmacyFax?: string;
}

function formatDateTime(iso?: string): string {
  if (!iso) return new Date().toLocaleString('en-CA');
  try {
    return new Date(iso).toLocaleString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function sectionPoints(
  consultation: Consultation,
  key: string,
): string[] {
  const notes = consultation.counsellingNotes as
    | {
        counselling_status?: string;
        confirmed_counselling?: Array<{
          section_key?: string;
          bullets?: string[];
          items?: Array<{ text?: string }>;
        }>;
        sections?: Array<{
          category?: string;
          section_key?: string;
          bullets?: string[];
          points?: Array<{ point?: string }>;
        }>;
        plan?: {
          status?: string;
          sections?: Array<{
            section_key?: string;
            items?: Array<{ text?: string; visibility?: string }>;
          }>;
        };
      }
    | undefined;

  const clean = (values: Array<string | undefined | null>): string[] =>
    values
      .map((t) => (t ?? '').replace(/\s+/g, ' ').trim())
      .filter((t) => t.length > 0 && !/^add a short patient-facing point/i.test(t));

  const confirmedRows = notes?.confirmed_counselling;
  if (Array.isArray(confirmedRows) && confirmedRows.length) {
    const section = confirmedRows.find((s) => s.section_key === key);
    const fromItems = (section?.items ?? []).map((i) => i.text);
    const fromBullets = section?.bullets ?? [];
    return clean([...fromBullets, ...fromItems]);
  }

  if (notes?.plan?.sections?.length) {
    const section = notes.plan.sections.find((s) => s.section_key === key);
    return clean((section?.items ?? []).map((i) => i.text));
  }

  const legacyKeyMap: Record<string, RegExp> = {
    MEDICATION_USE: /medication|how to use|treatment/i,
    EXPECTED_RESPONSE: /expect|response/i,
    SELF_CARE: /self.?care|non.?drug/i,
    FOLLOW_UP: /follow|seek|when to/i,
  };
  const re = legacyKeyMap[key];
  if (!re || !notes?.sections) return [];
  return notes.sections
    .filter((s) => s.section_key === key || re.test(s.category ?? ''))
    .flatMap((s) =>
      clean([
        ...(s.bullets ?? []),
        ...(s.points ?? []).map((p) => p.point),
      ]),
    );
}

export function selectedTreatments(consultation: Consultation): TreatmentRecommendation[] {
  const plan = consultation.treatmentPlan as
    | {
        recommendedTreatments?: TreatmentRecommendation[];
        selectedTreatments?: TreatmentRecommendation[];
        selectedItemsSnapshot?: TreatmentRecommendation[];
        selectedIndex?: number;
        selectedIndexes?: number[];
      }
    | undefined;

  const hasName = (t: TreatmentRecommendation | undefined): t is TreatmentRecommendation =>
    Boolean(
      t &&
        (t.displayName?.trim() ||
          t.medicationName?.trim() ||
          t.genericName?.trim() ||
          t.brandName?.trim()),
    );

  const snapshot = [
    ...(plan?.selectedTreatments ?? []),
    ...(plan?.selectedItemsSnapshot ?? []),
  ].filter(hasName);

  if (snapshot.length) {
    const seen = new Set<string>();
    const unique: TreatmentRecommendation[] = [];
    for (const t of snapshot) {
      const key = (
        t.displayName ||
        t.medicationName ||
        t.genericName ||
        ''
      )
        .trim()
        .toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(t);
    }
    if (unique.length) return unique;
  }

  const all = plan?.recommendedTreatments ?? [];
  if (!all.length) return [];

  const rawIndexes =
    Array.isArray(plan?.selectedIndexes) && plan.selectedIndexes.length
      ? plan.selectedIndexes
      : typeof plan?.selectedIndex === 'number' && plan.selectedIndex >= 0
        ? [plan.selectedIndex]
        : [];

  // Only confirmed pharmacist selections — never invent the first catalog item
  return rawIndexes
    .filter((i) => Number.isInteger(i) && i >= 0 && i < all.length)
    .map((i) => all[i])
    .filter(hasName);
}

export function projectConsultationSource(
  consultation: Consultation,
  patientInfo?: PatientDocumentInfo,
): ConsultationSourceProjection {
  const pathwayLabel =
    consultation.pathway?.condition?.trim() ||
    consultation.pathway?.name?.trim() ||
    undefined;

  const pharmacist = consultation.pharmacist;
  const pharmacistName = pharmacist
    ? `${pharmacist.firstName ?? ''} ${pharmacist.lastName ?? ''}`.trim()
    : undefined;

  const treatments = selectedTreatments(consultation);
  const referralSelected = Boolean(
    consultation.redFlags?.referralSelected ||
      consultation.consultationMode === 'DOCUMENTATION_REFERRAL',
  );
  const hasRedFlags = Boolean(consultation.redFlags?.hasRedFlags);
  const referralDoc = consultation.referralOutcome?.documentationText?.trim();

  let serviceTypeLabel = 'PHARMACIST ASSESSMENT';
  if (referralSelected) serviceTypeLabel = 'REFERRAL';
  else if (treatments.some((t) => (t.category ?? 'PRESCRIPTION') === 'PRESCRIPTION')) {
    serviceTypeLabel = 'INITIAL ACCESS PRESCRIBING';
  } else if (treatments.length) {
    serviceTypeLabel = 'SUPPORTIVE CARE';
  }

  const impression =
    consultation.eligibility?.overallAssessment?.trim() ||
    (pathwayLabel
      ? `Clinical presentation is consistent with ${pathwayLabel}`
      : undefined);

  const notes = consultation.counsellingNotes as
    | {
        includeDetailedHandout?: boolean;
        handoutLanguage?: string;
        counselling_status?: string;
        plan?: {
          status?: string;
          include_detailed_handout?: boolean;
          handoutLanguage?: string;
        };
      }
    | undefined;
  const confirmed =
    notes?.plan?.status === 'REVIEWED' ||
    notes?.counselling_status === 'confirmed';
  const includeCounsellingInHandout =
    confirmed &&
    (notes?.plan?.include_detailed_handout ?? notes?.includeDetailedHandout ?? true);
  const empty: string[] = [];

  const cj = consultation.clinicalJudgmentAssessment;
  const rationale = consultation.treatmentRationale;
  const rationaleConfirmed =
    rationale?.status === 'CONFIRMED' ||
    Boolean(rationale?.reasonConfirmed && rationale?.selectionConfirmed);
  const pregnancyYes = /^(yes|pregnant)$/i.test(
    consultation.demographics?.pregnancyStatus?.trim() ?? '',
  );
  const pregnancyInfluenced = treatments.some(
    (t) => Boolean(t.pregnancyWarning?.active) || Boolean(t.pregnancyCaution),
  );
  const redFlagsReviewedNegative = Boolean(
    consultation.redFlags &&
      consultation.redFlags.hasRedFlags === false &&
      !referralSelected,
  );

  return {
    consultationId: consultation.id,
    consultationRef: consultation.consultationRef,
    encounterDateLabel: formatDateTime(consultation.createdAt),
    encounterMethod: 'In person',
    pathwayLabel,
    serviceTypeLabel,
    chiefComplaint: consultation.chiefComplaint?.trim() || undefined,
    clinicalImpression: impression,
    eligibilitySummary: consultation.eligibility?.overallAssessment?.trim() || undefined,
    hasRedFlags,
    referralSelected,
    redFlagNotes: referralDoc
      ? referralDoc
      : consultation.redFlags?.referralSelected
        ? 'Referral selected for further medical assessment.'
        : !hasRedFlags
          ? undefined
          : 'Red-flag criteria were reviewed during the consultation.',
    treatments,
    counsellingPoints: includeCounsellingInHandout
      ? sectionPoints(consultation, 'MEDICATION_USE')
      : empty,
    followUpPoints: includeCounsellingInHandout
      ? sectionPoints(consultation, 'FOLLOW_UP')
      : empty,
    expectedResponsePoints: includeCounsellingInHandout
      ? sectionPoints(consultation, 'EXPECTED_RESPONSE')
      : empty,
    selfCarePoints: includeCounsellingInHandout
      ? sectionPoints(consultation, 'SELF_CARE')
      : empty,
    medicationUsePoints: includeCounsellingInHandout
      ? sectionPoints(consultation, 'MEDICATION_USE')
      : empty,
    includeCounsellingInHandout,
    counsellingReviewed: confirmed,
    handoutLanguage: notes?.plan?.handoutLanguage ?? notes?.handoutLanguage ?? 'en',
    workingDiagnosis: omitIfEmpty(cj?.workingDiagnosisText),
    diagnosticCertainty: omitIfEmpty(cj?.diagnosticCertainty),
    assessmentSummaryNote: omitIfEmpty(cj?.assessmentSummary),
    treatmentRationale: rationaleConfirmed
      ? omitIfEmpty(
          rationale?.selectionRationale || rationale?.reasonForPrescribing,
        )
      : undefined,
    redFlagsReviewedNegative,
    pregnancyRecorded: pregnancyYes && pregnancyInfluenced,
    renalConsidered: treatments.some((t) => Boolean(t.renalWarning?.active)),
    hepaticConsidered: treatments.some((t) => Boolean(t.hepaticWarning?.active)),
    followUpTimeframe: omitIfEmpty(consultation.treatmentPlan?.followUpTimeframe),
    pcpFollowUpPoints: confirmed ? sectionPoints(consultation, 'FOLLOW_UP') : [],
    pcpExpectedResponsePoints: confirmed
      ? sectionPoints(consultation, 'EXPECTED_RESPONSE')
      : [],
    patient: finalizePatientDocumentInfo(patientInfo ?? {}),
    pharmacistName: pharmacistName || undefined,
    pharmacistCredentials: 'RPh',
    pharmacyName: consultation.tenant?.name || undefined,
    pharmacyPhone: consultation.tenant?.phone || undefined,
    pharmacyFax: consultation.tenant?.faxNumber || undefined,
    pharmacyAddress: consultation.tenant?.address || undefined,
  };
}

export function formatRegimenLine(t: TreatmentRecommendation): string {
  const dose = t.dose?.trim();
  const route = t.route?.trim();
  const frequency = t.frequency?.trim();
  const duration = t.duration?.trim();
  const parts: string[] = [];
  if (dose) parts.push(dose);
  if (route) parts.push(route);
  if (frequency && frequency.toLowerCase() !== dose?.toLowerCase()) {
    parts.push(frequency);
  }
  if (duration) parts.push(duration);
  if (parts.length) return parts.join(', ');
  return t.instructions?.trim() || 'As directed';
}

function treatmentLabel(t: TreatmentRecommendation): string {
  return (
    t.displayName?.trim() ||
    t.genericName?.trim() ||
    t.medicationName?.trim() ||
    t.brandName?.trim() ||
    'Selected treatment'
  );
}

export function formatTreatmentBlock(treatments: TreatmentRecommendation[]): string {
  return treatments
    .map((t) => {
      const name = treatmentLabel(t);
      const line = `${name}\nDirections: ${formatRegimenLine(t)}`;
      return t.instructions?.trim() &&
        t.instructions.trim().toLowerCase() !== formatRegimenLine(t).toLowerCase()
        ? `${line}\n${t.instructions.trim()}`
        : line;
    })
    .join('\n\n');
}

export function joinNonEmpty(parts: Array<string | undefined | null>, sep = ' '): string {
  return parts
    .map((p) => p?.trim())
    .filter((p): p is string => Boolean(p))
    .join(sep);
}

/** Never invent negatives from missing data. */
export function omitIfEmpty(value?: string | null): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

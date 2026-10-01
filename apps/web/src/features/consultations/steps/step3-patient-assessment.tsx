'use client';
import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react';
import {
  ClipboardList,
  Sparkles,
  ChevronDown,
  Loader2,
  Check,
  AlertCircle,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/notify';
import { getErrorMessage, getErrorStatus, toastError } from '@/lib/errors';
import type {
  Consultation,
  Demographics,
  ClinicalQuestion,
  QuestionResponse,
  MedicationEntry,
  ExtractedLabValue,
} from '../types';
import { normalizeDifferentials, normalizeQuestionOptions, asArray } from '../safe-data';
import { useQueryClient } from '@tanstack/react-query';
import {
  isSectionVisible,
  type SectionVisibility,
  computeBmiKgCm,
  formatBmi,
  normalizePatientDemographics,
  parseNumericInput,
  selectLatestLabValues,
  vitalsFieldsFromLabValues,
  formatLatestLabValuesAsText,
  computeIntakeFingerprint,
  readIntakeAnalysisMeta,
  computeSourceAnswerRevision,
  evaluatePathwayAssessment,
  orderedAnswerPairs,
  dateOfBirthError,
  isDateOfBirthReady,
  isDateOfBirthUnavailable,
  ageYearsFromDemographics,
  firstUnresolvedPatientInformation,
  pathwayDisplayLabel,
  provinceFromTimezone,
  readClinicalAssessment,
  type PathwayClinicalJudgementRecord,
  type PathwayDiagnosticCertainty,
  type PatientInfoUnresolved,
} from '@safescript/shared';
import {
  ASSESSMENT_SECTIONS,
  DEFAULT_ASSESSMENT_SECTIONS,
  resolveAssessmentSection,
  resolveSectionDisplayName,
  type AssessmentSectionName,
} from '@/features/pathways/pathway-constants';
import {
  consultationKeys,
  useAnswerQuestions,
  useSaveStep,
  useAnalyzeTranscript,
  useResolveMedications,
  useConfirmPathwayClinicalJudgement,
  useDraftPathwayClinicalJudgement,
  usePathwayNoTreatment,
  useSavePathwayClinicalJudgementDraft,
  useSelectApproach,
} from '../hooks';
import {
  type AllergyDrugEntry,
} from '../allergy-search-field';
import {
  applyAllergyType,
  allergyTypeFromEntry,
} from '../allergy-type-dialog';
import {
  applyInferredAllergyType,
  buildResolvedAllergyEntries,
  collectAllergyNamesToResolve,
  inferAllergyType,
} from '../transcript-clinical-resolve';
import {
  buildDemographicsFromSources,
  getFieldConfidence,
  mergeQuestionAnswers,
  hasExtractedData,
  unansweredRequiredQuestions,
  isNkdaText,
  filterPastMedicalConditions,
  isAllergyOnlyDrugMention,
  isExplicitlyTakingMedication,
  isLabLikeCondition,
  CONFIDENCE_THRESHOLD,
} from '../ai-prefill';
import {
  drugResultToEntry,
  entriesToDisplayString,
  isMedicationQuestion,
  parseMedicationEntriesFromSaved,
  collectMedicationNamesToResolve,
  medicationEntryNeedsCcdDResolve,
  isCodedMedicationEntry,
  mergeUniqueMedications,
  sanitizeMedicationEntries,
} from '../medication-utils';
import {
  ClinicalStepFooter,
  ClinicalSectionStack,
} from '../clinical-ui';
import {
  focusClinicalSectionSoon,
  pinConsultScroll,
} from '../clinical-section-scroll';
import {
  PatientSnapshotSection,
  PatientClinicalHistorySection,
  LabsVitalsSection,
  migrateReproductiveStatus,
  composePregnancySafetyLabel,
  type PatientDetailsPhase,
} from './step3-patient-details';
import {
  PatientInformationHeader,
  PatientInformationRequiredBanner,
} from '../patient-info/patient-info-chrome';
import { PATIENT_INFO_COPY } from '../patient-info/patient-info-copy';
import {
  AssessmentCriteriaCard,
  sectionFullyAnswered,
  countCriteriaAnswered,
  criteriaFindingOptions,
  criteriaAffirmative,
  isCriteriaAnswered,
} from './step3-clinical-criteria';
import { PresentationReviewCard } from '../presentation-review/presentation-review-card';
import { parsePathwayEvidence, fallbackPathwayEvidence } from '../presentation-review/presentation-review-evidence';
import {
  parsePresentationFindings,
  serializePresentationFindings,
  type AdditionalClinicalFinding,
} from '../presentation-review/presentation-review-findings';
import { PRESENTATION_FINDINGS_KEY } from '../presentation-review/presentation-review-copy';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  PathwayClinicalJudgementCard,
  pathwayClinicalJudgementActive,
} from '../pathway-clinical-judgement-card';

interface Props {
  consultation: Consultation;
  onNext: (options?: { targetStep?: string; approachMode?: 'GUIDED_PATHWAY' | 'CLINICAL_JUDGMENT' }) => void;
  onBack: () => void;
  backLabel?: string;
  /** Rendered between page title and content (title → stepper → sections). */
  stepper?: ReactNode;
  /** Clinical Judgment mode: patient details only (no pathway questions). */
  clinicalJudgmentOnly?: boolean;
}

// ── Structured allergy helpers ────────────────────────────────────────────────
type AllergyEntry = AllergyDrugEntry;

function parseAllergies(raw?: string, fromAi?: unknown): AllergyEntry[] {
  if (isNkdaText(raw)) return [];

  if (raw?.trim()) {
    // Prefer structured "Drug|Reaction|Severity;..." if present
    if (raw.includes('|')) {
      return raw
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part, i): AllergyEntry | null => {
          const [drug, reaction = '', severity = ''] = part.split('|').map((s) => s.trim());
          if (isNkdaText(drug)) return null;
          const sev =
            severity === 'Mild' || severity === 'Moderate' || severity === 'Severe'
              ? severity
              : '';
          return {
            id: `a-${i}-${drug}`,
            drug,
            reaction,
            severity: sev,
            source: 'manual',
          };
        })
        .filter((e): e is AllergyEntry => e != null);
    }
    // Free-text fallback: comma-separated allergens
    return raw
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter((drug) => drug && !isNkdaText(drug))
      .map((drug, i) => ({
        id: `a-${i}-${drug}`,
        drug,
        reaction: '',
        severity: '' as const,
        source: 'transcript' as const,
      }));
  }

  const aiList = asArray<{
    allergen?: string;
    reaction?: string;
    allergyType?: string;
  }>(fromAi);
  if (aiList.length) {
    const real = aiList.filter((a) => !isNkdaText(a.allergen));
    if (!real.length) return [];
    return real.map((a, i) => {
      const base: AllergyEntry = {
        id: `ai-${i}-${a.allergen}`,
        drug: a.allergen ?? '',
        reaction: a.reaction ?? '',
        severity: '' as const,
        source: 'transcript' as const,
      };
      const type = inferAllergyType({
        allergen: a.allergen ?? '',
        reaction: a.reaction,
        allergyType: a.allergyType,
      });
      return applyAllergyType(base, type);
    });
  }
  return [];
}

function serializeAllergies(entries: AllergyEntry[], none: boolean): string {
  if (none) return 'No known allergies';
  if (!entries.length) return '';
  return entries
    .filter((e) => e.drug.trim())
    .map((e) => `${e.drug}|${e.reaction}|${e.severity}`)
    .join('; ');
}

function allergiesDisplay(entries: AllergyEntry[], none: boolean): string {
  if (none) return 'No known allergies';
  return entries.map((e) => e.drug).filter(Boolean).join(', ');
}

// ── Conditions helpers ────────────────────────────────────────────────────────
function parseConditions(raw?: string): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Brief pause so the pharmacist sees the last answer before the next subsection opens. */
const ASSESSMENT_ADVANCE_MS = 450;

// ── Clinical finding helpers ──────────────────────────────────────────────────
/** Canonical binary answers for pathway YES_NO / BOOLEAN questions. */
const YES_NO_OPTIONS = ['Yes', 'No'] as const;

const AFFIRMATIVE_ALIASES = new Set(['yes', 'true', 'present', 'positive']);
const NEGATIVE_ALIASES = new Set(['no', 'false', 'absent', 'negative']);
const UNKNOWN_ALIASES = new Set(['unknown', 'n/a', 'na', 'unsure', 'not sure']);

function isBinaryQuestion(q: ClinicalQuestion): boolean {
  return q.type === 'YES_NO' || q.type === 'BOOLEAN';
}

/**
 * Pathway clinical findings always use Yes / No only.
 * Custom SELECT options are preserved; Present/Absent/Unknown sets are coerced to Yes/No.
 */
function findingOptions(q: ClinicalQuestion): string[] {
  if (isBinaryQuestion(q)) return [...YES_NO_OPTIONS];

  const custom = normalizeQuestionOptions(q.options).map((o) => o.label || o.value);
  if (!custom.length) return [];

  const lower = custom.map((c) => c.toLowerCase());
  const looksBinary =
    custom.length <= 3 &&
    (lower.some((l) => AFFIRMATIVE_ALIASES.has(l) || NEGATIVE_ALIASES.has(l)) ||
      lower.includes('unknown'));
  if (looksBinary) return [...YES_NO_OPTIONS];

  return custom;
}

/** Affirmative choice for bulk / quick-select (always Yes for binary findings). */
function affirmativeOption(options: string[]): string | null {
  const preferred = ['Yes', 'True', 'Positive', 'Present'];
  for (const p of preferred) {
    const hit = options.find((o) => o.toLowerCase() === p.toLowerCase());
    if (hit) return hit;
  }
  return options[0] ?? null;
}

/** Negative choice for Treatment Eligibility bulk “No to all”. */
function negativeOption(options: string[]): string | null {
  const preferred = ['No', 'False', 'Negative', 'Absent'];
  for (const p of preferred) {
    const hit = options.find((o) => o.toLowerCase() === p.toLowerCase());
    if (hit) return hit;
  }
  return options.length === 2 ? options[1] ?? null : null;
}

function isAffirmativeSelected(val: string, options: string[]): boolean {
  const aff = affirmativeOption(options);
  if (!aff || !val) return false;
  return val.toLowerCase() === aff.toLowerCase();
}

function isNegativeSelected(val: string, options: string[]): boolean {
  const neg = negativeOption(options);
  if (!neg || !val) return false;
  return val.toLowerCase() === neg.toLowerCase();
}

/** All displayed questions must be answered before a criteria section is complete. */
function isQuestionAnswered(
  q: ClinicalQuestion,
  response: QuestionResponse | undefined,
): boolean {
  return isCriteriaAnswered(q, response);
}

function countAnsweredQuestions(
  qs: ClinicalQuestion[],
  responses: Record<string, QuestionResponse>,
): number {
  return countCriteriaAnswered(qs, responses);
}

function sectionMeetsMinimum(
  qs: ClinicalQuestion[],
  responses: Record<string, QuestionResponse>,
): boolean {
  return sectionFullyAnswered(qs, responses);
}



function assessmentGroupSummary(
  groupQuestions: ClinicalQuestion[],
  groupResponses: Record<string, QuestionResponse>,
): string {
  const answered = countAnsweredQuestions(groupQuestions, groupResponses);
  const total = groupQuestions.length;
  if (sectionMeetsMinimum(groupQuestions, groupResponses)) {
    return `${total} of ${total} questions completed`;
  }
  return `${answered} of ${total} answered`;
}

function findFirstIncompleteAssessmentKey(
  groups: Array<{ key: AssessmentSectionName; questions: ClinicalQuestion[] }>,
  groupResponses: Record<string, QuestionResponse>,
): AssessmentSectionName | null {
  const incomplete = groups.find((g) => !sectionMeetsMinimum(g.questions, groupResponses));
  return incomplete?.key ?? groups[groups.length - 1]?.key ?? null;
}

/**
 * Map legacy Present / Absent / Unknown (and boolean-ish values) onto the
 * active option list. Unknown clears the answer so the pharmacist reconfirms.
 */
function normalizeAnswerForOptions(answer: string, options: string[]): string {
  if (!answer) return '';
  const lower = answer.toLowerCase().trim();
  if (UNKNOWN_ALIASES.has(lower)) return '';

  const hit = options.find((o) => o.toLowerCase() === lower);
  if (hit) return hit;

  if (AFFIRMATIVE_ALIASES.has(lower)) {
    const yes = options.find((o) => o.toLowerCase() === 'yes');
    if (yes) return yes;
  }
  if (NEGATIVE_ALIASES.has(lower)) {
    const no = options.find((o) => o.toLowerCase() === 'no');
    if (no) return no;
  }

  return answer;
}

/** Canonicalize a stored response onto Yes/No when the question is binary. */
function canonicalizeBinaryResponse(
  q: ClinicalQuestion,
  response: QuestionResponse,
): QuestionResponse {
  const options = findingOptions(q);
  if (!options.length || options.length > 2) return response;
  const raw = String(response.answerText ?? response.answer ?? '');
  if (!raw.trim()) return response;
  const normalized = normalizeAnswerForOptions(raw, options);
  if (normalized === raw) return response;
  return {
    ...response,
    answer: normalized || null,
    answerText: normalized,
  };
}

const DIFF_REVIEW_KEY = '__differentialReview';

const PRESENTATION_PROVINCE_LABEL: Record<string, string> = {
  AB: 'Alberta',
  BC: 'British Columbia',
  MB: 'Manitoba',
  SK: 'Saskatchewan',
  ON: 'Ontario',
};

// ── Main step ─────────────────────────────────────────────────────────────────
export function StepPatientAssessment({ consultation, onNext, onBack, backLabel = 'Back', stepper, clinicalJudgmentOnly }: Props) {
  const entities = consultation.aiEntities;
  const allPathwayQuestions = Array.isArray(consultation.pathway?.questions)
    ? consultation.pathway!.questions
    : [];
  const differentials = normalizeDifferentials(consultation.pathway?.differentials);
  const transcript = consultation.transcript ?? '';
  const attachmentIds = (Array.isArray(consultation.attachments) ? consultation.attachments : []).map(
    (a) => a.id,
  );
  const intakeMeta = readIntakeAnalysisMeta(consultation.aiAnalysis);
  const currentIntakeFingerprint = computeIntakeFingerprint({
    chiefComplaint: consultation.chiefComplaint,
    transcript,
    attachmentIds,
  });
  const preferAiFromIntake =
    intakeMeta.downstreamRefreshRequired === true ||
    (Boolean(intakeMeta.intakeFingerprint) &&
      intakeMeta.intakeFingerprint !== currentIntakeFingerprint);

  const { demo: initialDemo, aiFields: initialAiFields } = buildDemographicsFromSources(
    entities,
    consultation.demographics,
    transcript,
    { preferAi: preferAiFromIntake },
  );
  const migratedRepro = migrateReproductiveStatus(initialDemo);

  const [demo, setDemo] = useState<Demographics>({
    ...initialDemo,
    pregnancyStatus: migratedRepro.pregnancyStatus || initialDemo.pregnancyStatus,
    breastfeedingStatus:
      migratedRepro.breastfeedingStatus || initialDemo.breastfeedingStatus,
    ageUnit: initialDemo.ageUnit ?? 'years',
  });
  const [patientInfoConfirmed, setPatientInfoConfirmed] = useState(() => {
    const d = consultation.demographics;
    if (d?.patientInformationConfirmed) return true;
    if (!d?.age || !d?.sex) return false;
    const allergiesOk = isNkdaText(d.allergies) || Boolean(d.allergies?.trim());
    const medsOk = Boolean(d.currentMedications?.trim());
    const conditionsOk =
      Boolean(d.noKnownConditions) || Boolean(d.medicalConditions?.trim());
    return allergiesOk && medsOk && conditionsOk;
  });

  const invalidatePatientInformationConfirmation = () => {
    setPatientInfoConfirmed((was) => (was ? false : was));
    setDemo((d) =>
      d.patientInformationConfirmed
        ? {
            ...d,
            patientInformationConfirmed: false,
            patientInformationConfirmedAt: null,
            patientInformationConfirmedBy: null,
          }
        : d,
    );
  };
  const [medicationEntries, setMedicationEntries] = useState<MedicationEntry[]>(() =>
    parseMedicationEntriesFromSaved(
      consultation.demographics?.medicationEntries,
      initialDemo.currentMedications,
    ),
  );
  const [aiFields, setAiFields] = useState<Set<keyof Demographics>>(initialAiFields);
  const [allergyEntries, setAllergyEntries] = useState<AllergyEntry[]>(() => {
    const saved = consultation.demographics?.allergyEntries;
    if (saved?.length) return saved as AllergyEntry[];
    return parseAllergies(initialDemo.allergies, entities?.allergies);
  });
  const [allergiesNone, setAllergiesNone] = useState(
    () =>
      isNkdaText(initialDemo.allergies) ||
      Boolean(
        asArray<{ allergen?: string }>(entities?.allergies).length &&
          asArray<{ allergen?: string }>(entities?.allergies).every((a) => isNkdaText(a.allergen)),
      ),
  );
  const [medsNone, setMedsNone] = useState(
    () =>
      initialDemo.currentMedications?.trim().toLowerCase() === 'none' ||
      initialDemo.currentMedications?.trim().toLowerCase() === 'no current medications',
  );
  const [conditions, setConditions] = useState<string[]>(() =>
    parseConditions(initialDemo.medicalConditions),
  );
  const [conditionsNone, setConditionsNone] = useState(
    () =>
      Boolean(initialDemo.noKnownConditions) ||
      initialDemo.medicalConditions?.trim().toLowerCase() === 'none' ||
      initialDemo.medicalConditions?.trim().toLowerCase() === 'no known conditions',
  );
  const [conditionsFromConsultation] = useState<string[]>(() =>
    initialAiFields.has('medicalConditions') ? parseConditions(initialDemo.medicalConditions) : [],
  );
  const [additionalOpen, setAdditionalOpen] = useState(false);

  const sectionsEnabled =
    consultation.pathway?.assessmentSectionsEnabled ?? DEFAULT_ASSESSMENT_SECTIONS;

  const assessmentGroups = useMemo(() => {
    const visibilityCtx = {
      sex: demo.sex,
      age: ageYearsFromDemographics(demo),
    };

    type Group = {
      key: AssessmentSectionName;
      title: string;
      questions: ClinicalQuestion[];
    };

    const groups: Group[] = [];
    for (const meta of ASSESSMENT_SECTIONS) {
      if (meta.name === 'additionalAssessment' && !sectionsEnabled.additionalAssessment) {
        continue;
      }

      const sectionRow = consultation.pathway?.sections?.find((s) => s.name === meta.name);
      const visible = isSectionVisible(
        (sectionRow?.visibility ?? null) as SectionVisibility | null,
        visibilityCtx,
      );
      if (!visible) continue;

      const sectionQuestions = allPathwayQuestions
        .filter((q) => resolveAssessmentSection(q.section?.name) === meta.name)
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

      // Questions with no section still appear under diagnosis confirmation
      if (meta.name === 'diagnosisConfirmation') {
        const unsectioned = allPathwayQuestions.filter((q) => !q.section?.name && !q.sectionId);
        for (const q of unsectioned) {
          if (!sectionQuestions.some((s) => s.id === q.id)) sectionQuestions.push(q);
        }
      }

      if (!sectionQuestions.length && meta.name !== 'additionalAssessment') {
        // Keep empty required sections only if they have questions; skip empty
      }

      if (!sectionQuestions.length) continue;

      groups.push({
        key: meta.name,
        title: resolveSectionDisplayName(meta.name, consultation.pathway?.sections),
        questions: sectionQuestions,
      });
    }

    // Fallback: if nothing grouped (legacy pathways), show all questions
    if (!groups.length && allPathwayQuestions.length) {
      groups.push({
        key: 'diagnosisConfirmation',
        title: 'Clinical findings',
        questions: allPathwayQuestions,
      });
    }

    return groups;
  }, [
    allPathwayQuestions,
    consultation.pathway?.sections,
    sectionsEnabled.additionalAssessment,
    demo.sex,
    demo.age,
    demo.ageUnit,
    demo.dateOfBirth,
    demo.dateOfBirthUnavailable,
  ]);

  const questions = useMemo(
    () => assessmentGroups.flatMap((g) => g.questions),
    [assessmentGroups],
  );

  const set = (k: keyof Demographics) => (v: string) => {
    invalidatePatientInformationConfirmation();
    setAiFields((prev) => {
      const next = new Set(prev);
      next.delete(k);
      return next;
    });
    setDemo((d) => {
      const next: Demographics = {
        ...d,
        [k]: v,
        // Preserve pregnancy/breastfeeding answers when sex changes — fields may hide
        // but answers must survive temporary hide (pharmacist can reveal manually).
      };
      if (k === 'height' || k === 'weight') {
        const bmi = computeBmiKgCm(
          parseNumericInput(k === 'weight' ? v : next.weight),
          parseNumericInput(k === 'height' ? v : next.height),
        );
        next.bmi = formatBmi(bmi);
      }
      return next;
    });
  };

  const patchDemo = (patch: Partial<Demographics>) => {
    if (!('patientInformationConfirmed' in patch)) {
      invalidatePatientInformationConfirmation();
    }
    setAiFields((prev) => {
      const next = new Set(prev);
      for (const key of Object.keys(patch) as Array<keyof Demographics>) {
        next.delete(key);
      }
      return next;
    });
    setDemo((d) => ({ ...d, ...patch }));
  };

  const syncAllergiesToDemo = useCallback((entries: AllergyEntry[], none: boolean) => {
    invalidatePatientInformationConfirmation();
    setDemo((d) => ({
      ...d,
      allergies: none
        ? 'No known allergies'
        : allergiesDisplay(entries, none) || serializeAllergies(entries, none),
      allergyEntries: none ? [] : entries,
    }));
  }, []);

  const handleMedicationsChange = (entries: MedicationEntry[], displayText: string) => {
    invalidatePatientInformationConfirmation();
    setAiFields((prev) => {
      const next = new Set(prev);
      next.delete('currentMedications');
      return next;
    });
    setMedsNone(false);
    setMedicationEntries(entries);
    setDemo((d) => ({
      ...d,
      currentMedications: displayText,
      medicationEntries: entries,
    }));
  };

  const handleConditionsChange = (next: string[]) => {
    invalidatePatientInformationConfirmation();
    setAiFields((prev) => {
      const n = new Set(prev);
      n.delete('medicalConditions');
      return n;
    });
    setConditions(next);
    setDemo((d) => ({ ...d, medicalConditions: next.join(', ') }));
  };

  const initResponses = useCallback((): Record<string, QuestionResponse> => {
    const existing = (consultation.questionResponses ?? {}) as Record<string, QuestionResponse>;
    const init: Record<string, QuestionResponse> = {};
    questions.forEach((q) => {
      const base = existing[q.id] ?? {
        questionId: q.id,
        question: q.question,
        answer: null,
        answerText: '',
      };
      // Migrate Present/Absent/Unknown → Yes/No (or clear Unknown) on load
      init[q.id] = canonicalizeBinaryResponse(q, base);
    });
    const savedFindings = existing[PRESENTATION_FINDINGS_KEY];
    if (savedFindings) init[PRESENTATION_FINDINGS_KEY] = savedFindings;
    return init;
  }, [questions, consultation.questionResponses]);

  const [responses, setResponses] = useState<Record<string, QuestionResponse>>(initResponses);
  const [aiQLoading, setAiQLoading] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [detailsPhase, setDetailsPhase] = useState<PatientDetailsPhase>(() => {
    const d = consultation.demographics;
    if (!d?.age || !d?.sex) return 'snapshot';
    const allergiesOk = isNkdaText(d.allergies) || Boolean(d.allergies?.trim());
    const medsOk = Boolean(d.currentMedications?.trim());
    const conditionsOk =
      Boolean(d.noKnownConditions) ||
      Boolean(d.medicalConditions?.trim());
    if (!allergiesOk || !medsOk || !conditionsOk) return 'background';
    // Snapshot + background complete — resume at labs (optional) or assessment
    return 'labs';
  });
  const [snapshotDone, setSnapshotDone] = useState(() =>
    Boolean(consultation.demographics?.age && consultation.demographics?.sex),
  );
  const [backgroundDone, setBackgroundDone] = useState(() => {
    const d = consultation.demographics;
    if (!d?.age || !d?.sex) return false;
    const allergiesOk = isNkdaText(d.allergies) || Boolean(d.allergies?.trim());
    const medsOk = Boolean(d.currentMedications?.trim());
    const conditionsOk =
      Boolean(d.noKnownConditions) || Boolean(d.medicalConditions?.trim());
    return allergiesOk && medsOk && conditionsOk;
  });
  const [labsDone, setLabsDone] = useState(false);
  const [attentionIntense, setAttentionIntense] = useState<PatientInfoUnresolved | null>(null);
  const [demoOpen, setDemoOpen] = useState(true);
  const [questOpen, setQuestOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [diagnosisOpen, setDiagnosisOpen] = useState(true);
  const [eligibilityOpen, setEligibilityOpen] = useState(false);
  const [diagnosisDone, setDiagnosisDone] = useState(false);
  const [eligibilityDone, setEligibilityDone] = useState(false);
  const [openAssessmentKey, setOpenAssessmentKey] = useState<AssessmentSectionName | null>(null);
  const assessmentSubsectionRefs = useRef<Partial<Record<AssessmentSectionName, HTMLDivElement | null>>>({});
  const autoAdvancedFromRef = useRef<Set<string>>(new Set());
  const [intakeExpanded, setIntakeExpanded] = useState(false);
  const [differentialReviewed, setDifferentialReviewed] = useState(() => {
    const saved = (consultation.questionResponses as Record<string, QuestionResponse> | undefined)?.[
      DIFF_REVIEW_KEY
    ];
    return Boolean(saved?.answer === true || saved?.answerText === 'reviewed');
  });
  const [errors, setErrors] = useState<Partial<Demographics>>({});
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [extractedLabValues, setExtractedLabValues] = useState<ExtractedLabValue[]>(
    () => selectLatestLabValues(consultation.demographics?.extractedLabValues ?? []),
  );
  const [savedAgo, setSavedAgo] = useState<string | null>(null);

  const saveStep = useSaveStep(consultation.id);
  const answerQs = useAnswerQuestions(consultation.id);
  const analyze = useAnalyzeTranscript(consultation.id);
  const saveJudgementDraft = useSavePathwayClinicalJudgementDraft(consultation.id);
  const draftJudgementAi = useDraftPathwayClinicalJudgement(consultation.id);
  const confirmJudgement = useConfirmPathwayClinicalJudgement(consultation.id);
  const noTreatment = usePathwayNoTreatment(consultation.id);
  const selectApproach = useSelectApproach(consultation.id);
  const [judgementRecord, setJudgementRecord] = useState<PathwayClinicalJudgementRecord | null>(
    () => consultation.pathwayClinicalJudgement ?? null,
  );
  const [judgementError, setJudgementError] = useState<string | null>(null);
  const judgementDraftTimer = useRef<number | null>(null);
  const queryClient = useQueryClient();
  const prefillRunRef = useRef<string | null>(null);
  const resolveMeds = useResolveMedications();
  const [medsResolving, setMedsResolving] = useState(false);
  const [allergiesResolving, setAllergiesResolving] = useState(false);
  const resolvedMedQuestionsRef = useRef<Set<string>>(new Set());
  const allergyResolveKeyRef = useRef<string | null>(null);
  const medResolveKeyRef = useRef<string | null>(null);

  const isLoading = prefillLoading || aiQLoading || medsResolving || allergiesResolving;

  const needsReproductive =
    demo.sex === 'Female' ||
    demo.sex === 'Intersex' ||
    demo.sex === 'Unknown' ||
    demo.sex === 'Other';
  const isFemale = needsReproductive; // legacy alias used in intake summaries
  const demoComplete = Boolean(isDateOfBirthReady(demo) && demo.sex?.trim());
  const pregnancyDone =
    !needsReproductive ||
    (Boolean(demo.pregnancyStatus?.trim()) && Boolean(demo.breastfeedingStatus?.trim()));
  const allergiesDone = allergiesNone || allergyEntries.some((a) => a.drug.trim());
  const medsDone = medsNone || medicationEntries.length > 0;
  const conditionsDone = conditionsNone || conditions.length > 0;
  const patientSectionReady =
    demoComplete && pregnancyDone && allergiesDone && medsDone && conditionsDone;

  const detailsComplete = patientInfoConfirmed;

  const stillNeeded = useMemo(() => {
    const items: { key: string; label: string; done: boolean }[] = [
      { key: 'dob', label: isDateOfBirthUnavailable(demo) ? 'Age' : 'Date of birth', done: isDateOfBirthReady(demo) },
      { key: 'sex', label: 'Sex at birth', done: Boolean(demo.sex?.trim()) },
      { key: 'allergies', label: 'Allergies', done: allergiesDone },
      { key: 'meds', label: 'Current medications', done: medsDone },
      { key: 'conditions', label: 'Medical conditions', done: conditionsDone },
    ];
    if (needsReproductive) {
      items.splice(2, 0, {
        key: 'pregnancy',
        label: 'Pregnancy & breastfeeding',
        done: pregnancyDone,
      });
    }
    return items;
  }, [
    needsReproductive,
    pregnancyDone,
    medsDone,
    allergiesDone,
    conditionsDone,
    demo.age,
    demo.sex,
    demo.dateOfBirth,
    demo.dateOfBirthUnavailable,
  ]);

  const missingNeeded = stillNeeded.filter((i) => !i.done);

  const reviewedCount = useMemo(
    () => countAnsweredQuestions(questions, responses),
    [questions, responses],
  );
  const diagnosisGroup = useMemo(
    () => assessmentGroups.find((g) => g.key === 'diagnosisConfirmation'),
    [assessmentGroups],
  );
  const eligibilityGroup = useMemo(
    () => assessmentGroups.find((g) => g.key === 'treatmentEligibility'),
    [assessmentGroups],
  );
  const presentationEvidence = useMemo(() => {
    const stored = readClinicalAssessment(consultation.aiAnalysis);
    const parsed = parsePathwayEvidence(stored?.evidenceSnapshot);
    if (parsed) return parsed;
    const pathway = consultation.pathway;
    if (!pathway) return null;
    const code = provinceFromTimezone(consultation.tenant?.timezone);
    return fallbackPathwayEvidence({
      pathwayId: pathway.id,
      displayName: pathwayDisplayLabel(pathway),
      jurisdiction: code ? PRESENTATION_PROVINCE_LABEL[code] ?? code : null,
      pathwayVersion: pathway.version ? `v${pathway.version}` : null,
    });
  }, [consultation.aiAnalysis, consultation.pathway, consultation.tenant?.timezone]);
  const presentationProvince =
    presentationEvidence?.jurisdiction ??
    (() => {
      const code = provinceFromTimezone(consultation.tenant?.timezone);
      if (!code) return null;
      return PRESENTATION_PROVINCE_LABEL[code] ?? code;
    })();

  const diagnosisQuestions = diagnosisGroup?.questions ?? [];
  const eligibilityQuestions = eligibilityGroup?.questions ?? [];
  const workingDiagnosis =
    consultation.pathway?.condition?.trim() ||
    consultation.pathway?.name?.trim() ||
    '';

  const pathwayJudgement = useMemo(() => {
    const snapshot = evaluatePathwayAssessment({
      diagnosisQuestionIds: diagnosisQuestions.map((q) => q.id),
      eligibilityQuestionIds: eligibilityQuestions.map((q) => q.id),
      responses,
      judgementStatus: judgementRecord?.status ?? 'NOT_REQUIRED',
    });
    const revision = computeSourceAnswerRevision({
      pathwayId: consultation.pathway?.id ?? consultation.selectedPathwayId ?? '',
      pathwayVersion: String(consultation.pathway?.version ?? ''),
      diagnosisAnswers: orderedAnswerPairs(
        snapshot.diagnosisConfig.questionIds,
        snapshot.diagnosisAnswers,
      ),
      eligibilityAnswers: orderedAnswerPairs(
        snapshot.eligibilityConfig.questionIds,
        snapshot.eligibilityAnswers,
      ),
    });
    return { ...snapshot, revision };
  }, [
    diagnosisQuestions,
    eligibilityQuestions,
    responses,
    judgementRecord?.status,
    consultation.pathway?.id,
    consultation.pathway?.version,
    consultation.selectedPathwayId,
  ]);

  const judgementRequired = pathwayJudgement.evaluation.clinicalJudgementRequired;
  const judgementSatisfied =
    !judgementRequired ||
    (judgementRecord?.status === 'CONFIRMED' &&
      judgementRecord.sourceAnswerRevision === pathwayJudgement.revision);
  const showJudgementCard =
    !clinicalJudgmentOnly &&
    (pathwayClinicalJudgementActive(pathwayJudgement.evaluation, judgementRecord) ||
      (judgementRequired && judgementRecord?.status !== 'CONFIRMED') ||
      judgementRecord?.status === 'STALE' ||
      (judgementRecord?.status === 'CONFIRMED' && judgementRecord.uiState === 'form'));

  useEffect(() => {
    const incoming = consultation.pathwayClinicalJudgement;
    if (!incoming) return;
    setJudgementRecord((prev) => {
      if (!prev) return incoming;
      return incoming.updatedAt >= prev.updatedAt ? incoming : prev;
    });
  }, [consultation.pathwayClinicalJudgement]);

  useEffect(() => {
    setJudgementRecord((prev) => {
      if (!prev) return prev;
      if (
        prev.status === 'CONFIRMED' &&
        judgementRequired &&
        prev.sourceAnswerRevision &&
        prev.sourceAnswerRevision !== pathwayJudgement.revision
      ) {
        return { ...prev, status: 'STALE', uiState: 'prompt' };
      }
      if (
        !judgementRequired &&
        (prev.status === 'REQUIRED' || prev.status === 'DRAFT' || prev.status === 'STALE')
      ) {
        return { ...prev, status: 'NOT_REQUIRED', reason: null, uiState: 'prompt' };
      }
      return prev;
    });
  }, [judgementRequired, pathwayJudgement.revision]);

  const displayJudgementRecord: PathwayClinicalJudgementRecord = judgementRecord ?? {
    id: 'local',
    consultationId: consultation.id,
    pathwayId: consultation.pathway?.id ?? '',
    pathwayVersion: String(consultation.pathway?.version ?? ''),
    status: judgementRequired ? 'REQUIRED' : 'NOT_REQUIRED',
    reason: pathwayJudgement.evaluation.clinicalJudgementReason,
    workingDiagnosisConceptId: consultation.pathway?.id ?? null,
    workingDiagnosisDisplay: workingDiagnosis || null,
    diagnosticCertainty: null,
    rationaleDraft: '',
    rationaleApproved: null,
    draftSource: null,
    sourceAnswerRevision: null,
    confirmedByUserId: null,
    confirmedAt: null,
    noTreatmentInitiated: false,
    uiState: 'prompt',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const queueJudgementDraft = useCallback(
    (patch: Partial<PathwayClinicalJudgementRecord>) => {
      setJudgementRecord((prev) => {
        const now = new Date().toISOString();
        const base: PathwayClinicalJudgementRecord = prev ?? {
          id: 'local',
          consultationId: consultation.id,
          pathwayId: consultation.pathway?.id ?? '',
          pathwayVersion: String(consultation.pathway?.version ?? ''),
          status: 'REQUIRED',
          reason: pathwayJudgement.evaluation.clinicalJudgementReason,
          workingDiagnosisConceptId: consultation.pathway?.id ?? null,
          workingDiagnosisDisplay: workingDiagnosis || null,
          diagnosticCertainty: null,
          rationaleDraft: '',
          rationaleApproved: null,
          draftSource: null,
          sourceAnswerRevision: null,
          confirmedByUserId: null,
          confirmedAt: null,
          noTreatmentInitiated: false,
          uiState: 'prompt',
          createdAt: now,
          updatedAt: now,
        };
        const next = { ...base, ...patch, updatedAt: now };
        if (judgementDraftTimer.current) window.clearTimeout(judgementDraftTimer.current);
        judgementDraftTimer.current = window.setTimeout(() => {
          void saveJudgementDraft
            .mutateAsync({
              workingDiagnosisDisplay: next.workingDiagnosisDisplay ?? undefined,
              workingDiagnosisConceptId: next.workingDiagnosisConceptId ?? undefined,
              diagnosticCertainty: next.diagnosticCertainty ?? undefined,
              rationaleDraft: next.rationaleDraft,
              uiState: next.uiState,
            })
            .catch(() => undefined);
        }, 400);
        return next;
      });
    },
    [
      consultation.id,
      consultation.pathway?.id,
      consultation.pathway?.version,
      pathwayJudgement.evaluation.clinicalJudgementReason,
      saveJudgementDraft,
      workingDiagnosis,
    ],
  );

  useEffect(() => {
    return () => {
      if (judgementDraftTimer.current) window.clearTimeout(judgementDraftTimer.current);
    };
  }, []);

  const diagnosisAnswered = countAnsweredQuestions(diagnosisQuestions, responses);
  const eligibilityAnswered = countAnsweredQuestions(eligibilityQuestions, responses);

  const assessmentComplete = useMemo(() => {
    if (!questions.length) return true;
    return assessmentGroups.every((g) => sectionMeetsMinimum(g.questions, responses));
  }, [assessmentGroups, questions.length, responses]);

  const differentialRequired = differentials.length > 0 && !clinicalJudgmentOnly;
  const canContinue = clinicalJudgmentOnly
    ? detailsComplete
    : assessmentComplete && judgementSatisfied;
  const continueBlockedReason = canContinue
    ? undefined
    : clinicalJudgmentOnly
      ? detailsComplete
        ? undefined
        : 'Complete patient details to continue'
      : !assessmentComplete
        ? 'Answer remaining clinical assessment questions to continue'
        : !judgementSatisfied
          ? 'Document clinical judgement to continue'
          : 'Complete this step to continue';

  // Keep expanded subsection valid; default to first incomplete when groups load
  useEffect(() => {
    if (!assessmentGroups.length) {
      setOpenAssessmentKey(null);
      return;
    }
    if (openAssessmentKey && assessmentGroups.some((g) => g.key === openAssessmentKey)) return;
    setOpenAssessmentKey(findFirstIncompleteAssessmentKey(assessmentGroups, responses));
  }, [assessmentGroups, openAssessmentKey, responses]);

  // Auto-open next subsection when the current one meets its minimum.
  // Never scroll here — Yes/No clicks must leave the viewport still.
  useEffect(() => {
    if (!openAssessmentKey || aiQLoading || !questOpen) return;
    const group = assessmentGroups.find((g) => g.key === openAssessmentKey);
    if (!group) return;

    const ready = sectionMeetsMinimum(group.questions, responses);
    if (!ready || autoAdvancedFromRef.current.has(openAssessmentKey)) return;

    const order = assessmentGroups.map((g) => g.key);
    const idx = order.indexOf(openAssessmentKey);
    const nextKey = order[idx + 1];
    if (!nextKey) return;

    autoAdvancedFromRef.current.add(openAssessmentKey);
    const timer = window.setTimeout(() => {
      setOpenAssessmentKey(nextKey);
    }, ASSESSMENT_ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [responses, openAssessmentKey, assessmentGroups, aiQLoading, questOpen]);

  const toggleAssessmentSubsection = useCallback((key: AssessmentSectionName) => {
    setOpenAssessmentKey((prev) => (prev === key ? null : key));
  }, []);

  const patientSummary = useMemo(() => {
    const parts: string[] = [];
    if (demo.age && demo.sex) {
      const unit = demo.ageUnit === 'months' ? 'month-old' : 'year-old';
      parts.push(`${demo.age}-${unit} ${demo.sex.toLowerCase()}`);
    }
    if (demo.pregnancyStatus) parts.push(demo.pregnancyStatus);
    if (demo.height || demo.weight) {
      const vitals: string[] = [];
      if (demo.height) vitals.push(`${demo.height} cm`);
      if (demo.weight) vitals.push(`${demo.weight} kg`);
      if (demo.bmi) vitals.push(`BMI ${demo.bmi}`);
      if (vitals.length) parts.push(vitals.join(', '));
    }
    if (demo.bloodPressureSystolic && demo.bloodPressureDiastolic) {
      parts.push(`BP ${demo.bloodPressureSystolic}/${demo.bloodPressureDiastolic}`);
    }
    if (demo.pulse) parts.push(`Pulse ${demo.pulse} bpm`);
    if (allergiesDone) {
      parts.push(allergiesNone ? 'NKDA' : `${allergyEntries.length} allerg${allergyEntries.length === 1 ? 'y' : 'ies'}`);
    }
    if (medsDone) {
      parts.push(medsNone ? 'No current meds' : `${medicationEntries.length} medication${medicationEntries.length === 1 ? '' : 's'}`);
    }
    return parts.join(' · ') || 'Patient details';
  }, [demo, allergiesDone, allergiesNone, allergyEntries.length, medsDone, medsNone, medicationEntries.length]);

  const assessmentSummary = useMemo(() => {
    if (!questions.length) return 'No clinical findings for this pathway';
    if (!assessmentComplete) {
      const bits: string[] = [];
      if (diagnosisQuestions.length) {
        bits.push(`Dx ${diagnosisAnswered}/${diagnosisQuestions.length}`);
      }
      if (eligibilityQuestions.length) {
        bits.push(`Elig ${eligibilityAnswered}/${eligibilityQuestions.length}`);
      }
      return bits.join(' · ') || `${reviewedCount} of ${questions.length} reviewed`;
    }
    return `${reviewedCount} findings reviewed`;
  }, [
    questions.length,
    assessmentComplete,
    diagnosisQuestions.length,
    eligibilityQuestions.length,
    diagnosisAnswered,
    eligibilityAnswered,
    reviewedCount,
  ]);

  // Sync demographics when AI entities load / intake is re-analysed
  useEffect(() => {
    const intake = readIntakeAnalysisMeta(consultation.aiAnalysis);
    const preferAi =
      intake.downstreamRefreshRequired === true ||
      (Boolean(intake.intakeFingerprint) &&
        intake.intakeFingerprint !==
          computeIntakeFingerprint({
            chiefComplaint: consultation.chiefComplaint,
            transcript: consultation.transcript ?? '',
            attachmentIds: (Array.isArray(consultation.attachments)
              ? consultation.attachments
              : []
            ).map((a) => a.id),
          }));

    const { demo: nextDemo, aiFields: nextFields } = buildDemographicsFromSources(
      consultation.aiEntities,
      consultation.demographics,
      consultation.transcript ?? '',
      { preferAi },
    );
    setDemo((prev) => {
      const merged = { ...nextDemo };
      const stringKeys: Array<keyof Demographics> = [
        'age', 'sex', 'ageUnit', 'dateOfBirth', 'height', 'weight', 'bmi', 'pulse',
        'bloodPressureSystolic', 'bloodPressureDiastolic',
        'pregnancyStatus', 'breastfeedingStatus', 'allergies',
        'currentMedications', 'medicalConditions', 'surgicalHistory', 'familyHistory',
        'smokingStatus', 'alcoholUse', 'drugUse', 'labValues', 'measurementDate',
      ];
      // When intake refreshed, trust AI merge; otherwise preserve in-progress local edits.
      if (!preferAi) {
        for (const k of stringKeys) {
          const v = prev[k];
          if (typeof v === 'string' && v.trim() && !nextFields.has(k)) {
            (merged as Record<string, string | MedicationEntry[] | undefined>)[k] = v;
          }
        }
        if (prev.medicationEntries?.length && !nextDemo.medicationEntries?.length) {
          merged.medicationEntries = prev.medicationEntries;
        }
      }
      if (prev.lifestyleAssessed) merged.lifestyleAssessed = true;
      if (prev.noKnownConditions) merged.noKnownConditions = true;
      if (prev.dateOfBirthUnavailable) merged.dateOfBirthUnavailable = true;
      // Prefer local UI reproductive answers; else migrate from saved/composed labels
      const source =
        !preferAi && consultation.demographics
          ? { ...merged, ...consultation.demographics }
          : merged;
      const migrated = migrateReproductiveStatus(source as Demographics);
      if (migrated.pregnancyStatus) merged.pregnancyStatus = migrated.pregnancyStatus;
      if (migrated.breastfeedingStatus) merged.breastfeedingStatus = migrated.breastfeedingStatus;
      // Don't clobber in-progress UI answers the pharmacist just typed (unless refreshing)
      if (!preferAi) {
        if (prev.pregnancyStatus && ['No', 'Yes', 'Unknown'].includes(prev.pregnancyStatus)) {
          merged.pregnancyStatus = prev.pregnancyStatus;
        }
        if (
          prev.breastfeedingStatus &&
          ['No', 'Yes', 'Unknown'].includes(prev.breastfeedingStatus)
        ) {
          merged.breastfeedingStatus = prev.breastfeedingStatus;
        }
      }
      return merged;
    });
    setAiFields(nextFields);
    if (!preferAi && consultation.demographics?.medicationEntries?.length) {
      setMedicationEntries(sanitizeMedicationEntries(consultation.demographics.medicationEntries));
    }
    if (!preferAi && consultation.demographics?.extractedLabValues?.length) {
      setExtractedLabValues(selectLatestLabValues(consultation.demographics.extractedLabValues));
    }
    if (!preferAi && consultation.demographics?.allergyEntries?.length) {
      setAllergiesNone(false);
      setAllergyEntries(consultation.demographics.allergyEntries as AllergyEntry[]);
    } else {
      const nextAllergies = parseAllergies(
        preferAi
          ? nextDemo.allergies
          : consultation.demographics?.allergies ?? nextDemo.allergies,
        consultation.aiEntities?.allergies,
      );
      const nextIsNkda =
        isNkdaText(
          preferAi
            ? nextDemo.allergies
            : consultation.demographics?.allergies ?? nextDemo.allergies,
        ) ||
        (() => {
          const aiAllergies = asArray<{ allergen?: string }>(consultation.aiEntities?.allergies);
          return Boolean(aiAllergies.length && aiAllergies.every((a) => isNkdaText(a.allergen)));
        })();
      if (nextIsNkda) {
        setAllergiesNone(true);
        setAllergyEntries([]);
      } else if (nextAllergies.length) {
        setAllergiesNone(false);
        setAllergyEntries(nextAllergies);
      }
    }
    if (
      (preferAi || !consultation.demographics?.currentMedications) &&
      nextDemo.currentMedications?.trim().toLowerCase() === 'none'
    ) {
      // Only apply AI "none" when the user has not already added meds this session
      setMedicationEntries((prev) => {
        if (!preferAi && prev.length > 0) return prev;
        setMedsNone(true);
        return [];
      });
    }
    const nextConditions = parseConditions(
      preferAi
        ? nextDemo.medicalConditions
        : consultation.demographics?.medicalConditions ?? nextDemo.medicalConditions,
    );
    // Drop presenting-complaint noise and lab values wrongly filed as history
    const cleanedConditions = filterPastMedicalConditions(
      nextConditions.map((c) => ({ condition: c })),
      consultation.aiEntities?.symptoms,
      consultation.aiEntities?.chiefComplaint ?? consultation.chiefComplaint,
    )
      .map((c) => c.condition)
      .filter((c) => !isLabLikeCondition(c));
    setConditions(cleanedConditions);

    // Prefer AI/local lab fill when demographics.labValues empty (or refreshing)
    if (
      nextDemo.labValues?.trim() &&
      (preferAi || !consultation.demographics?.labValues?.trim())
    ) {
      setDemo((prev) => ({
        ...prev,
        labValues:
          preferAi || !prev.labValues?.trim() ? nextDemo.labValues : prev.labValues,
        medicalConditions: cleanedConditions.join(', '),
      }));
    }
  }, [
    consultation.aiEntities,
    consultation.demographics,
    consultation.transcript,
    consultation.chiefComplaint,
    consultation.attachments,
    consultation.aiAnalysis,
  ]);

  // Resolve current medications via CCDD as soon as Step 3 opens.
  // Strip extractor placeholders ("Metformin Unknown") immediately, then
  // replace uncoded stubs with coded CCDD rows (generic / brand / class).
  useEffect(() => {
    if (medsNone) return;

    const savedEntries = consultation.demographics?.medicationEntries;
    const working = sanitizeMedicationEntries(
      medicationEntries.length
        ? medicationEntries
        : parseMedicationEntriesFromSaved(savedEntries, demo.currentMedications),
    );

    const cleanedAllergyOnly = working.filter((e) => {
      const label = e.label || e.brandName || e.genericName || '';
      if (!label) return true;
      if (isAllergyOnlyDrugMention(transcript, label)) return false;
      if (
        /novamoxin|amox/i.test(label) &&
        isAllergyOnlyDrugMention(transcript, 'amoxicillin')
      ) {
        return false;
      }
      return true;
    });

    if (cleanedAllergyOnly.length !== medicationEntries.length) {
      setMedicationEntries(cleanedAllergyOnly);
    }

    const coded = cleanedAllergyOnly.filter(isCodedMedicationEntry);
    const uncoded = cleanedAllergyOnly.filter(medicationEntryNeedsCcdDResolve);
    const pharmacistCoded = coded.filter(
      (e) => e.source === 'ccdd' || e.source === 'rxnorm' || e.source === 'openfda',
    );

    const meds = (consultation.aiEntities?.medications ?? []).filter((m) => {
      if (!m?.name) return false;
      if (isAllergyOnlyDrugMention(transcript, m.name)) return false;
      return isExplicitlyTakingMedication(transcript, m.name);
    });
    const aiNames = meds.map((m) => m.name).filter(Boolean);

    const names = collectMedicationNamesToResolve({
      aiNames,
      freeText: demo.currentMedications,
      existing: uncoded,
    }).filter((name) => {
      if (isAllergyOnlyDrugMention(transcript, name)) return false;
      if (
        /novamoxin|amox/i.test(name) &&
        isAllergyOnlyDrugMention(transcript, 'amoxicillin')
      ) {
        return false;
      }
      return isExplicitlyTakingMedication(transcript, name) || !transcript.trim() || uncoded.length > 0;
    });

    if (!names.length) return;
    if (pharmacistCoded.length && !uncoded.length) return;

    const resolveKey = names.map((n) => n.toLowerCase()).sort().join('|');
    if (medResolveKeyRef.current === resolveKey) return;
    medResolveKeyRef.current = resolveKey;

    let cancelled = false;
    setMedsResolving(true);
    resolveMeds
      .mutateAsync({ names, purpose: 'medication' })
      .then((resolved) => {
        if (cancelled || !resolved.length) return;
        const incoming = resolved
          .map((r) => {
            const entry = drugResultToEntry(r);
            return {
              ...entry,
              source: isCodedMedicationEntry(entry)
                ? entry.source
                : ('transcript' as const),
            };
          })
          .filter((e) => {
            const label = e.label || e.brandName || e.genericName || '';
            if (isAllergyOnlyDrugMention(transcript, label)) return false;
            if (
              /novamoxin|amox/i.test(label) &&
              isAllergyOnlyDrugMention(transcript, 'amoxicillin')
            ) {
              return false;
            }
            return true;
          });
        if (!incoming.length) return;
        const next = mergeUniqueMedications(pharmacistCoded, incoming);
        if (!next.length) return;
        setMedicationEntries(next);
        setDemo((prev) => ({
          ...prev,
          currentMedications: entriesToDisplayString(next),
          medicationEntries: next,
        }));
        setAiFields((prev) => new Set(prev).add('currentMedications'));
      })
      .catch(() => {
        medResolveKeyRef.current = null;
      })
      .finally(() => {
        if (!cancelled) setMedsResolving(false);
      });

    return () => {
      cancelled = true;
      setMedsResolving(false);
    };
  }, [consultation.aiEntities?.medications, consultation.demographics?.medicationEntries, demo.currentMedications, transcript, medsNone]); // eslint-disable-line

  // Resolve allergens via CCDD (TM) + classify allergy type from AI / transcript
  useEffect(() => {
    if (allergiesNone) return;

    const saved = consultation.demographics?.allergyEntries as AllergyEntry[] | undefined;
    const aiAllergies = asArray<{
      allergen?: string;
      reaction?: string;
      allergyType?: string;
      confidence?: number;
    }>(consultation.aiEntities?.allergies).filter((a) => !isNkdaText(a.allergen));

    const enrichTypesOnly = (entries: AllergyEntry[]) => {
      const needsType = entries.some((e) => allergyTypeFromEntry(e) == null);
      if (!needsType) return false;
      const enriched = entries.map((e) => {
        if (allergyTypeFromEntry(e) != null) return e;
        const hint = aiAllergies.find(
          (a) => (a.allergen ?? '').toLowerCase() === e.drug.toLowerCase(),
        );
        return applyInferredAllergyType(e, {
          allergen: e.drug,
          transcript,
          reaction: hint?.reaction ?? e.reaction,
          allergyType: hint?.allergyType,
        });
      });
      setAllergyEntries(enriched);
      syncAllergiesToDemo(enriched, false);
      return true;
    };

    const isCodedAllergy = (e: AllergyEntry) =>
      e.source === 'ccdd' ||
      e.source === 'rxnorm' ||
      e.source === 'openfda' ||
      Boolean(e.codeDisplay || e.rxcui || e.ndc);

    if (saved?.length) {
      const needsResolve = saved.some(
        (e) => !isCodedAllergy(e) && (e.source === 'transcript' || !e.source),
      );
      if (!needsResolve) {
        enrichTypesOnly(saved);
        return;
      }
    }

    const hasUserOrCoded = allergyEntries.some(
      (e) =>
        e.source === 'ccdd' ||
        e.source === 'rxnorm' ||
        e.source === 'openfda' ||
        e.source === 'manual',
    );
    if (hasUserOrCoded && allergyEntries.every(isCodedAllergy)) {
      enrichTypesOnly(allergyEntries);
      return;
    }

    const names = collectAllergyNamesToResolve({
      aiAllergies,
      freeText: demo.allergies,
      existing: saved?.length ? saved : allergyEntries,
    }).filter((n) => !isNkdaText(n));

    if (!names.length) return;

    const resolveKey = names.map((n) => n.toLowerCase()).sort().join('|');
    if (allergyResolveKeyRef.current === resolveKey) {
      // Already resolved this set — still fill types if chips lack them
      if (allergyEntries.length) enrichTypesOnly(allergyEntries);
      return;
    }
    allergyResolveKeyRef.current = resolveKey;

    let cancelled = false;
    setAllergiesResolving(true);
    resolveMeds
      .mutateAsync({ names, purpose: 'allergy' })
      .then((resolved) => {
        if (cancelled || !resolved.length) return;
        const uniqueNames = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
        const entries = buildResolvedAllergyEntries({
          names: uniqueNames,
          resolved,
          transcript,
          aiHints: aiAllergies,
        });
        if (!entries.length) return;
        setAllergiesNone(false);
        setAllergyEntries(entries);
        syncAllergiesToDemo(entries, false);
        setAiFields((prev) => new Set(prev).add('allergies'));
      })
      .catch(() => {
        if (cancelled) return;
        const fallback = (allergyEntries.length
          ? allergyEntries
          : parseAllergies(demo.allergies, aiAllergies)
        ).map((e) =>
          applyInferredAllergyType(e, {
            allergen: e.drug,
            transcript,
            reaction: e.reaction,
            allergyType: aiAllergies.find(
              (a) => (a.allergen ?? '').toLowerCase() === e.drug.toLowerCase(),
            )?.allergyType,
          }),
        );
        if (fallback.length) {
          setAllergyEntries(fallback);
          syncAllergiesToDemo(fallback, false);
        }
      })
      .finally(() => {
        setAllergiesResolving(false);
      });

    return () => {
      cancelled = true;
      setAllergiesResolving(false);
    };
  }, [
    allergiesNone,
    consultation.aiEntities?.allergies,
    consultation.demographics?.allergyEntries,
    demo.allergies,
    transcript,
  ]); // eslint-disable-line

  useEffect(() => {
    const medQuestions = questions.filter((q) => isMedicationQuestion(q));
    if (!medQuestions.length) return;

    const pending = medQuestions.filter((q) => {
      if (resolvedMedQuestionsRef.current.has(q.id)) return false;
      const r = responses[q.id];
      const text = String(r?.answerText ?? r?.answer ?? '').trim();
      return text && !r?.medicationEntries?.length;
    });
    if (!pending.length) return;

    let cancelled = false;
    (async () => {
      for (const q of pending) {
        resolvedMedQuestionsRef.current.add(q.id);
        const r = responses[q.id];
        const text = String(r?.answerText ?? r?.answer ?? '');
        const names = text.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
        if (!names.length) continue;
        try {
          const resolved = await resolveMeds.mutateAsync({ names, purpose: 'medication' });
          if (cancelled || !resolved.length) continue;
          const entries = resolved.map((item) => ({
            ...drugResultToEntry(item),
            source: 'transcript' as const,
          }));
          setResponses((prev) => ({
            ...prev,
            [q.id]: {
              ...prev[q.id],
              medicationEntries: entries,
              answerText: entriesToDisplayString(entries),
              answer: entriesToDisplayString(entries),
            },
          }));
        } catch {
          /* keep free-text */
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [questions, responses, resolveMeds]);

  useEffect(() => {
    if (!consultation.questionResponses) return;
    const saved = consultation.questionResponses as Record<string, QuestionResponse>;
    const intake = readIntakeAnalysisMeta(consultation.aiAnalysis);
    const refreshing = intake.downstreamRefreshRequired === true;

    setResponses((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const q of questions) {
        const row = saved[q.id];
        if (row && row.answer != null && row.answer !== '') {
          const canonical = canonicalizeBinaryResponse(q, row);
          const cur = prev[q.id];
          if (
            cur?.answerText !== canonical.answerText ||
            cur?.answer !== canonical.answer ||
            cur?.source !== canonical.source
          ) {
            next[q.id] = canonical;
            changed = true;
          }
        } else if (refreshing && prev[q.id]?.source !== 'manual') {
          // Intake re-analysis cleared AI fills — drop stale local answers
          next[q.id] = {
            ...prev[q.id],
            questionId: q.id,
            question: q.question,
            answer: null,
            answerText: '',
            aiAnswered: false,
            source: undefined,
            confidence: undefined,
            medicationEntries: undefined,
          };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [consultation.questionResponses, consultation.aiAnalysis, questions]);

  const lastSavedSnapshot = useRef<string | null>(null);
  const advancingRef = useRef(false);
  const savingDisabledRef = useRef(
    consultation.status === 'COMPLETED' || consultation.status === 'CANCELLED',
  );
  const lockToastShownRef = useRef(false);

  const notifyLocked = useCallback((message?: string) => {
    if (lockToastShownRef.current) return;
    lockToastShownRef.current = true;
    toast.error('This consultation is locked', {
      description: message ?? 'Completed consultations cannot be edited.',
    });
  }, []);

  const buildSnapshot = useCallback(
    () =>
      JSON.stringify({
        demo,
        medicationEntries,
        responses,
        allergyEntries,
        allergiesNone,
        conditions,
        medsNone,
        differentialReviewed,
      }),
    [
      demo,
      medicationEntries,
      responses,
      allergyEntries,
      allergiesNone,
      conditions,
      medsNone,
      differentialReviewed,
    ],
  );

  const persist = useCallback(async (extra?: Record<string, unknown>) => {
    const snapshot = buildSnapshot();
    setSaveStatus('saving');
    try {
      const allergyText = serializeAllergies(allergyEntries, allergiesNone);
      // Persist UI answers + a safety-readable composed pregnancyStatus for CDS
      const uiPregnancy = demo.pregnancyStatus;
      const uiBreastfeeding = demo.breastfeedingStatus;
      const safetyLabel = composePregnancySafetyLabel(uiPregnancy, uiBreastfeeding);
      const confirmedFlag = Boolean(
        extra && Object.prototype.hasOwnProperty.call(extra, 'patientInformationConfirmed')
          ? extra.patientInformationConfirmed
          : patientInfoConfirmed,
      );
      const confirmedAt = confirmedFlag
        ? typeof extra?.patientInformationConfirmedAt === 'string'
          ? extra.patientInformationConfirmedAt
          : demo.patientInformationConfirmedAt ?? new Date().toISOString()
        : null;
      const confirmedBy = confirmedFlag
        ? typeof extra?.patientInformationConfirmedBy === 'string'
          ? extra.patientInformationConfirmedBy
          : demo.patientInformationConfirmedBy ?? consultation.pharmacistId
        : null;
      const demoPayload = normalizePatientDemographics({
        ...demo,
        pregnancyStatus: safetyLabel || uiPregnancy,
        breastfeedingStatus: uiBreastfeeding,
        pregnancyAnswer: uiPregnancy,
        breastfeedingAnswer: uiBreastfeeding,
        allergies: allergyText || demo.allergies,
        allergyEntries: allergiesNone ? [] : allergyEntries,
        allergiesNone,
        medicalConditions: conditionsNone
          ? 'No known conditions'
          : conditions.join(', ') || demo.medicalConditions,
        noKnownConditions: conditionsNone,
        currentMedications: medsNone
          ? 'None'
          : entriesToDisplayString(medicationEntries) || demo.currentMedications,
        medicationEntries: medsNone ? [] : medicationEntries,
        medsNone,
        extractedLabValues,
        ...extra,
        patientInformationConfirmed: confirmedFlag,
        patientInformationConfirmedAt: confirmedAt,
        patientInformationConfirmedBy: confirmedBy,
      } as unknown as Record<string, unknown>);
      await saveStep.mutateAsync({
        stepIndex: 2,
        currentStep: 'DEMOGRAPHICS',
        data: demoPayload as unknown as Record<string, unknown>,
      });
      if (questions.length > 0 || differentialRequired || responses[PRESENTATION_FINDINGS_KEY]) {
        const responsePayload: Record<string, unknown> = {
          ...responses,
        };
        if (differentialRequired) {
          responsePayload[DIFF_REVIEW_KEY] = {
            questionId: DIFF_REVIEW_KEY,
            question: 'Differential review acknowledgment',
            answer: differentialReviewed,
            answerText: differentialReviewed ? 'reviewed' : '',
            source: 'manual',
          } satisfies QuestionResponse;
        }
        const saved = await saveStep.mutateAsync({
          stepIndex: 3,
          currentStep: 'CLINICAL_QUESTIONS',
          data: responsePayload,
        });
        const rec =
          saved && typeof saved === 'object' && 'pathwayClinicalJudgement' in saved
            ? (saved as { pathwayClinicalJudgement?: PathwayClinicalJudgementRecord })
                .pathwayClinicalJudgement
            : undefined;
        if (rec) setJudgementRecord(rec);
      }
      lastSavedSnapshot.current = snapshot;
      setSaveStatus('saved');
      setSavedAgo('just now');
      return true;
    } catch (err) {
      setSaveStatus('error');
      const message = getErrorMessage(err, 'Could not save changes');
      if (getErrorStatus(err) === 400 && /completed|locked|cannot edit|cancelled/i.test(message)) {
        savingDisabledRef.current = true;
        notifyLocked(message);
      } else {
        toastError(err, 'Could not save changes');
      }
      return false;
    }
  }, [
    demo,
    medicationEntries,
    responses,
    questions.length,
    saveStep,
    buildSnapshot,
    notifyLocked,
    allergyEntries,
    allergiesNone,
    conditions,
    conditionsNone,
    medsNone,
    extractedLabValues,
    differentialReviewed,
    differentialRequired,
    patientInfoConfirmed,
    consultation.pharmacistId,
  ]);

  const persistRef = useRef(persist);
  useEffect(() => {
    persistRef.current = persist;
  }, [persist]);

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isLoading) return;
    const snapshot = buildSnapshot();
    if (lastSavedSnapshot.current === null) {
      lastSavedSnapshot.current = snapshot;
      return;
    }
    if (snapshot === lastSavedSnapshot.current) return;
    if (savingDisabledRef.current) {
      notifyLocked();
      return;
    }
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      void persistRef.current();
    }, 1200);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [buildSnapshot, isLoading, notifyLocked]);

  // Soft "saved N sec ago" ticker
  useEffect(() => {
    if (saveStatus !== 'saved') return;
    setSavedAgo('just now');
    const t = setTimeout(() => setSavedAgo('a few seconds ago'), 3000);
    return () => clearTimeout(t);
  }, [saveStatus]);

  const demoSectionRef = useRef<HTMLDivElement>(null);
  const backgroundSectionRef = useRef<HTMLDivElement>(null);
  const labsSectionRef = useRef<HTMLDivElement>(null);
  const questSectionRef = useRef<HTMLDivElement>(null);
  const diffSectionRef = useRef<HTMLDivElement>(null);
  const [sectionSaving, setSectionSaving] = useState<'demo' | 'quest' | null>(null);
  const [allergyRemoveTarget, setAllergyRemoveTarget] = useState<AllergyDrugEntry | null>(null);
  const allergyRemoveConfirmRef = useRef<(() => void) | null>(null);

  const scrollToSection = useCallback((ref: React.RefObject<HTMLDivElement | null>) => {
    focusClinicalSectionSoon(() => ref.current, { behavior: 'auto', settleMs: 200 });
  }, []);

  const prevDiagnosisCompleteRef = useRef(false);
  const prevEligibilityCompleteRef = useRef(false);

  // Auto-complete Diagnosis Confirmation when all questions become answered
  useEffect(() => {
    if (!diagnosisQuestions.length) {
      setDiagnosisDone(true);
      prevDiagnosisCompleteRef.current = true;
      return;
    }
    const complete = sectionFullyAnswered(diagnosisQuestions, responses);
    if (complete && !prevDiagnosisCompleteRef.current && diagnosisOpen) {
      setDiagnosisDone(true);
      if (eligibilityQuestions.length) {
        setEligibilityOpen(true);
      } else if (differentials.length) {
        setDiffOpen(true);
      }
    }
    if (!complete) setDiagnosisDone(false);
    prevDiagnosisCompleteRef.current = complete;
  }, [
    responses,
    diagnosisQuestions,
    diagnosisOpen,
    eligibilityQuestions.length,
    differentials.length,
  ]);

  // Auto-complete Treatment Eligibility when all criteria become answered
  useEffect(() => {
    if (!eligibilityQuestions.length) {
      setEligibilityDone(true);
      prevEligibilityCompleteRef.current = true;
      return;
    }
    if (!diagnosisDone && diagnosisQuestions.length > 0) return;
    const complete = sectionFullyAnswered(eligibilityQuestions, responses);
    if (complete && !prevEligibilityCompleteRef.current && eligibilityOpen) {
      setEligibilityDone(true);
      if (pathwayJudgement.evaluation.clinicalJudgementRequired) {
        // Spec: do not auto-collapse Treatment Eligibility when judgement is required.
        setEligibilityOpen(true);
      } else {
        setEligibilityOpen(false);
        if (differentials.length) {
          setDiffOpen(true);
        }
      }
    }
    if (!complete) setEligibilityDone(false);
    prevEligibilityCompleteRef.current = complete;
  }, [
    responses,
    eligibilityQuestions,
    eligibilityOpen,
    diagnosisDone,
    diagnosisQuestions.length,
    differentials.length,
    pathwayJudgement.evaluation.clinicalJudgementRequired,
  ]);

  
  // Hydrate criteria section completion from saved answers (returning to step)
  useEffect(() => {
    if (!(detailsPhase === 'done' || (snapshotDone && backgroundDone && labsDone))) return;
    if (diagnosisQuestions.length && sectionFullyAnswered(diagnosisQuestions, responses)) {
      setDiagnosisDone(true);
      setDiagnosisOpen(false);
      prevDiagnosisCompleteRef.current = true;
      if (eligibilityQuestions.length) {
        if (sectionFullyAnswered(eligibilityQuestions, responses)) {
          setEligibilityDone(true);
          prevEligibilityCompleteRef.current = true;
          const needsJudgement =
            evaluatePathwayAssessment({
              diagnosisQuestionIds: diagnosisQuestions.map((q) => q.id),
              eligibilityQuestionIds: eligibilityQuestions.map((q) => q.id),
              responses,
              judgementStatus: consultation.pathwayClinicalJudgement?.status ?? 'NOT_REQUIRED',
            }).evaluation.clinicalJudgementRequired;
          setEligibilityOpen(needsJudgement);
          if (!needsJudgement && differentials.length && !differentialReviewed) {
            setDiffOpen(true);
          }
        } else {
          setEligibilityOpen(true);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailsPhase, labsDone]);


  const openNextAfterDemo = useCallback(() => {
    setDemoOpen(false);
    setDetailsPhase('done');
    setLabsDone(true);
    setQuestOpen(true);
    if (diagnosisQuestions.length > 0) {
      setDiagnosisOpen(true);
      const alreadyComplete = sectionFullyAnswered(diagnosisQuestions, responses);
      setDiagnosisDone(alreadyComplete);
      prevDiagnosisCompleteRef.current = alreadyComplete;
      setEligibilityOpen(alreadyComplete && eligibilityQuestions.length > 0);
      setDiffOpen(false);
      // One gentle align after confirm — no settle thrash; answers cancel this pin.
      focusClinicalSectionSoon(
        () => assessmentSubsectionRefs.current.diagnosisConfirmation ?? null,
        { behavior: 'auto', settleMs: 0 },
      );
    } else if (eligibilityQuestions.length > 0) {
      setEligibilityOpen(true);
      setEligibilityDone(false);
      setDiffOpen(false);
      focusClinicalSectionSoon(
        () => assessmentSubsectionRefs.current.treatmentEligibility ?? null,
        { behavior: 'auto', settleMs: 0 },
      );
    } else if (differentials.length > 0) {
      setDiffOpen(true);
      scrollToSection(diffSectionRef);
    }
  }, [
    questions.length,
    differentials.length,
    scrollToSection,
    diagnosisQuestions,
    eligibilityQuestions,
    responses,
    assessmentGroups,
  ]);

  const openNextAfterQuest = useCallback(() => {
    setQuestOpen(false);
    if (differentials.length > 0) {
      setDiffOpen(true);
      scrollToSection(diffSectionRef);
    }
  }, [differentials.length, scrollToSection]);

  // Prefill from conversation: re-analyze when intake drifted → refresh AI findings
  useEffect(() => {
    let cancelled = false;
    const safetyTimer = window.setTimeout(() => {
      // Never leave the form locked if AI calls hang
      setPrefillLoading(false);
      setAiQLoading(false);
    }, 45_000);

    const intake = readIntakeAnalysisMeta(consultation.aiAnalysis);
    const fingerprint = computeIntakeFingerprint({
      chiefComplaint: consultation.chiefComplaint,
      transcript,
      attachmentIds: (Array.isArray(consultation.attachments) ? consultation.attachments : []).map(
        (a) => a.id,
      ),
    });
    const fingerprintMismatch =
      Boolean(intake.intakeFingerprint) && intake.intakeFingerprint !== fingerprint;
    const needsAnswerRefresh =
      intake.downstreamRefreshRequired === true || fingerprintMismatch;
    const runKey = `${consultation.id}:${fingerprint}:${questions.length}:${needsAnswerRefresh ? '1' : '0'}`;

    if (!transcript.trim()) {
      window.clearTimeout(safetyTimer);
      setPrefillLoading(false);
      setAiQLoading(false);
      return;
    }
    if (prefillRunRef.current === runKey) {
      window.clearTimeout(safetyTimer);
      return;
    }
    prefillRunRef.current = runKey;

    async function runPrefill() {
      setPrefillLoading(true);
      setAiQLoading(false);
      try {
        // Re-analyze only when entities are sparse or intake fingerprint drifted.
        // If Step 1 already analysed (downstreamRefreshRequired only), skip a second pass.
        if (!hasExtractedData(consultation.aiEntities) || fingerprintMismatch) {
          await analyze.mutateAsync({
            transcript,
            chiefComplaint: consultation.chiefComplaint,
          });
          if (cancelled) return;
          await queryClient.refetchQueries({
            queryKey: consultationKeys.detail(consultation.id),
          });
        }
      } catch {
        /* local regex prefill still applies via buildDemographicsFromSources */
      } finally {
        setPrefillLoading(false);
      }

      if (cancelled || questions.length === 0) return;

      const latest = queryClient.getQueryData(
        consultationKeys.detail(consultation.id),
      ) as Consultation | undefined;
      const latestMeta = readIntakeAnalysisMeta(latest?.aiAnalysis ?? consultation.aiAnalysis);
      const forceRefresh =
        latestMeta.downstreamRefreshRequired === true || needsAnswerRefresh;

      const currentResponses = (
        latest?.questionResponses ?? consultation.questionResponses ?? {}
      ) as Record<string, QuestionResponse>;
      const missing = unansweredRequiredQuestions(questions, currentResponses);
      if (!forceRefresh && !missing.length) return;

      setAiQLoading(true);
      try {
        const res = await answerQs.mutateAsync({ forceRefresh });
        if (cancelled) return;
        const answers =
          (
            res as {
              answers: Array<{
                id: string;
                answer: unknown;
                answerText?: string;
                confidence?: number;
                source?: string;
              }>;
            }
          ).answers ?? [];

        setResponses((prev) => {
          const base = forceRefresh
            ? Object.fromEntries(
                Object.entries(prev).filter(([, v]) => v?.source === 'manual'),
              )
            : prev;
          return mergeQuestionAnswers(questions, base, answers, CONFIDENCE_THRESHOLD);
        });

        if (forceRefresh) {
          toast.message('Assessment updated', {
            description: 'Clinical findings were refreshed from the latest consultation notes.',
          });
          await queryClient.refetchQueries({
            queryKey: consultationKeys.detail(consultation.id),
          });
        }
      } catch {
        if (!cancelled) {
          toast.error('Could not auto-fill assessment from the conversation');
        }
      } finally {
        setAiQLoading(false);
      }
    }

    void runPrefill();
    return () => {
      cancelled = true;
      window.clearTimeout(safetyTimer);
      // Always clear loading so a cancelled/re-run effect cannot leave Save locked
      setPrefillLoading(false);
      setAiQLoading(false);
    };
    // Re-run when transcript, intake analysis meta, or pathway questions change
  }, [
    consultation.id,
    transcript,
    questions.length,
    consultation.aiAnalysis,
    consultation.chiefComplaint,
    consultation.attachments,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  const answerScrollUnpinRef = useRef<(() => void) | null>(null);

  const pinAnswerScroll = useCallback(() => {
    answerScrollUnpinRef.current?.();
    answerScrollUnpinRef.current = pinConsultScroll();
  }, []);

  useEffect(() => {
    return () => {
      answerScrollUnpinRef.current?.();
      answerScrollUnpinRef.current = null;
    };
  }, []);

  const handleChangeQ = (
    id: string,
    val: string,
    entryMethod: 'INDIVIDUAL_SELECTION' | 'YES_TO_ALL' = 'INDIVIDUAL_SELECTION',
  ) => {
    pinAnswerScroll();
    setResponses((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        questionId: id,
        question: prev[id]?.question ?? '',
        answer: val || null,
        answerText: val,
        source: 'manual',
        aiAnswered: false,
        medicationEntries: undefined,
        entryMethod: val ? entryMethod : undefined,
      },
    }));
  };

  /** Yes to all — only fills unanswered questions; never overwrites an existing No */
  const selectAllAffirmativeFor = (targets: ClinicalQuestion[]) => {
    const toFill: Array<{ q: ClinicalQuestion; aff: string }> = [];
    for (const q of targets) {
      const options = criteriaFindingOptions(q);
      const aff = criteriaAffirmative(options);
      if (!aff) continue;
      const existing = String(responses[q.id]?.answerText ?? responses[q.id]?.answer ?? '').trim();
      if (existing) continue;
      toFill.push({ q, aff });
    }
    if (!toFill.length) return;
    pinAnswerScroll();
    setResponses((prev) => {
      const next = { ...prev };
      for (const { q, aff } of toFill) {
        next[q.id] = {
          ...next[q.id],
          questionId: q.id,
          question: q.question,
          answer: aff,
          answerText: aff,
          source: 'manual',
          aiAnswered: false,
          medicationEntries: undefined,
          entryMethod: 'YES_TO_ALL',
        };
      }
      return next;
    });
  };

  const clearFindingsFor = (targets: ClinicalQuestion[]) => {
    pinAnswerScroll();
    setResponses((prev) => {
      const next = { ...prev };
      for (const q of targets) {
        next[q.id] = {
          ...next[q.id],
          questionId: q.id,
          question: q.question,
          answer: null,
          answerText: '',
          source: 'manual',
          aiAnswered: false,
          medicationEntries: undefined,
        };
      }
      return next;
    });
    if (
      judgementRecord &&
      judgementRecord.status !== 'CONFIRMED' &&
      judgementRecord.status !== 'NOT_REQUIRED'
    ) {
      queueJudgementDraft({
        uiState: 'prompt',
        rationaleDraft: '',
        diagnosticCertainty: null,
        status: 'REQUIRED',
      });
    }
    if (targets.length) {
      toast.success('Cleared selections in this section');
    }
  };

  const resetPresentationAnswers = () => {
    pinAnswerScroll();
    setResponses((prev) => {
      const next = { ...prev };
      for (const q of diagnosisQuestions) {
        next[q.id] = {
          ...next[q.id],
          questionId: q.id,
          question: q.question,
          answer: null,
          answerText: '',
          source: 'manual',
          aiAnswered: false,
          medicationEntries: undefined,
          entryMethod: undefined,
        };
      }
      return next;
    });
  };

  const presentationFindings = parsePresentationFindings(responses[PRESENTATION_FINDINGS_KEY]);
  const handlePresentationFindings = (next: AdditionalClinicalFinding[]) => {
    pinAnswerScroll();
    setResponses((prev) => ({
      ...prev,
      [PRESENTATION_FINDINGS_KEY]: serializePresentationFindings(next),
    }));
  };

  const handleChangeMedicationQ = (id: string, entries: MedicationEntry[], displayText: string) => {
    pinAnswerScroll();
    setResponses((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        answer: displayText,
        answerText: displayText,
        medicationEntries: entries,
        source: 'manual',
        aiAnswered: false,
      },
    }));
  };

  const validateDemo = (): boolean => {
    const errs: Partial<Demographics> = {};
    if (isDateOfBirthUnavailable(demo)) {
      if (!demo.age?.trim()) errs.age = 'Required';
    } else {
      const dobErr = dateOfBirthError(demo.dateOfBirth);
      if (dobErr) errs.dateOfBirth = dobErr;
    }
    if (!demo.sex) errs.sex = 'Required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const saveSnapshotAndContinue = async () => {
    if (!validateDemo()) return;
    if (needsReproductive && (!demo.pregnancyStatus?.trim() || !demo.breastfeedingStatus?.trim())) {
      setErrors((e) => ({
        ...e,
        ...(!demo.pregnancyStatus?.trim() ? { pregnancyStatus: 'Required' } : {}),
        ...(!demo.breastfeedingStatus?.trim() ? { breastfeedingStatus: 'Required' } : {}),
      }));
      return;
    }
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setSectionSaving('demo');
    try {
      const ok = await persist();
      if (!ok) return;
      setSnapshotDone(true);
      setDetailsPhase('background');
      toast.success('Patient details saved');
      scrollToSection(backgroundSectionRef);
    } finally {
      setSectionSaving(null);
    }
  };

  const saveBackgroundAndContinue = async () => {
    if (!allergiesDone || !medsDone || !conditionsDone) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setSectionSaving('demo');
    try {
      const ok = await persist();
      if (!ok) return;
      setBackgroundDone(true);
      setDetailsPhase('labs');
      toast.success('Clinical history saved');
      scrollToSection(labsSectionRef);
    } finally {
      setSectionSaving(null);
    }
  };

  const saveLabsAndContinue = async () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setSectionSaving('demo');
    try {
      const ok = await persist();
      if (!ok) return;
      setLabsDone(true);
      setDetailsPhase('done');
      toast.success('Labs & vitals saved');
      openNextAfterDemo();
    } finally {
      setSectionSaving(null);
    }
  };

  const skipLabsAndContinue = async () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setSectionSaving('demo');
    try {
      const ok = await persist();
      if (!ok) return;
      setLabsDone(true);
      setDetailsPhase('done');
      openNextAfterDemo();
    } finally {
      setSectionSaving(null);
    }
  };

  const patientInfoCheck = {
    dateOfBirth: demo.dateOfBirth,
    dateOfBirthUnavailable: demo.dateOfBirthUnavailable,
    age: demo.age,
    sex: demo.sex,
    allergiesCount: allergiesNone ? 0 : allergyEntries.filter((a) => a.drug.trim()).length,
    noKnownAllergies: allergiesNone,
    medicationsCount: medsNone ? 0 : medicationEntries.length,
    noCurrentMedications: medsNone,
    conditionsCount: conditionsNone ? 0 : conditions.length,
    noKnownConditions: conditionsNone,
  };

  const confirmPatientInformation = async () => {
    const unresolved = firstUnresolvedPatientInformation(patientInfoCheck);
    if (unresolved) {
      setAttentionIntense(unresolved);
      window.setTimeout(() => setAttentionIntense(null), 2800);
      if (unresolved === 'dob' || unresolved === 'age' || unresolved === 'sex') {
        scrollToSection(demoSectionRef);
        const focusId =
          unresolved === 'sex'
            ? 'patient-sex-at-birth'
            : unresolved === 'age'
              ? 'patient-age'
              : 'patient-date-of-birth';
        window.setTimeout(() => {
          const el = document.getElementById(focusId);
          if (el instanceof HTMLElement) el.focus();
        }, 50);
      } else {
        scrollToSection(backgroundSectionRef);
        const id =
          unresolved === 'allergies'
            ? 'patient-no-allergies'
            : unresolved === 'medications'
              ? 'patient-no-meds'
              : 'patient-no-conditions';
        window.setTimeout(() => {
          const el = document.getElementById(id);
          if (el instanceof HTMLElement) el.focus();
        }, 50);
      }
      return;
    }
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setSectionSaving('demo');
    try {
      const confirmedAt = new Date().toISOString();
      setDemo((d) => ({
        ...d,
        patientInformationConfirmed: true,
        patientInformationConfirmedAt: confirmedAt,
        patientInformationConfirmedBy: consultation.pharmacistId,
      }));
      setPatientInfoConfirmed(true);
      setSnapshotDone(true);
      setBackgroundDone(true);
      setLabsDone(true);
      const ok = await persist({
        patientInformationConfirmed: true,
        patientInformationConfirmedAt: confirmedAt,
        patientInformationConfirmedBy: consultation.pharmacistId,
      });
      if (!ok) {
        setPatientInfoConfirmed(false);
        return;
      }
      openNextAfterDemo();
    } finally {
      setSectionSaving(null);
    }
  };

  /** @deprecated kept for any remaining callers — routes through phased saves */
  const saveAndContinueDemo = async () => {
    if (!snapshotDone) {
      await saveSnapshotAndContinue();
      return;
    }
    if (!backgroundDone) {
      await saveBackgroundAndContinue();
      return;
    }
    await saveLabsAndContinue();
  };

  const saveAndContinueQuest = async () => {
    if (!assessmentComplete) {
      const first = findFirstIncompleteAssessmentKey(assessmentGroups, responses);
      if (first) {
        setOpenAssessmentKey(first);
        setQuestOpen(true);
        scrollToSection(questSectionRef);
      }
      toast.error(
        'Answer all diagnosis and eligibility questions to continue',
      );
      return;
    }

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setSectionSaving('quest');
    try {
      const ok = await persist();
      if (!ok) return;
      toast.success('Clinical assessment saved');
      openNextAfterQuest();
    } finally {
      setSectionSaving(null);
    }
  };

  /** Always show Save on Clinical Assessment when there are findings to review */
  const showQuestSaveButton = questions.length > 0;

  const openJudgementForm = useCallback(async () => {
    setJudgementError(null);
    const ok = await persist();
    if (!ok) return;
    queueJudgementDraft({
      uiState: 'form',
      status: judgementRecord?.status === 'CONFIRMED' ? 'CONFIRMED' : 'DRAFT',
    });
  }, [persist, queueJudgementDraft, judgementRecord?.status]);

  const reviewJudgementAnswers = useCallback(() => {
    const firstUnsupported =
      pathwayJudgement.evaluation.diagnosis.status === 'UNSUPPORTED'
        ? 'diagnosisConfirmation'
        : 'treatmentEligibility';
    if (firstUnsupported === 'diagnosisConfirmation' && diagnosisQuestions.length) {
      setDiagnosisDone(false);
      setDiagnosisOpen(true);
      focusClinicalSectionSoon(
        () => assessmentSubsectionRefs.current.diagnosisConfirmation ?? null,
      );
    } else {
      setEligibilityDone(false);
      setEligibilityOpen(true);
      focusClinicalSectionSoon(
        () => assessmentSubsectionRefs.current.treatmentEligibility ?? null,
      );
    }
    queueJudgementDraft({ uiState: 'prompt' });
  }, [
    diagnosisQuestions.length,
    pathwayJudgement.evaluation.diagnosis.status,
    queueJudgementDraft,
  ]);

  const documentWithoutTreatment = useCallback(async () => {
    setJudgementError(null);
    try {
      const ok = await persist();
      if (!ok) return;
      await noTreatment.mutateAsync();
      onNext({ targetStep: 'DOCUMENTATION' });
    } catch (err) {
      setJudgementError(getErrorMessage(err, 'Could not save this choice'));
    }
  }, [noTreatment, onNext, persist]);

  const draftJudgementRationale = useCallback(async () => {
    setJudgementError(null);
    try {
      const ok = await persist();
      if (!ok) return;
      const result = await draftJudgementAi.mutateAsync();
      if (result.record) setJudgementRecord(result.record);
    } catch (err) {
      toastError(err, 'Draft unavailable — enter the rationale manually');
    }
  }, [draftJudgementAi, persist]);

  const confirmJudgementAndContinue = useCallback(async () => {
    setJudgementError(null);
    try {
      const ok = await persist();
      if (!ok) return;
      const result = await confirmJudgement.mutateAsync({
        workingDiagnosisDisplay:
          displayJudgementRecord.workingDiagnosisDisplay || workingDiagnosis,
        workingDiagnosisConceptId:
          displayJudgementRecord.workingDiagnosisConceptId ??
          consultation.selectedPathwayId ??
          consultation.pathway?.id,
        diagnosticCertainty:
          displayJudgementRecord.diagnosticCertainty as PathwayDiagnosticCertainty,
        rationaleApproved: displayJudgementRecord.rationaleDraft,
        sourceAnswerRevision: pathwayJudgement.revision,
      });
      if (result.record) setJudgementRecord(result.record);
      onNext({ targetStep: 'RED_FLAGS' });
    } catch (err) {
      setJudgementError(getErrorMessage(err, 'Could not confirm clinical judgement'));
    }
  }, [
    confirmJudgement,
    consultation.pathway?.id,
    consultation.selectedPathwayId,
    displayJudgementRecord.diagnosticCertainty,
    displayJudgementRecord.rationaleDraft,
    displayJudgementRecord.workingDiagnosisConceptId,
    displayJudgementRecord.workingDiagnosisDisplay,
    onNext,
    pathwayJudgement.revision,
    persist,
    workingDiagnosis,
  ]);

  const switchToStandaloneJudgement = useCallback(async () => {
    try {
      await selectApproach.mutateAsync({ mode: 'CLINICAL_JUDGMENT' });
      onNext({ approachMode: 'CLINICAL_JUDGMENT' });
    } catch (err) {
      toastError(err, 'Could not switch to clinical judgement');
    }
  }, [onNext, selectApproach]);

  const judgementCard = showJudgementCard ? (
    <PathwayClinicalJudgementCard
      record={displayJudgementRecord}
      evaluation={pathwayJudgement.evaluation}
      sourceAnswerRevision={pathwayJudgement.revision}
      workingDiagnosis={displayJudgementRecord.workingDiagnosisDisplay || workingDiagnosis}
      saving={saveJudgementDraft.isPending}
      aiDrafting={draftJudgementAi.isPending}
      confirming={confirmJudgement.isPending}
      error={judgementError}
      onOpenForm={() => {
        void openJudgementForm();
      }}
      onBack={() => queueJudgementDraft({ uiState: 'prompt' })}
      onReviewAnswers={reviewJudgementAnswers}
      onDocumentWithoutTreatment={() => {
        void documentWithoutTreatment();
      }}
      onDraftWithAi={() => {
        void draftJudgementRationale();
      }}
      onConfirm={() => {
        void confirmJudgementAndContinue();
      }}
      onChangeDraft={(patch) => queueJudgementDraft(patch)}
      onSwitchPathway={onBack}
      onStandaloneClinicalJudgement={() => {
        void switchToStandaloneJudgement();
      }}
    />
  ) : null;

  const handleNext = async () => {
    if (advancingRef.current) return;
    if (!validateDemo()) {
      scrollToSection(demoSectionRef);
      return;
    }
    if (!allergiesDone || !medsDone || !conditionsDone) {
      setDetailsPhase('background');
      setBackgroundDone(false);
      scrollToSection(backgroundSectionRef);
      return;
    }
    if (!clinicalJudgmentOnly) {
      if (!assessmentComplete) {
        setQuestOpen(true);
        scrollToSection(questSectionRef);
        const first = findFirstIncompleteAssessmentKey(assessmentGroups, responses);
        if (first) setOpenAssessmentKey(first);
        toast.error(
          'Answer all diagnosis and eligibility questions to continue',
        );
        return;
      }
      if (judgementRequired && !judgementSatisfied) {
        setEligibilityOpen(true);
        focusClinicalSectionSoon(
          () => assessmentSubsectionRefs.current.treatmentEligibility ?? null,
        );
        toast.error('Document clinical judgement before continuing to clinical review');
        return;
      }
    }
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    advancingRef.current = true;
    try {
      const ok = await persist();
      if (!ok) return;
      // Clinical Judgment: advance server cursor to AI Red-Flag Check for correct resume
      if (clinicalJudgmentOnly) {
        try {
          await saveStep.mutateAsync({
            stepIndex: 4,
            currentStep: 'RED_FLAGS',
            // No data — only advance workflow cursor; do not wipe redFlags JSON
          });
        } catch {
          // Non-blocking — UI still advances; red-flag step will persist on confirm
        }
      }
      onNext();
    } finally {
      advancingRef.current = false;
    }
  };

  /** Headline + supporting clause for the compact AI intake banner */
  const intakeHeadline = useMemo(() => {
    const concern =
      consultation.chiefComplaint?.trim() ||
      entities?.chiefComplaint?.trim() ||
      '';
    const primary = entities?.symptoms?.[0];
    const duration = primary?.duration?.trim();

    if (concern) {
      // Append a short supporting clause when duration isn't already in the complaint
      if (duration && !concern.toLowerCase().includes(duration.toLowerCase())) {
        const lower = duration.toLowerCase();
        const clause = /ago|yesterday|today|hour|day|week|month|since|started/.test(lower)
          ? duration.charAt(0).toUpperCase() + duration.slice(1)
          : `Started ${duration}`;
        return `${concern.replace(/\.$/, '')}. ${clause.replace(/\.$/, '')}.`;
      }
      return concern.endsWith('.') ? concern : `${concern}.`;
    }

    if (primary?.symptom) {
      const base = primary.symptom.trim();
      if (duration) return `${base}. ${duration}.`;
      return base.endsWith('.') ? base : `${base}.`;
    }

    if (transcript.trim()) {
      const slice = transcript.trim().slice(0, 140);
      return slice + (transcript.length > 140 ? '…' : '');
    }
    return '';
  }, [consultation.chiefComplaint, entities, transcript]);

  /** Negated / reassuring findings shown as green dots in the banner */
  const intakeNegatives = useMemo(() => {
    const found: string[] = [];
    const push = (raw: string) => {
      const t = raw.trim().replace(/\.$/, '');
      if (!t) return;
      const normalized = t.replace(/^(denies|without)\s+/i, 'No ').replace(/^no\s+/i, 'No ');
      if (!/^no\b/i.test(normalized) && !/^denies\b/i.test(t)) return;
      const label = normalized.charAt(0).toUpperCase() + normalized.slice(1);
      if (!found.some((x) => x.toLowerCase() === label.toLowerCase())) found.push(label);
    };

    for (const s of entities?.symptoms ?? []) push(s.symptom);
    for (const r of entities?.riskFactors ?? []) push(r);
    for (const c of entities?.patientConcerns ?? []) push(c);

    // Light transcript heuristics when the model didn't emit structured negatives
    if (found.length < 2 && transcript.trim()) {
      const heuristics: Array<[RegExp, string]> = [
        [/\bno\s+fever\b/i, 'No fever'],
        [/\bno\s+(eye|ocular)\b/i, 'No eye symptoms'],
        [/\bno\s+(pus|discharge|severe\s+swelling)\b/i, 'No pus or severe swelling'],
        [/\bno\s+systemic\b/i, 'No systemic symptoms'],
        [/\bno\s+(malaise|vomiting|nausea)\b/i, 'No systemic symptoms'],
        [/\bdenies\s+fever\b/i, 'No fever'],
      ];
      for (const [re, label] of heuristics) {
        if (re.test(transcript)) push(label);
      }
    }

    return found.slice(0, 4);
  }, [entities, transcript]);

  /** Extra detail rows revealed when the intake banner is expanded */
  const intakeExtraDetails = useMemo(() => {
    const extras: string[] = [];
    for (const s of entities?.symptoms ?? []) {
      const t = [s.symptom, s.duration].filter(Boolean).join(' · ');
      if (!t) continue;
      if (/^(no|denies|without)\b/i.test(s.symptom.trim())) continue;
      if (intakeHeadline.toLowerCase().includes(s.symptom.trim().toLowerCase())) continue;
      extras.push(t);
    }
    if (isFemale && demo.pregnancyStatus) extras.push(`Pregnancy: ${demo.pregnancyStatus}`);
    if (demo.smokingStatus) extras.push(`Smoking: ${demo.smokingStatus}`);
    return extras.slice(0, 5);
  }, [entities, intakeHeadline, isFemale, demo.pregnancyStatus, demo.smokingStatus]);

  const confidenceLabel =
    (entities?.overallConfidence ?? 0) >= 80
      ? 'High'
      : (entities?.overallConfidence ?? 0) >= 60
        ? 'Moderate'
        : entities?.overallConfidence
          ? 'Low'
          : null;

  const handleAllergiesChange = useCallback(
    (entries: AllergyEntry[]) => {
      setAllergyEntries(entries);
      setAllergiesNone(false);
      syncAllergiesToDemo(entries, false);
      setAiFields((prev) => {
        const n = new Set(prev);
        n.delete('allergies');
        return n;
      });
    },
    [syncAllergiesToDemo],
  );

  const sexValue =
    demo.sex === 'Male' || demo.sex === 'Female' || demo.sex === 'Other' ? demo.sex : demo.sex || '';

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-5 [overflow-anchor:none]">
      <PatientInformationHeader
        pathwayName={
          consultation.pathway
            ? `${pathwayDisplayLabel(consultation.pathway)} pathway`
            : undefined
        }
        province={provinceFromTimezone(consultation.tenant?.timezone)}
        version={consultation.pathway?.version}
      />

      {(prefillLoading || aiQLoading || medsResolving || allergiesResolving) && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/[0.04] px-3.5 py-2.5 text-sm">
          <div className="flex min-w-0 items-center gap-2">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
            <span>
              {prefillLoading
                ? 'Reading the conversation and auto-filling patient details…'
                : allergiesResolving
                  ? 'Matching allergy names and classifying reaction type…'
                  : medsResolving
                    ? 'Matching current medications…'
                    : 'Auto-filling clinical findings from the conversation…'}
            </span>
          </div>
        </div>
      )}

      <div className="relative flex min-h-5 flex-wrap items-start justify-between gap-4">
        <PatientInformationRequiredBanner visible={!patientInfoConfirmed} />
        {/*
          Absolutely positioned so Saving… / error never changes document height.
          Height shifts above Presentation Review were yanking the Yes/No viewport.
        */}
        <p
          className={cn(
            'pointer-events-none absolute right-0 top-0 ml-auto flex h-5 items-center gap-1.5 text-xs transition-opacity',
            saveStatus === 'saving' && 'text-muted-foreground opacity-100',
            saveStatus === 'error' && 'text-destructive opacity-100',
            saveStatus !== 'saving' && saveStatus !== 'error' && 'opacity-0',
          )}
          aria-live="polite"
          aria-atomic="true"
        >
          {saveStatus === 'saving' ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
            </>
          ) : saveStatus === 'error' ? (
            <>
              <AlertCircle className="h-3.5 w-3.5" /> Save failed
            </>
          ) : (
            <span className="invisible">Saving…</span>
          )}
        </p>
      </div>

      {stepper ? <div className="mb-1">{stepper}</div> : null}

      <ClinicalSectionStack>

        <PatientSnapshotSection
          demo={demo}
          errors={errors}
          open
          completed={false}
          step={1}
          onEdit={() => {
            setSnapshotDone(false);
            setDetailsPhase('snapshot');
            scrollToSection(demoSectionRef);
          }}
          onFieldChange={(key, value) => set(key)(value)}
          onPatch={patchDemo}
          sectionRef={demoSectionRef}
        />

        <PatientClinicalHistorySection
          consultationId={consultation.id}
          demo={demo}
          open
          completed={false}
          allergyEntries={allergyEntries}
          allergiesNone={allergiesNone}
          medicationEntries={medicationEntries}
          medsNone={medsNone}
          conditions={conditions}
          conditionsNone={conditionsNone}
          conditionsFromConsultation={conditionsFromConsultation}
          attentionAllergies={!allergiesDone}
          attentionMedications={!medsDone}
          attentionConditions={!conditionsDone}
          attentionIntense={
            attentionIntense === 'allergies' ||
            attentionIntense === 'medications' ||
            attentionIntense === 'conditions'
              ? attentionIntense
              : null
          }
          onEdit={() => {
            scrollToSection(backgroundSectionRef);
          }}
          onAllergiesChange={(entries) => {
            setAllergiesNone(false);
            setAllergyEntries(entries);
            syncAllergiesToDemo(entries, false);
          }}
          onAllergiesNone={(none) => {
            invalidatePatientInformationConfirmation();
            setAllergiesNone(none);
            if (none) {
              setAllergyEntries([]);
              syncAllergiesToDemo([], true);
            }
          }}
          onMedicationsChange={handleMedicationsChange}
          onMedsNone={(none) => {
            invalidatePatientInformationConfirmation();
            setMedsNone(none);
            if (none) {
              setMedicationEntries([]);
              setDemo((d) => ({ ...d, currentMedications: 'None', medicationEntries: [] }));
            }
          }}
          onConditionsChange={(next) => {
            setConditionsNone(false);
            handleConditionsChange(next);
          }}
          onConditionsNone={(none) => {
            invalidatePatientInformationConfirmation();
            setConditionsNone(none);
            if (none) {
              setConditions([]);
              setDemo((d) => ({
                ...d,
                medicalConditions: 'No known conditions',
                noKnownConditions: true,
              }));
            } else {
              setDemo((d) => ({ ...d, noKnownConditions: false }));
            }
          }}
          onFieldChange={(key, value) => set(key)(value)}
          onLifestyleAssessed={() => {
            invalidatePatientInformationConfirmation();
            setDemo((d) => ({ ...d, lifestyleAssessed: true }));
          }}
          onConfirm={saveBackgroundAndContinue}
          saving={sectionSaving === 'demo' && detailsPhase === 'background'}
          sectionRef={backgroundSectionRef}
          removeAllergyConfirm={(entry, onConfirmRemove) => {
            allergyRemoveConfirmRef.current = onConfirmRemove;
            setAllergyRemoveTarget(entry);
          }}
        />

        <LabsVitalsSection
          consultationId={consultation.id}
          demo={demo}
          extractedLabValues={extractedLabValues}
          open
          completed={false}
          onEdit={() => {
            scrollToSection(labsSectionRef);
          }}
          onFieldChange={(key, value) => set(key)(value)}
          onLabsApply={(formattedText, values) => {
            invalidatePatientInformationConfirmation();
            setAiFields((prev) => {
              const next = new Set(prev);
              next.delete('labValues');
              return next;
            });
            const latest = selectLatestLabValues(values);
            const vitals = vitalsFieldsFromLabValues(latest);
            const height = vitals.height;
            const weight = vitals.weight;
            const computedBmi = formatBmi(
              computeBmiKgCm(parseNumericInput(weight), parseNumericInput(height)),
            );
            const latestDate = latest
              .map((row) => row.observedDate?.trim())
              .filter((date): date is string => Boolean(date))
              .sort()
              .at(-1);
            setExtractedLabValues(latest);
            setDemo((d) => ({
              ...d,
              labValues: formattedText || formatLatestLabValuesAsText(latest),
              extractedLabValues: latest,
              ...(vitals.height ? { height: vitals.height } : {}),
              ...(vitals.weight ? { weight: vitals.weight } : {}),
              ...(vitals.pulse ? { pulse: vitals.pulse } : {}),
              ...(vitals.bloodPressureSystolic
                ? { bloodPressureSystolic: vitals.bloodPressureSystolic }
                : {}),
              ...(vitals.bloodPressureDiastolic
                ? { bloodPressureDiastolic: vitals.bloodPressureDiastolic }
                : {}),
              ...(vitals.bmi || computedBmi
                ? { bmi: vitals.bmi || computedBmi }
                : {}),
              ...(latestDate && !d.measurementDate ? { measurementDate: latestDate } : {}),
            }));
          }}
          onSkip={skipLabsAndContinue}
          onSave={saveLabsAndContinue}
          saving={sectionSaving === 'demo' && detailsPhase === 'labs'}
          sectionRef={labsSectionRef}
          hasUnreviewedReport={false}
        />
      </ClinicalSectionStack>

      {!patientInfoConfirmed ? (
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-[14px] font-medium text-[#0f6f6b] hover:underline"
        >
          {PATIENT_INFO_COPY.back}
        </button>
        <button
          type="button"
          onClick={() => void confirmPatientInformation()}
          disabled={sectionSaving === 'demo'}
          className="inline-flex h-12 min-w-[280px] items-center justify-center rounded-[12px] bg-[#0f6f6b] px-6 text-[15px] font-semibold text-white hover:bg-[#0c5e5b] disabled:opacity-60"
        >
          {sectionSaving === 'demo' ? 'Saving…' : PATIENT_INFO_COPY.confirm}
        </button>
      </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(allergyRemoveTarget)}
        onOpenChange={(open) => {
          if (!open) setAllergyRemoveTarget(null);
        }}
        title="Remove allergy?"
        description={
          allergyRemoveTarget
            ? `Remove ${allergyRemoveTarget.drug}${
                allergyRemoveTarget.reaction ? ` (${allergyRemoveTarget.reaction})` : ''
              } from this assessment?`
            : 'Remove this allergy?'
        }
        confirmLabel="Remove"
        cancelLabel="Keep"
        variant="destructive"
        onConfirm={() => {
          allergyRemoveConfirmRef.current?.();
          allergyRemoveConfirmRef.current = null;
          setAllergyRemoveTarget(null);
        }}
      />

      {/* ── Clinical criteria (pathway only — skipped for Clinical Judgment) ── */}
      {!clinicalJudgmentOnly && patientInfoConfirmed && (
      <>
      <ClinicalSectionStack className="pt-6">
        {aiQLoading && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-8 text-sm text-muted-foreground shadow-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Filling findings from the conversation…
          </div>
        )}

        {!aiQLoading && !questions.length && !differentials.length && (
          <div className="rounded-xl border border-border bg-card px-4 py-10 text-center text-muted-foreground shadow-sm">
            <ClipboardList className="mx-auto mb-2 h-8 w-8 opacity-30" />
            <p className="text-sm">No clinical findings configured for this pathway.</p>
          </div>
        )}

        {!aiQLoading && (diagnosisQuestions.length > 0 || eligibilityQuestions.length > 0) && (
          <PresentationReviewCard
            questions={diagnosisQuestions}
            responses={responses}
            findings={presentationFindings}
            evidence={presentationEvidence}
            pathwayLabel={
              consultation.pathway ? pathwayDisplayLabel(consultation.pathway) : undefined
            }
            provinceLabel={presentationProvince}
            versionLabel={
              presentationEvidence?.pathwayVersion ??
              (consultation.pathway?.version ? `v${consultation.pathway.version}` : null)
            }
            sectionRef={(el) => {
              assessmentSubsectionRefs.current.diagnosisConfirmation = el;
            }}
            eligibilityQuestions={eligibilityQuestions}
            eligibilityUnlocked={
              detailsComplete &&
              (diagnosisDone ||
                diagnosisQuestions.length === 0 ||
                sectionFullyAnswered(diagnosisQuestions, responses))
            }
            eligibilitySectionRef={(el) => {
              assessmentSubsectionRefs.current.treatmentEligibility = el;
            }}
            onChange={handleChangeQ}
            onMedicationChange={handleChangeMedicationQ}
            onReset={resetPresentationAnswers}
            onFindingsChange={handlePresentationFindings}
            onEligibilityReset={() => clearFindingsFor(eligibilityQuestions)}
            onYesToAllEligibility={() =>
              selectAllAffirmativeFor(
                eligibilityQuestions.filter((q) => !isMedicationQuestion(q)),
              )
            }
            footerSlot={showJudgementCard ? judgementCard : null}
          />
        )}

        {/* Other assessment groups (e.g. additionalAssessment) */}
        {!aiQLoading &&
          assessmentGroups
            .filter(
              (g) =>
                g.key !== 'diagnosisConfirmation' && g.key !== 'treatmentEligibility',
            )
            .map((group, idx) => {
              const ready = sectionMeetsMinimum(group.questions, responses);
              const isOpen = openAssessmentKey === group.key;
              return (
                <AssessmentCriteriaCard
                  key={group.key}
                  title={group.title}
                  variant="diagnosis"
                  questions={group.questions}
                  responses={responses}
                  open={detailsComplete && (isOpen || !ready)}
                  completed={ready && !isOpen}
                  pending={!detailsComplete}
                  pendingHint="Complete patient details above first"
                  step={6 + idx}
                  sectionRef={(el) => {
                    assessmentSubsectionRefs.current[group.key] = el;
                  }}
                  onEdit={() => setOpenAssessmentKey(group.key)}
                  onChange={handleChangeQ}
                  onMedicationChange={handleChangeMedicationQ}
                  onYesToAll={() =>
                    selectAllAffirmativeFor(
                      group.questions.filter((q) => !isMedicationQuestion(q)),
                    )
                  }
                  onReset={() => clearFindingsFor(group.questions)}
                />
              );
            })}
      </ClinicalSectionStack>
      </>
      )}

      {patientInfoConfirmed ? (
      <ClinicalStepFooter
        onBack={onBack}
        backLabel={backLabel}
        onNext={handleNext}
        nextLabel={
          clinicalJudgmentOnly
            ? 'Continue to Red-Flag Check'
            : 'Continue to Clinical Review'
        }
        disabled={!canContinue}
        disabledReason={continueBlockedReason}
        hint="Progress auto-saves"
      />
      ) : null}
    </div>
  );
}

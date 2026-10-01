/**
 * DAP documentation-ready clinical facts: objective data, patient-specific
 * safety summaries, and structured follow-up. The LLM must not infer these.
 *
 * Spec: SafeScribe_DAP_Backend_Fixes_Cursor_Instructions.md
 */

import { canonicalizeLabTestName, type LabResultLike } from './lab-results';
import {
  buildPcpFollowUpPlan,
  isCounsellingLeakageFragment,
  isPharmacistPrescribingEncounter,
  pcpFollowUpPlanHasContent,
  pcpFollowUpPlanIsComplete,
  renderPcpFollowUpSection,
  type PcpFollowUpPlan,
  type PcpFollowUpSource,
} from './pcp-follow-up';
import { getConfirmedTreatmentRows } from './pcp-communication';
import { foldDocumentationText } from './documentation-encounter';

export interface DapObjectiveDatum {
  type: string;
  value: string | number;
  unit?: string;
  clinically_relevant: true;
}

export interface DapPatientSpecificSafety {
  factor: string;
  patient_finding: string;
  clinically_relevant: true;
  pharmacist_reviewed: true;
  confirmed: true;
  documentation_summary: string;
}

export interface DapFollowUpPlan {
  responsible_party: string | null;
  timeframe: string | null;
  effectiveness_parameters: string[];
  safety_parameters: string[];
  adherence_parameters: string[];
  expected_outcomes: string[];
  action_if_not_met: string[];
  responsibility_override_confirmed: boolean;
  pharmacist_confirmed: boolean;
}

const GENERIC_NEGATIVE_SAFETY =
  /no clinically significant[^.]*safety|no (?:patient-specific )?(?:treatment-)?safety (?:concerns?|issues?|findings?) (?:were |was )?(?:identified|found)|no contraindications identified|treatment was safe/i;

const MONOGRAPHISH =
  /limited human pregnancy data|canadian product information|product monograph|dose reduction is recommended in severe renal|when the expected (?:clinical )?benefit justifies|contraindicated in|refer to (?:the )?(?:product|monograph)/i;

const RENAL_LAB = /^(egfr|crcl|creatinineclearance|creatinine)$/i;
const HEPATIC_LAB = /^(alt|ast|bilirubin|alp|ggt)$/i;

function clean(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function fold(value: string): string {
  return foldDocumentationText(value);
}

function uniquePhrases(values: Array<string | null | undefined>, max = 6): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const t = clean(raw);
    if (!t || isCounsellingLeakageFragment(t) || isGenericNegativeSafetySummary(t)) continue;
    const key = fold(t);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

function parseNumeric(raw: unknown): number | null {
  const match = String(raw ?? '')
    .replace(/,/g, '')
    .match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

export function isGenericNegativeSafetySummary(text: string): boolean {
  const t = clean(text);
  if (!t) return true;
  return GENERIC_NEGATIVE_SAFETY.test(t);
}

export function isMonographSafetyText(text: string): boolean {
  return MONOGRAPHISH.test(clean(text));
}

function demoRecord(demographics: unknown): Record<string, unknown> {
  return demographics && typeof demographics === 'object'
    ? (demographics as Record<string, unknown>)
    : {};
}

function patientIsPregnant(demo: Record<string, unknown>): boolean {
  const answer = String(demo.pregnancyAnswer ?? '').trim().toLowerCase();
  if (answer === 'yes' || answer === 'y' || answer === 'true') return true;
  if (demo.pregnant === true) return true;
  const status = String(demo.pregnancyStatus ?? demo.pregnancy ?? '').trim().toLowerCase();
  return /pregnan/.test(status) && !/^not\b|^no\b|not_pregnant|non-?pregnant/.test(status);
}

function patientIsBreastfeeding(demo: Record<string, unknown>): boolean {
  const bf = demo.breastfeeding ?? demo.breastfeedingStatus;
  if (bf === true) return true;
  return /^(yes|breastfeeding)$/i.test(String(bf ?? '').trim());
}

function conditionsBlob(demo: Record<string, unknown>): string {
  return fold(
    [
      demo.medicalConditions,
      demo.conditions,
      demo.labValues,
      JSON.stringify(demo.extractedLabValues ?? []),
    ]
      .filter(Boolean)
      .join(' '),
  );
}

function renalImpairmentFromHistory(demo: Record<string, unknown>): boolean {
  if (demo.renalImpairment === true) return true;
  return /\brenal|kidney|ckd|dialysis|egfr|crcl|creatinine clearance\b/.test(
    conditionsBlob(demo),
  );
}

function hepaticImpairmentFromHistory(demo: Record<string, unknown>): boolean {
  if (demo.hepaticImpairment === true) return true;
  return /\bhepatic|liver|cirrhosis|hepatitis\b/.test(conditionsBlob(demo));
}

function allergyFinding(demo: Record<string, unknown>): string | null {
  const entries = Array.isArray(demo.allergyEntries)
    ? (demo.allergyEntries as Array<{ drug?: string }>)
        .map((row) => clean(row.drug))
        .filter(Boolean)
    : [];
  if (entries.length) return `Documented ${entries[0]} allergy`;
  const allergies = clean(demo.allergies);
  if (allergies && !/^(nkda|none|n\/a|no known)/i.test(allergies)) {
    return `Documented ${allergies.split(/[,;]/)[0]?.trim()} allergy`;
  }
  return null;
}

function labKey(test: string): string {
  return canonicalizeLabTestName(test).replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

function renalLabImpaired(type: string, value: unknown): boolean {
  const n = parseNumeric(value);
  if (n == null) return false;
  const key = labKey(type);
  if (key === 'egfr' || key === 'crcl' || key === 'creatinineclearance') return n < 60;
  return false;
}

export function labsFromDemographics(demographics: unknown): LabResultLike[] {
  const demo = demoRecord(demographics);
  const extracted = Array.isArray(demo.extractedLabValues)
    ? (demo.extractedLabValues as Array<{
        test?: string;
        value?: string;
        unit?: string;
        observedDate?: string;
        referenceRange?: string;
      }>)
    : [];
  const rows: LabResultLike[] = extracted
    .filter((row) => Boolean(row.test?.trim() && row.value?.trim()))
    .map((row) => ({
      test: canonicalizeLabTestName(row.test ?? '') || String(row.test),
      value: String(row.value).trim(),
      unit: row.unit?.trim() || undefined,
      observedDate: row.observedDate,
      referenceRange: row.referenceRange,
    }));

  const egfr = parseNumeric(demo.egfr);
  if (egfr != null && !rows.some((row) => labKey(row.test) === 'egfr')) {
    rows.push({
      test: 'eGFR',
      value: String(egfr),
      unit: 'mL/min',
    });
  }

  if (rows.length) return rows;

  const text = clean(demo.labValues);
  if (!text) return [];
  const inline: LabResultLike[] = [];
  const egfrMatch = text.match(/\begfr\b[^0-9]{0,8}(\d+(?:\.\d+)?)\s*(mL\/min(?:\/1\.73\s*m[²2])?)?/i);
  if (egfrMatch) {
    inline.push({
      test: 'eGFR',
      value: egfrMatch[1],
      unit: egfrMatch[2]?.replace(/\s+/g, ' ') || 'mL/min',
    });
  }
  const crclMatch = text.match(
    /\b(?:crcl|creatinine clearance)\b[^0-9]{0,8}(\d+(?:\.\d+)?)\s*(mL\/min)?/i,
  );
  if (crclMatch) {
    inline.push({
      test: 'CrCl',
      value: crclMatch[1],
      unit: crclMatch[2] || 'mL/min',
    });
  }
  return inline;
}

function treatmentsHaveRenalImplication(rows: Record<string, unknown>[]): boolean {
  return rows.some((row) => {
    if (row.renalAdjustmentRequired === true) return true;
    if (String(row.regimenSource ?? '').toUpperCase() === 'RENAL_ADJUSTED') return true;
    const warning = row.renalWarning as { active?: boolean } | undefined;
    if (warning?.active === true) return true;
    return Boolean(clean(row.renalAdjustmentReason));
  });
}

function treatmentsHaveHepaticImplication(rows: Record<string, unknown>[]): boolean {
  return rows.some((row) => Boolean(clean(row.hepaticAdjustmentReason)));
}

function treatmentsHavePregnancyImplication(rows: Record<string, unknown>[]): boolean {
  return rows.some((row) => Boolean(clean(row.pregnancyReason)) || Boolean(row.pregnancyWarning));
}

function treatmentsHaveAllergyImplication(rows: Record<string, unknown>[]): boolean {
  return rows.some((row) => {
    const warning = row.allergyWarning as { message?: string; reason?: string } | undefined;
    return Boolean(clean(warning?.message) || clean(warning?.reason));
  });
}

function labAffectsTreatment(
  lab: LabResultLike,
  rows: Record<string, unknown>[],
  renalImpaired: boolean,
  hepaticImpaired: boolean,
): boolean {
  const key = labKey(lab.test);
  if (RENAL_LAB.test(key)) return renalImpaired && treatmentsHaveRenalImplication(rows);
  if (HEPATIC_LAB.test(key)) return hepaticImpaired && treatmentsHaveHepaticImplication(rows);
  return false;
}

function labClinicallyRelevant(
  lab: LabResultLike,
  rows: Record<string, unknown>[],
  renalImpaired: boolean,
  hepaticImpaired: boolean,
): boolean {
  // The model must not infer that an abnormal lab required a treatment change.
  // Only send labs the safety engine already linked to the selected therapy.
  return labAffectsTreatment(lab, rows, renalImpaired, hepaticImpaired);
}

export function buildDapObjectiveData(input: {
  demographics?: unknown;
  treatmentPlan?: unknown;
}): DapObjectiveDatum[] {
  const demo = demoRecord(input.demographics);
  const rows = getConfirmedTreatmentRows(input.treatmentPlan);
  const labs = labsFromDemographics(demo);
  const renalHistory = renalImpairmentFromHistory(demo);
  const hepaticHistory = hepaticImpairmentFromHistory(demo);
  const renalImpaired =
    renalHistory || labs.some((lab) => renalLabImpaired(lab.test, lab.value));
  const hepaticImpaired = hepaticHistory;

  const out: DapObjectiveDatum[] = [];
  const seen = new Set<string>();
  for (const lab of labs) {
    if (!labClinicallyRelevant(lab, rows, renalImpaired, hepaticImpaired)) continue;
    const key = `${labKey(lab.test)}:${clean(lab.value)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const n = parseNumeric(lab.value);
    out.push({
      type: lab.test,
      value: n ?? lab.value,
      ...(lab.unit ? { unit: lab.unit } : {}),
      clinically_relevant: true,
    });
  }
  return out.slice(0, 8);
}

function formatObjectiveFinding(item: DapObjectiveDatum): string {
  const unit = item.unit ? ` ${item.unit}` : '';
  return `${item.type} ${item.value}${unit}`.replace(/\s+/g, ' ').trim();
}

function renalFinding(objective: DapObjectiveDatum[]): string {
  const renal = objective.find((item) => RENAL_LAB.test(labKey(item.type)));
  return renal ? formatObjectiveFinding(renal) : '';
}

export function buildDapPatientSpecificSafety(input: {
  demographics?: unknown;
  treatmentPlan?: unknown;
  objectiveData?: DapObjectiveDatum[];
}): DapPatientSpecificSafety[] {
  const demo = demoRecord(input.demographics);
  const rows = getConfirmedTreatmentRows(input.treatmentPlan);
  const objective = input.objectiveData ?? buildDapObjectiveData(input);
  const labs = labsFromDemographics(demo);
  const renalImpaired =
    renalImpairmentFromHistory(demo) ||
    labs.some((lab) => renalLabImpaired(lab.test, lab.value));
  const hepaticImpaired = hepaticImpairmentFromHistory(demo);
  const out: DapPatientSpecificSafety[] = [];

  const push = (item: Omit<DapPatientSpecificSafety, 'clinically_relevant' | 'pharmacist_reviewed' | 'confirmed'> & {
    documentation_summary: string;
  }) => {
    const summary = clean(item.documentation_summary);
    if (!summary || isGenericNegativeSafetySummary(summary) || isMonographSafetyText(summary)) {
      return;
    }
    if (out.some((existing) => existing.factor === item.factor)) return;
    out.push({
      factor: item.factor,
      patient_finding: clean(item.patient_finding),
      clinically_relevant: true,
      pharmacist_reviewed: true,
      confirmed: true,
      documentation_summary: summary,
    });
  };

  if (patientIsPregnant(demo) && (treatmentsHavePregnancyImplication(rows) || rows.length > 0)) {
    push({
      factor: 'pregnancy',
      patient_finding: 'Patient is pregnant',
      documentation_summary:
        'Pregnancy was a patient-specific consideration in treatment selection.',
    });
  }

  if (patientIsBreastfeeding(demo) && rows.length > 0) {
    push({
      factor: 'breastfeeding',
      patient_finding: 'Patient is breastfeeding',
      documentation_summary:
        'Breastfeeding was a patient-specific consideration in treatment selection.',
    });
  }

  if (renalImpaired && treatmentsHaveRenalImplication(rows)) {
    push({
      factor: 'renal_function',
      patient_finding: renalFinding(objective) || 'Reduced renal function',
      documentation_summary:
        'Renal function was a patient-specific consideration in treatment selection and dosing.',
    });
  }

  if (hepaticImpaired && treatmentsHaveHepaticImplication(rows)) {
    push({
      factor: 'hepatic_function',
      patient_finding: 'Hepatic impairment',
      documentation_summary:
        'Hepatic function was a patient-specific consideration in treatment selection.',
    });
  }

  const allergy = allergyFinding(demo);
  if (allergy && treatmentsHaveAllergyImplication(rows)) {
    push({
      factor: 'allergy',
      patient_finding: allergy,
      documentation_summary:
        `${allergy} was a patient-specific consideration in treatment selection.`,
    });
  }

  return out.slice(0, 6);
}

function looksLikeSafetyParameter(text: string): boolean {
  return /tolerab|adverse|side[- ]effect|safety|toxicity/i.test(text);
}

function dapTimeframe(raw: string | null): string | null {
  const t = clean(raw);
  if (!t) return null;
  return t.replace(/^(in|within|at|after|by)\s+/i, '');
}

export function toDapFollowUpPlan(
  plan: PcpFollowUpPlan | null | undefined,
  pharmacistConfirmed: boolean,
): DapFollowUpPlan | null {
  if (!plan || !pcpFollowUpPlanHasContent(plan)) return null;
  const extra = clean(plan.clinically_important_additional_parameter);
  const effectiveness = uniquePhrases([plan.primary_monitoring_target]);
  const safety = uniquePhrases([looksLikeSafetyParameter(extra) ? extra : null]);
  if (extra && !looksLikeSafetyParameter(extra) && fold(extra) !== fold(effectiveness[0] ?? '')) {
    effectiveness.push(...uniquePhrases([extra], 1));
  }
  const next: DapFollowUpPlan = {
    responsible_party: clean(plan.responsible_party) || null,
    timeframe: dapTimeframe(plan.timeframe),
    effectiveness_parameters: effectiveness,
    safety_parameters: safety,
    adherence_parameters: [],
    expected_outcomes: uniquePhrases([plan.expected_outcome], 2),
    action_if_not_met: uniquePhrases([plan.action_if_not_met], 2),
    responsibility_override_confirmed: plan.responsibility_override_confirmed === true,
    // Completeness + counselling confirmation — never mark incomplete FU as confirmed.
    pharmacist_confirmed: false,
  };
  next.pharmacist_confirmed =
    pharmacistConfirmed && dapFollowUpPlanIsComplete(next);
  return next;
}

export function dapFollowUpPlanIsComplete(plan: DapFollowUpPlan | null | undefined): boolean {
  if (!plan) return false;
  const what = [
    ...plan.effectiveness_parameters,
    ...plan.safety_parameters,
    ...plan.adherence_parameters,
  ].some((item) => clean(item));
  return Boolean(clean(plan.responsible_party) && clean(plan.timeframe) && what);
}

export function buildDapFollowUpPlan(source: PcpFollowUpSource & {
  counsellingConfirmed?: boolean;
  followUpRequired?: boolean;
  presentingConcern?: string | null;
}): {
  plan: DapFollowUpPlan | null;
  incomplete: boolean;
} {
  const pcp = buildPcpFollowUpPlan(source);
  const prescribing = isPharmacistPrescribingEncounter(source.consultationMode);
  const followUpRequired =
    source.followUpRequired ?? (pcpFollowUpPlanHasContent(pcp) && prescribing);
  if (followUpRequired && prescribing) {
    pcp.responsible_party = pcp.responsible_party || 'Pharmacist';
    pcp.timeframe = pcp.timeframe || 'in 7 days';
    const coldSoreConcern = /\b(cold sores?|oral herpes|herpes labialis)\b/i.test(
      source.presentingConcern ?? '',
    );
    if (
      coldSoreConcern &&
      (!pcp.primary_monitoring_target ||
        /^(symptom )?improvement( or resolution)?$/i.test(pcp.primary_monitoring_target))
    ) {
      pcp.primary_monitoring_target = 'lesion improvement or resolution';
    } else {
      pcp.primary_monitoring_target =
        pcp.primary_monitoring_target || 'symptom improvement or resolution';
    }
    pcp.clinically_important_additional_parameter =
      pcp.clinically_important_additional_parameter || 'treatment tolerability';
    pcp.action_if_not_met =
      pcp.action_if_not_met || 'referral advised if symptoms are not resolving';
  }
  // The server can supply a separately pharmacist-confirmed structured plan
  // even when the broader counselling payload is absent or stale. Preserve
  // that explicit confirmation instead of silently dropping planned follow-up.
  const pharmacistConfirmed =
    source.explicitPlan?.pharmacist_confirmed === true ||
    source.counsellingConfirmed !== false;
  const plan = toDapFollowUpPlan(pcp, pharmacistConfirmed);
  const incomplete = Boolean(
    followUpRequired &&
      (!dapFollowUpPlanIsComplete(plan) || !plan?.pharmacist_confirmed),
  );
  return { plan, incomplete };
}

export function renderDapFollowUpPlan(plan: DapFollowUpPlan | null | undefined): string {
  if (!dapFollowUpPlanIsComplete(plan) || !plan || !plan.pharmacist_confirmed) return '';
  const pcp: PcpFollowUpPlan = {
    responsible_party: plan.responsible_party,
    timeframe: plan.timeframe ? `in ${dapTimeframe(plan.timeframe)}` : null,
    primary_monitoring_target: plan.effectiveness_parameters[0] ?? null,
    clinically_important_additional_parameter:
      plan.safety_parameters[0] ?? plan.effectiveness_parameters[1] ?? null,
    expected_outcome: plan.expected_outcomes[0] ?? null,
    action_if_not_met: plan.action_if_not_met[0] ?? null,
    responsibility_override_confirmed: plan.responsibility_override_confirmed,
  };
  return renderPcpFollowUpSection(pcp);
}

export function stripGenericSafetySentences(text: string): string {
  return text
    .replace(
      /[^.]*no clinically significant[^.]*safety findings[^.]*\.?/gi,
      '',
    )
    .replace(
      /[^.]*no (?:patient-specific )?(?:treatment-)?safety (?:concerns?|issues?|findings?) (?:were |was )?(?:identified|found)[^.]*\.?/gi,
      '',
    )
    .replace(/[^.]*no contraindications identified[^.]*\.?/gi, '')
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function ensureSafetySummariesInAssessment(
  assessment: string,
  items: DapPatientSpecificSafety[],
): string {
  let out = assessment.trim();
  for (const item of items) {
    const summary = clean(item.documentation_summary);
    if (!summary) continue;
    const needle = fold(summary).slice(0, 28);
    if (needle && fold(out).includes(needle)) continue;
    out = [out, summary].filter(Boolean).join(' ');
  }
  return out.trim();
}

export function ensureFollowUpInPlan(plan: string, followUp: string): string {
  const sentence = clean(followUp);
  if (!sentence) return plan;
  const planFold = fold(plan);
  if (planFold.includes(fold(sentence).slice(0, 24))) return plan;
  // Only skip when a *planned* follow-up sentence already exists.
  // Safety-net wording ("follow up if symptoms worsen") must not block injection.
  if (containsPlannedFollowUpLanguage(plan)) return plan;
  return [plan.trim(), sentence].filter(Boolean).join('\n\n');
}

/**
 * True when Plan prose already states a structured planned follow-up
 * (WHO + planned), not mere safety-net "follow up if…" advice.
 */
export function containsPlannedFollowUpLanguage(text: string): boolean {
  const normalized = fold(text);
  return (
    /\bfollow[- ]?up planned\b/.test(normalized) ||
    /\bplanned (?:pharmacist|primary care provider|pcp|physician) follow[- ]?up\b/.test(
      normalized,
    ) ||
    /\b(pharmacist|primary care provider|pcp|physician) (?:will|plans? to|is scheduled to) follow[- ]?up\b/.test(
      normalized,
    )
  );
}

/** True when Plan prose mentions follow-up / reassessment at all (incl. safety-net). */
export function containsFollowUpLanguage(text: string): boolean {
  if (containsPlannedFollowUpLanguage(text)) return true;
  const normalized = fold(text);
  return (
    normalized.includes('follow up') ||
    normalized.includes('followup') ||
    /\breassess\b/.test(normalized)
  );
}

/**
 * Drop pure counselling/natural-history fragments that leaked into Plan as
 * standalone lines. Preserve documentation narrative (e.g. "self-care were
 * reviewed") and any follow-up sentence — those belong in P — Plan.
 */
export function stripCounsellingLeakageFromPlan(plan: string): string {
  const DOCUMENTATION_NARRATIVE =
    /\b(?:were|was) reviewed\b|\badvice was provided\b|\bcounselling\b|\bpatient (?:was|were) advised\b|\bmeasures were\b|\binfection-?control\b/i;

  return plan
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (containsFollowUpLanguage(line) || DOCUMENTATION_NARRATIVE.test(line)) {
        return splitPlanSentences(line)
          .filter((sentence) => {
            if (containsFollowUpLanguage(sentence)) return true;
            if (DOCUMENTATION_NARRATIVE.test(sentence)) return true;
            return !isCounsellingLeakageFragment(sentence);
          })
          .join(' ')
          .replace(/\s{2,}/g, ' ')
          .trim();
      }
      return isCounsellingLeakageFragment(line) ? '' : line;
    })
    .filter(Boolean)
    .join('\n\n');
}

function splitPlanSentences(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  if (!parts?.length) return [text];
  return parts.map((p) => p.trim()).filter(Boolean);
}

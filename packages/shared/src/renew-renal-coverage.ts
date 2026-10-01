/**
 * Dialysis / renal coverage for Renew Accordion 2.
 * Absence of a fired rule is not clinical clearance.
 */

import type { RenewPatientContextRequirement, RenewSafetyFindingSummary } from './renew-monitoring';
import { contextChoiceFromAnswer } from './renew-monitoring';

export type DialysisStatus =
  | 'NOT_ON_DIALYSIS'
  | 'HEMODIALYSIS'
  | 'PERITONEAL_DIALYSIS'
  | 'OTHER_DIALYSIS'
  | 'UNKNOWN';

export type RenalRuleCoverage =
  | 'COVERED'
  | 'NOT_REQUIRED'
  | 'EXPECTED_BUT_MISSING'
  | 'INSUFFICIENT_INPUT'
  | 'UNSUPPORTED_DIALYSIS_MODALITY';

export type RenalMedicationEvaluationStatus =
  | 'RULE_PASSED'
  | 'ADJUSTMENT_REQUIRED'
  | 'REVIEW_REQUIRED'
  | 'ACTION_REQUIRED'
  | 'NO_APPLICABLE_RULE'
  | 'INSUFFICIENT_INFORMATION'
  | 'NOT_REQUIRED';

export interface DialysisContext {
  dialysisStatus: DialysisStatus;
  onDialysis: boolean;
  label: string;
}

export interface RenalMedicationEvaluation {
  medicationId: string;
  medicationName: string;
  dialysisStatus: DialysisStatus;
  evaluationStatus: RenalMedicationEvaluationStatus;
  coverage: RenalRuleCoverage;
  matchedRuleId: string | null;
  reason: string;
  badgeLabel: string;
}

const DIALYSIS_CODES = new Set(['DIALYSIS_STATUS', 'DIALYSIS', 'HEMODIALYSIS', 'ON_DIALYSIS']);

const RENAL_DIALYSIS_EXPECTED = [
  'gabapentin',
  'pregabalin',
  'metformin',
  'sitagliptin',
  'saxagliptin',
  'glyburide',
  'glibenclamide',
  'nitrofurantoin',
  'morphine',
  'codeine',
  'allopurinol',
  'colchicine',
  'digoxin',
  'lithium',
  'baclofen',
  'atenolol',
  'nadolol',
  'sotalol',
  'enoxaparin',
  'dalteparin',
  'ramipril',
  'lisinopril',
  'enalapril',
  'perindopril',
  'quinapril',
  'captopril',
  'fosinopril',
  'candesartan',
  'irbesartan',
  'losartan',
  'valsartan',
  'telmisartan',
  'olmesartan',
  'spironolactone',
  'eplerenone',
];

export function isRenalMonitoringCode(inputCode: string): boolean {
  const code = inputCode.trim().toUpperCase();
  return code === 'EGFR' || code === 'CRCL' || code === 'CREATININE' || code === 'CREATININE_CLEARANCE';
}

export function dialysisDisplayLabel(status: DialysisStatus): string {
  if (status === 'HEMODIALYSIS') return 'Hemodialysis';
  if (status === 'PERITONEAL_DIALYSIS') return 'Peritoneal dialysis';
  if (status === 'OTHER_DIALYSIS') return 'Dialysis';
  if (status === 'UNKNOWN') return 'Dialysis status unknown';
  return 'Not on dialysis';
}

export function parseDialysisContext(args: {
  dialysisStatus?: DialysisStatus | null;
  patientContext?: RenewPatientContextRequirement[];
  findings?: RenewSafetyFindingSummary[];
}): DialysisContext {
  if (args.dialysisStatus) {
    return {
      dialysisStatus: args.dialysisStatus,
      onDialysis: isOnDialysis(args.dialysisStatus),
      label: dialysisDisplayLabel(args.dialysisStatus),
    };
  }

  for (const row of args.patientContext ?? []) {
    const fromCode = DIALYSIS_CODES.has(row.inputCode.trim().toUpperCase());
    const fromLabel = /\bdialysis\b/i.test(row.label);
    if (!fromCode && !fromLabel) continue;
    const parsed = dialysisStatusFromText(`${row.answer.valueText ?? ''} ${row.answer.note ?? ''}`);
    if (parsed) {
      return {
        dialysisStatus: parsed,
        onDialysis: isOnDialysis(parsed),
        label: dialysisDisplayLabel(parsed),
      };
    }
    const choice = contextChoiceFromAnswer(row.answer);
    if (choice === 'yes') {
      return {
        dialysisStatus: 'OTHER_DIALYSIS',
        onDialysis: true,
        label: dialysisDisplayLabel('OTHER_DIALYSIS'),
      };
    }
    if (choice === 'no') {
      return {
        dialysisStatus: 'NOT_ON_DIALYSIS',
        onDialysis: false,
        label: dialysisDisplayLabel('NOT_ON_DIALYSIS'),
      };
    }
  }

  const findingBlob = (args.findings ?? [])
    .map((finding) => `${finding.summary} ${finding.detail}`)
    .join(' ');
  const fromFinding = dialysisStatusFromText(findingBlob);
  if (fromFinding && isOnDialysis(fromFinding)) {
    return {
      dialysisStatus: fromFinding,
      onDialysis: true,
      label: dialysisDisplayLabel(fromFinding),
    };
  }

  return {
    dialysisStatus: 'NOT_ON_DIALYSIS',
    onDialysis: false,
    label: dialysisDisplayLabel('NOT_ON_DIALYSIS'),
  };
}

export function evaluateRenalMedications(args: {
  medicationIds: string[];
  medicationNames: string[];
  dialysis: DialysisContext;
  findings: RenewSafetyFindingSummary[];
}): RenalMedicationEvaluation[] {
  return args.medicationIds.map((medicationId, index) => {
    const medicationName = args.medicationNames[index] ?? medicationId;
    return evaluateRenalMedication({
      medicationId,
      medicationName,
      dialysis: args.dialysis,
      findings: args.findings,
    });
  });
}

export function renalRowNeedsReview(evaluations: RenalMedicationEvaluation[]): boolean {
  return evaluations.some(
    (row) =>
      row.evaluationStatus === 'ACTION_REQUIRED' ||
      row.evaluationStatus === 'REVIEW_REQUIRED' ||
      row.evaluationStatus === 'ADJUSTMENT_REQUIRED' ||
      row.evaluationStatus === 'NO_APPLICABLE_RULE' ||
      row.evaluationStatus === 'INSUFFICIENT_INFORMATION',
  );
}

export function renalCoverageSummary(evaluations: RenalMedicationEvaluation[]): {
  allNotRequired: boolean;
  anyCoveredPass: boolean;
  needsReview: boolean;
} {
  return {
    allNotRequired: evaluations.length > 0 && evaluations.every((row) => row.coverage === 'NOT_REQUIRED'),
    anyCoveredPass: evaluations.some((row) => row.coverage === 'COVERED' && row.evaluationStatus === 'RULE_PASSED'),
    needsReview: renalRowNeedsReview(evaluations),
  };
}

function evaluateRenalMedication(args: {
  medicationId: string;
  medicationName: string;
  dialysis: DialysisContext;
  findings: RenewSafetyFindingSummary[];
}): RenalMedicationEvaluation {
  const related = args.findings.filter((finding) =>
    `${finding.summary} ${finding.detail}`.toLowerCase().includes(ingredientKey(args.medicationName)),
  );
  const expected = renalDialysisRuleExpected(args.medicationName);

  if (related.some((finding) => isActionSeverity(finding.clinicalSeverity))) {
    return {
      medicationId: args.medicationId,
      medicationName: args.medicationName,
      dialysisStatus: args.dialysis.dialysisStatus,
      evaluationStatus: 'ACTION_REQUIRED',
      coverage: 'COVERED',
      matchedRuleId: related[0]?.key ?? null,
      reason: related[0]?.summary ?? 'Safety rule triggered',
      badgeLabel: 'Requires adjustment',
    };
  }

  if (related.some((finding) => finding.clinicalSeverity === 'REVIEW_REQUIRED')) {
    return {
      medicationId: args.medicationId,
      medicationName: args.medicationName,
      dialysisStatus: args.dialysis.dialysisStatus,
      evaluationStatus: 'REVIEW_REQUIRED',
      coverage: 'COVERED',
      matchedRuleId: related[0]?.key ?? null,
      reason: related[0]?.summary ?? 'Pharmacist review required',
      badgeLabel: 'Use with caution',
    };
  }

  if (related.length) {
    return {
      medicationId: args.medicationId,
      medicationName: args.medicationName,
      dialysisStatus: args.dialysis.dialysisStatus,
      evaluationStatus: 'RULE_PASSED',
      coverage: 'COVERED',
      matchedRuleId: related[0]?.key ?? null,
      reason: 'Published renal/dialysis rule matched and was reviewed by the safety engine.',
      badgeLabel: 'Renal regimen reviewed',
    };
  }

  if (!args.dialysis.onDialysis) {
    return {
      medicationId: args.medicationId,
      medicationName: args.medicationName,
      dialysisStatus: args.dialysis.dialysisStatus,
      evaluationStatus: 'NOT_REQUIRED',
      coverage: 'NOT_REQUIRED',
      matchedRuleId: null,
      reason: 'No medication-specific renal restriction was triggered by the current result.',
      badgeLabel: 'No unresolved renal dosing issue identified',
    };
  }

  if (args.dialysis.dialysisStatus === 'UNKNOWN') {
    return {
      medicationId: args.medicationId,
      medicationName: args.medicationName,
      dialysisStatus: args.dialysis.dialysisStatus,
      evaluationStatus: 'INSUFFICIENT_INFORMATION',
      coverage: 'INSUFFICIENT_INPUT',
      matchedRuleId: null,
      reason: 'Dialysis modality is unknown. Confirm hemodialysis or peritoneal dialysis before applying renal dosing rules.',
      badgeLabel: 'Additional information required',
    };
  }

  if (!expected) {
    return {
      medicationId: args.medicationId,
      medicationName: args.medicationName,
      dialysisStatus: args.dialysis.dialysisStatus,
      evaluationStatus: 'NOT_REQUIRED',
      coverage: 'NOT_REQUIRED',
      matchedRuleId: null,
      reason: 'No dialysis-specific renal rule is required for this medication.',
      badgeLabel: 'No renal-specific action',
    };
  }

  return {
    medicationId: args.medicationId,
    medicationName: args.medicationName,
    dialysisStatus: args.dialysis.dialysisStatus,
    evaluationStatus: 'NO_APPLICABLE_RULE',
    coverage: 'EXPECTED_BUT_MISSING',
    matchedRuleId: null,
    reason: 'No published dialysis-specific renal rule available',
    badgeLabel: 'Dialysis-specific rule not available',
  };
}

function renalDialysisRuleExpected(medicationName: string): boolean {
  const key = ingredientKey(medicationName);
  return RENAL_DIALYSIS_EXPECTED.some((name) => key === name || key.startsWith(name) || name.startsWith(key));
}

function ingredientKey(name: string): string {
  return name.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
}

function isOnDialysis(status: DialysisStatus): boolean {
  return status === 'HEMODIALYSIS' || status === 'PERITONEAL_DIALYSIS' || status === 'OTHER_DIALYSIS';
}

function dialysisStatusFromText(raw: string): DialysisStatus | null {
  const text = raw.toLowerCase();
  if (!text.trim()) return null;
  if (/\bnot on dialysis\b|\bno dialysis\b/.test(text)) return 'NOT_ON_DIALYSIS';
  if (/\bhemodialysis\b|\bhaemodialysis\b|\bhd\b/.test(text)) return 'HEMODIALYSIS';
  if (/\bperitoneal\b|\bcapd\b|\bpd\b/.test(text)) return 'PERITONEAL_DIALYSIS';
  if (/\bdialysis[- ]dependent\b|\bon dialysis\b|\bdialysis\b/.test(text)) return 'OTHER_DIALYSIS';
  return null;
}

function isActionSeverity(severity: string): boolean {
  return severity === 'AVOID' || severity === 'CRITICAL' || severity === 'HIGH';
}

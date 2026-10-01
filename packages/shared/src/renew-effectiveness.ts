/**
 * Step 2 effectiveness / stability copy and reason catalogs.
 * UI labels live here so pharmacist-facing text is not hardcoded in multiple components.
 */

export const RENEW_EFFECTIVENESS_NO_REASONS = [
  { id: 'not_at_goal', label: 'Not at goal / inadequate control' },
  { id: 'fluctuating_control', label: 'Fluctuating / inconsistent control' },
  { id: 'recent_worsening', label: 'Recent worsening' },
  { id: 'symptoms_despite_therapy', label: 'Symptoms / concerns despite therapy' },
  { id: 'patient_reports_not_working', label: 'Patient reports therapy not working well' },
  { id: 'other', label: 'Other (specify)' },
] as const;

export const RENEW_UNABLE_TO_ASSESS_REASONS = [
  { id: 'insufficient_information', label: 'Insufficient information available' },
  { id: 'patient_unable_to_provide', label: 'Patient unable to provide information' },
  { id: 'no_recent_monitoring', label: 'No recent monitoring / follow-up' },
  { id: 'recent_therapy_change', label: 'Recent therapy change' },
  { id: 'no_recent_follow_up', label: 'No recent follow-up' },
  { id: 'other', label: 'Other / specify' },
] as const;

export type EffectivenessReasonOption = { id: string; label: string };

export interface EffectivenessReviewCopy {
  noTitle: string;
  noPrompt: string;
  noReasons: EffectivenessReasonOption[];
  unableTitle: string;
  unablePrompt: string;
  unableReasons: EffectivenessReasonOption[];
}

const OTHER_NO = { id: 'other', label: 'Other (specify)' };
const OTHER_UNABLE = { id: 'other', label: 'Other / specify' };

const HTN_NO: EffectivenessReasonOption[] = [
  { id: 'bp_above_target', label: 'BP above target / not at goal' },
  { id: 'bp_fluctuating', label: 'BP fluctuating / inconsistent control' },
  { id: 'recent_worsening', label: 'Recent worsening' },
  { id: 'symptoms_despite_therapy', label: 'Symptoms / concerns despite therapy' },
  { id: 'patient_reports_not_working', label: 'Patient reports therapy not working well' },
  OTHER_NO,
];

const HTN_UNABLE: EffectivenessReasonOption[] = [
  { id: 'no_recent_monitoring', label: 'No recent BP / monitoring result' },
  { id: 'patient_unable_to_provide', label: 'Patient unsure / cannot provide readings' },
  { id: 'insufficient_information', label: 'Insufficient information available' },
  { id: 'recent_therapy_change', label: 'Recent therapy change' },
  { id: 'no_recent_follow_up', label: 'No recent follow-up' },
  OTHER_UNABLE,
];

const SYMPTOM_UNABLE: EffectivenessReasonOption[] = [
  { id: 'patient_unable_to_provide', label: 'Patient unable to describe current symptoms' },
  { id: 'insufficient_information', label: 'Insufficient information available' },
  { id: 'no_recent_follow_up', label: 'No recent follow-up' },
  { id: 'recent_therapy_change', label: 'Recent therapy change' },
  OTHER_UNABLE,
];

const LIPID_UNABLE: EffectivenessReasonOption[] = [
  { id: 'no_recent_monitoring', label: 'No recent relevant monitoring' },
  { id: 'insufficient_information', label: 'Insufficient information available' },
  { id: 'recent_therapy_change', label: 'Recent therapy change' },
  { id: 'no_recent_follow_up', label: 'No recent follow-up' },
  OTHER_UNABLE,
];

const GENERIC: EffectivenessReviewCopy = {
  noTitle: 'Effectiveness / stability concern',
  noPrompt: 'What suggests the condition is not adequately controlled?',
  noReasons: [...RENEW_EFFECTIVENESS_NO_REASONS],
  unableTitle: 'Unable to assess control',
  unablePrompt: 'Why is control unable to be assessed?',
  unableReasons: [...RENEW_UNABLE_TO_ASSESS_REASONS],
};

function profileFor(code?: string | null, displayName?: string | null): EffectivenessReviewCopy {
  const blob = `${code ?? ''} ${displayName ?? ''}`.toUpperCase();
  if (blob.includes('HYPERTENSION') || blob.includes('HIGH BLOOD PRESSURE') || /\bHTN\b/.test(blob)) {
    return {
      noTitle: 'Effectiveness / stability concern',
      noPrompt: 'What suggests the condition is not adequately controlled?',
      noReasons: HTN_NO,
      unableTitle: 'Unable to assess blood pressure control',
      unablePrompt: 'Why can blood pressure control not be assessed?',
      unableReasons: HTN_UNABLE,
    };
  }
  if (blob.includes('DYSLIPIDEMIA') || blob.includes('CHOLESTEROL') || blob.includes('CV PREVENTION')) {
    return {
      ...GENERIC,
      noPrompt: 'What suggests lipid / cardiovascular prevention therapy is not stable?',
      unableTitle: 'Unable to assess therapy status',
      unablePrompt: 'Why is therapy status unable to be assessed?',
      unableReasons: LIPID_UNABLE,
    };
  }
  if (blob.includes('GERD') || blob.includes('REFLUX')) {
    return {
      ...GENERIC,
      unableTitle: 'Unable to assess symptom control',
      unablePrompt: 'Why is symptom control unable to be assessed?',
      unableReasons: SYMPTOM_UNABLE,
    };
  }
  if (blob.includes('BPH') || blob.includes('PROSTAT')) {
    return {
      ...GENERIC,
      unableTitle: 'Unable to assess symptom control',
      unablePrompt: 'Why is symptom control unable to be assessed?',
      unableReasons: SYMPTOM_UNABLE,
    };
  }
  if (blob.includes('DIABETES') || blob.includes('T2DM') || blob.includes('T1DM')) {
    return {
      ...GENERIC,
      unableTitle: 'Unable to assess glycemic control',
      unablePrompt: 'Why is glycemic control unable to be assessed?',
      unableReasons: [
        { id: 'no_recent_monitoring', label: 'No recent A1c / glucose result' },
        { id: 'patient_unable_to_provide', label: 'Patient unable to provide readings' },
        { id: 'insufficient_information', label: 'Insufficient information available' },
        { id: 'recent_therapy_change', label: 'Recent therapy change' },
        { id: 'no_recent_follow_up', label: 'No recent follow-up' },
        OTHER_UNABLE,
      ],
    };
  }
  return GENERIC;
}

export function getEffectivenessReviewCopy(
  conditionCode?: string | null,
  displayName?: string | null,
): EffectivenessReviewCopy {
  return profileFor(conditionCode, displayName);
}

const UNABLE_TO_CONFIRM: EffectivenessReasonOption = {
  id: 'unable_to_confirm',
  label: 'Unable to confirm effectiveness/stability',
};

/** Combined reason list for the inverted “concerns? Yes” path. Unable to assess is a reason, not a third button. */
export function effectivenessConcernReasonOptions(
  copy: EffectivenessReviewCopy,
): EffectivenessReasonOption[] {
  const seen = new Set<string>();
  const merged: EffectivenessReasonOption[] = [];
  const push = (row: EffectivenessReasonOption) => {
    if (seen.has(row.id) || row.id === 'other') return;
    seen.add(row.id);
    merged.push(row);
  };
  for (const row of copy.noReasons) push(row);
  push(UNABLE_TO_CONFIRM);
  for (const row of copy.unableReasons) push(row);
  merged.push({ id: 'other', label: 'Other' });
  return merged;
}

export function effectivenessStatusForConcernReason(
  reasonId: string | null | undefined,
  copy: EffectivenessReviewCopy,
): 'no' | 'unable_to_assess' {
  if (!reasonId) return 'no';
  if (reasonId === 'unable_to_confirm') return 'unable_to_assess';
  const inUnable = copy.unableReasons.some((row) => row.id === reasonId);
  const inNo = copy.noReasons.some((row) => row.id === reasonId);
  if (inUnable && !inNo) return 'unable_to_assess';
  return 'no';
}

export function effectivenessReasonLabel(
  reasonId: string | null | undefined,
  options: EffectivenessReasonOption[],
): string {
  return options.find((row) => row.id === reasonId)?.label ?? 'Documented reason';
}

const EXTRA_REASON_LABELS: Record<string, string> = {
  bp_above_target: 'BP above target / not at goal',
  bp_fluctuating: 'BP fluctuating / inconsistent control',
  unable_to_confirm: 'Unable to confirm effectiveness/stability',
};

export function lookupEffectivenessReasonLabel(reasonId?: string | null): string {
  if (!reasonId) return 'Effectiveness concern';
  const fromNo = RENEW_EFFECTIVENESS_NO_REASONS.find((row) => row.id === reasonId)?.label;
  if (fromNo) return fromNo;
  const fromUnable = RENEW_UNABLE_TO_ASSESS_REASONS.find((row) => row.id === reasonId)?.label;
  if (fromUnable) return fromUnable;
  return EXTRA_REASON_LABELS[reasonId] ?? reasonId.replace(/_/g, ' ');
}

export function isUnableToAssessStatus(status: string | null | undefined): boolean {
  return status === 'unable_to_assess' || status === 'unsure' || status === 'no_unsure';
}

export function normalizeEffectivenessChoice(
  status: string | null | undefined,
): 'yes' | 'no' | 'unable_to_assess' | null {
  if (status === 'yes' || status === 'no') return status;
  if (isUnableToAssessStatus(status)) return 'unable_to_assess';
  return null;
}

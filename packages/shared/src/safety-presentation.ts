/**
 * Safety review presentation policy (Warnings UI spec, 28-Aug-2026).
 *
 * Patient-specific matched findings are review items.
 * Generic monograph / pathway precautions are Drug reference, not alerts.
 * HIGH severity is not automatically Avoid or Allergy.
 */

export type SafetyPresentationKind =
  | 'SIGNIFICANT_RISK'
  | 'ROUTINE_CAUTION'
  | 'REQUIRED_INFORMATION'
  | 'REFERENCE';

export type SafetyReviewDomain =
  | 'allergy'
  | 'renal'
  | 'hepatic'
  | 'pregnancy'
  | 'lactation'
  | 'interaction'
  | 'condition'
  | 'monitoring'
  | 'information'
  | 'other';

const ALLERGY_TYPES = new Set(['allergy', 'cross_reactivity']);

export function isAllergyFindingType(findingType: string | undefined): boolean {
  return ALLERGY_TYPES.has((findingType ?? '').trim().toLowerCase());
}

export function isValueSetOrSelectorCode(code: string | undefined): boolean {
  const c = (code ?? '').trim();
  if (!c) return false;
  return /^(VS-|SEL-|VALUE[_-]?SET)/i.test(c);
}

function blob(finding: {
  recommendedAction?: string;
  detail?: string;
  summary?: string;
  matchType?: string;
}): string {
  return `${finding.recommendedAction ?? ''} ${finding.detail ?? ''} ${finding.summary ?? ''} ${finding.matchType ?? ''}`.toLowerCase();
}

/** True when the finding is an avoid / contraindication, not a routine caution. */
export function isSignificantRiskFinding(finding: {
  findingType: string;
  clinicalSeverity?: string;
  matchType?: string;
  recommendedAction?: string;
  detail?: string;
  summary?: string;
}): boolean {
  return presentationKindForFinding(finding) === 'SIGNIFICANT_RISK';
}

export function presentationKindForFinding(finding: {
  findingType: string;
  clinicalSeverity?: string;
  matchType?: string;
  recommendedAction?: string;
  detail?: string;
  summary?: string;
}): SafetyPresentationKind {
  const type = (finding.findingType ?? '').trim().toLowerCase();
  const sev = (finding.clinicalSeverity ?? '').trim().toUpperCase();
  const text = blob(finding);
  const match = (finding.matchType ?? '').toLowerCase();

  if (type === 'allergy' || type === 'cross_reactivity') return 'SIGNIFICANT_RISK';

  if (type === 'pregnancy' || type === 'lactation') {
    if (
      match.includes('contraindicat') ||
      sev === 'CRITICAL' ||
      /\bcontraindicat/.test(text)
    ) {
      return 'SIGNIFICANT_RISK';
    }
    return 'ROUTINE_CAUTION';
  }

  if (type === 'drug_interaction') {
    if (/\bcontraindicat/.test(text) || (/\bavoid\b/.test(text) && !/\bmonitor\b/.test(text))) {
      return 'SIGNIFICANT_RISK';
    }
    if (sev === 'CRITICAL') return 'SIGNIFICANT_RISK';
    if (/\bmonitor\b/.test(text) || match === 'ddi_minor') return 'REFERENCE';
    return 'ROUTINE_CAUTION';
  }

  if (type === 'renal_band' || type === 'renal_lab') {
    if (sev === 'CRITICAL' || (sev === 'HIGH' && /\bcontraindicat|\bavoid\b/.test(text))) {
      return 'SIGNIFICANT_RISK';
    }
    return 'ROUTINE_CAUTION';
  }

  if (type === 'drug_disease' || type === 'age_gate' || type === 'duplicate_therapy') {
    if (sev === 'CRITICAL' || /\bcontraindicat/.test(text) || /\bavoid\b/.test(text)) {
      return 'SIGNIFICANT_RISK';
    }
    return 'ROUTINE_CAUTION';
  }

  if (type === 'missing_data' || type === 'information_needed') return 'REQUIRED_INFORMATION';

  if (sev === 'INFO' || type === 'monitoring') return 'REFERENCE';
  return 'ROUTINE_CAUTION';
}

export function safetyDomainForFindingType(findingType: string | undefined): SafetyReviewDomain {
  const type = (findingType ?? '').trim().toLowerCase();
  if (type === 'allergy' || type === 'cross_reactivity') return 'allergy';
  if (type === 'renal_band' || type === 'renal_lab') return 'renal';
  if (type === 'pregnancy') return 'pregnancy';
  if (type === 'lactation') return 'lactation';
  if (type === 'drug_interaction') return 'interaction';
  if (type === 'drug_disease') return 'condition';
  if (type === 'missing_data' || type === 'information_needed') return 'information';
  if (type === 'monitoring') return 'monitoring';
  return 'other';
}

/** Map an explicit engine ruleDomain (PREGNANCY, ALLERGY, …) onto the UI section. */
export function safetyDomainFromRuleDomain(
  ruleDomain: string | undefined,
  findingType?: string,
): SafetyReviewDomain {
  const domain = (ruleDomain ?? '').trim().toUpperCase();
  if (domain === 'ALLERGY' || domain === 'ALLERGY_CROSS_REACTIVITY') return 'allergy';
  if (domain === 'PREGNANCY') return 'pregnancy';
  if (domain === 'LACTATION') return 'lactation';
  if (domain === 'RENAL' || domain === 'LAB_THRESHOLD') return 'renal';
  if (domain === 'DRUG_INTERACTION') return 'interaction';
  if (domain === 'DRUG_DISEASE') return 'condition';
  if (domain === 'MONITORING') return 'monitoring';
  return safetyDomainForFindingType(findingType);
}

export function safetyReviewTitle(domain: SafetyReviewDomain, kind: SafetyPresentationKind): string {
  if (kind === 'REQUIRED_INFORMATION') return 'Information needed';
  switch (domain) {
    case 'allergy':
      return 'Allergy';
    case 'renal':
      return kind === 'SIGNIFICANT_RISK' ? 'Renal — avoid' : 'Renal';
    case 'hepatic':
      return kind === 'SIGNIFICANT_RISK' ? 'Hepatic — avoid' : 'Hepatic';
    case 'pregnancy':
      return kind === 'SIGNIFICANT_RISK' ? 'Pregnancy — avoid' : 'Pregnancy';
    case 'lactation':
      return 'Lactation';
    case 'interaction':
      return kind === 'SIGNIFICANT_RISK' ? 'Interaction — avoid' : 'Interaction';
    case 'condition':
      return kind === 'SIGNIFICANT_RISK' ? 'Condition — avoid' : 'Condition';
    case 'monitoring':
      return 'Monitoring';
    default:
      return kind === 'SIGNIFICANT_RISK' ? 'Avoid' : 'Safety finding';
  }
}

export interface SafetyReviewItem {
  findingId: string;
  issueKey: string;
  safetyDomain: SafetyReviewDomain;
  presentationKind: SafetyPresentationKind;
  severity: string;
  title: string;
  summary: string;
  requiresAcknowledgement: boolean;
  requiresRationale: boolean;
  ruleCode?: string;
}

export interface SafetyDrugReference {
  interactions: string[];
  renal?: string;
  hepatic?: string;
  monitoring?: string;
  pregnancy?: string;
}

/**
 * Visible Safety review items: significant risks, required information,
 * and matched patient-specific cautions. Reference / monograph text is excluded.
 *
 * Routine interaction "monitor" copy and unmatched pathway cautions do not count.
 */
export function isVisibleSafetyReviewItem(item: SafetyReviewItem): boolean {
  if (item.presentationKind === 'REFERENCE') return false;
  if (item.presentationKind === 'SIGNIFICANT_RISK') return true;
  if (item.presentationKind === 'REQUIRED_INFORMATION') return true;
  // Keep matched pregnancy / organ / condition cautions that the engine actually matched.
  // Generic monitoring and "monitor for X" DDI stay in Drug reference.
  if (item.presentationKind === 'ROUTINE_CAUTION') {
    return item.safetyDomain !== 'monitoring';
  }
  return false;
}

export function countSafetyReviewObligations(items: SafetyReviewItem[]): number {
  const keys = new Set<string>();
  for (const item of items) {
    if (!isVisibleSafetyReviewItem(item)) continue;
    keys.add(item.issueKey || item.findingId);
  }
  return keys.size;
}

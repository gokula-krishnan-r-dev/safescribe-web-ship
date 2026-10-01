/**
 * Patient pregnancy/breastfeeding context normalization for Safety Engine.
 */

export interface ParsedPregnancyContext {
  isPregnant: boolean;
  isBreastfeeding: boolean;
  trimester: string | null;
  statusKnown: boolean;
}

export function parsePregnancyStatus(status?: string | null): ParsedPregnancyContext {
  const raw = (status ?? '').trim().toLowerCase();
  if (!raw) {
    return { isPregnant: false, isBreastfeeding: false, trimester: null, statusKnown: false };
  }
  if (
    raw === 'unknown' ||
    raw === 'possible' ||
    raw === 'unanswered' ||
    raw === 'not sure' ||
    /\bunknown\b/.test(raw)
  ) {
    return { isPregnant: false, isBreastfeeding: false, trimester: null, statusKnown: false };
  }

  const notPregnant =
    /\bnot pregnant\b|\bnon-?pregnant\b|\bdenies pregnancy\b|\bno pregnancy\b/.test(raw) ||
    raw === 'no';
  const deniedBreast =
    /\bnot (breast\s?feeding|nursing|lactat)/.test(raw) ||
    /\bno (breast\s?feeding|lactation)\b/.test(raw);
  const isBreastfeeding =
    !deniedBreast && /\b(breast\s?feeding|lactat|nursing)\b/.test(raw);
  const isPregnant =
    !notPregnant &&
    (/(pregnan|gestation|gravid|expecting)/.test(raw) || raw === 'yes');

  let trimester: string | null = null;
  if (/\bfirst\b|\bt1\b|\b1st\b|\btrimester 1\b/.test(raw)) trimester = 'T1';
  else if (/\bsecond\b|\bt2\b|\b2nd\b|\btrimester 2\b/.test(raw)) trimester = 'T2';
  else if (/\bthird\b|\bt3\b|\b3rd\b|\btrimester 3\b/.test(raw)) trimester = 'T3';

  return {
    isPregnant,
    isBreastfeeding,
    trimester,
    statusKnown: true,
  };
}

export function normalizeTrimester(value?: string | null): string | null {
  if (!value?.trim()) return null;
  const raw = value.trim().toLowerCase();
  if (raw === 't1' || raw === '1' || raw === 'first' || raw === '1st') return 'T1';
  if (raw === 't2' || raw === '2' || raw === 'second' || raw === '2nd') return 'T2';
  if (raw === 't3' || raw === '3' || raw === 'third' || raw === '3rd') return 'T3';
  if (raw === 'all') return 'ALL';
  return value.trim().toUpperCase();
}

export function trimesterMatches(ruleTrimester: string, patientTrimester: string | null): boolean {
  const rule = (ruleTrimester ?? 'all').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!rule || rule === 'all' || rule === 'all_trimesters' || rule === 'any') return true;
  if (!patientTrimester) return true;
  const patient = normalizeTrimester(patientTrimester)?.toLowerCase() ?? patientTrimester.toLowerCase();
  if (rule === patient) return true;
  if (rule === 't1' && patient === 't1') return true;
  if (rule === 't2' && patient === 't2') return true;
  if (rule === 't3' && patient === 't3') return true;
  return false;
}

export function mapInteractionSeverityToClinical(
  severity: string,
  actionRequired?: string,
): 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | 'INFO' {
  const action = (actionRequired ?? '').toUpperCase();
  if (/HARD_STOP|CONTRAINDICAT|BLOCK/.test(action)) return 'CRITICAL';
  if (/AVOID|NOT_PREFERRED|PREFER_ALTERNATIVE/.test(action)) return 'HIGH';
  switch (severity.toUpperCase()) {
    case 'MAJOR':
      return 'CRITICAL';
    case 'MODERATE':
      return 'MODERATE';
    case 'MINOR':
      return 'LOW';
    default:
      return 'HIGH';
  }
}

/** CYP2C19 PPI + clopidogrel is avoid/not-preferred, not a hard contraindication. */
export function isAvoidNotBlockDdi(drugA: string, drugB: string): boolean {
  const a = drugA.toLowerCase();
  const b = drugB.toLowerCase();
  const pair = `${a} ${b}`;
  return (
    pair.includes('clopidogrel') &&
    (pair.includes('omeprazole') || pair.includes('esomeprazole'))
  );
}

export function mapActionRequired(action?: string): string {
  const v = (action ?? 'pharmacist_review').trim().toLowerCase().replace(/\s+/g, '_');
  if (v === 'none' || v === '—' || v === '-') return 'NONE';
  switch (v) {
    case 'hard_stop':
    case 'block':
      return 'HARD_STOP';
    case 'monitor':
      return 'MONITOR';
    case 'info_only':
      return 'INFO_ONLY';
    default:
      return 'PHARMACIST_REVIEW';
  }
}

export function mapLactationRisk(risk?: string): string {
  const v = (risk ?? 'high_risk').trim().toLowerCase().replace(/\s+/g, '_');
  switch (v) {
    case 'moderate_risk':
    case 'moderate':
      return 'MODERATE_RISK';
    case 'low_risk':
    case 'low':
      return 'LOW_RISK';
    case 'unknown':
      return 'UNKNOWN';
    default:
      return 'HIGH_RISK';
  }
}

export function mapBandSeverityFromImport(severity?: string): string {
  const v = (severity ?? 'block').trim().toLowerCase();
  switch (v) {
    case 'caution':
    case 'review':
      return 'CAUTION';
    case 'safe':
    case 'ok':
      return 'SAFE';
    default:
      return 'BLOCK';
  }
}

export function mapImportSeverityToClinical(severity?: string): 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | 'INFO' {
  const v = (severity ?? 'block').trim().toLowerCase();
  switch (v) {
    case 'block':
      return 'CRITICAL';
    case 'caution':
      return 'MODERATE';
    case 'safe':
      return 'INFO';
    default:
      return 'HIGH';
  }
}

export function mapPregnancyCategory(category?: string): string {
  const v = (category ?? 'contraindicated').trim().toLowerCase();
  switch (v) {
    case 'caution':
    case 'use_with_caution':
      return 'CAUTION';
    case 'preferred':
      return 'PREFERRED';
    case 'unknown':
      return 'UNKNOWN';
    default:
      return 'CONTRAINDICATED';
  }
}

export function overridePolicyForAction(action: string): {
  overrideAllowed: boolean;
  overrideReasonRequired: boolean;
} {
  if (action === 'HARD_STOP') {
    return { overrideAllowed: false, overrideReasonRequired: false };
  }
  return { overrideAllowed: true, overrideReasonRequired: true };
}

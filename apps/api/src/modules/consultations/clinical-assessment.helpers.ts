const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatClinicalDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = MONTHS[date.getUTCMonth()] ?? '';
  const year = date.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

export function formatPathwayVersionLabel(
  version: string | number,
  effectiveDate: Date | string | null | undefined,
): string {
  const raw = String(version).trim();
  const withV = raw.toLowerCase().startsWith('v') ? raw : `v${raw}`;
  const formatted = formatClinicalDate(effectiveDate);
  return formatted ? `${withV} · Effective ${formatted}` : withV;
}

export function isIndependentReviewDocument(doc: {
  documentFamily?: string | null;
  authority?: string | null;
  documentType?: string | null;
  purpose?: string[] | null;
}): boolean {
  const haystack = [
    doc.documentFamily,
    doc.authority,
    doc.documentType,
    ...(doc.purpose ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /\bindependent\b/.test(haystack) || /external peer/.test(haystack);
}

export type IndependentPeerReviewStatus = 'completed' | 'pending' | 'not_completed';

export function independentPeerReviewStatus(
  hasCompletedRecord: boolean,
): IndependentPeerReviewStatus {
  return hasCompletedRecord ? 'completed' : 'not_completed';
}

export function independentPeerReviewCopy(status: IndependentPeerReviewStatus): {
  summary: string;
  badge: string;
} {
  if (status === 'completed') {
    return { summary: 'Reviewed independently', badge: 'Completed' };
  }
  if (status === 'pending') {
    return { summary: 'Independent review is in progress', badge: 'Pending' };
  }
  return { summary: 'Not yet completed', badge: 'Not yet completed' };
}

export function parseGuidelineSources(raw?: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[;|•\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export const CLINICAL_ASSESSMENT_EVENTS = [
  'CLINICAL_ASSESSMENT_STEP_OPENED',
  'CONSULTATION_NOTE_VIEWED',
  'CLINICAL_ASSESSMENT_ENTERED',
  'CLINICAL_ASSESSMENT_CHANGED',
  'PATHWAY_MATCH_FOUND',
  'PATHWAY_MATCH_NOT_FOUND',
  'PATHWAY_EVIDENCE_OPENED',
  'FULL_REFERENCES_OPENED',
  'REVIEWERS_OPENED',
  'VERSION_HISTORY_OPENED',
  'STRUCTURED_PATHWAY_SELECTED',
  'CLINICAL_JUDGMENT_SELECTED',
  'ASSESSMENT_STEP_COMPLETED',
] as const;

export type ClinicalAssessmentEvent = (typeof CLINICAL_ASSESSMENT_EVENTS)[number];

export function isClinicalAssessmentEvent(value: string): value is ClinicalAssessmentEvent {
  return (CLINICAL_ASSESSMENT_EVENTS as readonly string[]).includes(value);
}

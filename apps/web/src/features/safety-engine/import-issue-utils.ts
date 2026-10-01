import type { ClinicalIssueSummary, ClinicalUploadResult } from './clinical-repository-hooks';

const ISSUE_REASONS: Record<string, string> = {
  UNRESOLVED_SELECTOR:
    'This drug or ingredient code is not in the pinned terminology release. Drafts can still be created; matching in live consultations may miss until the code is resolved.',
  TERMINOLOGY_LOOKUP_FAILED:
    'Terminology lookup timed out or failed. The row was accepted as a draft with a warning so import can continue.',
  MISSING_VALUE_SET:
    'The row references a clinical value set that is not in the repository yet. Upload the value-sets workbook in the same batch, or acknowledge if it will be added later.',
  UNRESOLVED_MEMBER_CODE:
    'This value-set member has no terminology or local code, so it cannot match products until resolved.',
  UNRESOLVED_EVIDENCE_SOURCE:
    'The evidence source is marked unresolved, so it should not be treated as supporting a published rule until reviewed.',
  DRAFT_WITH_EFFECTIVE_DATE:
    'Draft rows usually should not carry a live effective start date. Publishing will still work; confirm the date is intentional.',
  HARD_STOP_OVERRIDE:
    'A HARD_STOP rule allows override without requiring a reason. Pharmacists should record why they overrode a hard stop.',
  UNKNOWN_CONTENT_STATUS:
    'The content status is non-standard and will be treated as DRAFT.',
  MISSING_UNIT:
    'A numeric threshold is present without a unit. Confirm the metric does not require one.',
  REQUIRED_FIELD: 'A required column is empty. Fix the workbook or skip this file.',
  INVALID_SEVERITY: 'Alert severity is not a controlled value (INFO, LOW, MODERATE, HIGH, CRITICAL).',
  THRESHOLD_ORDER: 'The minimum threshold is greater than the maximum.',
};

export function issueReason(code: string, fallback: string): string {
  return ISSUE_REASONS[code] ?? fallback;
}

export function summariesForUpload(result: ClinicalUploadResult): ClinicalIssueSummary[] {
  if (result.issueSummary?.length) return result.issueSummary;
  const map = new Map<string, ClinicalIssueSummary>();
  for (const issue of result.issues ?? []) {
    const key = `${issue.severity}:${issue.code}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      if (existing.sampleRows.length < 8) existing.sampleRows.push(issue.row);
      continue;
    }
    map.set(key, {
      code: issue.code,
      severity: issue.severity,
      message: issue.message,
      suggestedFix: issue.suggestedFix,
      count: 1,
      sampleRows: [issue.row],
      reason: issueReason(issue.code, issue.message),
    });
  }
  return [...map.values()].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'ERROR' ? -1 : 1;
    return b.count - a.count;
  });
}

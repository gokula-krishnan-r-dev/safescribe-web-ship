export const ASSESSMENT_COPY = {
  assessmentLabel: 'Enter your clinical assessment',
  placeholder: 'e.g. cold sore / UTI / migraine',
  noteTitle: 'Consultation note',
  viewNote: 'View note',
  presentingConcern: 'Presenting concern',
  relevantClinical: 'Relevant clinical information',
  close: 'Close',
  backToAssessment: 'Back to assessment',
  structuredAvailable: 'Structured pathway available',
  evidenceReview: 'Evidence & review',
  continue: 'Continue →',
  or: 'OR',
  clinicalJudgment: 'Continue with Clinical Judgment',
  noPathway: 'No structured SafeScribe pathway available',
  noSingleMatch: 'Several structured pathways may apply — select one to continue.',
  selectPathway: 'Select a structured pathway',
  back: 'Back',
  needHelp: 'Need help?',
  stepOf: 'Step 2 of 5',
  pathwayInformation: 'Pathway information',
  developmentReview: 'Development & review',
  developmentReviewIntro: 'Clinical and independent peer review for this pathway version.',
  reviewersTab: 'Reviewers',
  referencesTab: 'References',
  noReviewEvidence: 'Reviewer details are not available for this pathway version.',
  jurisdiction: 'Jurisdiction',
  pathwayVersion: 'Pathway version',
  clinicalSources: 'Clinical sources',
  viewFullReferences: 'View full references',
  clinicalReview: 'Clinical review',
  clinicalReviewInternal: 'Clinical review (SafeScribe internal)',
  viewReviewers: 'View reviewers',
  independentPeerReview: 'Independent peer review',
  independentPeerReviewExternal: 'Independent peer review (external)',
  lastReviewed: 'Last reviewed',
  reviewedIndependently: 'Reviewed independently',
  fullReferences: 'Full references',
  noReferences: 'No approved references are attached to this pathway version.',
  noReviewers: 'Reviewer names are not listed for this pathway version.',
  helpTitle: 'Need help?',
  helpIntro:
    'You enter the clinical assessment. SafeScribe looks for approved structured pathways that match what you typed.',
  helpBullets: [
    'Type your working assessment in your own words — partial terms work (e.g. contraception).',
    'If one structured pathway matches, you can continue into it or inspect Evidence & review first.',
    'If several pathways may apply, choose the one that fits this visit.',
    'You can always continue with Clinical Judgment instead.',
  ],
} as const;

export const ASSESSMENT_RAIL = [
  { id: 'intake', label: 'Intake', status: 'Complete' },
  { id: 'assessment', label: 'Assessment', status: 'Current' },
  { id: 'patient', label: 'Patient Info', status: 'Upcoming' },
  { id: 'pathway', label: 'Pathway', status: 'Upcoming' },
  { id: 'documentation', label: 'Documentation', status: 'Upcoming' },
] as const;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatAssessmentDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = MONTHS[date.getUTCMonth()] ?? '';
  return `${day}-${month}-${date.getUTCFullYear()}`;
}

export function formatVersionLine(version: string, effectiveDate?: string | null): string {
  const formatted = formatAssessmentDate(effectiveDate);
  return formatted ? `${version} · Effective ${formatted}` : version;
}

export function reviewerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'R';
  return `${parts[0]![0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase();
}

export function reviewerCountLabel(count: number): string {
  if (count <= 0) return 'No reviewers listed';
  return count === 1 ? '1 reviewer' : `${count} reviewers`;
}

export function reviewersListedLabel(count: number): string {
  if (count <= 0) return 'No reviewers listed';
  return count === 1 ? '1 reviewer listed' : `${count} reviewers listed`;
}

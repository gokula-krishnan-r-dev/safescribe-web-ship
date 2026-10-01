export const PRESENTATION_REVIEW_COPY = {
  title: 'Presentation Review',
  subtitle: "Review whether the patient's presentation is consistent with this pathway.",
  banner:
    "These questions help confirm that the patient's presentation fits this pathway. They do not replace your clinical judgment.",
  eligibilityTitle: 'Treatment Eligibility',
  eligibilitySubtitle: "Confirm whether this pathway's treatment criteria are met.",
  eligibilityLocked:
    'Complete Presentation Review above to answer treatment eligibility.',
  eligibilityMet: 'Eligibility criteria met',
  eligibilityMetDetail:
    'This section is complete. Final treatment suitability still depends on safety screening and treatment-specific checks.',
  yesToAll: 'Yes to all',
  clearAll: 'Clear all',
  yesToAllHelper: 'Use when all statements below are true based on the patient assessment.',
  clearAllHelper: 'All marked Yes. Clear to revise answers individually.',
  why: 'Why?',
  whyTitle: 'Why this matters',
  keyReferences: 'Key references',
  viewFullReferences: 'View full references',
  noQuestionReferences: 'No approved references are attached to this question.',
  noRationale: 'No additional rationale is stored for this question in the approved pathway.',
  evidenceReview: 'Evidence & review',
  guidelineSources: 'Guideline sources',
  developmentReview: 'Development & review',
  addFinding: 'Add another clinical finding',
  addFindingHelper: 'Include any other relevant details to support pathway fit (optional).',
  findingLabel: 'Additional clinical finding',
  findingPlaceholder: 'Enter relevant finding (e.g., lesion appearance, location, patient history)...',
  cancel: 'Cancel',
  add: 'Add',
  save: 'Save',
  edit: 'Edit',
  remove: 'Remove',
  reset: 'Reset answers',
  resetTitle: 'Reset Presentation Review answers?',
  resetBody:
    'This will clear all Yes/No responses in this section. Your additional clinical findings will be kept.',
  resetAction: 'Reset answers',
  eligibilityResetTitle: 'Reset all treatment-eligibility answers?',
  eligibilityResetBody:
    'This removes recorded treatment-eligibility answers. You will need to answer the questions again.',
  removeFindingTitle: 'Remove this clinical finding?',
  removeFindingBody: 'This finding will be removed from the active Presentation Review.',
  fromReviewedNote: 'From reviewed consultation note',
  lastReviewed: 'Last reviewed',
  answered: (answered: number, total: number) => `${answered} of ${total} answered`,
} as const;

export const PRESENTATION_FINDINGS_KEY = '__presentationFindings';
export const PRESENTATION_FINDING_MAX = 250;

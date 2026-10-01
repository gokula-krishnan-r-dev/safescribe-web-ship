import {
  clinicalJudgementNoteFragment,
  clinicalJudgementPromptCopy,
  classifyPathwayQuestionSection,
  computeSourceAnswerRevision,
  confirmBlockedReason,
  defaultSectionConfig,
  evaluateCombinedAssessment,
  evaluateSection,
  isClinicalJudgementFormValid,
  normalizePathwayYesNo,
  NO_TREATMENT_NOTE_FRAGMENT,
} from '@safescript/shared';

const diagnosis = defaultSectionConfig(
  'DIAGNOSIS_CONFIRMATION',
  ['d1', 'd2', 'd3'],
  'Diagnosis Confirmation',
);
const eligibility = defaultSectionConfig(
  'TREATMENT_ELIGIBILITY',
  ['e1', 'e2', 'e3'],
  'Treatment Eligibility',
);

describe('pathway clinical judgement evaluation', () => {
  it('treats empty sections as not applicable', () => {
    const empty = defaultSectionConfig('DIAGNOSIS_CONFIRMATION', [], 'Diagnosis Confirmation');
    expect(evaluateSection(empty, {}).status).toBe('NOT_APPLICABLE');
  });

  it('keeps incomplete sections unevaluated', () => {
    const result = evaluateSection(diagnosis, { d1: 'NO', d2: 'YES', d3: null });
    expect(result.status).toBe('INCOMPLETE');
    expect(result.answeredQuestions).toBe(2);
  });

  it('supports a section with one Yes among Nos', () => {
    const result = evaluateSection(diagnosis, { d1: 'NO', d2: 'YES', d3: 'NO' });
    expect(result.status).toBe('SUPPORTED');
    expect(result.yesCount).toBe(1);
  });

  it('marks all-No complete sections unsupported', () => {
    const result = evaluateSection(eligibility, { e1: 'NO', e2: 'NO', e3: 'NO' });
    expect(result.status).toBe('UNSUPPORTED');
    expect(result.noCount).toBe(3);
  });

  it('continues normally when each completed section has at least one Yes', () => {
    const combined = evaluateCombinedAssessment(
      evaluateSection(diagnosis, { d1: 'YES', d2: 'NO', d3: 'NO' }),
      evaluateSection(eligibility, { e1: 'NO', e2: 'YES', e3: 'NO' }),
      'NOT_REQUIRED',
      null,
    );
    expect(combined.clinicalJudgementRequired).toBe(false);
    expect(combined.canProceedToSafetyScreening).toBe(true);
  });

  it('requires diagnosis-only clinical judgement', () => {
    const combined = evaluateCombinedAssessment(
      evaluateSection(diagnosis, { d1: 'NO', d2: 'NO', d3: 'NO' }),
      evaluateSection(eligibility, { e1: 'YES', e2: 'NO', e3: 'NO' }),
      'NOT_REQUIRED',
      null,
    );
    expect(combined.clinicalJudgementReason).toBe('DIAGNOSIS_UNSUPPORTED');
    expect(combined.canProceedToSafetyScreening).toBe(false);
  });

  it('requires eligibility-only clinical judgement', () => {
    const combined = evaluateCombinedAssessment(
      evaluateSection(diagnosis, { d1: 'YES', d2: 'YES', d3: 'YES' }),
      evaluateSection(eligibility, { e1: 'NO', e2: 'NO', e3: 'NO' }),
      'NOT_REQUIRED',
      null,
    );
    expect(combined.clinicalJudgementReason).toBe('ELIGIBILITY_UNSUPPORTED');
  });

  it('requires combined clinical judgement when both sections are all No', () => {
    const combined = evaluateCombinedAssessment(
      evaluateSection(diagnosis, { d1: 'NO', d2: 'NO', d3: 'NO' }),
      evaluateSection(eligibility, { e1: 'NO', e2: 'NO', e3: 'NO' }),
      'REQUIRED',
      null,
    );
    expect(combined.clinicalJudgementReason).toBe('DIAGNOSIS_AND_ELIGIBILITY_UNSUPPORTED');
    expect(clinicalJudgementPromptCopy(combined.clinicalJudgementReason).body).toMatch(
      /diagnosis or treatment/,
    );
  });

  it('allows progression after confirmation and blocks incomplete sections', () => {
    const unsupported = evaluateCombinedAssessment(
      evaluateSection(diagnosis, { d1: 'NO', d2: 'NO', d3: 'NO' }),
      evaluateSection(eligibility, { e1: 'NO', e2: 'NO', e3: 'NO' }),
      'CONFIRMED',
      null,
    );
    expect(unsupported.canProceedToSafetyScreening).toBe(true);

    const incomplete = evaluateCombinedAssessment(
      evaluateSection(diagnosis, { d1: 'NO', d2: 'NO', d3: 'NO' }),
      evaluateSection(eligibility, { e1: 'NO', e2: null, e3: null }),
      'NOT_REQUIRED',
      null,
    );
    expect(incomplete.clinicalJudgementRequired).toBe(false);
    expect(incomplete.canProceedToSafetyScreening).toBe(false);
  });

  it('lets a safety block take priority over confirmation', () => {
    const combined = evaluateCombinedAssessment(
      evaluateSection(diagnosis, { d1: 'NO', d2: 'NO', d3: 'NO' }),
      evaluateSection(eligibility, { e1: 'NO', e2: 'NO', e3: 'NO' }),
      'CONFIRMED',
      'Mandatory referral',
    );
    expect(combined.canProceedToSafetyScreening).toBe(false);
  });

  it('requires certainty and rationale before confirm', () => {
    expect(
      isClinicalJudgementFormValid({
        workingDiagnosisDisplay: 'Acute otitis media (AOM)',
        diagnosticCertainty: null,
        rationale: '',
      }),
    ).toBe(false);
    expect(
      confirmBlockedReason({
        workingDiagnosisDisplay: 'Acute otitis media (AOM)',
        diagnosticCertainty: 'PROBABLE',
        rationale: '  ',
      }),
    ).toBe('Enter a reason for continuing.');
    expect(
      isClinicalJudgementFormValid({
        workingDiagnosisDisplay: 'Acute otitis media (AOM)',
        diagnosticCertainty: 'PROBABLE',
        rationale: 'Presentation still fits pharmacist management.',
      }),
    ).toBe(true);
  });

  it('builds approved documentation fragments', () => {
    const note = clinicalJudgementNoteFragment({
      reason: 'ELIGIBILITY_UNSUPPORTED',
      workingDiagnosis: 'Acute otitis media (AOM)',
      diagnosticCertainty: 'PROBABLE',
      rationale: 'Patient can be monitored in pharmacy.',
    });
    expect(note).toMatch(/treatment suitability/);
    expect(note).toMatch(/clinical judgement/);
    expect(NO_TREATMENT_NOTE_FRAGMENT).toMatch(/No pharmacist treatment was initiated/);
  });

  it('changes the source revision when an answer changes', () => {
    const base = {
      pathwayId: 'p1',
      pathwayVersion: '1',
      eligibilityAnswers: [{ questionId: 'e1', answer: 'NO' as const }],
    };
    const a = computeSourceAnswerRevision({
      ...base,
      diagnosisAnswers: [{ questionId: 'd1', answer: 'NO' }],
    });
    const b = computeSourceAnswerRevision({
      ...base,
      diagnosisAnswers: [{ questionId: 'd1', answer: 'YES' }],
    });
    expect(a).not.toBe(b);
  });

  it('classifies pathway question sections the same way as the assessment UI', () => {
    expect(classifyPathwayQuestionSection(null)).toBe('DIAGNOSIS_CONFIRMATION');
    expect(classifyPathwayQuestionSection('diagnosisConfirmation')).toBe(
      'DIAGNOSIS_CONFIRMATION',
    );
    expect(classifyPathwayQuestionSection('safety_screening')).toBe('TREATMENT_ELIGIBILITY');
    expect(classifyPathwayQuestionSection('additionalAssessment')).toBeNull();
  });
});

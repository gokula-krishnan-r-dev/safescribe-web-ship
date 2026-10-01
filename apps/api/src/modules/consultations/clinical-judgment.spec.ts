import {
  evaluatePrescribingReadiness,
  evaluatePrescribingReadinessDecision,
  computeSnapshotHash,
  resolveConsultationMode,
  isClinicalJudgmentMode,
  deriveCjRedFlagCheckDecision,
  mergeCjRedFlagAnswers,
  unansweredCjRedFlagQuestionIds,
  isCjRedFlagAnswer,
  normalizeCjRedFlagAnswer,
  selectRelevantCjRedFlagCandidates,
  fallbackCjRedFlagCandidates,
  scrubTechnicalIdsFromProse,
  toClinicalScreeningPhrase,
} from '@safescript/shared';

describe('Clinical Judgment domain (shared)', () => {
  it('resolves null mode as guided pathway', () => {
    expect(resolveConsultationMode(null)).toBe('GUIDED_PATHWAY');
    expect(isClinicalJudgmentMode(null)).toBe(false);
    expect(isClinicalJudgmentMode('CLINICAL_JUDGMENT')).toBe(true);
  });

  it('encodes legacy readiness decision table', () => {
    expect(evaluatePrescribingReadiness(true, false)).toBe('READY_TO_CONTINUE');
    expect(evaluatePrescribingReadiness(false, true)).toBe('DOCUMENTATION_REFERRAL');
    expect(evaluatePrescribingReadiness(true, true)).toBe('DOCUMENTATION_REFERRAL');
    expect(evaluatePrescribingReadiness(null, false)).toBe('INCOMPLETE');
  });

  it('encodes v1 prescribing readiness decision table', () => {
    expect(
      evaluatePrescribingReadinessDecision({
        assessmentSufficient: true,
        reasonCodes: [],
        nextAction: 'CONTINUE_TO_TREATMENT',
      }),
    ).toBe('CONFIRMED_READY');
    expect(
      evaluatePrescribingReadinessDecision({
        assessmentSufficient: false,
        reasonCodes: ['ADDITIONAL_HISTORY'],
        nextAction: 'OBTAIN_OR_UPDATE_INFORMATION',
        returnTarget: 'CLINICAL_IMPRESSION',
      }),
    ).toBe('NOT_READY_MORE_INFORMATION');
  });

  it('produces stable snapshot hashes for staleness detection', () => {
    const a = computeSnapshotHash({ diagnosis: 'Asthma', goal: 'reduce cough' });
    const b = computeSnapshotHash({ goal: 'reduce cough', diagnosis: 'Asthma' });
    const c = computeSnapshotHash({ diagnosis: 'Cold sore', goal: 'reduce cough' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('Clinical Judgment red-flag confirm answers', () => {
  const stored: Array<{ id: string; answer: 'NO' | null }> = [
    { id: 'q1', answer: null },
    { id: 'q2', answer: 'NO' },
    { id: 'q3', answer: null },
  ];

  it('treats unanswered questions as incomplete', () => {
    expect(
      deriveCjRedFlagCheckDecision({
        questions: stored,
        otherUnresolvedConcern: false,
      }),
    ).toBe('INCOMPLETE');
    expect(unansweredCjRedFlagQuestionIds(stored)).toEqual(['q1', 'q3']);
  });

  it('confirms from the submit payload even when autosave never persisted', () => {
    const merged = mergeCjRedFlagAnswers(stored, [
      { questionId: 'q1', answer: 'NO' },
      { questionId: 'q3', answer: 'NO' },
      { questionId: 'unknown', answer: 'YES' },
      { questionId: 'q2', answer: 'maybe' },
    ]);
    expect(merged.map((q) => q.answer)).toEqual(['NO', 'NO', 'NO']);
    expect(
      deriveCjRedFlagCheckDecision({
        questions: merged,
        otherUnresolvedConcern: false,
      }),
    ).toBe('READY_FOR_PRESCRIBING_READINESS');
  });

  it('rejects Unable to confirm as a pharmacist answer', () => {
    expect(isCjRedFlagAnswer('UNABLE_TO_CONFIRM')).toBe(false);
    expect(normalizeCjRedFlagAnswer('UNABLE_TO_CONFIRM')).toBeNull();
    expect(normalizeCjRedFlagAnswer('YES')).toBe('YES');
    expect(normalizeCjRedFlagAnswer('NO')).toBe('NO');
  });

  it('treats a legacy Unable to confirm answer as unanswered', () => {
    const merged = mergeCjRedFlagAnswers(
      [{ id: 'q1', answer: 'UNABLE_TO_CONFIRM' }],
      [],
    );
    expect(merged[0].answer).toBeNull();
    expect(
      deriveCjRedFlagCheckDecision({
        questions: merged,
        otherUnresolvedConcern: false,
      }),
    ).toBe('INCOMPLETE');
  });

  it('does not confirm a red-flag check with zero questions', () => {
    expect(
      deriveCjRedFlagCheckDecision({
        questions: [],
        otherUnresolvedConcern: false,
      }),
    ).toBe('INCOMPLETE');
  });

  it('always returns at least one red-flag candidate', () => {
    expect(selectRelevantCjRedFlagCandidates('', 12).length).toBeGreaterThan(0);
    expect(fallbackCjRedFlagCandidates([], 3).length).toBeGreaterThan(0);
    expect(
      fallbackCjRedFlagCandidates([], 3)[0].candidateId,
    ).toBe('rf_general_red_flag_triad');
  });
});

describe('Clinical note prose', () => {
  it('never keeps pathway UUIDs or screening-item wrappers', () => {
    const raw =
      'Safety screening was negative for pathway:77f96502-8a1e-4576-9fd5-343bae93e064, pathway:86af0312-71e8-44c1-8130-d77a5d3d90da, is the following present: Ocular Involvement?, and is the following present: Immunocompromised Patient?. No red flags requiring referral were identified.';
    const cleaned = scrubTechnicalIdsFromProse(raw);
    expect(cleaned).not.toMatch(/pathway:/i);
    expect(cleaned).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(cleaned).not.toMatch(/is the following present/i);
    expect(cleaned.toLowerCase()).toContain('ocular involvement');
    expect(cleaned.toLowerCase()).toContain('immunocompromised patient');
    expect(cleaned).toContain('No red flags requiring referral were identified');
  });

  it('converts screening questions into clinical phrases and drops ids', () => {
    expect(toClinicalScreeningPhrase('pathway:77f96502-8a1e-4576-9fd5-343bae93e064')).toBeNull();
    expect(toClinicalScreeningPhrase('Is the following present: Ocular Involvement?')).toBe(
      'Ocular Involvement',
    );
  });
});

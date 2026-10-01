import {
  evaluatePrescribingReadiness,
  evaluatePrescribingReadinessDecision,
  computeSnapshotHash,
  resolveConsultationMode,
  isClinicalJudgmentMode,
  isGuidedPathwayMode,
} from './clinical-judgment';

describe('clinical-judgment helpers', () => {
  describe('resolveConsultationMode', () => {
    it('treats null/legacy as GUIDED_PATHWAY', () => {
      expect(resolveConsultationMode(null)).toBe('GUIDED_PATHWAY');
      expect(resolveConsultationMode(undefined)).toBe('GUIDED_PATHWAY');
      expect(resolveConsultationMode('garbage')).toBe('GUIDED_PATHWAY');
    });

    it('passthrough known modes', () => {
      expect(resolveConsultationMode('CLINICAL_JUDGMENT')).toBe('CLINICAL_JUDGMENT');
      expect(resolveConsultationMode('DOCUMENTATION_REFERRAL')).toBe(
        'DOCUMENTATION_REFERRAL',
      );
    });
  });

  describe('mode predicates', () => {
    it('detects clinical judgment vs guided', () => {
      expect(isClinicalJudgmentMode('CLINICAL_JUDGMENT')).toBe(true);
      expect(isClinicalJudgmentMode(null)).toBe(false);
      expect(isGuidedPathwayMode(null)).toBe(true);
      expect(isGuidedPathwayMode('GUIDED_PATHWAY')).toBe(true);
    });
  });

  describe('evaluatePrescribingReadiness', () => {
    it('returns READY only for Yes + No unresolved flags', () => {
      expect(evaluatePrescribingReadiness(true, false)).toBe('READY_TO_CONTINUE');
    });

    it('routes all other answer combos to DOCUMENTATION_REFERRAL', () => {
      expect(evaluatePrescribingReadiness(false, false)).toBe('DOCUMENTATION_REFERRAL');
      expect(evaluatePrescribingReadiness(true, true)).toBe('DOCUMENTATION_REFERRAL');
      expect(evaluatePrescribingReadiness(false, true)).toBe('DOCUMENTATION_REFERRAL');
    });

    it('returns INCOMPLETE when either answer is missing', () => {
      expect(evaluatePrescribingReadiness(null, false)).toBe('INCOMPLETE');
      expect(evaluatePrescribingReadiness(true, undefined)).toBe('INCOMPLETE');
    });
  });

  describe('evaluatePrescribingReadinessDecision', () => {
    it('confirms ready for Yes', () => {
      expect(
        evaluatePrescribingReadinessDecision({
          assessmentSufficient: true,
          reasonCodes: [],
          nextAction: 'CONTINUE_TO_TREATMENT',
        }),
      ).toBe('CONFIRMED_READY');
    });

    it('requires reasons and action for No', () => {
      expect(
        evaluatePrescribingReadinessDecision({
          assessmentSufficient: false,
          reasonCodes: [],
          nextAction: 'DOCUMENT_AND_REFER',
        }),
      ).toBe('INCOMPLETE');
      expect(
        evaluatePrescribingReadinessDecision({
          assessmentSufficient: false,
          reasonCodes: ['LABORATORY_INFORMATION'],
          nextAction: 'OBTAIN_OR_UPDATE_INFORMATION',
          returnTarget: 'PATIENT_PROFILE',
        }),
      ).toBe('NOT_READY_MORE_INFORMATION');
      expect(
        evaluatePrescribingReadinessDecision({
          assessmentSufficient: false,
          reasonCodes: ['REFERRAL_REQUIRED'],
          nextAction: 'DOCUMENT_AND_REFER',
        }),
      ).toBe('NOT_READY_REFERRAL');
    });

    it('requires detail for Other', () => {
      expect(
        evaluatePrescribingReadinessDecision({
          assessmentSufficient: false,
          reasonCodes: ['OTHER'],
          nextAction: 'DOCUMENT_AND_REFER',
        }),
      ).toBe('INCOMPLETE');
      expect(
        evaluatePrescribingReadinessDecision({
          assessmentSufficient: false,
          reasonCodes: ['OTHER'],
          reasonDetail: 'Need specialist input',
          nextAction: 'DOCUMENT_AND_REFER',
        }),
      ).toBe('NOT_READY_REFERRAL');
    });
  });

  describe('computeSnapshotHash', () => {
    it('is stable for equivalent objects', () => {
      const a = computeSnapshotHash({ diagnosis: 'Asthma', certainty: 'PROBABLE' });
      const b = computeSnapshotHash({ certainty: 'PROBABLE', diagnosis: 'Asthma' });
      expect(a).toBe(b);
      expect(a.startsWith('cj_')).toBe(true);
    });

    it('changes when clinical content changes', () => {
      const a = computeSnapshotHash({ diagnosis: 'Asthma' });
      const b = computeSnapshotHash({ diagnosis: 'Cold sore' });
      expect(a).not.toBe(b);
    });
  });
});

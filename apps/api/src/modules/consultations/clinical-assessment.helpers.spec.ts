import {
  formatClinicalDate,
  formatPathwayVersionLabel,
  independentPeerReviewCopy,
  independentPeerReviewStatus,
  isIndependentReviewDocument,
} from './clinical-assessment.helpers';

describe('clinical assessment evidence helpers', () => {
  it('formats effective dates as dd-Mon-yyyy', () => {
    expect(formatClinicalDate('2026-09-01T00:00:00.000Z')).toBe('01-Sep-2026');
  });

  it('joins pathway version with the effective date', () => {
    expect(formatPathwayVersionLabel(2, '2026-09-01T00:00:00.000Z')).toBe(
      'v2 · Effective 01-Sep-2026',
    );
  });

  it('never treats internal clinical review copy as independent peer review', () => {
    expect(
      isIndependentReviewDocument({
        documentFamily: 'SafeScribe Clinical Review Committee',
        authority: 'SafeScribe',
      }),
    ).toBe(false);
  });

  it('marks independent peer review completed only when an external record exists', () => {
    expect(
      isIndependentReviewDocument({
        documentFamily: 'Independent external peer review',
        authority: 'Laura Singh, MD',
      }),
    ).toBe(true);
    expect(independentPeerReviewStatus(false)).toBe('not_completed');
    expect(independentPeerReviewStatus(true)).toBe('completed');
    expect(independentPeerReviewCopy('not_completed').badge).toBe('Not yet completed');
    expect(independentPeerReviewCopy('completed').badge).toBe('Completed');
  });
});

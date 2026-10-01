import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildSuggestedRegimenBundle,
  formatEligibility,
  formatMonitoringAndFollowUp,
  formatWhyRecommended,
  pharmacistFacingCopy,
} from './suggested-regimen';

const almotriptan = {
  strength: '12.5 mg',
  dose: '12.5 mg',
  frequency: 'QD - Once daily',
  duration: '1 day',
  route: 'Oral',
  maxDose: '25 mg',
  instructions:
    'Take 1 tablet at migraine onset; may repeat after at least 2 hours. Maximum 25 mg in 24 hours.',
  recommendationLevel: 'FIRST_LINE',
  clinicalIndication: 'Acute treatment of migraine with or without aura.',
  followUpAdvice:
    'Reassess if attacks remain uncontrolled, treatment is repeatedly ineffective, or triptan use approaches 10 days per month.',
};

describe('suggested regimen presentation', () => {
  it('renders the almotriptan collapsed and expanded text from one object', () => {
    const bundle = buildSuggestedRegimenBundle(almotriptan);
    assert.equal(bundle.status, 'READY');
    assert.equal(
      bundle.presentation.summaryPrimary,
      '12.5 mg at migraine onset · May repeat after at least 2 hours',
    );
    assert.equal(bundle.presentation.summarySecondary, 'Maximum 25 mg in 24 hours');
    assert.equal(
      bundle.presentation.expandedText,
      '12.5 mg at migraine onset. If needed, the dose may be repeated after at least 2 hours. Maximum 25 mg in 24 hours.',
    );
    assert.doesNotMatch(bundle.presentation.summaryPrimary, /once daily/i);
    assert.doesNotMatch(bundle.presentation.expandedText, /once daily/i);
    assert.doesNotMatch(bundle.presentation.summaryPrimary, /up to 1 day/i);
    assert.doesNotMatch(bundle.presentation.expandedText, /up to 1 day/i);
    assert.equal(
      bundle.fingerprint,
      JSON.stringify(bundle.structured),
    );
  });

  it('updates summary and expanded text together when repeat or maximum changes', () => {
    const next = buildSuggestedRegimenBundle({
      ...almotriptan,
      instructions:
        '12.5 mg at migraine onset. May repeat after at least 4 hours. Maximum 25 mg in 24 hours.',
    });
    assert.match(next.presentation.summaryPrimary, /4 hours/);
    assert.match(next.presentation.expandedText, /4 hours/);
    const max = buildSuggestedRegimenBundle({
      ...almotriptan,
      instructions:
        '12.5 mg at migraine onset. May repeat after at least 2 hours. Maximum 37.5 mg in 24 hours.',
    });
    assert.equal(max.presentation.summarySecondary, 'Maximum 37.5 mg in 24 hours');
    assert.match(max.presentation.expandedText, /37\.5 mg/);
  });

  it('does not invent once-daily timing when frequency is missing', () => {
    const bundle = buildSuggestedRegimenBundle({
      strength: '500 mg',
      dose: '500 mg',
    });
    assert.equal(bundle.status, 'REVIEW_REQUIRED');
    assert.equal(bundle.presentation.expandedText, 'Regimen requires review');
    assert.doesNotMatch(bundle.presentation.summaryPrimary, /once daily/i);
  });

  it('formats why recommended, eligibility, and monitoring without enum codes', () => {
    assert.equal(
      formatWhyRecommended(almotriptan),
      'First-line pathway option for this presentation.',
    );
    assert.equal(
      formatEligibility(almotriptan),
      'Acute treatment of migraine with or without aura.',
    );
    assert.match(formatMonitoringAndFollowUp(almotriptan), /10 days per month/);
    assert.doesNotMatch(formatWhyRecommended(almotriptan), /FIRST_LINE/);
  });

  it('hides workbook filenames and Yes/No flags from pharmacist copy', () => {
    assert.equal(pharmacistFacingCopy('renal-rules.xlsx · baseline fallback'), '');
    assert.equal(pharmacistFacingCopy('No'), '');
    assert.equal(
      pharmacistFacingCopy('Reassess if attacks remain uncontrolled.'),
      'Reassess if attacks remain uncontrolled.',
    );
    assert.equal(
      formatMonitoringAndFollowUp({
        monitoring: 'No',
        followUpAdvice: 'renal-rules.xlsx · baseline fallback',
      }),
      '',
    );
  });
});

const famciclovir = {
  strength: '500 mg',
  dose: '3',
  doseAmount: '3',
  doseUnit: 'Tablet(s)',
  frequency: 'ONCE - One time only',
  duration: '1 day',
  route: 'Oral',
  productForm: 'Tablet',
  regimenLines: [
    {
      doseFrom: '3',
      doseTo: null,
      form: 'Tablet(s)',
      frequency: 'ONCE - One time only',
      prn: false,
    },
  ],
};

describe('administered dose versus product strength', () => {
  it('renders FAMVIR 3 tablets once as 1,500 mg, never 500 mg single dose', () => {
    const bundle = buildSuggestedRegimenBundle(famciclovir);
    assert.equal(bundle.status, 'READY');
    assert.equal(
      bundle.presentation.summaryPrimary,
      '3 tablets (1,500 mg) by mouth once',
    );
    assert.doesNotMatch(bundle.presentation.summaryPrimary, /500 mg single dose/i);
    assert.doesNotMatch(bundle.presentation.summaryPrimary, /single dose/i);
    assert.doesNotMatch(bundle.presentation.summaryPrimary, /up to 1 day/i);
    assert.equal(bundle.structured.administeredDoseStatus, 'CALCULATED');
    assert.equal(bundle.structured.administeredDoseMinimum, 1500);
  });

  it('uses committed tablet quantity after save, not leftover dose strength text', () => {
    const bundle = buildSuggestedRegimenBundle({
      ...famciclovir,
      dose: '500 mg',
      frequency: 'single dose',
    });
    assert.equal(
      bundle.presentation.summaryPrimary,
      '3 tablets (1,500 mg) by mouth once',
    );
  });

  it('does not label product strength as the dose when quantity is missing', () => {
    const bundle = buildSuggestedRegimenBundle({
      strength: '500 mg',
      frequency: 'single dose',
      route: 'Oral',
    });
    assert.equal(bundle.status, 'REVIEW_REQUIRED');
    assert.equal(bundle.presentation.summaryPrimary, '');
    assert.doesNotMatch(bundle.presentation.expandedText, /500 mg/);
    assert.equal(bundle.issues.some((issue) => issue.code === 'MISSING_QUANTITY'), true);
  });

  it('does not default missing quantity to 1 tablet or missing route to oral', () => {
    const bundle = buildSuggestedRegimenBundle({
      doseAmount: '3',
      doseUnit: 'Tablet(s)',
      frequency: 'ONCE - One time only',
    });
    assert.equal(bundle.presentation.summaryPrimary, '3 tablets once');
    assert.doesNotMatch(bundle.presentation.summaryPrimary, /by mouth/);
  });
});

describe('compact banner format matrix', () => {
  it('formats a single-tablet oral dose with calculated mass', () => {
    const bundle = buildSuggestedRegimenBundle({
      strength: '12.5 mg',
      doseAmount: '1',
      doseUnit: 'Tablet(s)',
      frequency: 'QD - Once daily',
      route: 'Oral',
    });
    assert.equal(
      bundle.presentation.summaryPrimary,
      '1 tablet (12.5 mg) by mouth once daily',
    );
  });

  it('preserves a tablet range without choosing one endpoint', () => {
    const bundle = buildSuggestedRegimenBundle({
      strength: '50 mg',
      doseAmount: '1',
      doseUnit: 'Tablet(s)',
      frequency: 'Q4-6H - Every 4 to 6 hours',
      route: 'Oral',
      prn: true,
      regimenLines: [
        {
          doseFrom: '1',
          doseTo: '2',
          form: 'Tablet(s)',
          frequency: 'Q4-6H - Every 4 to 6 hours',
          prn: true,
        },
      ],
    });
    assert.equal(
      bundle.presentation.summaryPrimary,
      '1–2 tablets by mouth every 4–6 hours as needed',
    );
  });

  it('calculates liquid concentration totals when denominator and volume match', () => {
    const bundle = buildSuggestedRegimenBundle({
      strength: '250 mg / 5 mL',
      doseAmount: '10',
      doseUnit: 'mL',
      frequency: 'QD - Once daily',
      route: 'Oral',
    });
    assert.equal(
      bundle.presentation.summaryPrimary,
      '10 mL (500 mg) by mouth once daily',
    );
  });

  it('does not invent a total when the concentration denominator is missing', () => {
    const bundle = buildSuggestedRegimenBundle({
      strength: '250 mg',
      doseAmount: '10',
      doseUnit: 'mL',
      frequency: 'QD - Once daily',
      route: 'Oral',
    });
    assert.equal(bundle.presentation.summaryPrimary, '10 mL by mouth once daily');
    assert.equal(bundle.structured.administeredDoseStatus, 'NOT_CALCULABLE');
  });

  it('does not sum combination-product ingredient strengths', () => {
    const bundle = buildSuggestedRegimenBundle({
      strength: '5 mg / 500 mg',
      doseAmount: '1',
      doseUnit: 'Tablet(s)',
      frequency: 'QD - Once daily',
      route: 'Oral',
    });
    assert.equal(
      bundle.presentation.summaryPrimary,
      '1 tablet by mouth once daily',
    );
    assert.doesNotMatch(bundle.presentation.summaryPrimary, /505 mg|5 mg \/ 500 mg/);
  });

  it('formats qualitative topical instructions without using concentration as dose', () => {
    const bundle = buildSuggestedRegimenBundle({
      strength: '0.1%',
      dose: 'Apply a thin layer',
      frequency: 'QD - Once daily',
      route: 'Topical',
    });
    assert.equal(
      bundle.presentation.summaryPrimary,
      'Apply a thin layer topically once daily',
    );
    assert.doesNotMatch(bundle.presentation.summaryPrimary, /0\.1%/);
  });

  it('formats nasal, ophthalmic, inhaled, and injected regimens with derived verbs', () => {
    assert.equal(
      buildSuggestedRegimenBundle({
        doseAmount: '1',
        doseUnit: 'Spray',
        frequency: 'QD - Once daily',
        route: 'Nasal',
      }).presentation.summaryPrimary,
      '1 spray nasally once daily',
    );
    assert.equal(
      buildSuggestedRegimenBundle({
        doseAmount: '1',
        doseUnit: 'Drop',
        frequency: 'BID - Two times daily',
        route: 'Ophthalmic',
      }).presentation.summaryPrimary,
      'Instill 1 drop into the eye twice daily',
    );
    assert.equal(
      buildSuggestedRegimenBundle({
        doseAmount: '3',
        doseUnit: 'Drop',
        frequency: 'BID - Two times daily',
        route: 'Otic',
      }).presentation.summaryPrimary,
      'Instill 3 drops into the ear twice daily',
    );
    assert.equal(
      buildSuggestedRegimenBundle({
        doseAmount: '2',
        doseUnit: 'Puff',
        frequency: 'BID - Two times daily',
        route: 'Inhalation',
      }).presentation.summaryPrimary,
      'Inhale 2 puffs twice daily',
    );
    assert.equal(
      buildSuggestedRegimenBundle({
        strength: '100 mg/mL',
        doseAmount: '0.5',
        doseUnit: 'mL',
        frequency: '1x/week - Once a week',
        route: 'Subcutaneous',
      }).presentation.summaryPrimary,
      'Inject 0.5 mL (50 mg) once weekly',
    );
  });

  it('marks unresolved weight-based dosing for review', () => {
    const bundle = buildSuggestedRegimenBundle({
      dose: '10 mg/kg',
      frequency: 'Q8H - Every 8 hours',
      route: 'Oral',
      instructions: '10 mg/kg per dose',
    });
    assert.equal(bundle.status, 'REVIEW_REQUIRED');
    assert.equal(
      bundle.presentation.expandedText,
      'Weight-based regimen requires review',
    );
  });

  it('keeps a resolved weight-based absolute dose', () => {
    const bundle = buildSuggestedRegimenBundle({
      dose: '250 mg',
      frequency: 'Q8H - Every 8 hours',
      route: 'Oral',
      instructions: 'Calculated from 10 mg/kg per dose',
    });
    assert.equal(
      bundle.presentation.summaryPrimary,
      '250 mg by mouth every 8 hours',
    );
  });

  it('formats a non-drug supportive action without inventing tablet fields', () => {
    const bundle = buildSuggestedRegimenBundle({
      dose: 'Apply a cool compress',
      frequency: 'as needed',
      prn: true,
    });
    assert.equal(bundle.presentation.summaryPrimary, 'Apply a cool compress as needed');
    assert.doesNotMatch(bundle.presentation.summaryPrimary, /tablet|by mouth|once daily/i);
  });

  it('summarizes a two-stage schedule without truncating a stage', () => {
    const bundle = buildSuggestedRegimenBundle({
      route: 'Oral',
      regimenLines: [
        {
          doseFrom: '2',
          form: 'Tablet(s)',
          frequency: 'BID - Two times daily',
          durationValue: '1',
          durationUnit: 'DAY',
        },
        {
          doseFrom: '1',
          form: 'Tablet(s)',
          frequency: 'BID - Two times daily',
        },
      ],
    });
    assert.match(bundle.presentation.summaryPrimary, /2 tablets/);
    assert.match(bundle.presentation.summaryPrimary, /then/);
    assert.match(bundle.presentation.summaryPrimary, /1 tablet/);
    assert.equal(bundle.presentation.summarySecondary, null);
  });

  it('does not repeat a taper duration under the collapsed directions', () => {
    const bundle = buildSuggestedRegimenBundle({
      route: 'Oral',
      duration: '5 days',
      regimenLines: [
        {
          doseFrom: '6',
          form: 'Tablet(s)',
          frequency: 'QD - Once daily',
          durationValue: '5',
          durationUnit: 'DAY',
        },
        {
          doseFrom: '3',
          form: 'Tablet(s)',
          frequency: 'QD - Once daily',
          durationValue: '4',
          durationUnit: 'DAY',
        },
      ],
    });
    assert.match(bundle.presentation.summaryPrimary, /for 5 days/i);
    assert.match(bundle.presentation.summaryPrimary, /then/i);
    assert.match(bundle.presentation.summaryPrimary, /for 4 days/i);
    assert.notEqual(bundle.presentation.summarySecondary, '5 days');
    assert.equal(bundle.presentation.summarySecondary, null);
  });
});


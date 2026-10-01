import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addAdjunctSelection,
  toggleAdjunctSelection,
  blocksUnsavedTreatmentSwitch,
  confirmTreatmentPlanBlockedReason,
  hasClinicalOverride,
  optionKey,
  MAX_RECOMMENDED_TREATMENTS,
  mergeTreatmentOptionLists,
  nextExpandedTreatmentOptionId,
  nextSelectedTreatmentForReview,
  presentTreatmentOptions,
  replacePrimarySelection,
  togglePrimarySelection,
  resolveSafetyTier,
  resolveWhyShown,
  toOptionView,
  type TreatmentOptionView,
} from './treatment-options-model';
import type { TreatmentRecommendation } from './types';

function rx(partial: Partial<TreatmentRecommendation>): TreatmentRecommendation {
  return {
    priority: 1,
    medicationName: 'MAXALT (rizatriptan 10 mg)',
    genericName: 'rizatriptan',
    confidence: 80,
    ...partial,
  } as TreatmentRecommendation;
}

describe('mergeTreatmentOptionLists', () => {
  it('overlays current safety onto pharmacist-edited Maxalt and drops a stale ondansetron allergy', () => {
    const saved = [
      rx({
        pathwayTreatmentId: 'maxalt-1',
        doseAmount: '1',
        doseUnit: 'Tablet(s)',
        instructions: 'Take 1 tablet by mouth once daily for up to 1 day.',
        allergyBlocked: true,
        allergyWarning: {
          patientAllergy: '',
          prescribedDrug: 'MAXALT (rizatriptan 10 mg)',
          reason: 'Ondansetron has matched pregnancy.',
        },
      }),
    ];
    const incoming = [
      rx({
        pathwayTreatmentId: 'maxalt-1',
        allergyBlocked: false,
        pregnancyWarning: {
          active: true,
          message: 'rizatriptan has matched a confirmed pregnancy.',
        },
        safetyTier: 'CAUTION',
      }),
    ];
    const merged = mergeTreatmentOptionLists(saved, incoming);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.doseUnit, 'Tablet(s)');
    assert.equal(merged[0]?.instructions, saved[0]?.instructions);
    assert.equal(merged[0]?.allergyBlocked, false);
    assert.equal(merged[0]?.allergyWarning, undefined);
    assert.match(merged[0]?.pregnancyWarning?.message ?? '', /rizatriptan/i);
  });
});

describe('hasClinicalOverride', () => {
  it('does not keep an ALLERGY override after the allergy finding was removed', () => {
    assert.equal(
      hasClinicalOverride(
        rx({
          clinicalOverride: {
            overriddenAt: '2026-08-29T00:00:00.000Z',
            acknowledgedRisk: true,
            reason: 'Proceed',
            source: 'ALLERGY',
          },
        }),
      ),
      false,
    );
  });
});

describe('resolveSafetyTier', () => {
  it('does not treat a pregnancy-as-allergy AVOID tier as Avoid', () => {
    const tier = resolveSafetyTier(
      rx({
        safetyTier: 'AVOID',
        allergyBlocked: true,
        allergyWarning: {
          patientAllergy: '',
          prescribedDrug: 'MAXALT',
          reason: 'Ondansetron has matched pregnancy.',
        },
        pregnancyWarning: {
          active: true,
          message: 'rizatriptan has matched a confirmed pregnancy.',
        },
      }),
    );
    assert.equal(tier, 'CAUTION');
  });
});

describe('presentTreatmentOptions', () => {
  function views(
    rows: Array<Partial<TreatmentRecommendation> & { medicationName: string }>,
  ) {
    return rows.map((row, i) =>
      toOptionView(
        rx({
          priority: i + 1,
          recommendationLevel: 'FIRST_LINE',
          category: 'PRESCRIPTION',
          genericName: row.genericName,
          ...row,
        }),
        i,
      ),
    );
  }

  it('renders zero to three recommended options and never fills with excluded rows', () => {
    const empty = presentTreatmentOptions([]);
    assert.equal(empty.counts.recommended, 0);

    const one = presentTreatmentOptions(
      views([{ medicationName: 'ZOMIG', recommendationLevel: 'FIRST_LINE' }]),
    );
    assert.equal(one.recommended.length, 1);
    assert.equal(one.recommended[0]?.displayName, 'ZOMIG');

    const fourPreferred = presentTreatmentOptions(
      views([
        { medicationName: 'A', recommendationLevel: 'FIRST_LINE' },
        { medicationName: 'B', recommendationLevel: 'FIRST_LINE' },
        { medicationName: 'C', recommendationLevel: 'FIRST_LINE' },
        { medicationName: 'D', recommendationLevel: 'FIRST_LINE' },
      ]),
    );
    assert.equal(fourPreferred.recommended.length, MAX_RECOMMENDED_TREATMENTS);
    assert.equal(fourPreferred.otherSuitable.length, 1);
    assert.equal(fourPreferred.otherSuitable[0]?.displayName, 'D');
    assert.deepEqual(
      fourPreferred.recommended.map((o) => o.displayName),
      ['A', 'B', 'C'],
    );
  });

  it('keeps presentationOrder and never promotes Avoid into Recommended', () => {
    const grouped = presentTreatmentOptions(
      views([
        {
          medicationName: 'AVOID-ME',
          allergyBlocked: true,
          allergyWarning: { patientAllergy: 'sulfa', prescribedDrug: 'AVOID-ME', reason: 'sulfa allergy' },
        },
        { medicationName: 'ZOMIG', recommendationLevel: 'FIRST_LINE' },
        {
          medicationName: 'CAMBIA',
          recommendationLevel: 'ALTERNATIVE',
        },
      ]),
    );
    assert.equal(grouped.recommended.length, 2);
    assert.deepEqual(
      grouped.recommended.map((o) => o.displayName),
      ['ZOMIG', 'CAMBIA'],
    );
    assert.ok(grouped.excluded.some((o) => o.displayName === 'AVOID-ME'));
    assert.ok(!grouped.recommended.some((o) => /allerg/i.test(o.displayName)));
  });

  it('places adjuncts in Add-on and extra primaries in Other suitable', () => {
    const grouped = presentTreatmentOptions(
      views([
        { medicationName: 'ZOMIG', recommendationLevel: 'FIRST_LINE' },
        { medicationName: 'ONDANSETRON', recommendationLevel: 'ADJUNCTIVE' },
        { medicationName: 'UBRELVY', recommendationLevel: 'ALTERNATIVE' },
        { medicationName: 'NARATRIPTAN', recommendationLevel: 'SECOND_LINE' },
        { medicationName: 'FROVA', recommendationLevel: 'ALTERNATIVE' },
      ]),
    );
    assert.deepEqual(
      grouped.recommended.map((o) => o.displayName),
      ['ZOMIG', 'UBRELVY', 'NARATRIPTAN'],
    );
    assert.equal(grouped.addOn.length, 1);
    assert.equal(grouped.addOn[0]?.displayName, 'ONDANSETRON');
    assert.equal(grouped.otherSuitable[0]?.displayName, 'FROVA');
  });

  it('keeps OTC and supplements in Add-on and omits non-drug measures', () => {
    const grouped = presentTreatmentOptions(
      views([
        { medicationName: 'ZOMIG', recommendationLevel: 'FIRST_LINE' },
        { medicationName: 'IBUPROFEN', category: 'OTC' },
        { medicationName: 'MAGNESIUM', category: 'SUPPLEMENT' },
        { medicationName: 'COLD COMPRESS', category: 'NON_DRUG' },
      ]),
    );
    assert.equal(grouped.recommended[0]?.displayName, 'ZOMIG');
    assert.deepEqual(
      grouped.addOn.map((o) => o.displayName),
      ['IBUPROFEN', 'MAGNESIUM'],
    );
  });
});

describe('treatment selection helpers', () => {
  it('replaces the primary treatment without dropping add-ons', () => {
    const options = [
      toOptionView(rx({ medicationName: 'ZOMIG', recommendationLevel: 'FIRST_LINE' }), 0),
      toOptionView(
        rx({ medicationName: 'CAMBIA', recommendationLevel: 'ALTERNATIVE' }),
        1,
      ),
      toOptionView(
        rx({ medicationName: 'ONDANSETRON', recommendationLevel: 'ADJUNCTIVE' }),
        2,
      ),
    ];
    const next = replacePrimarySelection(options, [0, 2], options[1]!);
    assert.deepEqual(next, [1, 2]);
  });

  it('adds an adjunct without replacing the primary', () => {
    const adjunct = toOptionView(
      rx({ medicationName: 'ONDANSETRON', recommendationLevel: 'ADJUNCTIVE' }),
      2,
    );
    assert.deepEqual(addAdjunctSelection([0], adjunct), [0, 2]);
  });

  it('toggles an add-on off without dropping the primary', () => {
    const adjunct = toOptionView(
      rx({ medicationName: 'IBUPROFEN', recommendationLevel: 'ADJUNCTIVE' }),
      2,
    );
    assert.deepEqual(toggleAdjunctSelection([0, 2], adjunct), [0]);
    assert.deepEqual(toggleAdjunctSelection([0], adjunct), [0, 2]);
  });

  it('toggles additional primary treatments without replacing the current selection', () => {
    const options = [
      toOptionView(rx({ medicationName: 'VALACYCLOVIR', recommendationLevel: 'FIRST_LINE' }), 0),
      toOptionView(
        rx({ medicationName: 'ACYCLOVIR 5% TOPICAL', recommendationLevel: 'FIRST_LINE' }),
        1,
      ),
      toOptionView(
        rx({ medicationName: 'ONDANSETRON', recommendationLevel: 'ADJUNCTIVE' }),
        2,
      ),
    ];
    const added = togglePrimarySelection([0, 2], options[1]!);
    assert.deepEqual(added, [0, 1, 2]);
    assert.deepEqual(togglePrimarySelection(added, options[0]!), [1, 2]);
  });

  it('toggles a single details panel without implying selection', () => {
    assert.equal(nextExpandedTreatmentOptionId(null, 'zomig'), 'zomig');
    assert.equal(nextExpandedTreatmentOptionId('zomig', 'cambia'), 'cambia');
    assert.equal(nextExpandedTreatmentOptionId('cambia', 'cambia'), null);
  });
});

describe('confirmTreatmentPlanBlockedReason', () => {
  const baseOption = {
    index: 0,
    displayName: 'Valtrex',
    selectable: true,
    treatmentType: 'PRESCRIPTION' as const,
    treatment: {
      dose: '1 g',
      frequency: 'BID',
      medicationName: 'Valtrex',
      treatmentKind: 'DRUG',
      drugId: 'drug-1',
    },
  } as unknown as TreatmentOptionView;

  it('blocks while a prescription editor is open even if fields look complete', () => {
    assert.match(
      confirmTreatmentPlanBlockedReason({
        savingKey: null,
        editingKey: 'drug-1',
        dirtyKeys: new Set(),
        selectedOptions: [baseOption],
        savedTreatmentKeys: new Set(),
      }) ?? '',
      /Save or cancel/,
    );
  });

  it('blocks until Save treatment has recorded the selection', () => {
    assert.match(
      confirmTreatmentPlanBlockedReason({
        savingKey: null,
        editingKey: null,
        dirtyKeys: new Set(),
        selectedOptions: [baseOption],
        savedTreatmentKeys: new Set(),
      }) ?? '',
      /Save treatment for Valtrex/,
    );
    assert.equal(
      confirmTreatmentPlanBlockedReason({
        savingKey: null,
        editingKey: null,
        dirtyKeys: new Set(),
        selectedOptions: [baseOption],
        savedTreatmentKeys: new Set([optionKey(baseOption)]),
      }),
      null,
    );
  });
});

describe('blocksUnsavedTreatmentSwitch', () => {
  it('never blocks Details — expanding another card is view-only', () => {
    assert.equal(
      blocksUnsavedTreatmentSwitch({
        action: 'details',
        editingKey: 'a',
        targetKey: 'b',
        dirtyKeys: new Set(['a']),
      }),
      false,
    );
  });

  it('blocks editing another treatment when the current editor is dirty', () => {
    assert.equal(
      blocksUnsavedTreatmentSwitch({
        action: 'edit',
        editingKey: 'a',
        targetKey: 'b',
        dirtyKeys: new Set(['a']),
      }),
      true,
    );
    assert.equal(
      blocksUnsavedTreatmentSwitch({
        action: 'edit',
        editingKey: 'a',
        targetKey: 'b',
        dirtyKeys: new Set(),
      }),
      false,
    );
    assert.equal(
      blocksUnsavedTreatmentSwitch({
        action: 'select-other',
        editingKey: 'a',
        targetKey: 'b',
        dirtyKeys: new Set(['a']),
      }),
      true,
    );
  });

  it('does not block the same treatment or when nothing is being edited', () => {
    assert.equal(
      blocksUnsavedTreatmentSwitch({
        action: 'edit',
        editingKey: 'a',
        targetKey: 'a',
        dirtyKeys: new Set(['a']),
      }),
      false,
    );
    assert.equal(
      blocksUnsavedTreatmentSwitch({
        action: 'select-other',
        editingKey: null,
        targetKey: 'b',
        dirtyKeys: new Set(['a']),
      }),
      false,
    );
  });
});

describe('nextSelectedTreatmentForReview', () => {
  const options = [
    { index: 0, displayName: 'Valtrex' },
    { index: 1, displayName: 'Ibuprofen' },
    { index: 2, displayName: 'Vitamin D' },
  ] as unknown as TreatmentOptionView[];

  it('advances through selected treatments in on-screen order', () => {
    const next = nextSelectedTreatmentForReview(options, [0, 2], 0);
    assert.equal(next?.index, 2);
    assert.equal(nextSelectedTreatmentForReview(options, [0, 2], 2), undefined);
  });

  it('skips treatments that are not selected', () => {
    assert.equal(nextSelectedTreatmentForReview(options, [2], 2), undefined);
    assert.equal(nextSelectedTreatmentForReview(options, [1, 2], 1)?.index, 2);
  });
});

describe('resolveWhyShown', () => {
  it('uses pathway-preferred copy for first-line preferred options', () => {
    assert.equal(
      resolveWhyShown(rx({ recommendationLevel: 'FIRST_LINE' }), 'PRIMARY', 'PREFERRED'),
      'pathway-preferred option',
    );
  });
});

describe('toOptionView expanded details', () => {
  const almotriptan = toOptionView(
    rx({
      medicationName: 'ALMOTRIPTAN',
      genericName: 'almotriptan (almotriptan malate)',
      brandName: 'ALMOTRIPTAN',
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
      eligibility: 'Acute treatment of migraine with or without aura.',
      followUpAdvice:
        'Reassess if attacks remain uncontrolled, treatment is repeatedly ineffective, or triptan use approaches 10 days per month.',
    }),
    0,
  );

  it('renders collapsed summary and expanded Suggested regimen from one fingerprint', () => {
    assert.equal(almotriptan.regimen.status, 'READY');
    assert.equal(
      almotriptan.regimen.presentation.summaryPrimary,
      '12.5 mg at migraine onset · May repeat after at least 2 hours',
    );
    assert.equal(
      almotriptan.regimen.presentation.summarySecondary,
      'Maximum 25 mg in 24 hours',
    );
    assert.equal(
      almotriptan.regimen.presentation.expandedText,
      '12.5 mg at migraine onset. If needed, the dose may be repeated after at least 2 hours. Maximum 25 mg in 24 hours.',
    );
    assert.equal(
      almotriptan.regimenSummary,
      '12.5 mg at migraine onset · May repeat after at least 2 hours · Maximum 25 mg in 24 hours',
    );
    assert.equal(
      almotriptan.regimen.fingerprint,
      JSON.stringify(almotriptan.regimen.structured),
    );
    assert.doesNotMatch(almotriptan.regimenSummary, /once daily/i);
    assert.doesNotMatch(almotriptan.regimen.presentation.expandedText, /once daily/i);
    assert.doesNotMatch(almotriptan.regimenSummary, /up to 1 day/i);
  });

  it('renders FAMVIR 3 tablets once as the administered dose, not product strength', () => {
    const famvir = toOptionView(
      rx({
        medicationName: 'FAMVIR (famciclovir 500 mg)',
        genericName: 'famciclovir',
        brandName: 'FAMVIR',
        strength: '500 mg',
        dose: '3',
        doseAmount: '3',
        doseUnit: 'Tablet(s)',
        frequency: 'ONCE - One time only',
        duration: '1 day',
        route: 'Oral',
        regimenLines: [
          {
            clientId: 'line-1',
            sequence: 1,
            doseFrom: '3',
            doseTo: null,
            form: 'Tablet(s)',
            frequency: 'ONCE - One time only',
            prn: false,
            durationValue: '1',
            durationUnit: 'DAY',
          },
        ],
      }),
      0,
    );
    assert.equal(famvir.regimen.status, 'READY');
    assert.equal(
      famvir.regimen.presentation.summaryPrimary,
      '3 tablets (1,500 mg) by mouth once',
    );
    assert.doesNotMatch(famvir.regimen.presentation.summaryPrimary, /500 mg single dose/i);
    assert.equal(famvir.whyShown, 'pathway-preferred option');
  });

  it('formats Why recommended, Eligibility, and Monitoring without identity or enum codes', () => {
    assert.equal(
      almotriptan.whyRecommended,
      'First-line pathway option for this presentation.',
    );
    assert.equal(
      almotriptan.eligibility,
      'Acute treatment of migraine with or without aura.',
    );
    assert.match(almotriptan.monitoringAndFollowUp, /10 days per month/);
    const panelText = [
      almotriptan.whyRecommended,
      almotriptan.regimen.presentation.expandedText,
      almotriptan.eligibility,
      almotriptan.monitoringAndFollowUp,
    ].join('\n');
    assert.doesNotMatch(panelText, /FIRST_LINE/);
    assert.doesNotMatch(panelText, /ALMOTRIPTAN/);
    assert.doesNotMatch(panelText, /almotriptan malate/i);
  });

  it('does not expose Excel workbooks or Yes/No monitoring flags in Details copy', () => {
    const option = toOptionView(
      rx({
        medicationName: 'ACYCLOVIR',
        recommendationLevel: 'ALTERNATIVE',
        monitoring: 'No',
        followUpAdvice: 'renal-rules.xlsx · baseline fallback',
        renalWarning: {
          active: true,
          message:
            "The patient's renal function is in the 10 to below 30 mL/min range. Adjust oral acyclovir dosing and monitor neurotoxicity risk.",
          safetySource: {
            findingType: 'renal_band',
            engineType: 'Renal eGFR / CrCl band',
            workbook: 'renal-rules.xlsx · baseline fallback',
            origin: 'baseline_engine',
          },
        },
        safetySources: [
          {
            findingType: 'renal_band',
            engineType: 'Renal eGFR / CrCl band',
            workbook: 'renal-rules.xlsx · baseline fallback',
            origin: 'baseline_engine',
          },
        ],
        safetyTier: 'REVIEW_REQUIRED',
      }),
      0,
    );
    const panelText = [
      option.whyRecommended,
      option.regimen.presentation.expandedText,
      option.eligibility,
      option.monitoringAndFollowUp,
    ].join('\n');
    assert.doesNotMatch(panelText, /\.xlsx/i);
    assert.doesNotMatch(panelText, /baseline fallback/i);
    assert.doesNotMatch(panelText, /renal-rules/i);
    assert.notEqual(option.monitoringAndFollowUp, 'No');
    assert.equal(option.monitoringAndFollowUp, '');
    assert.match(option.whyRecommended, /renal function/i);
  });
});

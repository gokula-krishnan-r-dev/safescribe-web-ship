import {
  allergyWarningIsValidPatientAllergy,
  overlaySafetyOntoSavedTreatments,
  overlayTreatmentSafety,
  patientHasRecordedAllergies,
  ruleCodeTargetsDifferentIngredient,
  sanitizeTreatmentSafety,
} from '@safescript/shared';
import { findingsApplyToProduct } from '@/modules/medication-safety/utils/drug-name.util';

describe('treatment safety sanitizer (MX-01 / MX-12)', () => {
  it('does not treat NKDA / empty allergy lists as recorded allergies', () => {
    expect(patientHasRecordedAllergies({ allergies: 'NKDA', allergiesNone: true })).toBe(false);
    expect(patientHasRecordedAllergies({ allergies: 'No known allergies' })).toBe(false);
    expect(patientHasRecordedAllergies({ allergies: '', allergyEntries: [] })).toBe(false);
    expect(
      patientHasRecordedAllergies({
        allergyEntries: [{ drug: 'oseltamivir' }],
      }),
    ).toBe(true);
  });

  it('does not associate an ondansetron pregnancy rule with Maxalt (MX-01)', () => {
    expect(
      ruleCodeTargetsDifferentIngredient(
        'SS-PREG-ONDANSETRON-PREGNANCY-NOT-RECOMMENDED-WITHOUT-REVIEW',
        'MAXALT (rizatriptan 10 mg)',
        'rizatriptan',
      ),
    ).toBe(true);
    expect(
      ruleCodeTargetsDifferentIngredient(
        'SS-PREG-RIZATRIPTAN-TRIPTAN-PREGNANCY-REVIEW',
        'MAXALT (rizatriptan 10 mg)',
        'rizatriptan',
      ),
    ).toBe(false);
    expect(
      findingsApplyToProduct('Ondansetron 8 mg', 'MAXALT (rizatriptan 10 mg)', 'rizatriptan'),
    ).toBe(false);
    expect(
      findingsApplyToProduct('MAXALT (rizatriptan 10 mg)', 'MAXALT (rizatriptan 10 mg)', 'rizatriptan'),
    ).toBe(true);
  });

  it('drops a persisted pregnancy finding that was stored as Allergy on Maxalt', () => {
    const poisoned = sanitizeTreatmentSafety(
      {
        medicationName: 'MAXALT (rizatriptan 10 mg)',
        genericName: 'rizatriptan',
        allergyBlocked: true,
        allergyWarning: {
          patientAllergy: '',
          prescribedDrug: 'MAXALT (rizatriptan 10 mg)',
          reason:
            'Ondansetron has matched pregnancy. Health Canada notes that use during pregnancy is not recommended because safety has not been established; review indication, prior options, gestational timing, dose, cardiac risk, and alternatives.',
          severity: 'HIGH',
        },
        safetyTier: 'AVOID',
        safetyReviewItems: [
          {
            findingId: 'allergy',
            issueKey: 'allergy:ondansetron',
            safetyDomain: 'allergy',
            presentationKind: 'SIGNIFICANT_RISK',
            severity: 'HIGH',
            title: 'Allergy',
            summary:
              'Ondansetron has matched pregnancy. Health Canada notes that use during pregnancy is not recommended.',
            requiresAcknowledgement: true,
            requiresRationale: true,
            ruleCode: 'SS-PREG-ONDANSETRON-PREGNANCY-NOT-RECOMMENDED-WITHOUT-REVIEW',
          },
          {
            findingId: 'pregnancy',
            issueKey: 'pregnancy',
            safetyDomain: 'pregnancy',
            presentationKind: 'ROUTINE_CAUTION',
            severity: 'MODERATE',
            title: 'Pregnancy',
            summary: 'rizatriptan has matched a confirmed pregnancy. Review maternal indication.',
            requiresAcknowledgement: true,
            requiresRationale: false,
            ruleCode: 'SS-PREG-RIZATRIPTAN-TRIPTAN-PREGNANCY-REVIEW',
          },
        ],
        pregnancyWarning: {
          active: true,
          message: 'rizatriptan has matched a confirmed pregnancy. Review maternal indication.',
        },
        clinicalOverride: {
          acknowledgedRisk: true,
          reason: 'Proceed',
          source: 'ALLERGY',
        },
      },
      { patientHasRecordedAllergies: false },
    );

    expect(poisoned.allergyBlocked).toBe(false);
    expect(poisoned.allergyWarning).toBeUndefined();
    expect(poisoned.clinicalOverride).toBeUndefined();
    expect(poisoned.safetyTier).toBe('CAUTION');
    const items = poisoned.safetyReviewItems as Array<{ safetyDomain: string; summary: string }>;
    expect(items.some((i) => i.safetyDomain === 'allergy')).toBe(false);
    expect(items.some((i) => /ondansetron/i.test(i.summary))).toBe(false);
    expect(items.some((i) => i.safetyDomain === 'pregnancy')).toBe(true);
  });

  it('drops a systemic NSAID pregnancy rule from acetaminophen-only products', () => {
    expect(
      ruleCodeTargetsDifferentIngredient(
        'SS-PREG-SYSTEMIC-NSAID-GA20-27',
        'PRESCRIPTION ACETAMINOPHEN',
        'acetaminophen',
      ),
    ).toBe(true);
    expect(
      ruleCodeTargetsDifferentIngredient(
        'SS-PREG-SYSTEMIC-NSAID-GA28-PLUS',
        'ibuprofen',
        'ibuprofen',
      ),
    ).toBe(false);

    const cleaned = sanitizeTreatmentSafety(
      {
        medicationName: 'PRESCRIPTION ACETAMINOPHEN',
        genericName: 'acetaminophen',
        safetyTier: 'AVOID',
        pregnancyWarning: {
          active: true,
          message: 'A systemic NSAID has matched pregnancy from 20 weeks to below 28 weeks.',
        },
        safetyReviewItems: [
          {
            findingId: 'allergy',
            issueKey: 'allergy:nsaid',
            safetyDomain: 'allergy',
            presentationKind: 'SIGNIFICANT_RISK',
            severity: 'HIGH',
            title: 'Allergy',
            summary:
              'A systemic NSAID has matched pregnancy from 20 weeks to below 28 weeks.',
            requiresAcknowledgement: true,
            requiresRationale: true,
            ruleCode: 'SS-PREG-SYSTEMIC-NSAID-GA20-27',
          },
          {
            findingId: 'pregnancy',
            issueKey: 'pregnancy',
            safetyDomain: 'pregnancy',
            presentationKind: 'SIGNIFICANT_RISK',
            severity: 'HIGH',
            title: 'Pregnancy',
            summary: 'A systemic NSAID has matched pregnancy at 28 weeks or later.',
            requiresAcknowledgement: true,
            requiresRationale: true,
            ruleCode: 'SS-PREG-SYSTEMIC-NSAID-GA28-PLUS',
          },
        ],
      },
      { patientHasRecordedAllergies: false },
    );

    const items = cleaned.safetyReviewItems as Array<{ ruleCode?: string }>;
    expect(items.some((i) => /SYSTEMIC-NSAID/i.test(i.ruleCode ?? ''))).toBe(false);
    expect(cleaned.safetyTier).not.toBe('AVOID');
  });

  it('does not accept a pregnancy-labelled allergy even when another allergen is on file', () => {
    expect(
      allergyWarningIsValidPatientAllergy(
        {
          reason: 'Ondansetron has matched pregnancy.',
          safetySource: { findingType: 'pregnancy' },
        },
        true,
        'MAXALT',
        'rizatriptan',
      ),
    ).toBe(false);
  });

  it('overlays fresh evaluation safety onto pharmacist dose edits and clears stale flags', () => {
    const saved: Array<Record<string, unknown>> = [
      {
        pathwayTreatmentId: 'maxalt-1',
        medicationName: 'MAXALT (rizatriptan 10 mg)',
        genericName: 'rizatriptan',
        doseAmount: '1',
        doseUnit: 'Tablet(s)',
        allergyBlocked: true,
        allergyWarning: { reason: 'Ondansetron has matched pregnancy.' },
        renalWarning: { active: true, message: 'Renal caution' },
      },
    ];
    const incoming: Array<Record<string, unknown>> = [
      {
        pathwayTreatmentId: 'maxalt-1',
        medicationName: 'MAXALT (rizatriptan 10 mg)',
        genericName: 'rizatriptan',
        doseAmount: '1',
        allergyBlocked: false,
        pregnancyWarning: { active: true, message: 'rizatriptan has matched a confirmed pregnancy.' },
        safetyTier: 'CAUTION',
      },
    ];
    const merged = overlaySafetyOntoSavedTreatments(saved, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.doseAmount).toBe('1');
    expect(merged[0]?.doseUnit).toBe('Tablet(s)');
    expect(merged[0]?.allergyBlocked).toBe(false);
    expect(merged[0]?.allergyWarning).toBeUndefined();
    expect(merged[0]?.renalWarning).toBeUndefined();
    expect((merged[0]?.pregnancyWarning as { message: string }).message).toMatch(/rizatriptan/i);
  });

  it('deletes omitted overlay keys instead of keeping stale allergyWarning', () => {
    const next = overlayTreatmentSafety(
      {
        medicationName: 'MAXALT',
        allergyBlocked: true,
        allergyWarning: { reason: 'Ondansetron has matched pregnancy.' },
      },
      { allergyBlocked: false },
    );
    expect(next.allergyBlocked).toBe(false);
    expect(next.allergyWarning).toBeUndefined();
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADAPTATION_REASONS,
  ADAPTATION_TYPES,
  ADAPT_DOCUMENT_DEFINITIONS,
  emptyAdaptPayload,
  emptyAdaptStepOne,
  emptyAdaptStepTwoOptionA,
  emptyAdaptStepTwoOptionB,
  emptyAdaptStepThreeOptionA,
  emptyAdaptStepThreeOptionB,
  emptyAdaptStepFour,
  evaluateAdaptationSafety,
  generateAdaptationDocuments,
  generateAdaptationSuggestions,
  generateChangeSummary,
  generateDraftRationale,
  generateCounsellingPreview,
  getAdaptationReasons,
  getQuestionLabel,
  isAdaptationTypeAllowed,
  isAdaptStepOneValid,
  isAdaptStepTwoOptionAValid,
  isAdaptStepTwoOptionBValid,
  resolveAdaptTherapyDurationSelection,
  isAdaptStepThreeOptionAValid,
  isAdaptStepThreeOptionBValid,
  isAdaptStepFourValid,
  isReasonOther,
  parseAdaptPayload,
  prefillAdaptStep2AFromStep1,
  adaptStep1IndicationLabel,
  type AdaptStepOne,
  type AdaptStepTwoOptionA,
  type AdaptStepTwoOptionB,
  type AdaptStepThreeOptionA,
  type AdaptStepThreeOptionB,
  type AdaptStepFour,
} from './adapt';
import type { RenewMedication } from './renew';

const MOCK_MEDICATION: RenewMedication = {
  id: 'rmed_123',
  source: { type: 'manual_search' },
  raw: { medicationText: 'RAMIPRIL 10 mg' },
  normalized: {
    brandName: 'ALTACE',
    genericName: 'RAMIPRIL',
    strength: '10 mg',
    dosageForm: 'Tablet',
    directions: 'Take 1 tablet once daily',
    quantity: 90,
    prescriberName: 'Dr. Jane Smith',
    prescribedDate: '2025-03-10',
  },
  confidence: { medication: 1 },
  reviewStatus: 'confirmed',
  ccddMatchStatus: 'matched',
  pharmacistEdited: false,
};

describe('Adapt Step 1 Shared Model', () => {
  it('correctly reports jurisdiction allowances', () => {
    assert.equal(isAdaptationTypeAllowed('therapeutic_substitution', 'AB'), true);
    assert.equal(isAdaptationTypeAllowed('therapeutic_substitution', 'ON'), false);
    assert.equal(isAdaptationTypeAllowed('dose', 'ON'), true);
    assert.equal(isAdaptationTypeAllowed('dosage_form', 'ON'), true);
  });

  it('provides the correct dynamic question label for each type', () => {
    assert.equal(getQuestionLabel('dose'), 'Why is the dose being changed?');
    assert.equal(getQuestionLabel('dosage_form'), 'Why is the dosage form being changed?');
    assert.equal(getQuestionLabel('regimen'), 'Why is the regimen being changed?');
    assert.equal(getQuestionLabel('route'), 'Why is the route being changed?');
    assert.equal(
      getQuestionLabel('therapeutic_substitution'),
      'Why is therapeutic substitution being considered?',
    );
    assert.equal(getQuestionLabel('other'), 'Why is the prescription being adapted?');
  });

  it('includes 9 approved reasons for dose', () => {
    const doseReasons = getAdaptationReasons('dose');
    assert.equal(doseReasons.length, 9);
    assert.ok(doseReasons.map((r) => r.code).includes('DOSE_RENAL'));
    assert.ok(doseReasons.map((r) => r.code).includes('DOSE_WEIGHT_AGE'));
    assert.ok(doseReasons.map((r) => r.code).includes('DOSE_OTHER'));
  });

  it('detects reason "Other" correctly', () => {
    assert.equal(isReasonOther({ code: 'DOSE_OTHER', label: 'Other' }), true);
    assert.equal(isReasonOther({ code: 'FORM_OTHER', label: 'Other' }), true);
    assert.equal(isReasonOther({ code: 'DOSE_RENAL', label: 'Renal function' }), false);
    assert.equal(isReasonOther(null), false);
  });

  describe('isAdaptStepOneValid', () => {
    it('is invalid when empty', () => {
      const step1 = emptyAdaptStepOne();
      const check = isAdaptStepOneValid(step1);
      assert.equal(check.valid, false);
      assert.equal(check.hasPrescription, false);
      assert.equal(check.hasDirections, false);
      assert.equal(check.hasType, false);
      assert.equal(check.hasReason, false);
    });

    it('is valid when prescription, indication, type, non-other reason are present', () => {
      const step1: AdaptStepOne = {
        originalPrescription: MOCK_MEDICATION,
        indication: {
          medicationId: MOCK_MEDICATION.id,
          medicationConceptKey: 'ramipril::10 mg::tablet::',
          conditionId: 'cond_htn',
          conditionCode: 'HTN',
          indicationDisplay: 'Hypertension',
          status: 'confirmed',
          selectionSource: 'approved_mapping',
          confirmedByPharmacist: true,
          selectedAt: new Date().toISOString(),
        },
        jurisdiction: 'AB',
        adaptationType: 'dose',
        adaptationReason: { code: 'DOSE_RENAL', label: 'Renal function' },
        additionalComments: '',
        dispensingStatus: 'not_yet_dispensed',
      };
      const check = isAdaptStepOneValid(step1);
      assert.equal(check.valid, true);
      assert.equal(check.hasDirections, true);
      assert.equal(check.hasIndication, true);
      assert.equal(check.commentsValid, true);
    });

    it('requires indication confirmation or explicit unknown', () => {
      const step1: AdaptStepOne = {
        originalPrescription: MOCK_MEDICATION,
        indication: null,
        jurisdiction: 'AB',
        adaptationType: 'dose',
        adaptationReason: { code: 'DOSE_RENAL', label: 'Renal function' },
        additionalComments: '',
        dispensingStatus: 'not_yet_dispensed',
      };
      assert.equal(isAdaptStepOneValid(step1).hasIndication, false);
      assert.equal(isAdaptStepOneValid(step1).valid, false);

      step1.indication = {
        medicationId: MOCK_MEDICATION.id,
        medicationConceptKey: 'x',
        status: 'unknown',
        selectionSource: 'unknown',
        confirmedByPharmacist: true,
        selectedAt: new Date().toISOString(),
      };
      assert.equal(isAdaptStepOneValid(step1).hasIndication, true);
      assert.equal(isAdaptStepOneValid(step1).valid, true);
    });

    it('requires original directions on the prescription', () => {
      const step1: AdaptStepOne = {
        originalPrescription: {
          ...MOCK_MEDICATION,
          raw: { medicationText: 'RAMIPRIL 10 mg' },
          normalized: {
            ...MOCK_MEDICATION.normalized,
            directions: null,
          },
          directionsStatus: 'UNAVAILABLE',
        },
        indication: {
          medicationId: MOCK_MEDICATION.id,
          medicationConceptKey: 'x',
          status: 'unknown',
          selectionSource: 'unknown',
          confirmedByPharmacist: true,
        },
        jurisdiction: 'AB',
        adaptationType: 'dose',
        adaptationReason: { code: 'DOSE_RENAL', label: 'Renal function' },
        additionalComments: '',
        dispensingStatus: 'not_yet_dispensed',
      };
      const check = isAdaptStepOneValid(step1);
      assert.equal(check.hasPrescription, true);
      assert.equal(check.hasDirections, false);
      assert.equal(check.valid, false);
    });

    it('requires comments when reason is Other', () => {
      const step1: AdaptStepOne = {
        originalPrescription: MOCK_MEDICATION,
        indication: {
          medicationId: MOCK_MEDICATION.id,
          medicationConceptKey: 'x',
          status: 'unknown',
          selectionSource: 'unknown',
          confirmedByPharmacist: true,
        },
        jurisdiction: 'AB',
        adaptationType: 'dose',
        adaptationReason: { code: 'DOSE_OTHER', label: 'Other' },
        additionalComments: '   ',
        dispensingStatus: 'not_yet_dispensed',
      };
      const checkWithoutComments = isAdaptStepOneValid(step1);
      assert.equal(checkWithoutComments.valid, false);
      assert.equal(checkWithoutComments.commentsValid, false);
      assert.equal(
        checkWithoutComments.commentsError,
        'Please briefly describe the reason for adaptation.',
      );

      step1.additionalComments = 'Patient has difficulty swallowing standard strength.';
      const checkWithComments = isAdaptStepOneValid(step1);
      assert.equal(checkWithComments.valid, true);
      assert.equal(checkWithComments.commentsValid, true);
      assert.equal(checkWithComments.commentsError, undefined);
    });
  });

  describe('prefillAdaptStep2AFromStep1', () => {
    const step1WithIndication: AdaptStepOne = {
      originalPrescription: MOCK_MEDICATION,
      indication: {
        medicationId: MOCK_MEDICATION.id,
        medicationConceptKey: 'ramipril::10 mg::tablet::',
        conditionId: 'cond_lipid',
        conditionCode: 'DYSLIPIDEMIA',
        indicationDisplay: 'Hyperlipidemia',
        status: 'confirmed',
        selectionSource: 'approved_mapping',
        confirmedByPharmacist: true,
        selectedAt: new Date().toISOString(),
      },
      jurisdiction: 'AB',
      adaptationType: 'dose',
      adaptationReason: { code: 'DOSE_RENAL', label: 'Renal function' },
      additionalComments: '',
      dispensingStatus: 'not_yet_dispensed',
    };

    it('autofills Step 2A condition from indication; medications only when already dispensed', () => {
      assert.equal(adaptStep1IndicationLabel(step1WithIndication.indication), 'Hyperlipidemia');

      const notDispensed = prefillAdaptStep2AFromStep1(
        emptyAdaptStepTwoOptionA(),
        step1WithIndication,
      );
      assert.equal(notDispensed.changed, true);
      assert.deepEqual(notDispensed.step2A.background.conditions, ['Hyperlipidemia']);
      assert.equal(notDispensed.step2A.background.medicationEntries.length, 0);

      const dispensed: AdaptStepOne = {
        ...step1WithIndication,
        dispensingStatus: 'already_dispensed',
      };
      const withMeds = prefillAdaptStep2AFromStep1(emptyAdaptStepTwoOptionA(), dispensed);
      assert.equal(withMeds.changed, true);
      assert.deepEqual(withMeds.step2A.background.conditions, ['Hyperlipidemia']);
      assert.equal(withMeds.step2A.background.conditionsNone, false);
      assert.equal(withMeds.step2A.background.medsNone, false);
      assert.equal(withMeds.step2A.background.medicationEntries.length, 1);
      assert.match(withMeds.step2A.background.medicationEntries[0]!.id, /^adapt-step1-rx:/);
      assert.match(
        withMeds.step2A.background.medicationEntries[0]!.name.toLowerCase(),
        /ramipril|altace/,
      );
    });

    it('is idempotent and does not override a confirmed Step 2A', () => {
      const dispensed: AdaptStepOne = {
        ...step1WithIndication,
        dispensingStatus: 'already_dispensed',
      };
      const once = prefillAdaptStep2AFromStep1(emptyAdaptStepTwoOptionA(), dispensed);
      const twice = prefillAdaptStep2AFromStep1(once.step2A, dispensed);
      assert.equal(twice.changed, false);
      assert.deepEqual(twice.step2A.background.conditions, ['Hyperlipidemia']);
      assert.equal(twice.step2A.background.medicationEntries.length, 1);

      const confirmed: AdaptStepTwoOptionA = {
        ...emptyAdaptStepTwoOptionA(),
        confirmed: true,
        background: {
          ...emptyAdaptStepTwoOptionA().background,
          conditionsNone: true,
          conditions: [],
        },
      };
      const skipped = prefillAdaptStep2AFromStep1(confirmed, dispensed);
      assert.equal(skipped.changed, false);
      assert.equal(skipped.step2A.background.conditionsNone, true);
      assert.deepEqual(skipped.step2A.background.conditions, []);
    });

    it('does not prefill conditions when indication is unknown', () => {
      const unknown: AdaptStepOne = {
        ...step1WithIndication,
        dispensingStatus: 'already_dispensed',
        indication: {
          medicationId: MOCK_MEDICATION.id,
          medicationConceptKey: 'x',
          status: 'unknown',
          selectionSource: 'unknown',
          confirmedByPharmacist: true,
        },
      };
      assert.equal(adaptStep1IndicationLabel(unknown.indication), null);
      const { step2A, changed } = prefillAdaptStep2AFromStep1(emptyAdaptStepTwoOptionA(), unknown);
      assert.equal(changed, true); // still prefills medication when already dispensed
      assert.deepEqual(step2A.background.conditions, []);
      assert.equal(step2A.background.medicationEntries.length, 1);
    });
  });

  it('parses empty or partial payload safely', () => {
    const parsed = parseAdaptPayload(null, 'ON');
    assert.equal(parsed.step1.jurisdiction, 'ON');
    assert.equal(parsed.step1.originalPrescription, null);
    assert.equal(parsed.step1.dispensingStatus, 'not_yet_dispensed');
    assert.ok(parsed.step2A);
    assert.equal(parsed.step2A.demographics.sex, '');
  });

  describe('isAdaptStepTwoOptionAValid', () => {
    it('is invalid when empty', () => {
      const step2A = emptyAdaptStepTwoOptionA();
      const check = isAdaptStepTwoOptionAValid(step2A);
      assert.equal(check.valid, false);
      assert.equal(check.snapshotValid, false);
      assert.equal(check.backgroundValid, false);
      assert.ok(check.missingFields.includes('Sex at birth'));
      assert.ok(check.missingFields.includes('Date of birth'));
      assert.ok(check.missingFields.includes('Allergies'));
      assert.ok(check.missingFields.includes('Current medications'));
      assert.ok(check.missingFields.includes('Medical conditions'));
    });

    it('passes when snapshot and background are validly confirmed', () => {
      const step2A: AdaptStepTwoOptionA = {
        demographics: {
          dateOfBirth: '1990-05-20',
          dateOfBirthUnavailable: false,
          age: '34',
          ageUnit: 'years',
          sex: 'Female',
          pregnancyStatus: 'No',
          breastfeedingStatus: 'No',
        },
        background: {
          allergiesNone: true,
          allergyEntries: [],
          medsNone: false,
          medicationEntries: [{ id: 'm1', name: 'Atorvastatin 20mg' }],
          conditionsNone: false,
          conditions: ['Dyslipidemia'],
          lifestyle: { assessed: true, smokingStatus: 'Never', alcoholUse: 'None' },
          additionalHistory: 'No major surgeries',
        },
      };
      const check = isAdaptStepTwoOptionAValid(step2A);
      assert.equal(check.valid, true);
      assert.equal(check.snapshotValid, true);
      assert.equal(check.backgroundValid, true);
      assert.equal(check.missingFields.length, 0);
    });

    it('supports dateOfBirthUnavailable with valid age', () => {
      const step2A: AdaptStepTwoOptionA = {
        demographics: {
          dateOfBirth: '',
          dateOfBirthUnavailable: true,
          age: '55',
          ageUnit: 'years',
          sex: 'Male',
        },
        background: {
          allergiesNone: true,
          allergyEntries: [],
          medsNone: true,
          medicationEntries: [],
          conditionsNone: true,
          conditions: [],
        },
      };
      const check = isAdaptStepTwoOptionAValid(step2A);
      assert.equal(check.valid, true);
      assert.equal(check.snapshotValid, true);
      assert.equal(check.backgroundValid, true);
    });

    it('requires pregnancy and breastfeeding when sex is Female', () => {
      const step2A: AdaptStepTwoOptionA = {
        demographics: {
          dateOfBirth: '1990-05-20',
          dateOfBirthUnavailable: false,
          age: '34',
          ageUnit: 'years',
          sex: 'Female',
        },
        background: {
          allergiesNone: true,
          allergyEntries: [],
          medsNone: true,
          medicationEntries: [],
          conditionsNone: true,
          conditions: [],
        },
      };
      const missing = isAdaptStepTwoOptionAValid(step2A);
      assert.equal(missing.valid, false);
      assert.ok(missing.missingFields.includes('Pregnancy'));
      assert.ok(missing.missingFields.includes('Breastfeeding'));

      const complete: AdaptStepTwoOptionA = {
        ...step2A,
        demographics: {
          ...step2A.demographics,
          pregnancyStatus: 'No',
          breastfeedingStatus: 'No',
        },
      };
      assert.equal(isAdaptStepTwoOptionAValid(complete).valid, true);
    });
  });

  describe('isAdaptStepTwoOptionBValid', () => {
    it('is invalid when empty / gating question unanswered', () => {
      const step2B = emptyAdaptStepTwoOptionB();
      const check = isAdaptStepTwoOptionBValid(step2B);
      assert.equal(check.valid, false);
      assert.ok(check.missingFields.includes('Is the patient already taking the medication'));
    });

    it('is immediately valid when isTakingMedication is false', () => {
      const step2B: AdaptStepTwoOptionB = {
        isTakingMedication: false,
      };
      const check = isAdaptStepTwoOptionBValid(step2B);
      assert.equal(check.valid, true);
      assert.equal(check.missingFields.length, 0);
    });

    it('requires follow-up fields when isTakingMedication is true', () => {
      const step2B: AdaptStepTwoOptionB = {
        isTakingMedication: true,
      };
      const check = isAdaptStepTwoOptionBValid(step2B);
      assert.equal(check.valid, false);
      assert.ok(check.missingFields.includes('How is the patient currently taking it'));
      assert.ok(check.missingFields.includes('How long have they been taking it'));
      assert.ok(check.missingFields.includes('Effectiveness / response'));
      assert.ok(check.missingFields.includes('Adverse effects / tolerability'));
      assert.ok(check.missingFields.includes('Adherence'));
    });

    it('requires conditional descriptions when applicable', () => {
      const step2B: AdaptStepTwoOptionB = {
        isTakingMedication: true,
        currentUse: 'Ramipril 10 mg once daily with food',
        duration: '3 months',
        effectiveness: 'effective',
        adverseEffects: 'yes_describe',
        adverseEffectsDescription: '',
        adherence: 'other',
        adherenceDescription: '',
      };
      const check = isAdaptStepTwoOptionBValid(step2B);
      assert.equal(check.valid, false);
      assert.ok(check.missingFields.includes('Describe adverse effects'));
      assert.ok(check.missingFields.includes('Describe adherence concern'));

      step2B.adverseEffectsDescription = 'Mild dizziness after morning dose';
      step2B.adherenceDescription = 'Sometimes forgets on weekends';
      const checkValid = isAdaptStepTwoOptionBValid(step2B);
      assert.equal(checkValid.valid, true);
      assert.equal(checkValid.missingFields.length, 0);
    });

    it('resolves predefined therapy duration chips', () => {
      assert.equal(resolveAdaptTherapyDurationSelection('1–3 months').id, '1_3_months');
      assert.equal(resolveAdaptTherapyDurationSelection('1-3 months').id, '1_3_months');
      assert.equal(resolveAdaptTherapyDurationSelection('3 months').id, '1_3_months');
      assert.equal(resolveAdaptTherapyDurationSelection('Unknown').id, 'unknown');
      assert.equal(resolveAdaptTherapyDurationSelection('since Jan 2025').id, 'custom');
      assert.equal(resolveAdaptTherapyDurationSelection('').id, null);
    });
  });

  describe('Step 3A Proposed Adaptation', () => {
    const METFORMIN_RX: RenewMedication = {
      id: 'med_metformin',
      source: { type: 'manual_search' },
      raw: { medicationText: 'Metformin 500 mg tablet', directionsText: 'Take 1 tablet by mouth twice daily', quantityText: '180' },
      normalized: {
        genericName: 'Metformin',
        strength: '500 mg',
        dosageForm: 'tablet',
        directions: 'Take 1 tablet by mouth twice daily',
      },
    };

    const STEP1_METFORMIN_RENAL: AdaptStepOne = {
      originalPrescription: METFORMIN_RX,
      jurisdiction: 'AB',
      adaptationType: 'dose',
      adaptationReason: { code: 'DOSE_RENAL', label: 'Reduced renal function' },
      additionalComments: '',
      dispensingStatus: 'not_yet_dispensed',
    };

    it('generates clinical adaptation suggestions matching mockup', () => {
      const suggestions = generateAdaptationSuggestions(STEP1_METFORMIN_RENAL);
      assert.equal(suggestions.length, 3);

      const card1 = suggestions[0]!;
      assert.equal(card1.title, 'Adjust dose');
      assert.equal(card1.badge, 'Recommended');
      assert.equal(card1.proposedPrescription.dose, '500 mg');
      assert.equal(card1.proposedPrescription.frequency, 'Once daily');
      assert.ok(card1.supportingPoints.some((p) => p.includes('eGFR')));

      const card2 = suggestions[1]!;
      assert.equal(card2.title, 'Adjust frequency');

      const card3 = suggestions[2]!;
      assert.equal(card3.title, 'Alternative therapy');
    });

    it('generates change summary accurately', () => {
      const proposed = {
        drugName: 'Metformin 500 mg tablet',
        dose: '500 mg',
        frequency: 'Once daily',
        sig: 'Take 1 tablet by mouth once daily',
      };
      const summary = generateChangeSummary(METFORMIN_RX, proposed);
      assert.ok(summary.includes('Once daily') || summary.includes('frequency'));
    });

    it('generates auto draft rationale and counselling preview', () => {
      const rationale = generateDraftRationale(STEP1_METFORMIN_RENAL);
      assert.ok(rationale.includes('eGFR of 45 mL/min') || rationale.includes('renal'));

      const counselling = generateCounsellingPreview(STEP1_METFORMIN_RENAL);
      assert.ok(counselling.length >= 3);
      assert.ok(counselling.some((c) => c.includes('500 mg') || c.includes('meal') || c.includes('kidney')));
    });

    it('validates Step 3A proposal', () => {
      const empty3A = emptyAdaptStepThreeOptionA();
      const checkEmpty = isAdaptStepThreeOptionAValid(empty3A);
      assert.equal(checkEmpty.valid, false);
      assert.ok(checkEmpty.missingFields.includes('Proposal option (suggestion or custom)'));

      const valid3A: AdaptStepThreeOptionA = {
        proposalMode: 'suggested',
        selectedSuggestionId: 'adjust_dose_metformin',
        proposedPrescription: {
          drugName: 'Metformin 500 mg tablet',
          dose: '500 mg',
          frequency: 'Once daily',
          route: 'By mouth',
          quantity: 90,
          refills: 1,
          sig: 'Take 1 tablet by mouth once daily',
        },
      };
      const checkValid = isAdaptStepThreeOptionAValid(valid3A);
      assert.equal(checkValid.valid, true);
      assert.equal(checkValid.missingFields.length, 0);

      // Custom mode with missing SIG is invalid
      const customMissingSig: AdaptStepThreeOptionA = {
        proposalMode: 'custom',
        proposedPrescription: {
          drugName: 'Metformin 500 mg tablet',
          dose: '500 mg',
          frequency: 'Once daily',
          sig: '',
        },
      };
      const checkCustom = isAdaptStepThreeOptionAValid(customMissingSig);
      assert.equal(checkCustom.valid, false);
      assert.ok(checkCustom.missingFields.includes('Directions (SIG)'));

      // Other branch requires custom adaptation summary
      const otherMissingSummary: AdaptStepThreeOptionA = {
        proposalMode: 'custom',
        customAdaptationSummary: '',
        proposedPrescription: {
          drugName: 'Amoxicillin oral suspension',
          dose: '10 mL',
          frequency: 'Three times daily',
          route: 'By mouth',
          quantity: 210,
          refills: 0,
          sig: 'Take 10 mL by mouth three times daily for 7 days',
        },
      };
      const checkOther = isAdaptStepThreeOptionAValid(otherMissingSummary, 'AB', 'other');
      assert.equal(checkOther.valid, false);
      assert.ok(checkOther.missingFields.includes('Custom adaptation summary'));

      const otherValid: AdaptStepThreeOptionA = {
        ...otherMissingSummary,
        customAdaptationSummary: 'Change from capsules to oral suspension due to swallow difficulty.',
      };
      assert.equal(isAdaptStepThreeOptionAValid(otherValid, 'AB', 'other').valid, true);
    });
  });

  describe('Step 3B Clinical & Safety Check', () => {
    const METFORMIN_RX: RenewMedication = {
      id: 'med_metformin',
      source: { type: 'manual_search' },
      raw: { medicationText: 'Metformin 500 mg tablet', directionsText: 'Take 1 tablet by mouth twice daily', quantityText: '180' },
      normalized: {
        genericName: 'Metformin',
        strength: '500 mg',
        dosageForm: 'tablet',
        directions: 'Take 1 tablet by mouth twice daily',
      },
    };

    const STEP1_METFORMIN_RENAL: AdaptStepOne = {
      originalPrescription: METFORMIN_RX,
      jurisdiction: 'AB',
      adaptationType: 'dose',
      adaptationReason: { code: 'DOSE_RENAL', label: 'Reduced renal function' },
      additionalComments: 'Patient eGFR: 45 mL/min/1.73 m²',
      dispensingStatus: 'not_yet_dispensed',
    };

    const STEP2A_RENAL: AdaptStepTwoOptionA = {
      demographics: {
        sex: 'Male',
        age: '68',
      },
      background: {
        allergiesNone: true,
        allergyEntries: [],
        medsNone: true,
        medicationEntries: [],
        conditionsNone: false,
        conditions: ['Type 2 Diabetes', 'CKD Stage 3a (eGFR 45)'],
      },
    };

    const STEP3A_PROPOSAL: AdaptStepThreeOptionA = {
      proposalMode: 'suggested',
      selectedSuggestionId: 'adjust_dose_metformin',
      proposedPrescription: {
        drugName: 'Metformin 500 mg tablet',
        strength: '500 mg',
        dosageForm: 'tablet',
        dose: '500 mg',
        frequency: 'Once daily',
        route: 'By mouth',
        quantity: 90,
        refills: 1,
        sig: 'Take 1 tablet by mouth once daily',
      },
    };

    it('evaluates 8 clinical checks dynamically for Metformin renal adaptation matching mockup', () => {
      const result = evaluateAdaptationSafety(
        STEP1_METFORMIN_RENAL,
        STEP2A_RENAL,
        undefined,
        STEP3A_PROPOSAL,
        'AB',
      );

      assert.equal(result.checks.length, 8);
      assert.equal(result.overallStatus, 'review');

      // 1. Dose & Regimen
      const doseCheck = result.checks.find((c) => c.id === 'dose_regimen');
      assert.ok(doseCheck);
      assert.equal(doseCheck.status, 'appropriate');
      assert.equal(doseCheck.statusLabel, 'Appropriate');
      assert.equal(doseCheck.tone, 'success');
      assert.equal(doseCheck.title, 'Dose & renal function');
      assert.equal(doseCheck.isRelevantToAdaptation, true);
      assert.ok(doseCheck.summary.includes('appropriate for the patient'));

      // 2. Renal function
      const renalCheck = result.checks.find((c) => c.id === 'renal_function');
      assert.ok(renalCheck);
      assert.equal(renalCheck.status, 'monitoring_recommended');
      assert.equal(renalCheck.statusLabel, 'Monitoring recommended');
      assert.equal(renalCheck.tone, 'warning');
      assert.equal(renalCheck.severity, 'review');
      assert.equal(renalCheck.isRelevantToAdaptation, false);
      assert.ok(renalCheck.summary.includes('eGFR 45 mL/min'));
      assert.ok(renalCheck.reference?.title.includes('Metformin'));
      assert.equal(renalCheck.requiresAcknowledgment, true);

      // 3. Allergies
      const allergyCheck = result.checks.find((c) => c.id === 'allergies');
      assert.ok(allergyCheck);
      assert.equal(allergyCheck.status, 'no_issues');
      assert.equal(allergyCheck.statusLabel, 'No issues');
      assert.equal(allergyCheck.tone, 'success');

      // 4. Drug interactions
      const interactionCheck = result.checks.find((c) => c.id === 'drug_interactions');
      assert.ok(interactionCheck);
      assert.equal(interactionCheck.statusLabel, 'No issues');

      // 5. Contraindications
      const contraCheck = result.checks.find((c) => c.id === 'contraindications');
      assert.ok(contraCheck);
      assert.equal(contraCheck.statusLabel, 'No issues');

      // 6. Duplicate therapy
      const duplicateCheck = result.checks.find((c) => c.id === 'duplicate_therapy');
      assert.ok(duplicateCheck);
      assert.equal(duplicateCheck.statusLabel, 'No issues');

      // 7. Jurisdiction / scope
      const scopeCheck = result.checks.find((c) => c.id === 'jurisdiction');
      assert.ok(scopeCheck);
      assert.equal(scopeCheck.statusLabel, 'Permitted');
      assert.equal(scopeCheck.tone, 'success');

      // 8. Monitoring / follow-up
      const monitoringCheck = result.checks.find((c) => c.id === 'monitoring_followup');
      assert.ok(monitoringCheck);
      assert.equal(monitoringCheck.statusLabel, 'Follow-up required');
      assert.equal(monitoringCheck.tone, 'warning');
      assert.equal(monitoringCheck.severity, 'review');
      assert.equal(monitoringCheck.isRelevantToAdaptation, true);
      assert.ok(monitoringCheck.summary.includes('3–6 months'));

      const keyFindings = result.checks.filter((c) => c.isRelevantToAdaptation);
      assert.equal(keyFindings.length, 2);
      assert.ok(keyFindings.some((c) => c.id === 'dose_regimen'));
      assert.ok(keyFindings.some((c) => c.id === 'monitoring_followup'));

      // Rationale auto-generation
      assert.ok(result.defaultRationale.includes('500 mg once daily'));
      assert.ok(result.defaultRationale.includes('eGFR 45 mL/min'));
    });

    it('flags documented allergy as contraindicated blocker', () => {
      const step2AWithAllergy: AdaptStepTwoOptionA = {
        demographics: { sex: 'Female', age: '52' },
        background: {
          allergiesNone: false,
          allergyEntries: [
            { id: 'alg1', drug: 'Metformin', reaction: 'Anaphylaxis', severity: 'Severe' },
          ],
          medsNone: true,
          medicationEntries: [],
          conditionsNone: true,
          conditions: [],
        },
      };

      const result = evaluateAdaptationSafety(
        STEP1_METFORMIN_RENAL,
        step2AWithAllergy,
        undefined,
        STEP3A_PROPOSAL,
        'AB',
      );

      assert.equal(result.overallStatus, 'block');
      const allergyCheck = result.checks.find((c) => c.id === 'allergies')!;
      assert.equal(allergyCheck.severity, 'block');
      assert.equal(allergyCheck.status, 'contraindicated');
      assert.equal(allergyCheck.tone, 'danger');
      assert.ok(allergyCheck.summary.includes('Documented allergy'));
      const contraindicationCheck = result.checks.find((c) => c.id === 'contraindications')!;
      assert.equal(contraindicationCheck.severity, 'block');
      assert.equal(contraindicationCheck.status, 'contraindicated');
    });

    it('flags amoxicillin allergy against amoxicillin proposed prescription as blocker', () => {
      const step2WithAmox: AdaptStepTwoOptionA = {
        confirmed: true,
        demographics: { sex: 'Male', age: '45' },
        background: {
          allergiesNone: false,
          allergyEntries: [
            { id: 'alg_amox', drug: 'Amoxicillin', reaction: 'Hives, swelling', severity: 'Severe' },
          ],
          medsNone: true,
          medicationEntries: [],
          conditionsNone: true,
          conditions: [],
        },
      };

      const amoxProposal: AdaptStepThreeOptionA = {
        proposalMode: 'custom',
        proposedPrescription: {
          drugName: 'Amoxicillin 500 mg oral capsule',
          genericName: 'Amoxicillin',
          dose: '500 mg',
          frequency: 'Three times daily',
          quantity: '30',
          refills: '0',
        },
      };

      const result = evaluateAdaptationSafety(
        STEP1_METFORMIN_RENAL,
        step2WithAmox,
        undefined,
        amoxProposal,
        'AB',
      );

      assert.equal(result.overallStatus, 'block');
      const allergyCheck = result.checks.find((c) => c.id === 'allergies')!;
      assert.equal(allergyCheck.severity, 'block');
      assert.equal(allergyCheck.status, 'contraindicated');
      assert.equal(allergyCheck.tone, 'danger');
      assert.ok(allergyCheck.summary.includes('Amoxicillin'));

      const contraCheck = result.checks.find((c) => c.id === 'contraindications')!;
      assert.equal(contraCheck.severity, 'block');
      assert.equal(contraCheck.status, 'contraindicated');
    });

    it('flags penicillin allergy against amoxicillin proposed prescription via beta-lactam cross-reactivity', () => {
      const step2WithPen: AdaptStepTwoOptionA = {
        confirmed: true,
        demographics: { sex: 'Female', age: '38' },
        background: {
          allergiesNone: false,
          allergyEntries: [
            { id: 'alg_pen', drug: 'Penicillin', reaction: 'Anaphylaxis', severity: 'Severe' },
          ],
          medsNone: true,
          medicationEntries: [],
          conditionsNone: true,
          conditions: [],
        },
      };

      const amoxProposal: AdaptStepThreeOptionA = {
        proposalMode: 'custom',
        proposedPrescription: {
          drugName: 'Amoxil 500 mg capsule',
          dose: '500 mg',
          frequency: 'Three times daily',
          quantity: '21',
          refills: '0',
        },
      };

      const result = evaluateAdaptationSafety(
        STEP1_METFORMIN_RENAL,
        step2WithPen,
        undefined,
        amoxProposal,
        'AB',
      );

      assert.equal(result.overallStatus, 'block');
      const allergyCheck = result.checks.find((c) => c.id === 'allergies')!;
      assert.equal(allergyCheck.severity, 'block');
      assert.equal(allergyCheck.status, 'contraindicated');
      assert.ok(allergyCheck.assessment.includes('cross-reactivity') || allergyCheck.assessment.includes('hypersensitivity'));
    });

    it('flags penicillin allergy against cephalosporin as review (not a hard stop)', () => {
      const step2WithPen: AdaptStepTwoOptionA = {
        confirmed: true,
        demographics: { sex: 'Male', age: '35' },
        background: {
          allergiesNone: false,
          allergyEntries: [
            {
              id: 'alg_pen_v',
              drug: 'Penicillin V potassium',
              reaction: 'Urticaria (hives)',
              severity: 'Moderate',
              reactionType: 'Immediate (IgE-mediated)',
              recordedDate: '2019',
            },
          ],
          medsNone: true,
          medicationEntries: [],
          conditionsNone: true,
          conditions: [],
        },
      };

      const cephProposal: AdaptStepThreeOptionA = {
        proposalMode: 'custom',
        proposedPrescription: {
          drugName: 'Cephalexin 500 mg capsule',
          genericName: 'Cephalexin',
          dose: '500 mg',
          frequency: 'Four times daily',
          quantity: '28',
          refills: '0',
        },
      };

      const result = evaluateAdaptationSafety(
        {
          ...STEP1_METFORMIN_RENAL,
          adaptationType: 'therapeutic_substitution',
          adaptationReason: {
            code: 'THERAPEUTIC_SUBSTITUTION',
            label: 'Therapeutic substitution',
          },
        },
        step2WithPen,
        undefined,
        cephProposal,
        'AB',
      );

      assert.equal(result.overallStatus, 'review');
      const allergyCheck = result.checks.find((c) => c.id === 'allergies')!;
      assert.equal(allergyCheck.severity, 'review');
      assert.equal(allergyCheck.status, 'caution');
      assert.equal(allergyCheck.tone, 'warning');
      assert.equal(allergyCheck.requiresAcknowledgment, true);
      assert.equal(allergyCheck.isRelevantToAdaptation, true);
      assert.ok(/cross-react/i.test(allergyCheck.summary));
      assert.doesNotMatch(result.defaultRationale, /CONTRAINDICATED/i);
    });

    it('does not flag allergy conflict when allergy is unrelated to proposed medication', () => {
      const step2WithPen: AdaptStepTwoOptionA = {
        confirmed: true,
        demographics: { sex: 'Female', age: '38' },
        background: {
          allergiesNone: false,
          allergyEntries: [
            { id: 'alg_pen', drug: 'Penicillin', reaction: 'Anaphylaxis', severity: 'Severe' },
          ],
          medsNone: true,
          medicationEntries: [],
          conditionsNone: true,
          conditions: [],
        },
      };

      // Proposed medication is Metformin (unrelated to Penicillin)
      const result = evaluateAdaptationSafety(
        STEP1_METFORMIN_RENAL,
        step2WithPen,
        undefined,
        STEP3A_PROPOSAL,
        'AB',
      );

      const allergyCheck = result.checks.find((c) => c.id === 'allergies')!;
      assert.equal(allergyCheck.severity, 'pass');
      assert.equal(allergyCheck.status, 'no_issues');
      assert.equal(allergyCheck.tone, 'success');
    });

    it('flags out of scope jurisdiction as blocker', () => {
      const step1SubON: AdaptStepOne = {
        ...STEP1_METFORMIN_RENAL,
        adaptationType: 'therapeutic_substitution',
        jurisdiction: 'ON',
      };

      const result = evaluateAdaptationSafety(
        step1SubON,
        STEP2A_RENAL,
        undefined,
        STEP3A_PROPOSAL,
        'ON',
      );

      assert.equal(result.overallStatus, 'block');
      const scopeCheck = result.checks.find((c) => c.id === 'jurisdiction')!;
      assert.equal(scopeCheck.severity, 'block');
      assert.equal(scopeCheck.statusLabel, 'Outside scope');
      assert.equal(scopeCheck.tone, 'danger');
    });

    it('validates Step 3B and detects unacknowledged review items', () => {
      const step3B = emptyAdaptStepThreeOptionB(
        STEP1_METFORMIN_RENAL,
        STEP2A_RENAL,
        undefined,
        STEP3A_PROPOSAL,
        'AB',
      );

      const check = isAdaptStepThreeOptionBValid(step3B);
      assert.equal(check.valid, false);
      assert.equal(check.hasBlockers, false);
      assert.equal(check.unacknowledgedReviewCount, 2); // renal_function + monitoring_followup
      assert.ok(check.missingFields.some((f) => /Unresolved review items/i.test(f)));

      // Acknowledge one
      step3B.acknowledgedCheckIds = ['renal_function'];
      const check2 = isAdaptStepThreeOptionBValid(step3B);
      assert.equal(check2.unacknowledgedReviewCount, 1);
      assert.equal(check2.valid, false);

      // Acknowledge both
      step3B.acknowledgedCheckIds = ['renal_function', 'monitoring_followup'];
      const check3 = isAdaptStepThreeOptionBValid(step3B);
      assert.equal(check3.unacknowledgedReviewCount, 0);
      assert.equal(check3.valid, true);

      // Empty rationale fails validation
      step3B.clinicalRationale = '   ';
      const checkEmptyRationale = isAdaptStepThreeOptionBValid(step3B);
      assert.equal(checkEmptyRationale.valid, false);
      assert.ok(checkEmptyRationale.missingFields.includes('Clinical rationale'));
    });
  });

  describe('Step 4 Documentation', () => {
    const METFORMIN_RX: RenewMedication = {
      id: 'med_metformin',
      source: { type: 'manual_search' },
      raw: { medicationText: 'Metformin 500 mg tablet', directionsText: 'Take 1 tablet by mouth twice daily', quantityText: '180' },
      normalized: {
        genericName: 'Metformin',
        strength: '500 mg',
        dosageForm: 'tablet',
        directions: 'Take 1 tablet by mouth twice daily',
        prescriberName: 'Dr. Jane Smith, MD',
      },
    };

    const STEP1: AdaptStepOne = {
      originalPrescription: METFORMIN_RX,
      jurisdiction: 'AB',
      adaptationType: 'dose',
      adaptationReason: { code: 'DOSE_RENAL', label: 'Renal function' },
      dispensingStatus: 'not_yet_dispensed',
    };

    const STEP2A: AdaptStepTwoOptionA = {
      demographics: { sex: 'Female', age: '67', dateOfBirth: '1959-06-15' },
      background: {
        allergiesNone: true,
        allergyEntries: [],
        medsNone: true,
        medicationEntries: [],
        conditionsNone: false,
        conditions: ['Type 2 Diabetes', 'CKD Stage 3a (eGFR 45 mL/min)'],
      },
    };

    const STEP3A: AdaptStepThreeOptionA = {
      proposalMode: 'suggested',
      proposedPrescription: {
        drugName: 'Metformin 500 mg tablet',
        dose: '500 mg',
        frequency: 'Once daily',
        route: 'By mouth',
        quantity: 90,
        refills: 1,
        sig: 'Take 1 tablet by mouth once daily with largest meal',
      },
    };

    const STEP3B = emptyAdaptStepThreeOptionB(STEP1, STEP2A, undefined, STEP3A, 'AB');

    it('defines 4 standard adaptation document definitions', () => {
      assert.equal(ADAPT_DOCUMENT_DEFINITIONS.length, 4);
      const ids = ADAPT_DOCUMENT_DEFINITIONS.map((d) => d.id);
      assert.ok(ids.includes('consultation_note'));
      assert.ok(ids.includes('prescriber_communication'));
      assert.ok(ids.includes('patient_care_summary'));
      assert.ok(ids.includes('prescription'));
    });

    it('generates adaptation document package for clinical scenario', () => {
      const patientInfo = {
        name: 'Eleanor Vance',
        dateOfBirth: '1959-06-15',
        patientId: 'AB1234567',
        phone: '(403) 555-9876',
        address: '456 Heritage Trail, Calgary, AB',
      };

      const docs = generateAdaptationDocuments(
        STEP1,
        STEP2A,
        undefined,
        STEP3A,
        STEP3B,
        patientInfo,
      );

      assert.equal(Object.keys(docs).length, 4);

      // 1. DAP Note — Adapt DAP assembler (frozen snapshot + D/A/P + references)
      const dap = docs.consultation_note;
      assert.ok(dap);
      assert.match(dap.html, /D\s*[—-]\s*Data/);
      assert.match(dap.html, /A\s*[—-]\s*Assessment/);
      assert.match(dap.html, /P\s*[—-]\s*Plan/);
      assert.match(dap.html, /Eleanor Vance/);
      assert.match(dap.html, /eGFR/);
      assert.match(dap.html, /45/);

      // 2. Prescriber Notification — Adapt PCP assembler
      const pcp = docs.prescriber_communication;
      assert.ok(pcp);
      assert.match(pcp.html, /PHARMACIST ADAPTATION NOTIFICATION/);
      assert.match(pcp.html, /Dear Colleague/);
      assert.match(pcp.html, /Original prescription/i);
      assert.match(pcp.html, /Adapted prescription/i);
      assert.match(pcp.html, /once daily/i);
      assert.match(pcp.plainText, /continuity of care/i);
      assert.doesNotMatch(pcp.plainText, /prescriber was notified/i);

      // 3. Patient Handout — patient-facing Adapt handout
      const handout = docs.patient_care_summary;
      assert.ok(handout);
      assert.match(handout.plainText, /YOUR UPDATED MEDICATION PLAN/i);
      assert.match(handout.html, /Your updated medication/i);
      assert.match(handout.html, /How to use your medication/i);
      assert.match(handout.plainText, /once daily/i);
      assert.doesNotMatch(handout.plainText, /doctor has been notified|prescriber was notified/i);
      assert.doesNotMatch(handout.plainText, /eCPS|Bugs\s*&\s*Drugs|product monograph/i);

      // 4. Prescription (Adapted) — Prescribe clinical Rx template
      const rx = docs.prescription;
      assert.ok(rx);
      assert.match(rx.plainText, /^PRESCRIPTION/m);
      assert.match(rx.plainText, /\bRx\s*-/i);
      assert.match(rx.plainText, /once daily/i);
      assert.match(rx.plainText, /Qty:/i);
      assert.match(rx.plainText, /Refills:/i);
      assert.match(rx.plainText, /Adapted by pharmacist/i);
      assert.ok(rx.html.includes('Qty: 90') || rx.html.includes('90 tablets') || rx.plainText.includes('90'));
      assert.match(rx.html, /Refills/i);
    });

    it('initializes step4 and correctly validates review status', () => {
      const step4 = emptyAdaptStepFour(STEP1, STEP2A, undefined, STEP3A, STEP3B, 'AB');

      // Initially unreviewed
      const initCheck = isAdaptStepFourValid(step4);
      assert.equal(initCheck.valid, false);
      assert.equal(initCheck.allReviewed, false);
      assert.equal(initCheck.unreviewedDocTitles.length, 4);

      // Mark 3 reviewed
      step4.documentReviews.consultation_note.status = 'REVIEWED';
      step4.documentReviews.prescriber_communication.status = 'REVIEWED';
      step4.documentReviews.patient_care_summary.status = 'REVIEWED';
      const partialCheck = isAdaptStepFourValid(step4);
      assert.equal(partialCheck.valid, false);
      assert.equal(partialCheck.unreviewedDocTitles.length, 1);

      // Mark all 4 reviewed
      step4.documentReviews.prescription.status = 'REVIEWED';
      const fullCheck = isAdaptStepFourValid(step4);
      assert.equal(fullCheck.valid, true);
      assert.equal(fullCheck.allReviewed, true);
      assert.equal(fullCheck.unreviewedDocTitles.length, 0);
    });

    it('parses and persists step4 in parseAdaptPayload', () => {
      const step4 = emptyAdaptStepFour(STEP1, STEP2A, undefined, STEP3A, STEP3B, 'AB');
      step4.documentReviews.consultation_note.status = 'REVIEWED';
      step4.patientInfo.name = 'Marcus Brody';

      const payload = {
        step1: STEP1,
        step2A: STEP2A,
        step3A: STEP3A,
        step3B: STEP3B,
        step4,
      };

      const parsed = parseAdaptPayload(payload, 'AB');
      assert.ok(parsed.step4);
      assert.equal(parsed.step4.patientInfo.name, 'Marcus Brody');
      assert.equal(parsed.step4.documentReviews.consultation_note.status, 'REVIEWED');
    });

    it('initializes step4 with empty patient info and unconfirmed status', () => {
      const step4 = emptyAdaptStepFour(STEP1, STEP2A, undefined, STEP3A, STEP3B, 'AB');
      assert.equal(step4.patientInfo.name, '');
      assert.equal(step4.patientInfo.patientId, '');
      assert.equal(step4.patientInfo.phone, '');
      assert.equal(step4.patientInfo.address, '');
      assert.equal(step4.patientInfo.skipped, false);
      assert.equal(step4.patientInfo.confirmed, false);
    });

    it('sanitizes legacy mock patient values and unconfirms in parseAdaptPayload', () => {
      const mockPayload = {
        step1: STEP1,
        step4: {
          patientInfo: {
            name: 'Jane Doe',
            dateOfBirth: '1958-04-12',
            patientId: '987654321',
            phone: '(403) 555-0199',
            address: '123 Health Ave, Calgary, AB T2P 1J9',
            confirmed: true,
            skipped: false,
          },
        },
      };

      const parsed = parseAdaptPayload(mockPayload, 'AB');
      assert.ok(parsed.step4);
      assert.equal(parsed.step4.patientInfo.name, '');
      assert.equal(parsed.step4.patientInfo.dateOfBirth, '');
      assert.equal(parsed.step4.patientInfo.patientId, '');
      assert.equal(parsed.step4.patientInfo.phone, '');
      assert.equal(parsed.step4.patientInfo.address, '');
      assert.equal(parsed.step4.patientInfo.confirmed, false);
    });

    it('generates documents without mock patient names when empty', () => {
      const docs = generateAdaptationDocuments(
        STEP1,
        STEP2A,
        undefined,
        STEP3A,
        STEP3B,
        {
          name: '',
          dateOfBirth: '',
          patientId: '',
          phone: '',
          address: '',
        },
      );

      for (const key of Object.keys(docs) as (keyof typeof docs)[]) {
        const doc = docs[key];
        assert.ok(!doc.html.includes('Jane Doe'), `Document ${key} should not include Jane Doe`);
        assert.ok(!doc.plainText.includes('Jane Doe'), `Document ${key} text should not include Jane Doe`);
        assert.ok(!doc.html.includes('987654321'), `Document ${key} should not include 987654321`);
      }
    });
  });

  describe('End-to-End Adaptation Module Lifecycle', () => {
    it('executes a complete consultation through Step 1, Step 2, Step 3, and Step 4', () => {
      // Step 1: Intake & Reason
      const step1: AdaptStepOne = {
        originalPrescriptionId: 'rx-101',
        originalPrescription: MOCK_MEDICATION,
        indication: {
          medicationId: MOCK_MEDICATION.id,
          medicationConceptKey: 'ramipril',
          conditionId: 'cond_htn',
          conditionCode: 'HTN',
          indicationDisplay: 'Hypertension',
          status: 'confirmed',
          selectionSource: 'approved_mapping',
          confirmedByPharmacist: true,
          selectedAt: new Date().toISOString(),
        },
        jurisdiction: 'AB',
        adaptationType: 'dose',
        adaptationReason: {
          code: 'DOSE_RENAL',
          label: 'Renal function',
          category: 'dose',
        },
        additionalComments: 'Dose adjustment based on recent eGFR laboratory findings',
        dispensingStatus: 'not_yet_dispensed',
      };
      const step1Validation = isAdaptStepOneValid(step1);
      assert.equal(step1Validation.valid, true);

      // Step 2A & 2B: Patient Assessment & Experience
      const step2A: AdaptStepTwoOptionA = {
        demographics: {
          dateOfBirth: '1965-08-20',
          sex: 'male',
          dateOfBirthUnavailable: false,
          age: '60',
          ageUnit: 'years',
        },
        background: {
          allergiesNone: false,
          allergyEntries: [
            {
              id: 'allergy-1',
              drug: 'Amoxicillin',
              reaction: 'Hives, severe rash',
              severity: 'severe',
            },
          ],
          medsNone: false,
          medicationEntries: [
            {
              id: 'med-1',
              name: 'Amlodipine 5 mg',
              directions: 'Take 1 tablet daily',
            },
          ],
          conditionsNone: false,
          conditions: ['Type 2 Diabetes', 'Hypertension', 'Stage 3a Chronic Kidney Disease'],
          lifestyle: {
            assessed: true,
            smokingStatus: 'never',
            alcoholUse: 'moderate',
            drugUse: 'none',
          },
          additionalHistory: 'Patient monitored by nephrology team',
        },
        confirmed: true,
      };
      const step2B: AdaptStepTwoOptionB = {
        isTakingMedication: true,
        currentUse: 'Taking 1 tablet twice daily with breakfast and dinner',
        duration: '1-3 months',
        effectiveness: 'Good blood pressure control',
        adverseEffects: 'none',
        adherence: 'regular',
        patientGoals: 'Maintain kidney health and reduce adverse effects',
      };
      assert.equal(isAdaptStepTwoOptionAValid(step2A).valid, true);
      assert.equal(isAdaptStepTwoOptionBValid(step2B).valid, true);

      // Step 3 Safety Check - Allergy conflict test
      // If proposed Rx conflicts with documented allergy (Amoxicillin):
      const conflictingStep3A: AdaptStepThreeOptionA = {
        proposedPrescription: {
          drugName: 'Amoxicillin 500 mg capsule',
          sig: 'Take 1 capsule three times daily',
          quantity: 21,
          refills: 0,
        },
      };
      const allergyConflictSafety = evaluateAdaptationSafety(
        step1,
        step2A,
        step2B,
        conflictingStep3A,
        'AB',
      );
      assert.equal(allergyConflictSafety.overallStatus, 'block');
      const allergyCheck = allergyConflictSafety.checks.find((c) => c.type === 'allergy');
      assert.ok(allergyCheck);
      assert.equal(allergyCheck.severity, 'block');
      assert.equal(allergyCheck.status, 'contraindicated');

      // Step 3: Appropriate adaptation (Dose reduction of Metformin)
      const validStep3A: AdaptStepThreeOptionA = {
        proposalMode: 'custom',
        proposedPrescription: {
          drugName: 'Metformin 500 mg tablet',
          dose: '500 mg',
          frequency: 'Once daily',
          sig: 'Take 1 tablet once daily with evening meal',
          quantity: 90,
          refills: 1,
        },
      };
      assert.equal(isAdaptStepThreeOptionAValid(validStep3A).valid, true);

      const evaluatedSafety = evaluateAdaptationSafety(step1, step2A, step2B, validStep3A, 'AB');
      // No allergy conflict now
      assert.ok(evaluatedSafety.overallStatus !== 'block');

      const step3B: AdaptStepThreeOptionB = {
        checks: evaluatedSafety.checks,
        clinicalRationale:
          'Dose reduced from metformin 500 mg twice daily to 500 mg once daily due to moderate renal impairment.',
        clinicalReferences: [],
        adaptationConfirmed: true,
        confirmedAt: new Date().toISOString(),
        acknowledgedCheckIds: evaluatedSafety.checks
          .filter((c) => c.requiresAcknowledgment)
          .map((c) => c.id),
      };
      assert.equal(isAdaptStepThreeOptionBValid(step3B).valid, true);

      // Step 4: Documentation
      // Fresh Step 4 starts empty and unconfirmed
      const initialStep4 = emptyAdaptStepFour(step1, step2A, step2B, validStep3A, step3B, 'AB');
      assert.equal(initialStep4.patientInfo.name, '');
      assert.equal(initialStep4.patientInfo.confirmed, false);
      assert.equal(initialStep4.patientInfo.dateOfBirth, '1965-08-20'); // Carried from Step 2A real DOB!

      // Pharmacist fills and confirms patient details
      initialStep4.patientInfo = {
        name: 'Robert Vance',
        dateOfBirth: '1965-08-20',
        patientId: '123456789',
        phone: '(403) 555-7890',
        address: '456 Bow Valley Trail, Canmore, AB',
        confirmed: true,
        skipped: false,
      };

      // Regenerate documents with confirmed patient info
      const confirmedDocs = generateAdaptationDocuments(
        step1,
        step2A,
        step2B,
        validStep3A,
        step3B,
        initialStep4.patientInfo,
        {
          name: 'Sarah Connor',
          licenseNumber: 'RPh-99881',
          pharmacyName: 'Mountain Health Pharmacy',
          pharmacyAddress: '100 Main St, Canmore, AB',
          pharmacyPhone: '(403) 678-1111',
          pharmacyFax: '(403) 678-2222',
        },
      );
      initialStep4.documents = confirmedDocs;

      // Verify all 4 documents reflect real patient details and zero mock data
      for (const key of Object.keys(confirmedDocs) as (keyof typeof confirmedDocs)[]) {
        const doc = confirmedDocs[key];
        assert.ok(doc.html.includes('Robert Vance'), `${key} should include patient name`);
        assert.ok(doc.html.includes('Sarah Connor'), `${key} should include pharmacist name`);
        assert.ok(!doc.html.includes('Jane Doe'), `${key} should not include Jane Doe`);
        assert.ok(!doc.html.includes('Alex Chen'), `${key} should not include Alex Chen`);
        assert.ok(!doc.html.includes('987654321'), `${key} should not include mock PHN`);
        assert.ok(!doc.html.includes('123 Health Ave'), `${key} should not include mock address`);
      }

      // Mark documents as reviewed
      initialStep4.documentReviews.consultation_note.status = 'REVIEWED';
      initialStep4.documentReviews.prescriber_communication.status = 'REVIEWED';
      initialStep4.documentReviews.patient_care_summary.status = 'REVIEWED';
      initialStep4.documentReviews.prescription.status = 'REVIEWED';

      const step4Check = isAdaptStepFourValid(initialStep4);
      assert.equal(step4Check.valid, true);
      assert.equal(step4Check.allReviewed, true);
      assert.equal(step4Check.unreviewedDocTitles.length, 0);

      // Verify full payload serialization roundtrip
      const fullPayload = {
        step1,
        step2A,
        step2B,
        step3A: validStep3A,
        step3B,
        step4: initialStep4,
      };
      const parsedRoundTrip = parseAdaptPayload(fullPayload, 'AB');
      assert.equal(parsedRoundTrip.step1.adaptationType, 'dose');
      assert.equal(parsedRoundTrip.step2A?.demographics?.dateOfBirth, '1965-08-20');
      assert.equal(parsedRoundTrip.step3A?.proposedPrescription?.drugName, 'Metformin 500 mg tablet');
      assert.equal(parsedRoundTrip.step4?.patientInfo?.name, 'Robert Vance');
      assert.equal(parsedRoundTrip.step4?.patientInfo?.confirmed, true);
      assert.equal(parsedRoundTrip.step4?.allReviewed, true);
    });
  });
});





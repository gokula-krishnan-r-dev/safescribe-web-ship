import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  adaptPrescriptionBodyFromHtml,
  buildAdaptPharmacistPrescription,
  buildAdaptPharmacistPrescriptionSource,
  renderAdaptPharmacistPrescription,
  validateAdaptPharmacistPrescriptionBody,
  ADAPT_PHARMACIST_PRESCRIPTION_TITLE,
  ADAPT_PRESCRIPTION_PROMPT_VERSION,
} from './adapt-pharmacist-prescription';
import { ADAPT_PHARMACIST_PRESCRIPTION_PROMPT } from './adapt-pharmacist-prescription-prompt';
import {
  ADAPT_DOCUMENTATION_PRESCRIPTION_PROMPT,
  ADAPT_DOCUMENTATION_PROMPT_KEYS,
} from './adapt-documentation-prompts';
import {
  emptyAdaptStepThreeOptionB,
  evaluateAdaptationSafety,
  generateAdaptationDocuments,
  type AdaptStepOne,
  type AdaptStepThreeOptionA,
  type AdaptStepThreeOptionB,
  type AdaptStepTwoOptionA,
} from './adapt';
import type { RenewMedication } from './renew';

function baseSteps() {
  const metformin: RenewMedication = {
    id: 'med_metformin',
    source: { type: 'manual_search' },
    raw: {
      medicationText: 'Metformin 500 mg tablet',
      directionsText: 'Take 1 tablet by mouth twice daily',
      quantityText: '180',
    },
    normalized: {
      genericName: 'Metformin',
      brandName: null,
      strength: '500 mg',
      dosageForm: 'tablet',
      directions: 'Take 1 tablet by mouth twice daily',
      quantity: 180,
      refillsRemaining: 1,
      prescriberName: 'Dr. Jane Smith',
    },
    confidence: {},
    reviewStatus: 'confirmed',
    ccddMatchStatus: 'matched',
    pharmacistEdited: false,
  };

  const step1: AdaptStepOne = {
    originalPrescription: metformin,
    jurisdiction: 'AB',
    adaptationType: 'dose',
    adaptationReason: { code: 'DOSE_RENAL', label: 'Renal function' },
    dispensingStatus: 'not_yet_dispensed',
  };

  const step2A: AdaptStepTwoOptionA = {
    demographics: {
      sex: 'Female',
      age: '67',
      ageUnit: 'years',
      dateOfBirth: '1959-06-15',
      dateOfBirthUnavailable: false,
      pregnancyStatus: '',
      breastfeedingStatus: '',
    },
    background: {
      allergiesNone: true,
      allergyEntries: [],
      medsNone: true,
      medicationEntries: [],
      conditionsNone: false,
      conditions: ['Type 2 Diabetes'],
    },
  };

  const step3A: AdaptStepThreeOptionA = {
    proposalMode: 'suggested',
    selectedSuggestionId: null,
    proposedPrescription: {
      drugName: 'Metformin 500 mg tablet',
      genericName: 'Metformin',
      brandName: '',
      strength: '500 mg',
      dosageForm: 'tablet',
      dose: '500 mg',
      frequency: 'once daily',
      route: 'oral',
      sig: 'Take 1 tablet by mouth once daily with meal',
      quantity: 90,
      refills: 1,
    },
    modifiedFromSuggestion: false,
    changeSummary: '',
    patientSpecificNotes: '',
    rationaleDraft: '',
    rationaleEditedByPharmacist: false,
    counsellingPreview: [],
    confirmed: true,
  };

  const evaluated = evaluateAdaptationSafety(step1, step2A, undefined, step3A, 'AB');
  const step3B: AdaptStepThreeOptionB = {
    ...emptyAdaptStepThreeOptionB(step1, step2A, undefined, step3A, 'AB'),
    checks: evaluated.checks,
    overallStatus: evaluated.overallStatus,
    clinicalRationale: evaluated.defaultRationale,
    confirmed: true,
    confirmedAt: '2026-09-19T20:00:00.000Z',
  };

  return { step1, step2A, step3A, step3B };
}

describe('Adapt Adapted Prescription', () => {
  it('registers a catalog-only Adapt Rx prompt (deterministic render)', () => {
    assert.equal(ADAPT_DOCUMENTATION_PROMPT_KEYS.PRESCRIPTION, 'ADAPT_DOCUMENTATION_PRESCRIPTION');
    assert.equal(ADAPT_DOCUMENTATION_PRESCRIPTION_PROMPT, ADAPT_PHARMACIST_PRESCRIPTION_PROMPT);
    assert.match(ADAPT_PHARMACIST_PRESCRIPTION_PROMPT, /MUST NOT/);
    assert.match(ADAPT_PHARMACIST_PRESCRIPTION_PROMPT, /deterministic/i);
    assert.match(ADAPT_PHARMACIST_PRESCRIPTION_PROMPT, /treat blank refills as zero/i);
    assert.match(ADAPT_PHARMACIST_PRESCRIPTION_PROMPT, /STRENGTH VS DOSE/i);
    assert.match(ADAPT_PHARMACIST_PRESCRIPTION_PROMPT, /Prescribe clinical Rx layout/i);
    assert.equal(ADAPT_PRESCRIPTION_PROMPT_VERSION, 'adapt-rx-deterministic-v2');
  });

  it('renders the same Prescribe clinical Rx template as Renew', () => {
    const { step1, step2A, step3A, step3B } = baseSteps();
    const built = buildAdaptPharmacistPrescription({
      step1,
      step2A,
      step3A,
      step3B,
      patientInfo: {
        name: 'Eleanor Vance',
        dateOfBirth: '1959-06-15',
        patientId: 'AB1234567',
        phone: '(403) 555-9876',
        address: '456 Heritage Trail, Calgary, AB',
      },
      context: {
        pharmacistName: 'Alex Pharmacist',
        pharmacistLicense: '12345',
        pharmacyName: 'SafeScribe Clinical Pharmacy',
        pharmacyPhone: '403-555-0100',
        pharmacyFax: '403-555-0101',
        confirmedAt: '2026-09-19T20:00:00.000Z',
      },
    });

    assert.equal(built.source.workflow, 'ADAPT');
    assert.match(built.plainText, new RegExp(`^${ADAPT_PHARMACIST_PRESCRIPTION_TITLE}`, 'm'));
    assert.match(built.plainText, /Name: Eleanor Vance/);
    assert.match(built.plainText, /Date of birth:/);
    assert.match(built.plainText, /PHN: AB1234567/);
    assert.match(built.plainText, /\*\*Rx - METFORMIN 500 mg\*\*/);
    assert.match(built.plainText, /Take 1 tablet by mouth once daily with meal/);
    assert.match(built.plainText, /Qty: 90 tablets\s+·\s+Refills: 1\s+·\s+Route: Oral/);
    assert.match(built.plainText, /Start:.*Expiry:/);
    assert.match(built.plainText, /Original Prescriber: Dr\. Jane Smith/);
    assert.match(built.plainText, /Adapted by pharmacist: Alex Pharmacist/);
    assert.match(built.plainText, /Adaptation type: Dose adjustment/);
    assert.equal(validateAdaptPharmacistPrescriptionBody(built.plainText).length, 0);

    const recovered = adaptPrescriptionBodyFromHtml(built.html);
    assert.match(recovered, /^PRESCRIPTION/m);
    assert.match(recovered, /\bRx\s*-/i);
  });

  it('does not invent SIG, quantity, or refill values', () => {
    const { step1, step2A, step3A, step3B } = baseSteps();
    const incomplete: AdaptStepThreeOptionA = {
      ...step3A,
      proposedPrescription: {
        ...step3A.proposedPrescription,
        sig: '',
        quantity: '',
        refills: '',
      },
    };
    const source = buildAdaptPharmacistPrescriptionSource({
      step1,
      step2A,
      step3A: incomplete,
      step3B,
      patientInfo: { name: 'Eleanor Vance' },
    });
    assert.equal(source.validation.readyForRender, false);
    assert.equal(source.prescription.refills, '');
    assert.equal(source.prescription.quantityDisplay, '');
    assert.ok(source.validation.blockingIssues.some((i) => /SIG|directions/i.test(i)));
    assert.ok(source.validation.blockingIssues.some((i) => /Refills/i.test(i)));
    assert.ok(source.validation.blockingIssues.some((i) => /Quantity/i.test(i)));

    const body = renderAdaptPharmacistPrescription(source);
    assert.match(body, /Refills: —/);
    assert.match(body, /Qty: —/);
  });

  it('generateAdaptationDocuments uses the Prescribe-format Adapt Rx assembler', () => {
    const { step1, step2A, step3A, step3B } = baseSteps();
    const docs = generateAdaptationDocuments(
      step1,
      step2A,
      undefined,
      step3A,
      step3B,
      { name: 'Eleanor Vance', dateOfBirth: '1959-06-15', patientId: 'AB1234567' },
    );
    const rx = docs.prescription;
    assert.ok(rx);
    assert.match(rx.plainText, /^PRESCRIPTION/m);
    assert.match(rx.plainText, /\bRx\s*-/i);
    assert.equal(rx.title, 'Adapted Prescription');
    assert.match(rx.html, /data-template="prescribe"/);
    const body = renderAdaptPharmacistPrescription(
      buildAdaptPharmacistPrescriptionSource({
        step1,
        step2A,
        step3A,
        step3B,
        patientInfo: { name: 'Eleanor Vance', dateOfBirth: '1959-06-15', patientId: 'AB1234567' },
      }),
    );
    assert.match(body, /Original Prescriber/);
  });
});

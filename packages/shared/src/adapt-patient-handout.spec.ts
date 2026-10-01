import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  acceptAdaptPatientHandoutDraft,
  assembleAdaptPatientHandoutDraftFromAi,
  buildAdaptPatientHandout,
  buildAdaptPatientHandoutPromptPayload,
  buildAdaptPatientHandoutSource,
  composeAdaptPatientHandoutFallback,
  mergeAdaptPatientHandoutDraft,
  validateAdaptPatientHandoutBody,
  ADAPT_PATIENT_HANDOUT_PROMPT_VERSION,
  ADAPT_PATIENT_HANDOUT_TITLE,
  ADAPT_PATIENT_REASON_TEMPLATES,
} from './adapt-patient-handout';
import { ADAPT_PATIENT_HANDOUT_PROMPT } from './adapt-patient-handout-prompt';
import {
  ADAPT_DOCUMENTATION_PATIENT_CARE_SUMMARY_PROMPT,
  ADAPT_DOCUMENTATION_PROMPT_KEYS,
  adaptPromptCanDrivePatientHandoutGeneration,
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
    additionalComments: 'eGFR declined since last fill',
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
      conditions: ['Type 2 Diabetes', 'CKD stage 3a'],
      medicationEntries: [],
    },
  };

  const step3A: AdaptStepThreeOptionA = {
    proposalMode: 'suggestion',
    selectedSuggestionId: 'sug_1',
    proposedPrescription: {
      drugName: 'Metformin 500 mg tablet',
      genericName: 'Metformin',
      strength: '500 mg',
      dosageForm: 'tablet',
      dose: '500 mg',
      frequency: 'Once daily',
      route: 'Oral',
      quantity: 90,
      refills: 1,
      sig: 'Take 1 tablet by mouth once daily with meal',
    },
    modifiedFromSuggestion: false,
    changeSummary: 'Frequency reduced from twice daily to once daily.',
    patientSpecificNotes: '',
    rationaleDraft: 'Dose reduced due to reduced renal function.',
    rationaleEditedByPharmacist: true,
    counsellingPreview: [
      'Take with your largest meal to minimize stomach upset.',
      'Your next kidney function lab test will be scheduled in 3 to 6 months.',
      'Report any persistent severe fatigue, muscle pains, nausea, or breathing difficulties immediately.',
    ],
    confirmed: true,
    confirmedAt: '2026-09-19T12:00:00.000Z',
  };

  const step3B: AdaptStepThreeOptionB = {
    ...emptyAdaptStepThreeOptionB(),
    ...evaluateAdaptationSafety(step1, step2A, undefined, step3A),
    clinicalRationale:
      'Dose reduced due to eGFR 45 mL/min/1.73 m². Follow-up renal monitoring in 3–6 months.',
    rationaleEditedByPharmacist: true,
    confirmed: true,
    confirmedAt: '2026-09-19T12:05:00.000Z',
  };

  return { step1, step2A, step3A, step3B };
}

describe('Adapt Patient Handout', () => {
  it('registers the Adapt patient-handout prompt for Document Session', () => {
    assert.equal(
      ADAPT_DOCUMENTATION_PROMPT_KEYS.PATIENT_CARE_SUMMARY,
      'ADAPT_DOCUMENTATION_PATIENT_CARE_SUMMARY',
    );
    assert.equal(ADAPT_DOCUMENTATION_PATIENT_CARE_SUMMARY_PROMPT, ADAPT_PATIENT_HANDOUT_PROMPT);
    assert.ok(adaptPromptCanDrivePatientHandoutGeneration(ADAPT_PATIENT_HANDOUT_PROMPT));
    assert.match(ADAPT_PATIENT_HANDOUT_PROMPT, /what_changed/);
    assert.match(ADAPT_PATIENT_HANDOUT_PROMPT, /confirmed_counselling/);
    assert.match(ADAPT_PATIENT_HANDOUT_PROMPT, /DO NOT invent/i);
    assert.equal(ADAPT_PATIENT_HANDOUT_PROMPT_VERSION, 'adapt-handout-v2');
  });

  it('renders YOUR UPDATED MEDICATION PLAN with deterministic Rx fields', () => {
    const { step1, step2A, step3A, step3B } = baseSteps();
    const built = buildAdaptPatientHandout({
      step1,
      step2A,
      step3A,
      step3B,
      patientInfo: {
        name: 'Eleanor Vance',
        dateOfBirth: '1959-06-15',
      },
      context: {
        pharmacyName: 'ABC Pharmacy',
        pharmacyPhone: '780-000-0000',
        pharmacistName: 'Alex Pharmacist',
        confirmedAt: '2026-09-19T12:05:00.000Z',
      },
    });

    assert.equal(built.source.validation.readyForRender, true);
    assert.match(built.plainText, new RegExp(`^${ADAPT_PATIENT_HANDOUT_TITLE}`, 'm'));
    assert.match(built.plainText, /Patient: Eleanor Vance/);
    assert.match(built.plainText, /Take 1 tablet by mouth once daily with meal/);
    assert.match(built.plainText, /Quantity: 90 tablets/);
    assert.match(built.plainText, /Refills: 1/);
    assert.match(built.plainText, /WHAT CHANGED/i);
    assert.match(built.plainText, /twice daily.*once daily|once daily/i);
    assert.match(built.plainText, /kidney function/i);
    assert.match(built.plainText, /QUESTIONS\?/i);
    assert.match(built.plainText, /ABC Pharmacy/);
    assert.doesNotMatch(built.plainText, /doctor has been notified/i);
    assert.doesNotMatch(built.plainText, /eCPS|Bugs\s*&\s*Drugs|product monograph/i);
    assert.equal(validateAdaptPatientHandoutBody(built.plainText).length, 0);
  });

  it('uses DOSE_RENAL patient-friendly reason template', () => {
    const { step1, step2A, step3A, step3B } = baseSteps();
    const source = buildAdaptPatientHandoutSource({ step1, step2A, step3A, step3B });
    assert.equal(
      source.adaptation.patientFriendlyReason,
      ADAPT_PATIENT_REASON_TEMPLATES.DOSE_RENAL,
    );
    const fallback = composeAdaptPatientHandoutFallback(source);
    assert.equal(fallback.why_it_changed, ADAPT_PATIENT_REASON_TEMPLATES.DOSE_RENAL);
  });

  it('rejects AI drafts that invent emergency or notification claims', () => {
    const { step1, step2A, step3A, step3B } = baseSteps();
    const source = buildAdaptPatientHandoutSource({
      step1,
      step2A,
      step3A: { ...step3A, counsellingPreview: [], confirmed: true },
      step3B,
    });
    const bad = acceptAdaptPatientHandoutDraft(
      {
        what_changed: 'Your schedule changed.',
        why_it_changed: 'Kidney function.',
        how_to_use_additional_guidance: [],
        what_to_expect: [],
        follow_up: [],
        when_to_get_help: ['Call 911 if you feel unwell.'],
      },
      source,
    );
    assert.equal(bad.ok, false);
    assert.ok(bad.warnings.some((w) => /emergency|Invented when-to-get-help/i.test(w)));

    const notified = acceptAdaptPatientHandoutDraft(
      {
        what_changed: '',
        why_it_changed: '',
        how_to_use_additional_guidance: [],
        what_to_expect: [],
        follow_up: [],
        when_to_get_help: [],
      },
      source,
    );
    // empty draft is fine
    assert.equal(notified.ok, true);

    const doctorNotified = acceptAdaptPatientHandoutDraft(
      {
        what_changed: 'Your doctor has been notified of this change.',
        why_it_changed: '',
        how_to_use_additional_guidance: [],
        what_to_expect: [],
        follow_up: [],
        when_to_get_help: [],
      },
      source,
    );
    assert.equal(doctorNotified.ok, false);
  });

  it('prompt payload omits medication identity for AI narrative-only use', () => {
    const { step1, step2A, step3A, step3B } = baseSteps();
    const source = buildAdaptPatientHandoutSource({ step1, step2A, step3A, step3B });
    const payload = buildAdaptPatientHandoutPromptPayload(source);
    assert.equal(payload.document_type, 'adapt_patient_handout');
    assert.ok((payload as { confirmed_change_summary: { before: string } }).confirmed_change_summary.before);
    assert.equal(
      Object.prototype.hasOwnProperty.call(payload, 'final_adapted_prescription'),
      false,
    );
  });

  it('assembles AI handout drafts from flat and nested JSON', () => {
    const flat = assembleAdaptPatientHandoutDraftFromAi({
      what_changed: 'Your dosing schedule changed from twice daily to once daily.',
      why_it_changed: 'Your dose was changed because of your kidney function.',
      how_to_use_additional_guidance: ['Take with food.'],
      what_to_expect: [],
      follow_up: ['Lab check in 3 to 6 months.'],
      when_to_get_help: [],
    });
    assert.equal(flat.ok, true);
    assert.match(flat.draft.what_changed, /once daily/);
    assert.equal(flat.draft.how_to_use_additional_guidance[0], 'Take with food.');

    const nested = assembleAdaptPatientHandoutDraftFromAi({
      patient_care_summary: {
        what_changed: 'Form changed.',
        why_it_changed: 'Easier to take.',
        follow_up: 'Call the pharmacy if you have questions.',
      },
    });
    assert.equal(nested.ok, true);
    assert.equal(nested.draft.follow_up.length, 1);

    const incomplete = assembleAdaptPatientHandoutDraftFromAi(null);
    assert.equal(incomplete.ok, false);
  });

  it('merges empty AI fields with deterministic fallback', () => {
    const { step1, step2A, step3A, step3B } = baseSteps();
    const source = buildAdaptPatientHandoutSource({ step1, step2A, step3A, step3B });
    const fallback = composeAdaptPatientHandoutFallback(source);
    const merged = mergeAdaptPatientHandoutDraft(
      {
        what_changed: 'Your schedule is now once daily.',
        why_it_changed: '',
        how_to_use_additional_guidance: [],
        what_to_expect: [],
        follow_up: [],
        when_to_get_help: [],
      },
      fallback,
    );
    assert.equal(merged.what_changed, 'Your schedule is now once daily.');
    assert.equal(merged.why_it_changed, fallback.why_it_changed);

    const built = buildAdaptPatientHandout({
      step1,
      step2A,
      step3A,
      step3B,
      aiDraft: {
        what_changed: 'Your schedule is now once daily.',
        why_it_changed: '',
        how_to_use_additional_guidance: [],
        what_to_expect: [],
        follow_up: [],
        when_to_get_help: [],
      },
    });
    assert.equal(built.usedAiDraft, true);
    assert.match(built.plainText, /once daily/);
    assert.match(built.plainText, /kidney function/i);
  });

  it('generateAdaptationDocuments uses the Adapt patient handout assembler', () => {
    const { step1, step2A, step3A, step3B } = baseSteps();
    const docs = generateAdaptationDocuments(step1, step2A, undefined, step3A, step3B, {
      name: 'Eleanor Vance',
      dateOfBirth: '1959-06-15',
    });
    const handout = docs.patient_care_summary;
    assert.match(handout.plainText, /YOUR UPDATED MEDICATION PLAN/i);
    assert.match(handout.html, /adapt-patient-handout/);
    assert.match(handout.plainText, /once daily/i);
  });

  it('hides empty optional sections when counselling is not confirmed', () => {
    const { step1, step2A, step3A, step3B } = baseSteps();
    const built = buildAdaptPatientHandout({
      step1,
      step2A,
      step3A: { ...step3A, counsellingPreview: [], confirmed: false },
      step3B: {
        ...step3B,
        checks: step3B.checks.filter((c) => c.type !== 'monitoring'),
        clinicalRationale: '',
      },
      patientInfo: { name: 'Eleanor Vance' },
    });
    // Without confirmed counselling, when-to-get-help from preview should be absent
    assert.doesNotMatch(built.plainText, /WHEN TO GET HELP/i);
    // Reason template from DOSE_RENAL still applies
    assert.match(built.plainText, /WHY IT WAS CHANGED/i);
  });
});

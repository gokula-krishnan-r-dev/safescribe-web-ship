import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  acceptAdaptPcpDraft,
  assembleAdaptPcpDraftFromAi,
  buildAdaptPrescriberCommunication,
  buildAdaptPcpPayload,
  buildAdaptPcpPromptPayload,
  composeAdaptPcpFallback,
  renderAdaptPcpReferences,
  ADAPT_PCP_DEFAULT_CLOSING,
  ADAPT_PCP_NOTIFICATION_TITLE,
  ADAPT_PCP_PROMPT_VERSION,
  ADAPT_PCP_SALUTATION,
} from './adapt-pcp-communication';
import { ADAPT_PCP_COMMUNICATION_PROMPT } from './adapt-pcp-communication-prompt';
import {
  ADAPT_DOCUMENTATION_PRESCRIBER_COMMUNICATION_PROMPT,
  ADAPT_DOCUMENTATION_PROMPT_KEYS,
  adaptPromptCanDrivePcpGeneration,
} from './adapt-documentation-prompts';
import {
  emptyAdaptStepThreeOptionB,
  emptyAdaptStepTwoOptionB,
  evaluateAdaptationSafety,
  generateAdaptationDocuments,
  type AdaptStepOne,
  type AdaptStepThreeOptionA,
  type AdaptStepThreeOptionB,
  type AdaptStepTwoOptionA,
  type AdaptStepTwoOptionB,
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
      medsNone: true,
      medicationEntries: [],
      conditionsNone: false,
      conditions: [
        'Type 2 Diabetes',
        'CKD Stage 3a (eGFR 45 mL/min/1.73 m², date: 15-Sep-2026)',
      ],
    },
  };

  const step2B: AdaptStepTwoOptionB = {
    ...emptyAdaptStepTwoOptionB(),
    isTakingMedication: true,
    currentUse: 'metformin 500 mg twice daily',
    duration: 'approximately 3 months',
    effectiveness: 'effective',
    adverseEffects: 'none_reported',
    adherence: 'taking_as_directed',
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
    counsellingPreview: ['Take with the largest meal of the day'],
    confirmed: true,
  };

  const evaluated = evaluateAdaptationSafety(step1, step2A, step2B, step3A, 'AB');
  const step3B: AdaptStepThreeOptionB = {
    ...emptyAdaptStepThreeOptionB(step1, step2A, step2B, step3A, 'AB'),
    checks: evaluated.checks,
    overallStatus: evaluated.overallStatus,
    clinicalRationale: evaluated.defaultRationale,
    confirmed: true,
    confirmedAt: '2026-09-19T20:00:00.000Z',
    pharmacistReferencesConsulted: [
      { type: 'ecps', label: 'eCPS', selected: true },
      { type: 'bugs_and_drugs', label: 'Bugs & Drugs', selected: false },
    ],
    safeScribeSupportingReferences: [
      {
        referenceId: 'metformin-pm',
        title: 'Metformin Product Monograph (Canada, 2023)',
        organizationPublisher: 'Health Canada',
        yearEdition: '2023',
        sectionsUsed: ['Renal Impairment'],
        usedForCheckCodes: ['renal_function'],
        source: 'pathway_library',
      },
    ],
  };

  return { step1, step2A, step2B, step3A, step3B };
}

describe('Adapt PCP / Prescriber Communication', () => {
  it('registers the Adapt PCP system prompt for Document Session JSON fields', () => {
    assert.equal(
      ADAPT_DOCUMENTATION_PROMPT_KEYS.PRESCRIBER_COMMUNICATION,
      'ADAPT_DOCUMENTATION_PRESCRIBER_COMMUNICATION',
    );
    assert.equal(
      ADAPT_DOCUMENTATION_PRESCRIBER_COMMUNICATION_PROMPT,
      ADAPT_PCP_COMMUNICATION_PROMPT,
    );
    assert.equal(adaptPromptCanDrivePcpGeneration(ADAPT_PCP_COMMUNICATION_PROMPT), true);
    assert.match(ADAPT_PCP_COMMUNICATION_PROMPT, /pharmacist_approved_rationale/);
    assert.match(ADAPT_PCP_COMMUNICATION_PROMPT, /prescriber_action_request/);
    assert.match(ADAPT_PCP_COMMUNICATION_PROMPT, /Do NOT invent references/i);
    assert.match(ADAPT_PCP_COMMUNICATION_PROMPT, /adapt_prescriber_communication/);
    assert.match(ADAPT_PCP_COMMUNICATION_PROMPT, /"intro"/);
    assert.match(ADAPT_PCP_COMMUNICATION_PROMPT, /"rationale"/);
    assert.match(ADAPT_PCP_COMMUNICATION_PROMPT, /"closing"/);
    assert.equal(ADAPT_PCP_PROMPT_VERSION, 'adapt-pcp-v1');
  });

  it('assembles Adapt PCP drafts from Assist Engine JSON (including nested wrappers)', () => {
    const flat = assembleAdaptPcpDraftFromAi({
      intro: 'I adapted the prescription after assessing the patient.',
      rationale: 'Dose reduced due to reduced renal function.',
      relevantClinicalInformation: 'Recent eGFR: 45 mL/min/1.73 m².',
      monitoringFollowUp: 'Renal function reassessment in 3–6 months.',
      counsellingAgreement: '',
      closing: ADAPT_PCP_DEFAULT_CLOSING,
    });
    assert.equal(flat.ok, true);
    assert.match(flat.draft.rationale, /renal/i);

    const nested = assembleAdaptPcpDraftFromAi({
      prescriber_communication: {
        intro: 'Intro text',
        rationale: 'Rationale text',
        closing: 'Closing text',
      },
    });
    assert.equal(nested.ok, true);
    assert.equal(nested.draft.intro, 'Intro text');

    const incomplete = assembleAdaptPcpDraftFromAi({ intro: 'Only intro' });
    assert.equal(incomplete.ok, false);
  });

  it('builds a concise notification from the frozen Adapt snapshot', () => {
    const { step1, step2A, step2B, step3A, step3B } = baseSteps();
    const built = buildAdaptPrescriberCommunication({
      step1,
      step2A,
      step2B,
      step3A,
      step3B,
      patientInfo: {
        name: 'Eleanor Vance',
        dateOfBirth: '1959-06-15',
        patientId: 'AB1234567',
      },
      context: {
        pharmacistName: 'Alex Pharmacist',
        pharmacistLicense: '12345',
        pharmacyName: 'SafeScribe Clinical Pharmacy',
        pharmacyPhone: '403-555-0100',
        pharmacyFax: '403-555-0101',
      },
    });

    assert.equal(built.usedAiDraft, false);
    assert.match(built.html, new RegExp(ADAPT_PCP_NOTIFICATION_TITLE));
    assert.match(built.html, new RegExp(ADAPT_PCP_SALUTATION));
    assert.match(built.html, /Eleanor Vance/);
    assert.match(built.html, /Original prescription/i);
    assert.match(built.html, /Adapted prescription/i);
    assert.match(built.html, /once daily/i);
    assert.match(built.html, /Quantity: 90/i);
    assert.match(built.html, /Clinical reference consulted/i);
    assert.match(built.html, /eCPS/);
    assert.doesNotMatch(built.html, /Metformin Product Monograph/);
    assert.match(built.plainText, new RegExp(ADAPT_PCP_DEFAULT_CLOSING.slice(0, 40)));
    assert.doesNotMatch(built.plainText, /prescriber was notified/i);
    assert.doesNotMatch(built.plainText, /\bStep\s*[1234]\b/i);
    assert.doesNotMatch(built.plainText, /AdaptReferenceSelector/);

    const { payload } = buildAdaptPcpPayload({
      step1,
      step2A,
      step2B,
      step3A,
      step3B,
    });
    assert.equal(payload.document_type, 'adapt_prescriber_communication');
    assert.equal(payload.prescriber_action_request.type, 'for_information');
    assert.equal(payload.pharmacist_references_consulted.length, 1);
    assert.ok(payload.relevant_labs_vitals.some((l) => l.name === 'eGFR' && l.value === '45'));

    const promptPayload = buildAdaptPcpPromptPayload(payload);
    assert.ok(!('provenance' in promptPayload));
    assert.ok(!('patient' in promptPayload));
  });

  it('does not invent counselling when none was confirmed', () => {
    const { step1, step2A, step2B, step3A, step3B } = baseSteps();
    const noCounsel: AdaptStepThreeOptionA = {
      ...step3A,
      counsellingPreview: [],
    };
    const draft = composeAdaptPcpFallback(
      buildAdaptPcpPayload({
        step1,
        step2A,
        step2B,
        step3A: noCounsel,
        step3B,
      }).payload,
    );
    assert.equal(draft.counsellingAgreement, '');
    assert.doesNotMatch(draft.intro + draft.rationale + draft.closing, /counsel+ed/i);
  });

  it('omits SafeScribe supporting references by default and includes them when enabled', () => {
    const { step1, step2A, step2B, step3A, step3B } = baseSteps();
    const { payload } = buildAdaptPcpPayload({
      step1,
      step2A,
      step2B,
      step3A,
      step3B,
    });
    assert.equal(renderAdaptPcpReferences(payload), 'Clinical reference consulted:\neCPS');
    assert.match(
      renderAdaptPcpReferences(payload, {
        includePharmacistConsultedReferences: true,
        includePrimarySafeScribeReference: true,
        maxSafeScribeReferences: 1,
      }),
      /Supporting reference:\nMetformin Product Monograph/,
    );
  });

  it('rejects AI drafts that invent notification or approval requests', () => {
    const { step1, step2A, step2B, step3A, step3B } = baseSteps();
    const { payload } = buildAdaptPcpPayload({
      step1,
      step2A,
      step2B,
      step3A,
      step3B,
    });
    const bad = acceptAdaptPcpDraft(
      {
        intro: 'I adapted the prescription.',
        rationale: 'Dose reduced for renal function.',
        relevantClinicalInformation: '',
        monitoringFollowUp: '',
        counsellingAgreement: '',
        closing: 'The prescriber was notified. Please review and approve.',
      },
      payload,
    );
    assert.equal(bad.ok, false);
    assert.ok(bad.warnings.length >= 1);

    const rejected = buildAdaptPrescriberCommunication({
      step1,
      step2A,
      step2B,
      step3A,
      step3B,
      aiDraft: bad.draft,
    });
    assert.equal(rejected.usedAiDraft, false);
    assert.match(rejected.plainText, /continuity of care/i);
  });

  it('accepts a valid AI draft', () => {
    const { step1, step2A, step2B, step3A, step3B } = baseSteps();
    const built = buildAdaptPrescriberCommunication({
      step1,
      step2A,
      step2B,
      step3A,
      step3B,
      aiDraft: {
        intro:
          'I am writing to inform you that I adapted the patient metformin prescription after reviewing renal function.',
        rationale:
          'Dose reduction is appropriate given the patient eGFR and the pharmacist clinical assessment.',
        relevantClinicalInformation: 'Recent eGFR: 45 mL/min/1.73 m².',
        monitoringFollowUp: 'Renal function should be reassessed in 3 to 6 months.',
        counsellingAgreement:
          'The patient was counselled regarding the revised dosing schedule.',
        closing: ADAPT_PCP_DEFAULT_CLOSING,
      },
    });
    assert.equal(built.usedAiDraft, true);
    assert.match(built.plainText, /Dose reduction is appropriate/);
  });

  it('generateAdaptationDocuments uses the Adapt PCP assembler for prescriber_communication', () => {
    const { step1, step2A, step2B, step3A, step3B } = baseSteps();
    const docs = generateAdaptationDocuments(
      step1,
      step2A,
      step2B,
      step3A,
      step3B,
      { name: 'Eleanor Vance', dateOfBirth: '1959-06-15', patientId: 'AB1234567' },
    );
    const pcp = docs.prescriber_communication;
    assert.ok(pcp);
    assert.match(pcp.html, /PHARMACIST ADAPTATION NOTIFICATION/);
    assert.match(pcp.html, /Dear Colleague/);
    assert.match(pcp.plainText, /Original prescription/i);
    assert.match(pcp.plainText, /Adapted prescription/i);
  });
});

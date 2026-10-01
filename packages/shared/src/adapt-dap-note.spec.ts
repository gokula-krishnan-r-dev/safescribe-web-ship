import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  acceptAdaptDapDraft,
  assembleAdaptDapDraftFromAi,
  buildAdaptConsultationNote,
  buildAdaptDapPayload,
  buildAdaptDapPromptPayload,
  composeAdaptDapFallback,
  freezeAdaptDocumentSnapshot,
  formatAdaptDapChartCopy,
  renderAdaptDapReferences,
  validateAdaptDapNote,
  ADAPT_DAP_NOTE_TITLE,
  ADAPT_DAP_PROMPT_VERSION,
} from './adapt-dap-note';
import { ADAPT_DAP_CONSULTATION_NOTE_PROMPT } from './adapt-dap-consultation-note-prompt';
import {
  ADAPT_DOCUMENTATION_CONSULTATION_NOTE_PROMPT,
  ADAPT_DOCUMENTATION_PROMPT_KEYS,
  adaptPromptCanDriveDapGeneration,
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
      allergiesNone: false,
      allergyEntries: [{ id: 'a1', drug: 'Penicillin', reaction: 'rash' }],
      medsNone: false,
      medicationEntries: [
        { id: 'm1', name: 'Ramipril', dose: '5 mg', frequency: 'once daily' },
      ],
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
    patientGoals: 'Maintain glycemic control with safer renal dosing',
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
    counsellingPreview: [
      'Take with the largest meal of the day',
      'Seek care for severe GI symptoms or unexplained muscle pain',
    ],
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
      {
        type: 'other',
        label: 'Other reference',
        title: 'Diabetes Canada Clinical Practice Guidelines',
        selected: true,
      },
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

describe('Adapt DAP consultation note', () => {
  it('registers the Adapt DAP system prompt for Document Session JSON fields', () => {
    assert.equal(
      ADAPT_DOCUMENTATION_PROMPT_KEYS.CONSULTATION_NOTE,
      'ADAPT_DOCUMENTATION_CONSULTATION_NOTE',
    );
    assert.equal(ADAPT_DOCUMENTATION_CONSULTATION_NOTE_PROMPT, ADAPT_DAP_CONSULTATION_NOTE_PROMPT);
    assert.equal(adaptPromptCanDriveDapGeneration(ADAPT_DAP_CONSULTATION_NOTE_PROMPT), true);
    assert.match(ADAPT_DAP_CONSULTATION_NOTE_PROMPT, /key_clinical_findings/);
    assert.match(ADAPT_DAP_CONSULTATION_NOTE_PROMPT, /pharmacist_references_consulted/);
    assert.match(ADAPT_DAP_CONSULTATION_NOTE_PROMPT, /Do NOT generate the visible reference list/i);
    assert.match(ADAPT_DAP_CONSULTATION_NOTE_PROMPT, /adapt_dap_note/);
    assert.match(ADAPT_DAP_CONSULTATION_NOTE_PROMPT, /"data"/);
    assert.match(ADAPT_DAP_CONSULTATION_NOTE_PROMPT, /"assessment"/);
    assert.match(ADAPT_DAP_CONSULTATION_NOTE_PROMPT, /"plan"/);
    assert.equal(ADAPT_DAP_PROMPT_VERSION, 'adapt-dap-v2');
  });

  it('assembles Adapt DAP drafts from Assist Engine JSON (including nested wrappers)', () => {
    const flat = assembleAdaptDapDraftFromAi({
      data: 'Original prescription: metformin 500 mg.',
      assessment: 'Dose reduction appropriate given eGFR.',
      plan: 'Prescription adapted to once daily.',
    });
    assert.equal(flat.ok, true);
    assert.match(flat.draft.data, /metformin/i);

    const nested = assembleAdaptDapDraftFromAi({
      consultation_note: {
        data: 'Data section',
        assessment: 'Assessment section',
        plan: 'Plan section',
      },
    });
    assert.equal(nested.ok, true);
    assert.equal(nested.draft.assessment, 'Assessment section');

    const incomplete = assembleAdaptDapDraftFromAi({ data: 'Only data' });
    assert.equal(incomplete.ok, false);
  });

  it('freezes a Step 3 document snapshot and reuses id when hash is stable', () => {
    const { step1, step2A, step2B, step3A, step3B } = baseSteps();
    const first = freezeAdaptDocumentSnapshot({
      step1,
      step2A,
      step2B,
      step3A,
      step3B,
      consultationId: 'c1',
    });
    assert.ok(first.snapshotId.startsWith('adapt_snap_'));
    assert.ok(first.snapshotHash.length >= 8);
    assert.equal(first.promptVersion, ADAPT_DAP_PROMPT_VERSION);
    assert.equal(first.pharmacistReferencesConsulted.length, 2);
    assert.equal(first.safeScribeSupportingReferences[0]?.referenceId, 'metformin-pm');

    const withIds: AdaptStepThreeOptionB = {
      ...step3B,
      documentSnapshotId: first.snapshotId,
      documentSnapshotHash: first.snapshotHash,
    };
    const second = freezeAdaptDocumentSnapshot({
      step1,
      step2A,
      step2B,
      step3A,
      step3B: withIds,
    });
    assert.equal(second.snapshotId, first.snapshotId);
    assert.equal(second.snapshotHash, first.snapshotHash);
  });

  it('builds a complete clinical DAP story from structured Adapt data only', () => {
    const { step1, step2A, step2B, step3A, step3B } = baseSteps();
    const built = buildAdaptConsultationNote({
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
        dateString: '19-Sep-2026',
      },
    });

    assert.equal(built.usedAiDraft, false);
    assert.match(built.html, /D — Data/);
    assert.match(built.html, /A — Assessment/);
    assert.match(built.html, /P — Plan/);
    assert.match(built.html, /References consulted by pharmacist/);
    assert.match(built.html, /SafeScribe supporting references/);
    assert.match(built.html, /eCPS/);
    assert.match(built.html, /Diabetes Canada Clinical Practice Guidelines/);
    assert.match(built.html, /Metformin Product Monograph/);
    assert.doesNotMatch(built.html, /Bugs & Drugs/);
    assert.match(built.plainText, /Original prescription/i);
    assert.match(built.plainText, /Renal function/i);
    assert.match(built.plainText, /once daily/i);
    assert.match(built.plainText, /Take with the largest meal/);
    assert.doesNotMatch(built.plainText, /\bStep\s*[1234]\b/i);
    assert.doesNotMatch(built.plainText, /AdaptReferenceSelector/);
    assert.equal(ADAPT_DAP_NOTE_TITLE.includes('DAP'), true);

    const { payload } = buildAdaptDapPayload({
      step1,
      step2A,
      step2B,
      step3A,
      step3B,
    });
    assert.equal(payload.original_prescription.drug.includes('Metformin'), true);
    assert.equal(payload.final_adapted_prescription.sig.includes('once daily'), true);
    assert.equal(payload.current_medication_experience.isTakingMedication, true);
    assert.ok(payload.relevant_labs_vitals.some((l) => l.name === 'eGFR' && l.value === '45'));
    assert.equal(payload.pharmacist_references_consulted.length, 2);
    assert.equal(payload.counselling_confirmed.length, 2);
    assert.ok(payload.patient_context.current_medications.some((m) => /Ramipril/i.test(m)));

    const promptPayload = buildAdaptDapPromptPayload(payload);
    assert.equal(promptPayload.document_type, 'adapt_dap_note');
    assert.ok(!('provenance' in promptPayload));
  });

  it('documents not-started medication experience without inventing tolerability', () => {
    const { step1, step2A, step3A, step3B } = baseSteps();
    const step2B: AdaptStepTwoOptionB = {
      ...emptyAdaptStepTwoOptionB(),
      isTakingMedication: false,
    };
    const draft = composeAdaptDapFallback(
      buildAdaptDapPayload({ step1, step2A, step2B, step3A, step3B }).payload,
    );
    assert.match(draft.data, /had not yet been started/i);
    assert.doesNotMatch(draft.data, /adherence|tolerability|effectiveness/i);
  });

  it('omits References section when neither reference category is selected', () => {
    const { step1, step2A, step2B, step3A, step3B } = baseSteps();
    const cleared: AdaptStepThreeOptionB = {
      ...step3B,
      pharmacistReferencesConsulted: [{ type: 'ecps', label: 'eCPS', selected: false }],
      safeScribeSupportingReferences: [],
    };
    const { payload } = buildAdaptDapPayload({
      step1,
      step2A,
      step2B,
      step3A,
      step3B: cleared,
    });
    assert.equal(renderAdaptDapReferences(payload), '');
    const note = buildAdaptConsultationNote({
      step1,
      step2A,
      step2B,
      step3A,
      step3B: cleared,
    });
    assert.doesNotMatch(note.html, /<h3>References<\/h3>/);
  });

  it('rejects AI drafts that invent counselling, notification, or internal terms', () => {
    const { step1, step2A, step2B, step3A, step3B } = baseSteps();
    const { payload } = buildAdaptDapPayload({
      step1,
      step2A,
      step2B,
      step3A,
      step3B,
    });
    payload.counselling_confirmed = [];
    payload.communication = {
      prescriber_notification_required: null,
      status: '',
      method: '',
      recipient: '',
      date: '',
    };

    const bad = acceptAdaptDapDraft(
      {
        data: 'Patient presented with metformin.',
        assessment: 'Adaptation appropriate per Step 3 AdaptReferenceSelector.',
        plan: 'Patient was counselled. Prescriber was notified by fax.',
      },
      payload,
    );
    assert.equal(bad.ok, false);
    assert.ok(bad.warnings.length >= 1);

    const chart = formatAdaptDapChartCopy(composeAdaptDapFallback(payload));
    assert.equal(validateAdaptDapNote(chart, payload).length, 0);
  });

  it('accepts a valid AI draft and falls back when invalid', () => {
    const { step1, step2A, step2B, step3A, step3B } = baseSteps();
    const good = buildAdaptConsultationNote({
      step1,
      step2A,
      step2B,
      step3A,
      step3B,
      aiDraft: {
        data: 'Original prescription: metformin 500 mg tablet twice daily. Adaptation considered for renal function.',
        assessment:
          'Proposed adaptation: metformin 500 mg once daily. Dose reduction is appropriate given reduced renal function.',
        plan: 'Prescription adapted to metformin 500 mg once daily. Quantity 90; 1 refill.',
      },
    });
    assert.equal(good.usedAiDraft, true);
    assert.match(good.plainText, /Dose reduction is appropriate/);

    const rejected = buildAdaptConsultationNote({
      step1,
      step2A,
      step2B,
      step3A,
      step3B,
      aiDraft: {
        data: 'Patient presented with metformin.',
        assessment: 'Adaptation appropriate per Step 3 AdaptReferenceSelector.',
        plan: 'Patient was counselled. Prescriber was notified by fax.',
      },
    });
    // Clear counselling in a dedicated validation path already covered above;
    // this draft must still fail on invented notification + internal terms.
    assert.equal(rejected.usedAiDraft, false);
    assert.ok(rejected.warnings.some((w) => /fallback|Unsupported DAP claim/i.test(w)));
  });

  it('generateAdaptationDocuments uses the Adapt DAP assembler for consultation_note', () => {
    const { step1, step2A, step2B, step3A, step3B } = baseSteps();
    const docs = generateAdaptationDocuments(
      step1,
      step2A,
      step2B,
      step3A,
      step3B,
      { name: 'Eleanor Vance', dateOfBirth: '1959-06-15', patientId: 'AB1234567' },
    );
    const dap = docs.consultation_note;
    assert.ok(dap);
    assert.equal(dap.title, 'Pharmacist Consultation Note (DAP)');
    assert.match(dap.html, /Consultation type:<\/strong> Prescription Adaptation/);
    assert.match(dap.html, /D — Data/);
    assert.match(dap.plainText, /References consulted by pharmacist/);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DAP_CONSENT_SENTENCE,
  computeDocumentationSourceHash,
  documentationDocumentHasContent,
  documentationLlmKeysToGenerate,
  documentationLlmRetryKeys,
  documentationPackageIsReusable,
  filterPatientSpecificSafetyFindings,
  resolveDocumentationLlmKeys,
  ensureDapOpeningConsent,
  insertConsentSentence,
  isPcpCommunicationCompleted,
  isPatientHandoutProvided,
  isReconstructedSigText,
  looksLikeDiagnosticSymptom,
  readConsentObtained,
  resolveNoRedFlagsRequiringReferral,
  restoreAmbiguousPatientInstruction,
  stripDuplicateMedicationUse,
  stripOverallRedFlagClaim,
  structuredRegimenConflictsWithDirections,
  substantiallyDuplicatesSig,
} from './documentation-encounter';

describe('documentation encounter helpers', () => {
  it('Test A — reads explicit consent and inserts the DAP sentence', () => {
    assert.equal(
      readConsentObtained({ demographics: { patientConsentObtained: true } }),
      true,
    );
    assert.equal(readConsentObtained({ consentObtained: false, demographics: {} }), false);
    const data = insertConsentSentence('25-year-old assessed for migraine.', true);
    assert.equal(data.startsWith(DAP_CONSENT_SENTENCE), true);
    assert.equal(data, `${DAP_CONSENT_SENTENCE}\n\n25-year-old assessed for migraine.`);
  });

  it('always opens D with the canonical consent paragraph and replaces legacy wording', () => {
    const once = ensureDapOpeningConsent('25-year-old assessed for migraine.');
    assert.equal(once, `${DAP_CONSENT_SENTENCE}\n\n25-year-old assessed for migraine.`);
    assert.equal(ensureDapOpeningConsent(once), once);
    const migrated = ensureDapOpeningConsent(
      'Patient informed consent obtained prior to the pharmacist assessment. 25-year-old assessed for migraine.',
    );
    assert.equal(migrated, `${DAP_CONSENT_SENTENCE}\n\n25-year-old assessed for migraine.`);
    assert.equal(insertConsentSentence('25-year-old assessed for migraine.', false), '25-year-old assessed for migraine.');
  });

  it('Test B — drops reconstructed / duplicate SIGs from MEDICATION_USE', () => {
    const directions =
      'Take 1 tablet by mouth at onset of migraine. If the migraine returns after an initial response, may repeat 1 tablet after at least 2 hours. Maximum 2 tablets (25 mg) in 24 hours.';
    assert.equal(
      isReconstructedSigText(
        'Take almotriptan (almotriptan malate) 1 Tablet(s) by Oral route Once daily for 1 days.',
      ),
      true,
    );
    const kept = stripDuplicateMedicationUse(
      [
        'Take almotriptan (almotriptan malate) 1 Tablet(s) by Oral route Once daily for 1 days.',
        'Take ALMOTRIPTAN 1 tablet at onset of migraine.',
        'Swallow the tablet whole with water.',
      ],
      [{ display_name: 'ALMOTRIPTAN', patient_directions: directions }],
    );
    assert.deepEqual(kept, ['Swallow the tablet whole with water.']);
    assert.equal(
      substantiallyDuplicatesSig('Take ALMOTRIPTAN 1 tablet at onset of migraine.', directions),
      true,
    );
  });

  it('Test C — diagnostic symptoms are not treatment expectations', () => {
    assert.equal(
      looksLikeDiagnosticSymptom('Migraine pain may occur with nausea, vomiting, and sensitivity to light.', [
        'Nausea',
        'Light sensitivity',
      ]),
      true,
    );
    assert.equal(
      looksLikeDiagnosticSymptom(
        'The degree and timing of relief may vary between individuals and attacks.',
        ['Nausea', 'Light sensitivity'],
      ),
      false,
    );
  });

  it('Test D — restores ambiguous self-care wording', () => {
    const original = 'Apply a cold pack to the forehead or back of the neck for comfort.';
    assert.equal(
      restoreAmbiguousPatientInstruction(
        'Apply it to the forehead or back of the neck for comfort.',
        original,
      ),
      original,
    );
  });

  it('Test E — generic renal warnings do not leak without renal impairment', () => {
    const kept = filterPatientSpecificSafetyFindings(
      ['Severe renal impairment requires dose adjustment.', 'Patient is pregnant — review MAXALT RPD.'],
      { medicalConditions: 'migraine', pregnancyStatus: 'No' },
    );
    assert.deepEqual(kept, []);
  });

  it('Test F — overall no-red-flag claim requires explicit confirmation', () => {
    assert.equal(
      resolveNoRedFlagsRequiringReferral({
        hasRedFlags: false,
        acknowledgments: [{ flag: 'Thunderclap', answer: 'no', action: 'clear' }],
      }),
      true,
    );
    assert.equal(
      resolveNoRedFlagsRequiringReferral({
        hasRedFlags: true,
        acknowledgments: [{ flag: 'Thunderclap', answer: 'no' }],
      }),
      false,
    );
    const stripped = stripOverallRedFlagClaim(
      'Thunderclap headache was not present. No red flags requiring referral were identified.',
      false,
    );
    assert.match(stripped, /Thunderclap/i);
    assert.doesNotMatch(stripped, /No red flags requiring referral/i);
  });

  it('Test G — generated PCP draft is not completed communication', () => {
    assert.equal(
      isPcpCommunicationCompleted({
        documents: { prescriber_communication: { assessment: 'draft' } },
        faxHistory: [{ status: 'queued' }],
      }),
      false,
    );
    assert.equal(
      isPcpCommunicationCompleted({ pcpSendConfirmed: true }),
      true,
    );
  });

  it('Test H — generating a handout is not the same as providing it', () => {
    assert.equal(
      isPatientHandoutProvided({
        counselling_status: 'confirmed',
        includeDetailedHandout: true,
      }),
      false,
    );
    assert.equal(
      isPatientHandoutProvided(
        { counselling_status: 'confirmed' },
        { patientHandoutProvided: true },
      ),
      true,
    );
  });

  it('flags structured once-daily vs event-based directions', () => {
    assert.equal(
      structuredRegimenConflictsWithDirections({
        frequency: 'QD once daily',
        patientDirections: 'Take 1 tablet by mouth at onset of migraine.',
      }),
      true,
    );
  });

  it('changes the source hash when treatment directions change', () => {
    const base = {
      treatments: [{ display_name: 'ALMOTRIPTAN', patient_directions: 'Take 1 tablet at onset.' }],
      assessment: 'migraine',
    };
    const next = computeDocumentationSourceHash({
      ...base,
      treatments: [
        { display_name: 'ALMOTRIPTAN', patient_directions: 'Take 1 tablet; may repeat after 2 hours.' },
      ],
    });
    assert.notEqual(computeDocumentationSourceHash(base), next);
  });

  it('never sends prescription or patient care summary to the LLM', () => {
    assert.deepEqual(resolveDocumentationLlmKeys(undefined), [
      'consultation_note',
      'prescriber_communication',
    ]);
    assert.deepEqual(resolveDocumentationLlmKeys([]), []);
    assert.deepEqual(
      resolveDocumentationLlmKeys([
        'prescription',
        'patient_care_summary',
        'consultation_note',
      ]),
      ['consultation_note'],
    );
  });

  it('reuses matching source-hash documents and regenerates only when forced', () => {
    const sourceHash = computeDocumentationSourceHash({
      treatments: [{ display_name: 'VALACYCLOVIR', patient_directions: 'Take 1 g twice daily.' }],
      assessment: 'cold sores',
    });
    const existing = {
      sourceHash,
      documents: {
        consultation_note: { data: 'Patient informed consent obtained prior to the pharmacist assessment.', assessment: 'Cold sores.' },
        prescriber_communication: { assessment: 'Cold sores treated in pharmacy.' },
      },
    };
    assert.equal(documentationPackageIsReusable(existing, sourceHash), true);
    assert.equal(
      documentationDocumentHasContent(existing.documents.consultation_note, 'consultation_note'),
      true,
    );
    assert.deepEqual(
      documentationLlmKeysToGenerate({
        sourceHash,
        existingDocumentation: existing,
      }),
      [],
    );
    assert.deepEqual(
      documentationLlmKeysToGenerate({
        sourceHash,
        existingDocumentation: existing,
        force: true,
      }),
      ['consultation_note', 'prescriber_communication'],
    );
    assert.deepEqual(
      documentationLlmKeysToGenerate({
        sourceHash: 'doc_other',
        existingDocumentation: existing,
      }),
      ['consultation_note', 'prescriber_communication'],
    );
  });

  it('retries only the failed LLM document', () => {
    assert.deepEqual(
      documentationLlmRetryKeys({
        requested: ['consultation_note', 'prescriber_communication'],
        consultationNoteNeedsRetry: true,
        prescriberCommunicationNeedsRetry: false,
      }),
      ['consultation_note'],
    );
  });
});

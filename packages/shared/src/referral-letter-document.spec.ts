import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  patientIdentityComplete,
  referralLetterDocumentToPlainText,
  referralLetterDocumentToPrintHtml,
  buildReferralLetterPrintDocument,
  buildReferralLetterDocument,
  serializeReferralLetterDocument,
  clinicalDetailsFromPayload,
  overlayClinicalDetailsFromSeed,
  referralAllergiesFromDemographics,
  referralMedicationsFromDemographics,
  emptyClinicalDetails,
} from './referral-letter-document';
import { buildReferralLetterPayload } from './referral-letter';
import type { ReferralTriggerSnapshotItem } from './referral-pathway.types';

const trigger: ReferralTriggerSnapshotItem = {
  ruleId: 'flag-ocular',
  questionId: 'flag-ocular',
  label: 'possible ocular involvement',
  urgencyCode: 'SAME_DAY_REFERRAL',
  urgencyDisplay: 'Same-day medical assessment required',
};

describe('referral letter document', () => {
  it('requires name, DOB, and PHN or not-available before identity is complete', () => {
    assert.equal(
      patientIdentityComplete({
        fullName: '',
        dateOfBirth: '2001-03-12',
        healthNumber: '12345-6789',
        healthNumberNotAvailable: false,
      }),
      false,
    );
    assert.equal(
      patientIdentityComplete({
        fullName: 'Emma Clarke',
        dateOfBirth: '2001-03-12',
        healthNumber: '',
        healthNumberNotAvailable: true,
      }),
      true,
    );
    assert.equal(
      patientIdentityComplete({
        fullName: 'Emma Clarke',
        dateOfBirth: '2001-03-12',
        healthNumber: '12345-6789',
        healthNumberNotAvailable: false,
      }),
      true,
    );
  });

  it('omits empty clinical placeholders from provider-facing print HTML', () => {
    const payload = buildReferralLetterPayload({
      consultationRef: 'CS-MTN7IFQ5-669D',
      pathwayName: 'Cold sores',
      pathwayCondition: 'cold sores (oral herpes labialis)',
      urgencyDisplay: 'Same-day medical assessment required',
      urgencyCode: 'SAME_DAY_REFERRAL',
      triggers: [trigger],
      destination: 'family_doctor_np',
      reasonForReferral:
        'Please assess this patient the same day by their family doctor or nurse practitioner for possible ocular involvement.',
      chiefComplaint: 'cold sore symptoms',
      patientName: 'Emma Clarke',
      patientDob: '2001-03-12',
      patientHealthNumber: '12345-6789',
      pharmacistName: 'Jane Pharmacist',
      pharmacyName: 'City Care Pharmacy',
      pharmacyAddress: '123 Main Street, Edmonton, AB T5J 1A1',
      pharmacyPhone: '17805550142',
      now: new Date('2026-09-04T12:00:00Z'),
      timeZone: 'UTC',
    });
    const doc = buildReferralLetterDocument(payload);
    const html = referralLetterDocumentToPrintHtml(doc);
    const text = referralLetterDocumentToPlainText(doc);
    assert.match(html, /CONFIDENTIAL CLINICAL COMMUNICATION/);
    assert.match(html, /PATIENT INFORMATION/);
    assert.match(html, /Telephone:/);
    assert.match(html, /Reason for referral/);
    assert.doesNotMatch(html, /Included when recorded/);
    assert.doesNotMatch(html, /Referral finding/);
    assert.doesNotMatch(html, /John Pharmacist|Demo Pharmacy/);
    assert.doesNotMatch(text, /Included when recorded/);
    assert.match(text, /Re: Same-day assessment requested — possible ocular involvement/);
    assert.match(text, /Telephone:/);
  });

  it('builds a complete print document with page CSS and optional draft mark', () => {
    const payload = buildReferralLetterPayload({
      consultationRef: 'CS-PRINT-1',
      pathwayName: 'Gout',
      pathwayCondition: 'gout',
      urgencyDisplay: 'Same-day medical assessment required',
      urgencyCode: 'SAME_DAY_REFERRAL',
      triggers: [trigger],
      destination: 'family_doctor_np',
      reasonForReferral: 'Please assess this patient today.',
      chiefComplaint: 'gout symptoms',
      patientName: 'Jame Smith',
      pharmacistName: 'John Pharmacist',
      pharmacyName: 'Demo Pharmacy',
    });
    const doc = buildReferralLetterDocument(payload);
    const page = buildReferralLetterPrintDocument(doc, { draft: true });
    assert.match(page, /^<!DOCTYPE html>/i);
    assert.match(page, /<style>/);
    assert.match(page, /@page/);
    assert.match(page, /ss-referral-letter/);
    assert.match(page, /DRAFT — NOT APPROVED/);
    const approved = buildReferralLetterPrintDocument(doc, { draft: false });
    assert.doesNotMatch(approved, /DRAFT — NOT APPROVED/);
  });

  it('maps confirmed history, allergy and treatment facts into clinical rows', () => {
    const payload = buildReferralLetterPayload({
      consultationRef: 'CS-TEST-FACTS',
      pathwayName: 'Cold sores',
      pathwayCondition: 'cold sores',
      urgencyDisplay: 'Same-day medical assessment required',
      urgencyCode: 'SAME_DAY_REFERRAL',
      triggers: [trigger],
      destination: 'family_doctor_np',
      reasonForReferral: 'Please assess this patient today for possible ocular involvement.',
      chiefComplaint: 'painful grouped lesions at the right upper lip',
      pharmacistName: 'Jane Pharmacist',
      pharmacyName: 'City Care Pharmacy',
      confirmedFacts: [
        { id: 'allergy-1', renderedText: 'Penicillin — rash', category: 'ALLERGY' },
        { id: 'condition-1', renderedText: 'Asthma', category: 'CONDITION' },
        { id: 'treatment-tried-1', renderedText: 'Topical cold-sore treatment used once', category: 'TREATMENT_TRIED' },
        {
          id: 'pathway-vision',
          renderedText: 'No change in vision identified.',
          category: 'PERTINENT_NEGATIVE',
          assertion: 'ABSENT',
        },
      ],
    });
    const doc = buildReferralLetterDocument(payload);
    assert.equal(doc.clinicalDetails.allergies, 'Penicillin — rash');
    assert.equal(doc.clinicalDetails.relevantMedicalHistory, 'Asthma');
    assert.match(String(doc.clinicalDetails.treatmentToDate), /Topical cold-sore treatment/);
    assert.match(String(doc.clinicalDetails.pertinentNegatives), /No change in vision/);
  });

  it('does not copy pathway screening prose into allergies, medications, or findings', () => {
    const payload = buildReferralLetterPayload({
      consultationRef: 'CS-TEST-SCREEN',
      pathwayName: 'Gout',
      pathwayCondition: 'gout',
      urgencyDisplay: 'Immediate medical assessment required',
      urgencyCode: 'IMMEDIATE_REFERRAL',
      triggers: [trigger],
      destination: 'emergency_department',
      reasonForReferral: 'Please assess this patient immediately in the emergency department.',
      chiefComplaint: 'gout symptoms',
      pharmacistName: 'Jane Pharmacist',
      pharmacyName: 'City Care Pharmacy',
      confirmedFacts: [
        {
          id: 'pathway-elig',
          renderedText:
            'Patient reported after reviewing renal function, gastrointestinal and cardiovascular risk, bleeding risk, allergies and current medications.',
          category: 'SYMPTOM',
        },
        {
          id: 'pathway-diff',
          renderedText: 'Differential review acknowledgment: reviewed',
          category: 'SYMPTOM',
        },
        {
          id: 'allergy-nkda',
          renderedText: 'No known drug allergies.',
          category: 'ALLERGY',
          assertion: 'ABSENT',
        },
        {
          id: 'medication-none',
          renderedText: 'No current medications reported.',
          category: 'MEDICATION',
          assertion: 'ABSENT',
        },
      ],
    });
    const doc = buildReferralLetterDocument(payload);
    assert.equal(doc.clinicalDetails.allergies, 'No known drug allergies.');
    assert.equal(doc.clinicalDetails.currentMedications, 'No current medications reported.');
    assert.equal(doc.clinicalDetails.relevantFindings, null);
  });

  it('lists confirmed allergies and medications from demographics helpers', () => {
    assert.equal(
      referralAllergiesFromDemographics({ allergiesNone: true, allergyEntries: [] }),
      'No known drug allergies.',
    );
    assert.match(
      String(
        referralAllergiesFromDemographics({
          allergyEntries: [
            { drug: 'Colchicine', reaction: 'rash', severity: 'Moderate' },
            { drug: 'Penicillin', reaction: 'anaphylaxis', severity: 'Severe' },
          ],
        }),
      ),
      /Colchicine/,
    );
    assert.match(
      String(
        referralAllergiesFromDemographics({
          allergyEntries: [
            { drug: 'Colchicine', reaction: 'rash', severity: 'Moderate' },
            { drug: 'Penicillin', reaction: 'anaphylaxis', severity: 'Severe' },
          ],
        }),
      ),
      /Penicillin/,
    );
    assert.equal(
      referralMedicationsFromDemographics({ medsNone: true, medicationEntries: [] }),
      'No current medications reported.',
    );
    assert.equal(
      referralMedicationsFromDemographics({
        medicationEntries: [{ label: 'Allopurinol', strength: '100 mg' }],
      }),
      'Allopurinol 100 mg',
    );
  });

  it('overlays stored screening dumps with live patient-profile values', () => {
    const stored = {
      ...emptyClinicalDetails(),
      relevantFindings:
        'Differential review acknowledgment: reviewed; Patient reported after reviewing renal function, gastrointestinal and cardiovascular risk, bleeding risk, allergies and current medications.',
      currentMedications:
        'Patient reported after reviewing renal function, gastrointestinal and cardiovascular risk, bleeding risk, allergies and current medications.',
      allergies:
        'Patient reported after reviewing renal function, gastrointestinal and cardiovascular risk, bleeding risk, allergies and current medications.',
    };
    const seed = {
      ...emptyClinicalDetails(),
      currentMedications: 'No current medications reported.',
      allergies: 'No known drug allergies.',
    };
    const next = overlayClinicalDetailsFromSeed(stored, seed);
    assert.equal(next.allergies, 'No known drug allergies.');
    assert.equal(next.currentMedications, 'No current medications reported.');
    assert.equal(next.relevantFindings, null);
  });

  it('leaves unrecorded clinical rows empty instead of inventing findings', () => {
    const payload = buildReferralLetterPayload({
      consultationRef: 'CS-TEST-EMPTY',
      pathwayName: 'Gout',
      pathwayCondition: 'gout',
      urgencyDisplay: 'Immediate medical assessment required',
      urgencyCode: 'IMMEDIATE_REFERRAL',
      triggers: [trigger],
      destination: 'emergency_department',
      reasonForReferral: 'Please assess this patient immediately in the emergency department.',
      chiefComplaint: 'gout symptoms',
      pharmacistName: 'Jane Pharmacist',
      pharmacyName: 'City Care Pharmacy',
      confirmedFacts: [],
    });
    const details = clinicalDetailsFromPayload(payload);
    assert.equal(details.allergies, null);
    assert.equal(details.currentMedications, null);
    assert.equal(details.relevantFindings, null);
  });

  it('never serializes UI placeholders into the stored letter', () => {
    const raw = serializeReferralLetterDocument({
      schema: 'referral-letter-v3',
      letterDate: '04-Sep-2026',
      recipientLine: 'Primary care clinician',
      subject: 'Same-day assessment requested',
      salutation: 'Dear Colleague,',
      reasonForReferral: 'Please assess this patient today.',
      clinicalDetails: {
        presentingConcern: 'Included when recorded',
        onsetAndCourse: null,
        relevantFindings: null,
        pertinentNegatives: null,
        relevantMedicalHistory: null,
        currentMedications: null,
        allergies: null,
        treatmentToDate: null,
        referralFinding: 'Enter PHN',
      },
      patient: {
        fullName: "Enter patient's full name",
        dateOfBirth: '',
        healthNumber: 'Enter PHN',
        healthNumberNotAvailable: false,
      },
      pharmacist: {
        displayName: 'Jane Pharmacist',
        credentials: '',
        pharmacyName: 'City Care Pharmacy',
        pharmacyAddress: '',
        pharmacyPhone: null,
        pharmacyFax: null,
        pharmacyLicense: null,
      },
      consultationRef: 'CS-TEST',
    });
    const parsed = JSON.parse(raw) as {
      patient: { fullName: string; healthNumber: string };
      clinicalDetails: { presentingConcern: string | null; referralFinding: string | null };
    };
    assert.equal(parsed.patient.fullName, '');
    assert.equal(parsed.patient.healthNumber, '');
    assert.equal(parsed.clinicalDetails.presentingConcern, null);
    assert.equal(parsed.clinicalDetails.referralFinding, null);
  });
});

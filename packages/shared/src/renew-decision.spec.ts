import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyPlanPatch,
  deriveMedicationSafety,
  evaluateRenewStep4Gate,
  generateRenewDocuments,
  isChronicNsaid,
  isRenewPatientInfoConfirmed,
  renewAllEligible,
  renewalPlanFingerprint,
  requiredDocumentsReady,
  requiredDocumentsReviewed,
  toPlanRows,
  validateRenewPatientInfo,
} from './renew-decision';
import { emptyRenewalDecision, emptyRenewCommunication, parseRenewPayload, type RenewMedication } from './renew';
import type { RenewMedicationPlanItem } from './renew';
import type { RenewMonitoringRequirement } from './renew-monitoring';

function med(patch: Partial<RenewMedication> & { id: string }): RenewMedication {
  return {
    id: patch.id,
    source: patch.source ?? { type: 'manual_search' },
    raw: patch.raw ?? {},
    normalized: {
      brandName: null,
      genericName: null,
      strength: null,
      dosageForm: null,
      ...patch.normalized,
    },
    confidence: patch.confidence ?? {},
    reviewStatus: patch.reviewStatus ?? 'not_reviewed',
    ccddMatchStatus: patch.ccddMatchStatus ?? 'unmatched',
    pharmacistEdited: patch.pharmacistEdited ?? false,
  };
}

function planItem(
  patch: Partial<RenewMedicationPlanItem> & { medicationId: string },
): RenewMedicationPlanItem {
  return {
    selected: false,
    decision: 'do_not_renew',
    durationId: null,
    customDurationDays: null,
    customDurationText: null,
    pharmacistOverride: false,
    durationSource: 'DEFAULT',
    durationBulkActionId: null,
    durationApplyNote: null,
    ...patch,
  };
}

function monitoring(
  patch: Partial<RenewMonitoringRequirement> & { inputCode: string; medicationIds: string[] },
): RenewMonitoringRequirement {
  return {
    inputCode: patch.inputCode,
    label: patch.label ?? patch.inputCode,
    inputType: patch.inputType ?? 'LAB',
    valueShape: patch.valueShape ?? 'NUMERIC',
    unit: patch.unit ?? null,
    medicationIds: patch.medicationIds,
    medicationNames: patch.medicationNames ?? [],
    result: patch.result ?? {
      inputCode: patch.inputCode,
      status: 'AVAILABLE',
      value: { numericValue: 1, secondaryNumericValue: null, valueText: null, unit: null },
      observedDate: '2026-08-01',
      sourceType: 'MANUAL',
      sourceLabel: null,
      note: null,
      pharmacistConfirmed: true,
    },
  };
}

describe('renew step 4 decision helpers', () => {
  it('parses a stored renewal plan', () => {
    const parsed = parseRenewPayload({
      renewalDecision: {
        confirmed: true,
        items: [{ medicationId: 'm1', selected: true, decision: 'renew', durationId: '30_days' }],
        documents: [{ kind: 'consultation_note', status: 'generated', body: 'Note' }],
      },
    });
    assert.equal(parsed.renewalDecision.confirmed, true);
    assert.equal(parsed.renewalDecision.items[0]?.durationId, '30_days');
    assert.equal(parsed.renewalDecision.items[0]?.durationSource, 'DEFAULT');
    assert.equal(parsed.renewalDecision.lastDurationBulk, null);
    assert.equal(parsed.renewalDecision.documents[0]?.status, 'generated');
    assert.equal(parsed.renewalDecision.documents[0]?.reviewed, false);
    assert.equal(parsed.renewalDecision.documents.length, 4);
    assert.equal(parsed.renewalDecision.documents.some((doc) => doc.kind === 'patient_handout'), true);
  });

  it('flags chronic NSAID use for review', () => {
    const ibuprofen = med({ id: 'ibu', normalized: { genericName: 'Ibuprofen', strength: '400 mg' } });
    assert.equal(isChronicNsaid(ibuprofen), true);
    const safety = deriveMedicationSafety(ibuprofen, [], [], {
      mappings: [],
      reviews: [],
      suggestedConditionIds: [],
      completed: true,
      completedAt: null,
      mappingFingerprint: null,
    });
    assert.equal(safety.tone, 'review');
    assert.equal(safety.note, 'Chronic use');
  });

  it('uses available monitoring as a clear note', () => {
    const ramipril = med({ id: 'ram', normalized: { genericName: 'Ramipril', strength: '5 mg' } });
    const safety = deriveMedicationSafety(
      ramipril,
      [
        monitoring({
          inputCode: 'EGFR',
          label: 'eGFR',
          medicationIds: ['ram'],
        }),
      ],
      [],
      {
        mappings: [],
        reviews: [],
        suggestedConditionIds: [],
        completed: true,
        completedAt: null,
        mappingFingerprint: null,
      },
    );
    assert.equal(safety.tone, 'clear');
    assert.equal(safety.note, 'eGFR UTD');
  });

  it('renews all eligible medications and leaves review rows unselected', () => {
    const items = [
      planItem({ medicationId: 'a' }),
      planItem({
        medicationId: 'b',
        selected: true,
        decision: 'renew',
        durationId: '30_days',
      }),
    ];
    const safetyById = new Map([
      ['a', { tone: 'clear' as const, label: 'No concerns', note: 'Appropriate use' }],
      ['b', { tone: 'review' as const, label: 'Review recommended', note: 'Chronic use' }],
    ]);
    const next = renewAllEligible(items, safetyById);
    assert.equal(next[0]?.selected, true);
    assert.equal(next[0]?.durationId, null);
    assert.equal(next[1]?.selected, false);
    assert.equal(next[1]?.decision, 'review');
    assert.equal(next[1]?.durationId, '30_days');
  });

  it('marks a review-recommended medication as an override when selected', () => {
    const items = [
      planItem({
        medicationId: 'b',
        selected: false,
        decision: 'review',
      }),
    ];
    const next = applyPlanPatch(items, 'b', { selected: true, durationId: '14_days' }, {
      tone: 'review',
      label: 'Review recommended',
      note: 'Chronic use',
    });
    assert.equal(next[0]?.selected, true);
    assert.equal(next[0]?.pharmacistOverride, true);
    assert.equal(next[0]?.durationId, '14_days');
    assert.equal(next[0]?.durationSource, 'MANUAL');
  });

  it('generates required documents from the confirmed plan', () => {
    const atorva = med({
      id: 'at',
      normalized: {
        genericName: 'Atorvastatin',
        strength: '20 mg',
        dosageForm: 'tablet',
        directions: 'Take 1 tablet by mouth once daily',
        quantity: 30,
        quantityUnit: 'tablets',
      },
    });
    const payload = parseRenewPayload({
      medicationList: { items: [atorva], confirmed: true },
      renewalRequest: { requestedDuration: '30_days', reasons: ['no_refills_remaining'] },
      renewalDecision: {
        confirmed: true,
        items: [{ medicationId: 'at', selected: true, decision: 'renew', durationId: '30_days' }],
      },
    });
    const rows = toPlanRows(
      [atorva],
      payload.renewalDecision.items,
      new Map([['at', { tone: 'clear', label: 'No concerns', note: 'Lipids UTD' }]]),
    );
    const docs = generateRenewDocuments(payload, rows, ['consultation_note', 'renewal_summary'], []);
    assert.equal(requiredDocumentsReady(docs), true);
    assert.equal(requiredDocumentsReviewed(docs), false);
    assert.equal(docs[0]?.reviewed, false);
    assert.match(docs[0]?.body ?? '', /Atorvastatin/);
    assert.match(docs[1]?.body ?? '', /PRESCRIPTION/);
    assert.match(docs[1]?.body ?? '', /Qty: 30 tablets/);
    assert.match(docs[1]?.body ?? '', /Rx -/);
    assert.match(docs[1]?.body ?? '', /Refills: 0/);
    assert.doesNotMatch(docs[1]?.body ?? '', /dispense and counsel/i);
    const unreviewedGate = evaluateRenewStep4Gate({
      ...payload.renewalDecision,
      documents: docs,
      pharmacistAttested: false,
    });
    assert.equal(unreviewedGate.canComplete, false);
    const reviewed = docs.map((doc) => ({
      ...doc,
      reviewed: true,
      reviewedAt: '2026-08-28T12:00:00.000Z',
    }));
    assert.equal(requiredDocumentsReviewed(reviewed), true);
    const withoutPatient = evaluateRenewStep4Gate({
      ...payload.renewalDecision,
      documents: reviewed,
      pharmacistAttested: false,
    });
    assert.equal(withoutPatient.canComplete, false);
    assert.equal(withoutPatient.reason, 'Patient information must be confirmed first.');
    const patientReady = {
      ...payload.renewalDecision,
      documents: reviewed,
      pharmacistAttested: false,
      patientInfo: {
        patientName: 'Jane Doe',
        dateOfBirth: '1985-03-12',
        phn: '123456789',
        source: 'STEP4_MANUAL' as const,
        confirmedAt: '2026-08-28T12:00:00.000Z',
        confirmedBy: 'pharmacist-1',
      },
      communication: {
        ...emptyRenewCommunication(),
        requirement: 'REQUIRED' as const,
        noAffectedProfessional: true,
      },
    };
    const pending = evaluateRenewStep4Gate({
      ...patientReady,
      communication: emptyRenewCommunication(),
    });
    assert.equal(pending.communicationRequired, true);
    assert.equal(pending.canComplete, true);
    const gate = evaluateRenewStep4Gate(patientReady);
    assert.equal(isRenewPatientInfoConfirmed(patientReady.patientInfo), true);
    assert.equal(gate.canComplete, true);
    assert.ok(renewalPlanFingerprint(payload.renewalDecision.items).includes('at:1:30_days'));
    const withOptional = generateRenewDocuments(
      { ...payload, renewalDecision: patientReady },
      rows,
      ['patient_handout', 'prescriber_notification'],
      reviewed,
    );
    const optionalUnreviewed = evaluateRenewStep4Gate({
      ...patientReady,
      documents: withOptional,
    });
    assert.equal(optionalUnreviewed.canComplete, true);
  });

  it('keeps duration when a medication is deselected', () => {
    const items = [
      planItem({
        medicationId: 'a',
        selected: true,
        decision: 'renew',
        durationId: '14_days',
      }),
    ];
    const next = applyPlanPatch(items, 'a', { selected: false }, {
      tone: 'clear',
      label: 'No concerns',
      note: 'Appropriate use',
    });
    assert.equal(next[0]?.selected, false);
    assert.equal(next[0]?.durationId, '14_days');
  });

  it('requires a selected medication with a valid duration before confirm', () => {
    const empty = evaluateRenewStep4Gate({
      ...emptyRenewalDecision(),
      items: [planItem({ medicationId: 'a' })],
    });
    assert.equal(empty.canConfirm, false);
    const ready = evaluateRenewStep4Gate({
      ...emptyRenewalDecision(),
      items: [
        planItem({
          medicationId: 'a',
          selected: true,
          decision: 'renew',
          durationId: '30_days',
        }),
      ],
    });
    assert.equal(ready.canConfirm, true);
  });

  it('requires a valid date of birth before document generation', () => {
    const missing = validateRenewPatientInfo({ patientName: 'Jane Doe', dateOfBirth: '' });
    assert.equal(missing.valid, false);
    const future = validateRenewPatientInfo({ patientName: 'Jane Doe', dateOfBirth: '2999-01-01' });
    assert.equal(future.valid, false);
    const mismatch = validateRenewPatientInfo({
      patientName: 'Jane Doe',
      dateOfBirth: '2010-01-01',
      recordedAgeYears: 80,
    });
    assert.match(mismatch.dobError ?? '', /does not match the age entered earlier/);
    const ok = validateRenewPatientInfo({
      patientName: 'Jane Doe',
      dateOfBirth: '1985-03-12',
      phn: '',
    });
    assert.equal(ok.valid, true);
    const skipped = validateRenewPatientInfo({
      patientName: '',
      dateOfBirth: '',
      skipped: true,
    });
    assert.equal(skipped.valid, true);
    assert.equal(
      isRenewPatientInfoConfirmed({
        patientName: '',
        dateOfBirth: '',
        phn: null,
        source: 'STEP4_MANUAL',
        confirmedAt: '2026-09-16T12:00:00.000Z',
        confirmedBy: 'pharm-1',
        skipped: true,
      }),
      true,
    );
  });
});

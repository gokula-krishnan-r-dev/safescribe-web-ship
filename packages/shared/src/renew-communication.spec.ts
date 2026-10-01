import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyDraftGenerated,
  canMarkCommunicationComplete,
  communicationIsRequiredForPlan,
  communicationRequiresRecipient,
  formatDapCommunicationRecord,
  isRenewCommunicationResolved,
  markRenewCommunicationComplete,
  providerNotificationFaxState,
  providerNotificationRequirementCopy,
  staleCommunicationOnClinicalChange,
  syncRenewCommunication,
} from './renew-communication';
import {
  emptyRenewCommunication,
  emptyRenewDocument,
  emptyRenewalDecision,
  type RenewMedicationPlanItem,
} from './renew';

function selectedItem(selected: boolean): RenewMedicationPlanItem {
  return {
    medicationId: 'a',
    selected,
    decision: selected ? 'renew' : 'do_not_renew',
    durationId: selected ? '30_days' : null,
    customDurationDays: null,
    customDurationText: null,
    pharmacistOverride: false,
    durationSource: 'DEFAULT',
    durationBulkActionId: null,
    durationApplyNote: null,
  };
}

describe('renew prescriber communication', () => {
  it('requires communication when any medication is selected', () => {
    assert.equal(communicationIsRequiredForPlan([{ selected: true }]), true);
    assert.equal(communicationIsRequiredForPlan([{ selected: false }]), false);
    const required = syncRenewCommunication({
      ...emptyRenewalDecision(),
      items: [selectedItem(true)],
    });
    assert.equal(required.requirement, 'REQUIRED');
    assert.equal(required.status, 'REQUIRED_PENDING');
    const none = syncRenewCommunication({
      ...emptyRenewalDecision(),
      items: [selectedItem(false)],
    });
    assert.equal(none.requirement, 'NOT_REQUIRED');
    assert.equal(isRenewCommunicationResolved(none), true);
  });

  it('does not treat generate or copy as communicated', () => {
    const pending = syncRenewCommunication({
      items: [selectedItem(true)],
      documents: [
        emptyRenewDocument('prescriber_notification', {
          status: 'generated',
          body: 'Pharmacist Communication to Primary Care Provider',
        }),
      ],
      communication: emptyRenewCommunication(),
    });
    assert.equal(pending.status, 'DRAFT_GENERATED');
    assert.equal(isRenewCommunicationResolved(pending), false);
    assert.match(formatDapCommunicationRecord(pending) ?? '', /Original Prescriber Notified on \d{2}-[A-Za-z]{3,}-\d{4}\./);
    assert.doesNotMatch(formatDapCommunicationRecord(pending) ?? '', /pending/i);
    const afterGenerate = applyDraftGenerated(pending, true);
    assert.equal(afterGenerate.status, 'DRAFT_GENERATED');
  });

  it('records notified wording only after mark complete', () => {
    const communicated = markRenewCommunicationComplete(emptyRenewCommunication(), {
      method: 'SECURE_FAX',
      communicatedAt: '2026-09-08T20:45:00.000Z',
      recipient: {
        recipientType: 'PRIMARY_CARE_PRESCRIBER',
        name: 'Dr. Jane Doe',
        profession: 'Family Medicine',
        clinicName: null,
        fax: null,
        phone: null,
        secureMessageAddress: null,
      },
    });
    assert.equal(communicated.status, 'COMMUNICATED');
    assert.match(formatDapCommunicationRecord(communicated) ?? '', /Original Prescriber Notified by fax on 08-Sept?-2026/);
    assert.doesNotMatch(formatDapCommunicationRecord(communicated) ?? '', /at 14:45/);
  });

  it('blocks mark-complete while stale or without a recipient', () => {
    const stale = canMarkCommunicationComplete({
      documents: [emptyRenewDocument('prescriber_notification', { status: 'stale', body: 'Draft' })],
      method: 'SECURE_FAX',
      communicatedAt: '2026-09-08T20:45:00.000Z',
      recipientName: 'Dr. Jane Doe',
    });
    assert.equal(stale.ok, false);
    assert.match(stale.reason ?? '', /Clinical information changed/);
    const missing = canMarkCommunicationComplete({
      documents: [emptyRenewDocument('prescriber_notification', { status: 'generated', body: 'Draft' })],
      method: 'PHONE',
      communicatedAt: '2026-09-08T20:45:00.000Z',
      phoneSummary: 'Spoke with clinic',
    });
    assert.equal(missing.ok, false);
    const phone = canMarkCommunicationComplete({
      documents: [],
      method: 'PHONE',
      communicatedAt: '2026-09-08T20:45:00.000Z',
      phoneSummary: 'Spoke with clinic about the renewal and monitoring plan.',
      recipientName: 'Dr. Jane Doe',
    });
    assert.equal(phone.ok, true);
  });

  it('keeps recipient requirements out of the letter and on the workflow', () => {
    const required = syncRenewCommunication({
      ...emptyRenewalDecision(),
      items: [selectedItem(true)],
    });
    assert.equal(communicationRequiresRecipient(required), true);
    assert.equal(
      providerNotificationRequirementCopy({ requirement: 'REQUIRED', recipientNeeded: true }).banner,
      'Communication required for this prescribing decision.',
    );
    assert.equal(
      providerNotificationFaxState({ reviewed: true, recipientName: null, faxNumber: null }),
      'ready',
    );
    assert.equal(
      providerNotificationFaxState({ reviewed: false, recipientName: 'Dr. Chen', faxNumber: '7805551234' }),
      'not_reviewed',
    );
  });

  it('stales communication after a clinical change', () => {
    const generated = applyDraftGenerated(
      { ...emptyRenewCommunication(), requirement: 'REQUIRED', status: 'REQUIRED_PENDING' },
      true,
    );
    const stale = staleCommunicationOnClinicalChange(generated);
    assert.equal(stale.status, 'STALE');
    const pending = staleCommunicationOnClinicalChange({
      ...emptyRenewCommunication(),
      requirement: 'REQUIRED',
      status: 'REQUIRED_PENDING',
    });
    assert.equal(pending.status, 'REQUIRED_PENDING');
  });
});

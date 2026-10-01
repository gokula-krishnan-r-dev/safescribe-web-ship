import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canCompleteReferralWithLetter } from './referral-pathway.types';
import {
  handlingMethodFromStorage,
  handlingRecordIsComplete,
  referralHandlingLabel,
} from './referral-handling';

describe('referral handling', () => {
  it('maps stored contact methods to handling codes', () => {
    assert.equal(handlingMethodFromStorage('printed_and_provided'), 'PRINTED_AND_PROVIDED_TO_PATIENT');
    assert.equal(handlingMethodFromStorage('printed_letter'), 'PRINTED_AND_PROVIDED_TO_PATIENT');
    assert.equal(handlingMethodFromStorage('secure_fax'), 'FAXED_FROM_SAFESCRIBE');
    assert.equal(
      handlingMethodFromStorage(null, { faxConfirmed: true, letterApproved: true }),
      'FAXED_FROM_SAFESCRIBE',
    );
    assert.equal(
      handlingMethodFromStorage(null, { faxConfirmed: true, letterApproved: false }),
      null,
    );
    assert.equal(
      handlingMethodFromStorage('printed_and_provided', { faxConfirmed: true, letterApproved: true }),
      'PRINTED_AND_PROVIDED_TO_PATIENT',
    );
    assert.equal(handlingMethodFromStorage(null), null);
  });

  it('locks complete until a handling method is recorded', () => {
    const ready = {
      referralFormIsValid: true,
      referralOutcomeStatus: 'DRAFT',
      letterStatus: 'approved',
      letterSourceRevision: 1,
      referralSourceRevision: 1,
    };
    assert.equal(canCompleteReferralWithLetter({ ...ready, handlingRecorded: true }), true);
    assert.equal(canCompleteReferralWithLetter({ ...ready, handlingRecorded: false }), false);
    assert.equal(canCompleteReferralWithLetter(ready), false);
  });

  it('requires detail only for sent another way', () => {
    assert.equal(handlingRecordIsComplete('PRINTED_AND_PROVIDED_TO_PATIENT'), true);
    assert.equal(handlingRecordIsComplete('SENT_ANOTHER_WAY', ''), false);
    assert.equal(handlingRecordIsComplete('SENT_ANOTHER_WAY', 'Secure email'), true);
    assert.equal(
      referralHandlingLabel('SENT_ANOTHER_WAY', 'Secure email'),
      'Sent another way — Secure email',
    );
  });
});

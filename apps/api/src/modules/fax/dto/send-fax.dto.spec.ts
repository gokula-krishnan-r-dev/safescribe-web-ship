import { FAXABLE_DOCUMENT_TYPE_IDS } from './send-fax.dto';

describe('FAXABLE_DOCUMENT_TYPE_IDS', () => {
  it('includes referral letters alongside consultation documents', () => {
    expect(FAXABLE_DOCUMENT_TYPE_IDS).toEqual(
      expect.arrayContaining([
        'consultation_note',
        'prescription',
        'prescriber_communication',
        'patient_care_summary',
        'referral_letter',
        'renewal_summary',
        'patient_handout',
        'prescriber_notification',
      ]),
    );
  });
});

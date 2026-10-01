import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Consultation } from '../../types';
import { generateConsultationNoteFields } from './consultation-note-generator';

describe('Pharmacist Consultation Note DAP generator', () => {
  it('renders canonical confirmed directions and the planned pharmacist follow-up', () => {
    const consultation = {
      id: 'consultation-test',
      createdAt: '2026-09-27T00:00:00.000Z',
      consultationMode: 'GUIDED_PATHWAY',
      chiefComplaint: 'cold sores',
      demographics: { age: '35', ageUnit: 'years', sex: 'Male' },
      treatmentPlan: {
        selectedItemsSnapshot: [
          {
            medicationName: 'Valtrex',
            genericName: 'valacyclovir',
            patientDirections: 'Take 2 tablets by mouth twice daily for 1 day.',
          },
          {
            medicationName: 'ABREVA',
            genericName: 'docosanol',
            patientDirections: 'Apply 1 application topically 5 times a day for 10 days.',
          },
        ],
      },
      counsellingNotes: {
        counselling_status: 'confirmed',
        plan: { status: 'REVIEWED', sections: [] },
      },
    } as unknown as Consultation;

    const fields = generateConsultationNoteFields(consultation);

    assert.match(fields.plan, /\*\*Valtrex:\*\* Take 2 tablets by mouth twice daily for 1 day\./);
    assert.match(fields.plan, /\*\*ABREVA:\*\* Apply 1 application topically 5 times a day for 10 days\./);
    assert.match(
      fields.plan,
      /Pharmacist follow-up planned in 7 days to assess lesion improvement or resolution and treatment tolerability; referral advised if symptoms are not resolving\./,
    );
    assert.doesNotMatch(fields.plan, /BID|twice daily.*twice daily|Valtrex \(valacyclovir\)/i);
  });
});

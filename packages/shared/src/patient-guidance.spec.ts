import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  guidanceTypeForNonDrugName,
  isNonDrugTreatmentMigrated,
  isUsablePatientGuidanceText,
  patientWordingFromNonDrugTreatment,
  selectFollowupsForCounselling,
  selectPathwayGuidanceForCounselling,
} from './patient-guidance';

describe('isUsablePatientGuidanceText', () => {
  it('rejects yes/no fragments that leaked from structured flags', () => {
    assert.equal(isUsablePatientGuidanceText('No.'), false);
    assert.equal(isUsablePatientGuidanceText('Yes'), false);
    assert.equal(isUsablePatientGuidanceText('N/A'), false);
  });

  it('keeps real patient-facing pathway copy', () => {
    assert.equal(
      isUsablePatientGuidanceText(
        'Start antiviral treatment as soon as possible after the first prodromal symptoms.',
      ),
      true,
    );
  });
});

describe('selectPathwayGuidanceForCounselling', () => {
  it('uses authored drafts when a pathway has no approved items', () => {
    const selected = selectPathwayGuidanceForCounselling([
      {
        id: 'e1',
        outputSection: 'what_to_expect',
        point: 'Start antiviral treatment as soon as possible after the first prodromal symptoms.',
        detail: 'Treatment is ideally started within 1 to 2 hours of prodromal symptoms.',
        approved: false,
      },
      {
        id: 's1',
        outputSection: 'self_care',
        point: 'Keep the area clean and dry and avoid sharing towels or lip products.',
        approved: false,
      },
      {
        id: 'f1',
        outputSection: 'follow_up',
        point: 'Seek care if lesions spread toward the eye or you become systemically unwell.',
        approved: false,
      },
      {
        id: 'junk',
        outputSection: 'follow_up',
        point: 'No.',
        approved: false,
      },
    ]);
    assert.equal(selected.length, 3);
    assert.equal(selected.some((row) => row.point === 'No.'), false);
  });

  it('prefers approved items in a section and still fills other sections from drafts', () => {
    const selected = selectPathwayGuidanceForCounselling([
      {
        outputSection: 'what_to_expect',
        point: 'Approved expected-course wording for this condition is shown first.',
        approved: true,
      },
      {
        outputSection: 'what_to_expect',
        point: 'Draft expected-course wording should stay hidden when approved copy exists.',
        approved: false,
      },
      {
        outputSection: 'self_care',
        point: 'Keep the area clean and dry and avoid sharing towels.',
        approved: false,
      },
    ]);
    assert.equal(selected.length, 2);
    assert.equal(
      selected[0]?.point,
      'Approved expected-course wording for this condition is shown first.',
    );
    assert.match(selected[1]?.point ?? '', /clean and dry/);
  });
});

describe('selectFollowupsForCounselling', () => {
  it('drops yes/no follow-up actions and keeps real instructions', () => {
    const selected = selectFollowupsForCounselling([
      { action: 'No.', approved: false },
      {
        action: 'Reassess if not improving',
        timeframe: '48 hours',
        approved: false,
      },
    ]);
    assert.equal(selected.length, 1);
    assert.match(selected[0]?.action ?? '', /Reassess/);
  });
});

describe('legacy non-drug migration helpers', () => {
  it('detects migrated non-drug treatments by legacyId or prefixed id', () => {
    assert.equal(
      isNonDrugTreatmentMigrated('t1', [{ id: 'nd_t1', legacyId: 't1' }]),
      true,
    );
    assert.equal(
      isNonDrugTreatmentMigrated('t1', [{ id: 'x', legacyId: 'nd_t1' }]),
      true,
    );
    assert.equal(isNonDrugTreatmentMigrated('t1', [{ id: 'other' }]), false);
  });

  it('builds patient wording from non-drug treatment fields', () => {
    assert.match(
      patientWordingFromNonDrugTreatment({
        medicationName: 'Hydration',
        directions: 'Maintain usual adequate oral fluid intake throughout the day.',
      }),
      /fluid intake/i,
    );
    assert.equal(guidanceTypeForNonDrugName('Regular voiding'), 'prevention');
    assert.equal(
      guidanceTypeForNonDrugName('Urination after sexual intercourse'),
      'transmission_reduction',
    );
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parsePharmacistTip } from './pharmacist-tip';

describe('parsePharmacistTip', () => {
  it('returns null for empty help text', () => {
    assert.equal(parsePharmacistTip(null), null);
    assert.equal(parsePharmacistTip(''), null);
    assert.equal(parsePharmacistTip('   '), null);
  });

  it('splits expected YES from imported pharmacist guidance', () => {
    const parsed = parsePharmacistTip(
      'Expected answer: YES Clarify whether the patient is starting contraception, continuing an existing method, or restarting after a break.',
    );
    assert.deepEqual(parsed, {
      expectedAnswer: 'YES',
      guidance:
        'Clarify whether the patient is starting contraception, continuing an existing method, or restarting after a break.',
    });
  });

  it('splits Date documented expected answers', () => {
    const parsed = parsePharmacistTip(
      'Expected answer: Date documented Also ask whether the last period was normal for the patient.',
    );
    assert.deepEqual(parsed, {
      expectedAnswer: 'Date documented',
      guidance: 'Also ask whether the last period was normal for the patient.',
    });
  });

  it('keeps guidance-only tips without inventing an expected answer', () => {
    const parsed = parsePharmacistTip(
      'Ask the patient to rate pain from 0–10. Pain rated 7/10 or higher should be referred.',
    );
    assert.deepEqual(parsed, {
      expectedAnswer: null,
      guidance:
        'Ask the patient to rate pain from 0–10. Pain rated 7/10 or higher should be referred.',
    });
  });

  it('strips a duplicated Pharmacist tip label', () => {
    const parsed = parsePharmacistTip('Pharmacist tip: Confirm continuous contraceptive use.');
    assert.deepEqual(parsed, {
      expectedAnswer: null,
      guidance: 'Confirm continuous contraceptive use.',
    });
  });

  it('keeps expected answer when there is no extra guidance', () => {
    const parsed = parsePharmacistTip('Expected answer: YES');
    assert.deepEqual(parsed, {
      expectedAnswer: 'YES',
      guidance: null,
    });
  });
});

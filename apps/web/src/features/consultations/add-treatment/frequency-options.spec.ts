import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FREQUENCY_CATALOG,
  findFrequencyOption,
  frequencyComboboxValue,
  frequencyDirectionPhrase,
  parseHourlyInterval,
  resolveFrequencyValue,
} from './frequency-options';
import { administrationsPerDay } from './quantity';

describe('frequency catalog', () => {
  it('includes screenshot SIG codes', () => {
    const codes = FREQUENCY_CATALOG.map((item) => item.code);
    for (const code of ['QD', 'BID', 'TID', 'QID', 'QHS', 'STAT', '21/28D', 'Q4-6H', '5ID', 'MWF', 'TTSS', 'OTH']) {
      assert.ok(codes.includes(code), `missing ${code}`);
    }
  });

  it('resolves legacy English labels and SIG codes to the same value', () => {
    assert.equal(resolveFrequencyValue('Once daily'), 'QD - Once daily');
    assert.equal(resolveFrequencyValue('QD'), 'QD - Once daily');
    assert.equal(resolveFrequencyValue('Twice daily'), 'BID - Two times daily');
    assert.equal(resolveFrequencyValue('Every 6–8 hours'), 'Q6-8H - Every 6 to 8 hours');
    assert.equal(resolveFrequencyValue('bid'), 'BID - Two times daily');
  });

  it('keeps unknown custom frequencies', () => {
    assert.equal(resolveFrequencyValue('with breakfast'), 'with breakfast');
    assert.equal(frequencyComboboxValue('with breakfast'), 'OTH - Other');
    assert.equal(frequencyDirectionPhrase('with breakfast'), 'with breakfast');
  });

  it('uses the English description in patient-facing copy', () => {
    assert.equal(frequencyDirectionPhrase('QD - Once daily'), 'Once daily');
    assert.equal(frequencyDirectionPhrase('QHS'), 'Every day at bedtime');
  });

  it('maps administrations per day from codes and aliases', () => {
    assert.equal(administrationsPerDay('QD'), 1);
    assert.equal(administrationsPerDay('BID - Two times daily'), 2);
    assert.equal(administrationsPerDay('Once daily'), 1);
    assert.equal(administrationsPerDay('Every 6–8 hours'), 4);
    assert.equal(administrationsPerDay('ASDIR - As directed'), null);
    assert.equal(findFrequencyOption('TTSS')?.description, 'Tue,Thur,Sat,Sun');
    assert.equal(parseHourlyInterval('Q5H - Every 5 hours'), 5);
    assert.equal(administrationsPerDay('Q5H - Every 5 hours'), 24 / 5);
    assert.equal(frequencyDirectionPhrase('Q5H - Every 5 hours'), 'every 5 hours');
  });
});

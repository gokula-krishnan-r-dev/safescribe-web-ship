import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPathwayRoutingRepresentation,
  isPathwayEnabledForProvince,
  mergeRoutingSuggestions,
  normalizePathwayRouting,
  normalizeProvinceCode,
  normalizeRoutingTags,
  provinceFromTimezone,
  rankPathwaysByRoutingMetadata,
} from './pathway-routing';

describe('normalizeRoutingTags', () => {
  it('trims, dedupes case-insensitively, and caps length', () => {
    assert.deepEqual(
      normalizeRoutingTags(['  MSK pain ', 'msk pain', 'Sprain', '', '  '], 20),
      ['MSK pain', 'Sprain'],
    );
  });
});

describe('normalizePathwayRouting', () => {
  it('normalizes all fields', () => {
    const n = normalizePathwayRouting({
      aliases: ['Sprain', 'sprain'],
      presentingComplaints: ['shoulder pain'],
      contextTerms: ['knee'],
      description: '  Acute soft tissue pain.  ',
    });
    assert.deepEqual(n.aliases, ['Sprain']);
    assert.equal(n.description, 'Acute soft tissue pain.');
  });
});

describe('mergeRoutingSuggestions', () => {
  it('retains existing terms and marks new suggestions', () => {
    const merged = mergeRoutingSuggestions(
      { aliases: ['sprain'], presentingComplaints: [], contextTerms: [], description: '' },
      {
        aliases: ['sprain', 'MSK pain'],
        presentingComplaints: ['shoulder pain'],
        contextTerms: ['shoulder'],
        description: 'Activity-related soft tissue pain.',
      },
    );
    assert.deepEqual(merged.aliases, ['sprain', 'MSK pain']);
    assert.deepEqual(merged.presentingComplaints, ['shoulder pain']);
    assert.ok(merged.suggestedKeys?.includes('msk pain'));
    assert.ok(merged.suggestedKeys?.includes('shoulder pain'));
    assert.ok(merged.suggestedKeys?.includes('__description__'));
    assert.ok(!merged.suggestedKeys?.includes('sprain'));
  });
});

describe('normalizeProvinceCode', () => {
  it('maps full names and codes case-insensitively', () => {
    assert.equal(normalizeProvinceCode('AB'), 'AB');
    assert.equal(normalizeProvinceCode('alberta'), 'AB');
    assert.equal(normalizeProvinceCode(' Alberta '), 'AB');
    assert.equal(normalizeProvinceCode('British Columbia'), 'BC');
    assert.equal(normalizeProvinceCode('Québec'), 'QC');
    assert.equal(normalizeProvinceCode('unknown-province'), null);
  });
});

describe('isPathwayEnabledForProvince', () => {
  it('filters by provinceAvailability', () => {
    assert.equal(
      isPathwayEnabledForProvince({ province: 'AB', provinceAvailability: 'AB,SK' }, 'AB'),
      true,
    );
    assert.equal(
      isPathwayEnabledForProvince({ province: 'AB', provinceAvailability: 'AB,SK' }, 'ON'),
      false,
    );
    assert.equal(
      isPathwayEnabledForProvince({ province: 'AB', provinceAvailability: null }, null),
      true,
    );
  });

  it('accepts full province names without zeroing the catalog', () => {
    assert.equal(
      isPathwayEnabledForProvince({ province: 'AB', provinceAvailability: 'AB,SK' }, 'Alberta'),
      true,
    );
    assert.equal(
      isPathwayEnabledForProvince({ province: 'AB', provinceAvailability: 'AB,SK' }, 'Ontario'),
      false,
    );
  });
});

describe('rankPathwaysByRoutingMetadata', () => {
  it('ranks MSK highly for shoulder pain after lifting', () => {
    const results = rankPathwaysByRoutingMetadata(
      [
        {
          id: 'msk',
          name: 'Musculoskeletal sprains and strains',
          condition: 'Musculoskeletal sprains and strains',
          routingAliases: ['MSK pain', 'sprain'],
          routingPresentingComplaints: ['shoulder pain', 'pain after lifting'],
          routingContextTerms: ['shoulder', 'knee'],
          routingDescription: 'Acute uncomplicated musculoskeletal pain.',
        },
        {
          id: 'uti',
          name: 'Acute uncomplicated cystitis',
          condition: 'UTI',
          routingAliases: ['UTI', 'cystitis'],
          routingPresentingComplaints: ['burning when I pee'],
          routingContextTerms: ['urinary'],
          routingDescription: 'Dysuria and frequency without red flags.',
        },
      ],
      '35-year-old female with shoulder pain after lifting.',
    );
    assert.equal(results[0]?.pathwayId, 'msk');
    assert.match(results[0]?.matchLevel ?? '', /high|moderate/);
    assert.equal(results.some((r) => r.pathwayId === 'uti'), false);
  });
});

describe('buildPathwayRoutingRepresentation', () => {
  it('includes aliases and presenting complaints', () => {
    const text = buildPathwayRoutingRepresentation({
      id: '1',
      name: 'MSK',
      condition: 'Sprains',
      routingAliases: ['sprain'],
      routingPresentingComplaints: ['shoulder pain'],
      routingContextTerms: ['shoulder'],
      routingDescription: 'Soft tissue pain.',
    });
    assert.match(text, /Aliases: sprain/);
    assert.match(text, /shoulder pain/);
  });
});

describe('provinceFromTimezone', () => {
  it('maps Edmonton to AB', () => {
    assert.equal(provinceFromTimezone('America/Edmonton'), 'AB');
  });
});

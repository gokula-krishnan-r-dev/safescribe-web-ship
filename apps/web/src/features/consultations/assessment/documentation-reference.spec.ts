import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { documentationReferenceLine } from './documentation-reference';

describe('documentationReferenceLine', () => {
  it('shows citation title and publication year only', () => {
    assert.equal(
      documentationReferenceLine({
        citationTitle: 'VALTREX',
        publicationYear: 2026,
        edition: '4th',
      }),
      'VALTREX (2026)',
    );
  });

  it('falls back to edition when year is missing', () => {
    assert.equal(
      documentationReferenceLine({
        citationTitle: 'CPS',
        publicationYear: null,
        edition: '2025',
      }),
      'CPS (2025)',
    );
  });

  it('shows title alone when year and edition are missing', () => {
    assert.equal(
      documentationReferenceLine({
        citationTitle: 'Product monograph',
        publicationYear: null,
        edition: null,
      }),
      'Product monograph',
    );
  });
});

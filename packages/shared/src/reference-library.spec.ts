import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evidenceReferenceSearchText,
  evidenceReferenceStableKey,
  reviewerLibrarySearchText,
  reviewerLibraryStableKey,
  sanitizeLibrarySearch,
} from './reference-library';

describe('reference library helpers', () => {
  it('normalizes citation keys for master dedupe', () => {
    assert.equal(
      evidenceReferenceStableKey({
        citationTitle: '  CPS  HSV  ',
        organization: 'CPhA',
        publicationYear: 2024,
      }),
      evidenceReferenceStableKey({
        citationTitle: 'cps hsv',
        organization: 'cpha',
        publicationYear: 2024,
      }),
    );
  });

  it('normalizes reviewer keys without type so one person can be reused', () => {
    assert.equal(
      reviewerLibraryStableKey({
        name: 'Dr Jane Smith',
        credentials: 'PharmD',
        organization: 'CPS',
      }),
      reviewerLibraryStableKey({
        name: '  dr  jane smith ',
        credentials: 'pharmd',
        organization: 'cps',
      }),
    );
  });

  it('sanitizes search input', () => {
    assert.equal(sanitizeLibrarySearch('  val%trex_*  '), 'val trex');
    assert.equal(sanitizeLibrarySearch('a'.repeat(200)).length, 120);
  });

  it('builds lowercase search blobs', () => {
    assert.ok(
      evidenceReferenceSearchText({
        citationTitle: 'VALTREX',
        organization: 'GSK',
        documentType: 'product_monograph',
      }).includes('valtrex'),
    );
    assert.ok(
      reviewerLibrarySearchText({
        name: 'Jane Smith',
        credentials: 'PharmD',
        role: 'Clinical reviewer',
      }).includes('pharmd'),
    );
  });
});

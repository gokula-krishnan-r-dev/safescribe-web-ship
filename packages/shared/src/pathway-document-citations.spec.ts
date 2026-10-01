import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  documentationCitationLine,
  formatPathwayDocumentChrome,
  formatPathwayDocumentChromeFromEvidenceSnapshot,
  stripClinicalPathwayChromeLine,
} from './pathway-document-citations';

describe('pathway document citations', () => {
  it('shows name and year only', () => {
    assert.equal(
      documentationCitationLine({
        citationTitle: 'VALTREX',
        publicationYear: 2026,
        edition: '4th',
      }),
      'VALTREX (2026)',
    );
  });

  it('formats primary and secondary without pathway governance lines', () => {
    const chrome = formatPathwayDocumentChrome({
      primary: { citationTitle: 'VALTREX', publicationYear: 2026 },
      secondary: { citationTitle: 'CPS', publicationYear: 2025 },
      pathwayLabel: 'Cold sore',
      pathwayVersion: 'v1.2',
      lastReviewed: '2026-01-12T00:00:00.000Z',
    });
    assert.equal(
      chrome,
      'Clinical resources consulted: VALTREX (2026) and CPS (2025).',
    );
  });

  it('omits missing citations instead of inventing them', () => {
    const chrome = formatPathwayDocumentChrome({
      primary: null,
      secondary: null,
      pathwayLabel: 'Cold sore',
      pathwayVersion: 'v1.2',
    });
    assert.equal(chrome, null);
  });

  it('reads primary and secondary from an evidence snapshot', () => {
    const chrome = formatPathwayDocumentChromeFromEvidenceSnapshot({
      displayName: 'Cold sore',
      pathwayVersion: 'v1.2',
      primaryReference: { id: 'a', citationTitle: 'VALTREX', publicationYear: 2026 },
      secondaryReference: { id: 'b', citationTitle: 'CPS', edition: '2025' },
      clinicalReview: { lastReviewed: '2026-01-12' },
    });
    assert.equal(chrome, 'Clinical resources consulted: VALTREX (2026) and CPS (2025).');
  });

  it('strips legacy pathway governance lines from stored chrome', () => {
    assert.equal(
      stripClinicalPathwayChromeLine(
        'Clinical resources consulted: VALTREX (2026) and CPS (2025).\n\nClinical pathway: Cold sore (v1.2). Last reviewed 12-Jan-2026.',
      ),
      'Clinical resources consulted: VALTREX (2026) and CPS (2025).',
    );
  });

  it('strips pathway governance lines separated by HTML breaks', () => {
    assert.equal(
      stripClinicalPathwayChromeLine(
        'Clinical resources consulted: VALTREX (2026) and CPS (2025).<br><br>Clinical pathway: Cold sore (v25). Last reviewed 11-Sep-2026.',
      ),
      'Clinical resources consulted: VALTREX (2026) and CPS (2025).',
    );
  });

  it('returns null when there is nothing to print', () => {
    assert.equal(formatPathwayDocumentChrome({}), null);
    assert.equal(formatPathwayDocumentChromeFromEvidenceSnapshot(null), null);
  });
});

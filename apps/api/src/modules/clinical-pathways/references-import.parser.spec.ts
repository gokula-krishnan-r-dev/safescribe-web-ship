import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  findMatchingReference,
  importStatusForItem,
  parseReferenceLibraryMarkdown,
} from './references-import.parser';

const SAMPLE = `
## Reference Library

### R1
- Title: CPS — Herpes simplex infections
- Organization / publisher: Canadian Pharmacists Association
- Document type: Clinical reference
- Year / edition: 2024
- Jurisdiction: Canada
- URL: https://www.e-therapeutics.ca
- DOI:
- Applicable condition(s) / pathway(s): Cold sores (oral herpes labialis)
- Suggested pathway sections: Treatment Options, Red Flags
- Clinical use tags: Assessment, Dose, Monitoring / follow-up
- Documentation reference candidate: YES
- Verification required: true
- Status: Needs review
- Notes: Pathway-level clinical reference

### R2
- Title: Health Canada Product Monograph — Valacyclovir
- Organization / publisher: Health Canada
- Document type: Product monograph
- Year / edition: 2023
- Jurisdiction: Canada
- URL:
- DOI: 10.1234/example
- Applicable condition(s) / pathway(s): Cold sores (oral herpes labialis)
- Suggested pathway sections: Treatment Options
- Clinical use tags: Dose, Renal, Drug interactions
- Documentation reference candidate: NO
- Verification required: false
- Status: Needs review
- Notes:

### R3
- Title: Public health guidance example
- Organization / publisher: Public Health Agency of Canada
- Document type: Public-health guidance
- Year / edition:
- Jurisdiction: Canada
- URL:
- DOI:
- Applicable condition(s) / pathway(s): Cold sores (oral herpes labialis)
- Suggested pathway sections: Section-wide
- Clinical use tags: Counselling / patient guidance, Red flags / referral
- Documentation reference candidate: NO
- Verification required: true
- Status: Needs review
- Notes:
`;

describe('references import parser', () => {
  it('parses Reference Library blocks with documentation candidates and clinical-use tags', () => {
    const result = parseReferenceLibraryMarkdown(SAMPLE);
    assert.equal(result.items.length, 3);
    assert.equal(result.items[0]!.citationTitle, 'CPS — Herpes simplex infections');
    assert.equal(result.items[0]!.documentType, 'clinical_reference');
    assert.deepEqual(result.items[0]!.suggestedSections, ['treatment_options', 'red_flags']);
    assert.deepEqual(result.items[0]!.clinicalUseTags, [
      'assessment',
      'dose',
      'monitoring_follow_up',
    ]);
    assert.equal(result.items[0]!.documentationReferenceCandidate, true);
    assert.equal(result.items[0]!.verificationRequired, true);
    assert.equal(result.items[0]!.notes, 'Pathway-level clinical reference');
    assert.equal(result.items[1]!.documentType, 'product_monograph');
    assert.equal(result.items[1]!.doi, '10.1234/example');
    assert.equal(result.items[2]!.documentType, 'public_health_guidance');
    assert.deepEqual(result.items[2]!.suggestedSections, ['section_wide']);
    assert.equal(result.summary.documentationCandidates, 1);
  });

  it('rejects missing Reference Library heading', () => {
    const result = parseReferenceLibraryMarkdown('### R1\n- Title: Only');
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /Unable to parse reference library/);
  });

  it('never marks imports as verified', () => {
    const result = parseReferenceLibraryMarkdown(SAMPLE);
    assert.equal(importStatusForItem(result.items[0]!), 'verification_required');
    assert.equal(importStatusForItem(result.items[1]!), 'needs_review');
  });

  it('matches existing references by DOI then title+org', () => {
    const result = parseReferenceLibraryMarkdown(SAMPLE);
    const existing = [
      {
        id: 'existing-1',
        citationTitle: 'Health Canada Product Monograph — Valacyclovir',
        organization: 'Health Canada',
        edition: '2023',
        publicationYear: 2023,
        url: null,
        doi: '10.1234/example',
        status: 'verified',
      },
    ];
    const match = findMatchingReference(result.items[1]!, existing);
    assert.equal(match?.id, 'existing-1');
    assert.equal(match?.confidence, 'exact');
  });

  it('ignores unknown clinical-use tags with warning', () => {
    const md = `
## Reference Library

### R1
- Title: Example Guideline
- Organization / publisher: Example Org
- Document type: Guideline
- Year / edition: 2024
- Jurisdiction: Canada
- URL:
- DOI:
- Applicable condition(s) / pathway(s): Cold sores
- Suggested pathway sections: Treatment Options
- Clinical use tags: Dose, Made Up Tag, Renal
- Documentation reference candidate: NO
- Verification required: false
- Status: Needs review
- Notes:
`;
    const result = parseReferenceLibraryMarkdown(md);
    assert.equal(result.ok, true);
    assert.deepEqual(result.items[0]!.clinicalUseTags, ['dose', 'renal']);
    assert.ok(
      result.items[0]!.warnings.some((w) => /Unknown clinical-use tag/i.test(w)),
    );
  });

  it('rejects invented placeholder URLs', () => {
    const md = `
## Reference Library

### R1
- Title: Example Guideline
- Organization / publisher: Example Org
- Document type: Guideline
- Year / edition: 2024
- Jurisdiction: Canada
- URL: https://example.com/fake
- DOI:
- Applicable condition(s) / pathway(s): Cold sores
- Suggested pathway sections: Treatment Options
- Clinical use tags: Dose
- Documentation reference candidate: NO
- Verification required: true
- Status: Needs review
- Notes:
`;
    const result = parseReferenceLibraryMarkdown(md);
    assert.equal(result.items[0]!.url, null);
  });
});

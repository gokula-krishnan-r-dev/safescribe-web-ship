import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseDifferentialsImport } from './differentials-import.parser';

const SAMPLE = `## Differential Review

### 1. Aphthous ulcer (Canker sore)
- Likelihood: COMMON
- Screening question: Is the sore located inside the mouth rather than on the outer lip border, without preceding vesicles?
- Why this matters: Aphthous ulcers can resemble herpes labialis but differ in typical location and lesion pattern.
- If yes → suggested result: Canker sore (Aphthous stomatitis)
- Key symptoms / features: Painful round or oval oral ulcer with a pale centre and erythematous border.
- How to distinguish: Usually occurs on oral mucosa and is not preceded by grouped vesicles.
- Suggested next step: Assess and manage as aphthous ulcer if appropriate; refer if atypical, severe, or persistent.
- Required in screening: true
- References: R1, R2

### 2. Angular cheilitis
- Likelihood: LESS_COMMON
- Screening question: Is the problem mainly cracking, redness, or soreness at one or both corners of the mouth without grouped fluid-filled blisters?
- Why this matters: Angular cheilitis may be mistaken for herpes labialis but has a different distribution and management approach.
- If yes → suggested result: Angular cheilitis
- Key symptoms / features: Fissuring, erythema, soreness or crusting at the oral commissures.
- How to distinguish: Typically localized to the corners of the mouth rather than the vermilion border.
- Suggested next step: Assess contributing factors and manage or refer as appropriate.
- Required in screening: false
- References: R1

## Section Evidence
- R1
- R2

## Reference Library

### R1
- Title: [source title]
- Organization / publisher: [organization]
- Guideline / document type: Clinical reference
- Year / edition: [edition]
- Jurisdiction: Canada
- URL:
- DOI:
- Verification required: true

### R2
- Title: [second source title]
- Organization / publisher: [organization]
- Guideline / document type: Clinical reference
- Year / edition: [edition]
- Jurisdiction: Canada
- URL:
- DOI:
- Verification required: false
`;

describe('differential Review ChatGPT import parser', () => {
  it('parses structured items, section evidence, and the reference library', () => {
    const parsed = parseDifferentialsImport(SAMPLE);
    assert.equal(parsed.format, 'structured');
    assert.equal(parsed.items.length, 2);
    assert.equal(parsed.items[0]!.condition, 'Aphthous ulcer (Canker sore)');
    assert.equal(parsed.items[0]!.likelihood, 'COMMON');
    assert.equal(parsed.items[0]!.required, true);
    assert.deepEqual(parsed.items[0]!.importedReferenceIds, ['R1', 'R2']);
    assert.match(parsed.items[0]!.positiveResult, /Canker sore/i);
    assert.equal(parsed.items[1]!.likelihood, 'LESS_COMMON');
    assert.equal(parsed.items[1]!.required, false);
    assert.deepEqual(parsed.sectionEvidenceIds, ['R1', 'R2']);
    assert.equal(parsed.references.length, 2);
    assert.equal(parsed.references[0]!.verificationRequired, true);
    assert.equal(parsed.blockingErrors.length, 0);
  });

  it('blocks unknown reference IDs and invalid likelihood', () => {
    const parsed = parseDifferentialsImport(`## Differential Review

### 1. Mystery condition
- Likelihood: POSSIBLE
- Screening question: Does this look like a competing diagnosis the pharmacist should consider?
- Why this matters: Needs review
- If yes → suggested result: Mystery
- Key symptoms / features: Unclear
- How to distinguish: Unclear
- Suggested next step: Reassess
- Required in screening: true
- References: R9

## Reference Library

### R1
- Title: A real title
- Organization / publisher: CPS
- Guideline / document type: Clinical reference
- Year / edition: 2024
- Jurisdiction: Canada
- URL:
- DOI:
- Verification required: true
`);
    assert.ok(parsed.blockingErrors.some((e) => /COMMON, LESS_COMMON, or RARE/i.test(e)));
    assert.ok(parsed.blockingErrors.some((e) => /Undefined reference ID/i.test(e)));
  });

  it('does not invent references from unstructured prose', () => {
    const parsed = parseDifferentialsImport(
      'Differentials include canker sores and angular cheilitis. See CPS herpes chapter. 98% sure this is HSV.',
    );
    assert.equal(parsed.items.length, 0);
    assert.equal(parsed.references.length, 0);
    assert.ok(parsed.blockingErrors.length > 0);
    assert.ok(parsed.warnings.some((w) => /confidence percentages/i.test(w)));
  });

  it('parses legacy Condition blocks as Needs-review drafts without inferred citations', () => {
    const parsed = parseDifferentialsImport(`## Differential
Condition: Bacterial cellulitis
Likelihood: LESS_COMMON
Question: Is there rapidly spreading erythema, warmth, and systemic symptoms?
Why it matters: Requires medical assessment.
Key symptoms: Spreading redness, fever
Distinguishing features: Not limited to typical localized pattern
Recommended action: Same-day physician referral
Suggested pathway: Cellulitis
`);
    assert.equal(parsed.format, 'legacy');
    assert.equal(parsed.items.length, 1);
    assert.equal(parsed.items[0]!.condition, 'Bacterial cellulitis');
    assert.equal(parsed.items[0]!.likelihood, 'LESS_COMMON');
    assert.deepEqual(parsed.items[0]!.importedReferenceIds, []);
    assert.equal(parsed.references.length, 0);
    assert.ok(parsed.warnings.some((w) => /Legacy/i.test(w)));
  });
});

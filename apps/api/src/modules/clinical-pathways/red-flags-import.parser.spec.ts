import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseRedFlagsImport } from './red-flags-import.parser';

const SAMPLE = `## Red Flag

### 1. Ocular involvement
- Question: Does the patient have a lesion near the eye or eye pain, redness, light sensitivity, excessive tearing, or changes in vision?
- Severity: CRITICAL
- Why this matters: Ocular involvement may indicate a complication requiring urgent medical assessment.
- Recommended action: IMMEDIATE_REFERRAL
- Action note: Refer for urgent medical assessment.
- Required: true
- References: R1, R2

### 2. Persistent or non-healing lesion
- Question: Has the lesion been present longer than expected without healing or failed to improve with treatment?
- Severity: WARNING
- Why this matters: Persistent or atypical lesions may require further assessment to exclude another condition.
- Recommended action: SAME_DAY_PHYSICIAN
- Action note: Arrange further assessment before routine pathway treatment continues.
- Required: true
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
- Guideline / document type: Product monograph
- Year / edition: [edition]
- Jurisdiction: Canada
- URL:
- DOI:
- Verification required: false
`;

describe('red flags ChatGPT import parser', () => {
  it('parses structured flags, section evidence, and the reference library', () => {
    const parsed = parseRedFlagsImport(SAMPLE);
    assert.equal(parsed.format, 'structured');
    assert.equal(parsed.flags.length, 2);
    assert.equal(parsed.flags[0]!.title, 'Ocular involvement');
    assert.equal(parsed.flags[0]!.severity, 'CRITICAL');
    assert.equal(parsed.flags[0]!.recommendedAction, 'IMMEDIATE_REFERRAL');
    assert.deepEqual(parsed.flags[0]!.importedReferenceIds, ['R1', 'R2']);
    assert.equal(parsed.flags[1]!.severity, 'WARNING');
    assert.deepEqual(parsed.sectionEvidenceIds, ['R1', 'R2']);
    assert.equal(parsed.references.length, 2);
    assert.equal(parsed.references[0]!.verificationRequired, true);
    assert.equal(parsed.blockingErrors.length, 0);
  });

  it('blocks unknown reference IDs and invalid actions or severity', () => {
    const parsed = parseRedFlagsImport(`## Red Flag

### 1. Mystery finding
- Question: Does the patient have an unexplained systemic finding that changes management?
- Severity: URGENT
- Why this matters: Needs review
- Recommended action: CALL_SPECIALIST
- Action note: Ask for help
- Required: true
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
    assert.ok(parsed.blockingErrors.some((e) => /CRITICAL or WARNING/i.test(e)));
    assert.ok(parsed.blockingErrors.some((e) => /invalid/i.test(e)));
    assert.ok(parsed.blockingErrors.some((e) => /Undefined reference ID/i.test(e)));
  });

  it('does not invent references from unstructured prose', () => {
    const parsed = parseRedFlagsImport(
      'Red flags include fever and eye pain. See CPS herpes chapter. 98% sure this is HSV.',
    );
    assert.equal(parsed.flags.length, 0);
    assert.equal(parsed.references.length, 0);
    assert.ok(parsed.blockingErrors.length > 0);
    assert.ok(parsed.warnings.some((w) => /confidence percentages/i.test(w)));
  });

  it('parses legacy Title blocks as Needs-review drafts without inferred citations', () => {
    const parsed = parseRedFlagsImport(`## Red Flag
Title: Immunocompromised patient
Severity: CRITICAL
Question: Is the patient significantly immunocompromised?
Why it matters: Higher risk of complications.
Action: IMMEDIATE_REFERRAL
Required: yes
`);
    assert.equal(parsed.format, 'legacy');
    assert.equal(parsed.flags.length, 1);
    assert.equal(parsed.flags[0]!.title, 'Immunocompromised patient');
    assert.deepEqual(parsed.flags[0]!.importedReferenceIds, []);
    assert.equal(parsed.references.length, 0);
    assert.ok(parsed.warnings.some((w) => /Legacy/i.test(w)));
  });
});

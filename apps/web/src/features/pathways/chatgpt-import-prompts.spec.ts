import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDifferentialsChatGptPrompt,
  buildPresentationReviewChatGptPrompt,
  buildRedFlagsChatGptPrompt,
  buildTreatmentsChatGptPrompt,
  getChatGptImportConfig,
} from './chatgpt-import-prompts';

describe('Presentation Review ChatGPT prompt', () => {
  it('uses the revised SafeScribe context and evidence rules', () => {
    const prompt = buildPresentationReviewChatGptPrompt({
      pathwayName: 'Cold Sore (Herpes labialis)',
      condition: 'Herpes labialis',
      province: 'Alberta',
    });
    assert.match(prompt, /Cold Sore \(Herpes labialis\)/);
    assert.match(prompt, /Alberta/);
    assert.match(prompt, /deliberately selected this pathway/);
    assert.match(prompt, /SafeScribe is NOT diagnosing the patient/);
    assert.match(prompt, /## Presentation Review/);
    assert.match(prompt, /Do NOT create separate "Diagnosis Confirmation"/);
    assert.match(prompt, /Differential Review/);
    assert.match(prompt, /Red Flags & Safety Screening/);
    assert.match(prompt, /DO NOT invent/);
    assert.match(prompt, /## Section Evidence/);
    assert.match(prompt, /## Reference Library/);
    assert.match(prompt, /Verification required/);
    assert.doesNotMatch(prompt, /98% sure/);
  });
});

describe('Red Flags ChatGPT prompt', () => {
  it('uses the revised Red Flags & Safety Screening evidence rules', () => {
    const prompt = buildRedFlagsChatGptPrompt({
      pathwayName: 'Cold Sore (Herpes labialis)',
      condition: 'Herpes labialis',
      province: 'Alberta',
    });
    assert.match(prompt, /Cold Sore \(Herpes labialis\)/);
    assert.match(prompt, /Alberta/);
    assert.match(prompt, /completed Presentation Review and Differential Review/);
    assert.match(prompt, /SafeScribe is NOT diagnosing the patient/);
    assert.match(prompt, /## Red Flags & Safety Screening/);
    assert.match(prompt, /Do not include routine medication-safety checks/);
    assert.match(prompt, /Why this matters/);
    assert.match(prompt, /\*\*References:\*\* reference IDs/);
    assert.match(prompt, /## Section Evidence/);
    assert.match(prompt, /## Reference Library/);
    assert.match(prompt, /DO NOT invent/);
    assert.match(prompt, /Verification required/);
    assert.doesNotMatch(prompt, /98% sure/);
    assert.doesNotMatch(prompt, /patient names|PHN|date of birth/i);
  });
});

describe('Differential Review ChatGPT prompt', () => {
  it('uses the revised Differential Review evidence rules', () => {
    const prompt = buildDifferentialsChatGptPrompt({
      pathwayName: 'Cold Sore (Herpes labialis)',
      condition: 'Herpes labialis',
      province: 'Alberta',
    });
    assert.match(prompt, /Cold Sore \(Herpes labialis\)/);
    assert.match(prompt, /Alberta/);
    assert.match(prompt, /deliberately selected this pathway/);
    assert.match(prompt, /completed Presentation Review/);
    assert.match(prompt, /SafeScribe is NOT diagnosing the patient/);
    assert.match(prompt, /## Differential Review/);
    assert.match(prompt, /Red Flags & Safety Screening/);
    assert.match(prompt, /Why this matters/);
    assert.match(prompt, /Key symptoms \/ features/);
    assert.match(prompt, /How to distinguish/);
    assert.match(prompt, /\*\*References:\*\* reference IDs/);
    assert.match(prompt, /## Section Evidence/);
    assert.match(prompt, /## Reference Library/);
    assert.match(prompt, /DO NOT invent/);
    assert.match(prompt, /Verification required/);
    assert.match(prompt, /the selected pathway condition itself was not repeated/);
    assert.doesNotMatch(prompt, /98% sure/);
    assert.doesNotMatch(prompt, /patient names|PHN|date of birth/i);
  });
});

describe('Treatment Options ChatGPT prompt', () => {
  it('uses the revised evidence, documentation, and eGFR safety rules', () => {
    const prompt = buildTreatmentsChatGptPrompt({
      pathwayName: 'Cold Sore (Herpes labialis)',
      condition: 'Herpes labialis',
      province: 'Alberta',
    });
    assert.match(prompt, /Cold Sore \(Herpes labialis\)/);
    assert.match(prompt, /Alberta/);
    assert.match(prompt, /completed Red Flags & Safety Screening/);
    assert.match(prompt, /SafeScribe is NOT selecting treatment for the pharmacist/);
    assert.match(prompt, /The pharmacist chooses the treatment/);
    assert.match(prompt, /Why this option\?/);
    assert.match(prompt, /## Section Evidence/);
    assert.match(prompt, /## Reference Library/);
    assert.match(prompt, /DO NOT invent/);
    assert.match(prompt, /Documentation reference/);
    assert.match(prompt, /Renal source basis/);
    assert.match(prompt, /no validated eGFR mapping/);
    assert.match(prompt, /Do not invent an eGFR conversion/);
    assert.match(prompt, /Apply renal-adjusted regimen/);
    assert.doesNotMatch(prompt, /98% sure/);
    assert.doesNotMatch(prompt, /patient names|PHN|date of birth/i);
  });
});

describe('References ChatGPT prompt', () => {
  it('maps the revised Clinical Admin reference library prompt fields', () => {
    const config = getChatGptImportConfig('references');
    const prompt = config.promptTemplate({
      pathwayName: 'Cold sores (oral herpes labialis)',
      condition: 'Cold sores (oral herpes labialis)',
      province: 'AB,BC',
    });
    assert.match(prompt, /Clinical use tags/);
    assert.match(prompt, /Documentation reference candidate/);
    assert.match(prompt, /Applicable condition\(s\) \/ pathway\(s\)/);
    assert.match(prompt, /Suggested pathway sections/);
    assert.match(prompt, /ADAPT-SPECIFIC TAGGING/);
    assert.match(prompt, /Therapeutic substitution/);
    assert.match(prompt, /Status: Needs review/);
    assert.match(prompt, /DEDUPLICATION/);
    assert.doesNotMatch(prompt, /Content tags/);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyDapAttestationToFields,
  ensureDapFollowUpParagraphBreak,
  ensureDapNoteSpacingHtml,
  fieldsToDapNotionHtml,
  formatDapAttestation,
  upsertDapAttestationHtml,
} from './dap-note-format';
import { DAP_CONSENT_SENTENCE } from '@safescript/shared';

describe('DAP consultation note attestation', () => {
  const source = {
    createdAt: '2026-08-18T20:34:00.000Z',
    pharmacist: { firstName: 'Priya', lastName: 'Shah' },
    tenant: { name: 'Riverbend Pharmacy' },
  };

  it('formats pharmacist, pharmacy, and date/time without empty labels', () => {
    const block = formatDapAttestation(source);
    assert.match(block, /^Pharmacist: Priya Shah, RPh$/m);
    assert.match(block, /^Pharmacy: Riverbend Pharmacy$/m);
    assert.match(block, /^Date\/time: /m);
    assert.doesNotMatch(block, /Pharmacist: ,/);
  });

  it('omits missing pharmacist or pharmacy rather than printing blank labels', () => {
    const block = formatDapAttestation({ createdAt: '2026-08-18T12:00:00.000Z' });
    assert.doesNotMatch(block, /Pharmacist:/);
    assert.doesNotMatch(block, /Pharmacy:/);
    assert.match(block, /^Date\/time: /m);
  });

  it('appends the attestation below clinical resources in the preview HTML', () => {
    const html = fieldsToDapNotionHtml({
      documentTitle: 'Pharmacist Consultation Note',
      data: 'Findings.',
      assessment: 'Impression.',
      plan: 'Plan.',
      clinicalReferences: 'Clinical resource consulted: CPS / eCPS (18-Aug-2026).',
      attestationBlock: formatDapAttestation(source),
    });
    const refsAt = html.indexOf('data-field="clinicalReferences"');
    const attAt = html.indexOf('data-field="attestationBlock"');
    assert.ok(refsAt >= 0);
    assert.ok(attAt > refsAt);
    assert.match(html, /Pharmacy: Riverbend Pharmacy/);
  });

  it('keeps clinical resource citations without pathway governance lines', () => {
    const html = fieldsToDapNotionHtml({
      documentTitle: 'Pharmacist Consultation Note',
      data: 'Findings.',
      assessment: 'Impression.',
      plan: 'Plan.',
      clinicalReferences:
        'Clinical resources consulted: VALTREX (2026) and CPS (2025).\n\nClinical pathway: Cold sore (v1.2). Last reviewed 12-Jan-2026.',
    });
    assert.match(html, /VALTREX \(2026\) and CPS \(2025\)/);
    assert.doesNotMatch(html, /Clinical pathway:/);
  });

  it('replaces a previous attestation block instead of duplicating it', () => {
    const first = upsertDapAttestationHtml(
      '<p>Plan complete.</p>',
      'Pharmacist: A, RPh\nPharmacy: Old\nDate/time: 01-Jan-2026, 1:00 PM',
    );
    const second = upsertDapAttestationHtml(
      first,
      'Pharmacist: B, RPh\nPharmacy: New\nDate/time: 18-Aug-2026, 2:34 PM',
    );
    assert.equal((second.match(/data-field="attestationBlock"/g) ?? []).length, 1);
    assert.match(second, /Pharmacy: New/);
    assert.doesNotMatch(second, /Pharmacy: Old/);
  });

  it('stores the attestation on the document fields used by PDF, fax, and Kroll copy', () => {
    const next = applyDapAttestationToFields(
      { plan: 'Continue therapy.', documentHtml: '<p>Continue therapy.</p>' },
      source,
    );
    assert.match(next.attestationBlock, /Riverbend Pharmacy/);
    assert.match(next.documentHtml ?? '', /data-field="attestationBlock"/);
  });

  it('renders DAP plan markdown as bold numbered treatments', () => {
    const html = fieldsToDapNotionHtml({
      documentTitle: 'Pharmacist Consultation Note',
      plan: [
        '**omeprazole:** Take 20 mg by mouth once daily.',
        '**aluminum hydroxide:** Take 20 mL by mouth three times daily for 5 days.',
      ].join('\n\n'),
    });
    assert.match(html, /data-field="plan"/);
    assert.match(html, /<ol>/);
    assert.match(html, /<strong>omeprazole:<\/strong>/);
    assert.doesNotMatch(html, /\*\*/);
  });

  it('opens the DAP note with the static consent sentence in D — Data', () => {
    const html = fieldsToDapNotionHtml({
      documentTitle: 'Pharmacist Consultation Note',
      data: '25-year-old female assessed for migraine.',
      assessment: 'Presentation is consistent with migraine.',
      plan: 'Continue therapy.',
    });
    const dataAt = html.indexOf('data-field="data"');
    const consentAt = html.indexOf(DAP_CONSENT_SENTENCE);
    const findingsAt = html.indexOf('25-year-old female assessed for migraine.');
    assert.ok(dataAt >= 0);
    assert.ok(consentAt > dataAt);
    assert.ok(findingsAt > consentAt);
    assert.equal((html.match(new RegExp(DAP_CONSENT_SENTENCE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length, 1);
  });

  it('splits a jammed follow-up sentence onto its own paragraph', () => {
    const split = ensureDapFollowUpParagraphBreak(
      'Supportive care was reviewed with the patient. Pharmacist follow-up planned in 3 days to assess symptom improvement.',
    );
    assert.match(split, /patient\.\n\nPharmacist follow-up planned/);
    const again = ensureDapFollowUpParagraphBreak(split);
    assert.equal(again, split);
  });

  it('splits a follow-up line that was jammed after a <br> in stored HTML', () => {
    const html = ensureDapNoteSpacingHtml(
      '<p>Supportive care was reviewed with the patient.<br>Pharmacist follow-up planned in 3 days to assess symptom improvement.</p>',
    );
    assert.match(html, /<p>Supportive care was reviewed with the patient\.<\/p>/);
    assert.match(html, /<p>Pharmacist follow-up planned in 3 days to assess symptom improvement\.<\/p>/);
  });
});

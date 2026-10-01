import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ensurePcpHtmlHasBackendSections,
  fieldsToPcpNotionHtml,
} from './pcp-format';

const FOLLOW_UP_SENTENCE =
  'Pharmacist follow-up planned in 7 days to assess symptom improvement or resolution; referral advised if symptoms are not resolving.';

describe('PCP communication HTML', () => {
  it('puts both selected treatments in one Treatment card', () => {
    const html = fieldsToPcpNotionHtml({
      documentTitle: 'Pharmacist Communication to Primary Care Provider',
      assessment: 'Presentation was consistent with Cold sores.',
      treatment: [
        'FAMVIR: Take 500 mg by mouth once.',
        'ZOVIRAX: Apply 1 application topically 5 times a day for up to 4 days.',
      ].join('\n'),
      followUp: 'Reassess if symptoms are not improving.',
    });
    const treatmentBlocks = html.match(
      /<h2 data-field="treatment">Treatment:<\/h2><p[\s\S]*?<\/p>/,
    );
    assert.ok(treatmentBlocks);
    assert.match(treatmentBlocks![0], /FAMVIR:/);
    assert.match(treatmentBlocks![0], /<br>ZOVIRAX:/);
    assert.equal((html.match(/<h2 data-field="treatment">/g) ?? []).length, 1);
    assert.match(html, /<h2 data-field="followUp">Follow-up:<\/h2>/);
  });

  it('Test A — Follow-up renders from backend text, not the LLM field name', () => {
    const html = fieldsToPcpNotionHtml({
      assessment: 'Presentation was consistent with cold sores.',
      treatment: 'Valtrex: Take 500 mg by mouth every 12 hours for 2 doses.',
      followUp: FOLLOW_UP_SENTENCE,
    });
    assert.match(html, /<h2 data-field="followUp">Follow-up:<\/h2>/);
    assert.match(html, /data-pcp-card="followUp"/);
    assert.match(html, /Pharmacist follow-up planned in 7 days/);
  });

  it('Test B — empty LLM followUp still renders when backend follow-up is supplied', () => {
    const stored = fieldsToPcpNotionHtml({
      assessment: 'Presentation was consistent with cold sores.',
      treatment: 'Valtrex: Take 500 mg by mouth every 12 hours for 2 doses.',
      followUp: '',
      closingSentence:
        'This update is provided for your information and continuity of care.',
    });
    assert.doesNotMatch(stored, /data-field="followUp"/);
    const html = ensurePcpHtmlHasBackendSections(stored, {
      followUp: FOLLOW_UP_SENTENCE,
    });
    assert.match(html, /<h2 data-field="followUp">Follow-up:<\/h2>/);
    assert.match(html, /Pharmacist follow-up planned in 7 days/);
    const followUpAt = html.indexOf('data-field="followUp"');
    const closingAt = html.indexOf('data-field="closingSentence"');
    assert.ok(followUpAt > -1 && closingAt > followUpAt);
  });

  it('Test D — Treatment card ends before Follow-up, closing, and signature', () => {
    const html = fieldsToPcpNotionHtml({
      assessment: 'Presentation was consistent with cold sores.',
      treatment: [
        'Valtrex: Take 500 mg by mouth every 12 hours for 2 doses.',
        'XERESE: Apply 1 application topically 5 times a day for up to 5 days.',
      ].join('\n'),
      followUp: FOLLOW_UP_SENTENCE,
      closingSentence:
        'This update is provided for your information and continuity of care.',
      signatureBlock: 'Kind regards,\nJohn Pharmacist, RPh\n\nDemo Pharmacy',
    });
    const treatmentCard = html.match(
      /<h2 data-field="treatment">[\s\S]*?<p data-pcp-card="treatment">[\s\S]*?<\/p>/,
    )?.[0];
    assert.ok(treatmentCard);
    assert.doesNotMatch(treatmentCard, /continuity of care/i);
    assert.doesNotMatch(treatmentCard, /Kind regards/);
    assert.doesNotMatch(treatmentCard, /Follow-up/);
    const treatmentAt = html.indexOf('data-field="treatment"');
    const followUpAt = html.indexOf('data-field="followUp"');
    const closingAt = html.indexOf('data-field="closingSentence"');
    const signatureAt = html.indexOf('data-field="signatureBlock"');
    assert.ok(treatmentAt < followUpAt);
    assert.ok(followUpAt < closingAt);
    assert.ok(closingAt < signatureAt);
  });

  it('renders PATIENT INFORMATION from structured identity fields', () => {
    const html = fieldsToPcpNotionHtml({
      documentTitle: 'Pharmacist Communication to Primary Care Provider',
      patientName: 'Emma Clarke',
      patientDob: '2001-03-12',
      patientPhn: '12345-6789',
      headerBlock: 'Date: 04-Sept-2026',
      assessment: 'Presentation was consistent with cold sores.',
      treatment: 'Valtrex: Take 500 mg by mouth every 12 hours for 2 doses.',
      followUp: FOLLOW_UP_SENTENCE,
    });
    assert.match(html, /PATIENT INFORMATION/);
    assert.match(html, /Name:<\/strong> Emma Clarke/);
    assert.match(html, /Date of birth:<\/strong> 12-Mar-2001/);
    assert.match(html, /PHN:<\/strong> 12345-6789/);
    assert.match(html, /Date: 04-Sept-2026/);
    assert.doesNotMatch(html, /Re: Emma/);
    const patientAt = html.indexOf('patientInformation');
    const dateAt = html.indexOf('headerBlock');
    const treatmentAt = html.indexOf('data-field="treatment"');
    const followUpAt = html.indexOf('data-field="followUp"');
    assert.ok(dateAt > -1 && dateAt < patientAt);
    assert.ok(treatmentAt > patientAt);
    assert.ok(followUpAt > treatmentAt);
  });

  it('Test E — omits Follow-up when backend follow-up text is empty', () => {
    const html = fieldsToPcpNotionHtml({
      assessment: 'Presentation was consistent with cold sores.',
      treatment: 'Valtrex: Take 500 mg by mouth every 12 hours for 2 doses.',
      followUp: '',
    });
    assert.doesNotMatch(html, /data-field="followUp"/);
    assert.match(html, /data-field="closingSentence"/);
  });
});

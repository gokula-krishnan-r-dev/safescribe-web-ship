import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renewDocumentToHtml } from './renew-document-html';

describe('renew document html', () => {
  it('does not wrap compact DAP chart-copy with a document title', () => {
    const html = renewDocumentToHtml(
      [
        'D — Data',
        'Requested 30-day renewal of established ramipril.',
        '',
        'A — Assessment',
        'Current therapies remain indicated.',
        '',
        'P — Plan',
        'Renewed ramipril 10 mg daily for 30 days.',
      ].join('\n'),
      'Pharmacist Renewal Assessment',
    );
    assert.doesNotMatch(html, /<h1>/i);
    assert.match(html, /<h2>D — Data<\/h2>/);
    assert.match(html, /<h2>A — Assessment<\/h2>/);
    assert.match(html, /<h2>P — Plan<\/h2>/);
    assert.match(
      html,
      /Patient informed consent obtained prior to the pharmacist assessment\./,
    );
    assert.match(html, /Requested 30-day renewal of established ramipril/);
    assert.equal(
      (html.match(/Patient informed consent obtained prior to the pharmacist assessment\./g) ?? []).length,
      1,
    );
  });

  it('renders Your Medication Renewal with labelled patient-facing rows', () => {
    const html = renewDocumentToHtml(
      [
        'Your Medication Renewal',
        '',
        'Your pharmacist reviewed your medication and provided a 7-day renewal.',
        '',
        'Your renewed medication',
        '',
        'Salbutamol HFA 100 mcg',
        'How to take it: Inhale 1 puff twice daily as needed.',
        'Renewal supply: 7 days',
        'Used for: Asthma',
        '',
        'When to get help',
        '',
        'Contact your pharmacist or healthcare provider if:',
        '• you have a new or concerning side effect',
        '',
        'Questions?',
        'Contact Chappelle Pharmacy',
        '780-250-2494',
      ].join('\n'),
      'Your Medication Renewal',
    );
    assert.equal((html.match(/<h1>/gi) ?? []).length, 1);
    assert.match(html, /<h1>Your Medication Renewal<\/h1>/);
    assert.match(html, /<h2>Your renewed medication<\/h2>/);
    assert.match(html, /<strong>How to take it:<\/strong>/);
    assert.match(html, /<strong>Renewal supply:<\/strong>/);
    assert.match(html, /<h2>When to get help<\/h2>/);
    assert.match(html, /<h2>Questions\?<\/h2>/);
  });

  it('bolds renewed medication labels in the Plan', () => {
    const html = renewDocumentToHtml(
      [
        'D — Data',
        'Renewal requested because no refills remain.',
        '',
        'A — Assessment',
        'Continued salbutamol therapy remains appropriate.',
        '',
        'P — Plan',
        'Renewed salbutamol HFA 100 mcg: inhale 1 puff twice daily as needed.',
        'Renewal authorized for a 7-day supply.',
        'Original Prescriber Notified on 16-Sep-2026.',
      ].join('\n'),
      'Pharmacist Renewal Assessment',
    );
    assert.match(html, /<strong>Renewed salbutamol HFA 100 mcg:<\/strong>/);
  });

  it('keeps a title heading for non-DAP renew documents', () => {
    const html = renewDocumentToHtml('Ramipril 10 mg daily\nQuantity: 30', 'Prescription');
    assert.match(html, /<h1>Prescription<\/h1>/);
    assert.match(html, /Ramipril 10 mg daily/);
  });

  it('renders the renew provider letter without numbered To/Patient chrome', () => {
    const html = renewDocumentToHtml(
      [
        'PHARMACIST RENEWAL NOTIFICATION',
        '',
        'Patient: Mani · DOB: 10-Oct-2000',
        '',
        'Re: Pharmacist prescription renewal',
        '',
        'Dear Colleague,',
        '',
        'Salbutamol was renewed for 7 days to maintain continuity of established therapy.',
        '',
        'Medication renewed',
        '',
        'Salbutamol HFA 100 mcg',
      ].join('\n'),
      'Prescriber Communication',
    );
    assert.match(html, /<h1>PHARMACIST RENEWAL NOTIFICATION<\/h1>/);
    assert.doesNotMatch(html, /Prescriber Communication/);
    assert.match(html, /<p>Dear Colleague,<\/p>/);
    assert.match(html, /<h2>Medication renewed<\/h2>/);
    assert.match(html, /<p><strong>Patient:<\/strong>/);
    assert.match(html, /<p><strong>Re:<\/strong>/);
    assert.doesNotMatch(html, /1\.\s+Patient/);
    assert.doesNotMatch(html, /<ol[\s>]/i);
    assert.doesNotMatch(html, />To:</);
  });

  it('flattens numbered letter chrome and medication meta into paragraphs', () => {
    const html = renewDocumentToHtml(
      [
        'PHARMACIST RENEWAL NOTIFICATION',
        '1. Patient: Dane · DOB: 16-Oct-2020',
        '2. Re: Pharmacist prescription renewal',
        '',
        'Dear Colleague,',
        '',
        'Medication renewed',
        '',
        'salbutamol',
        '1. Quantity: 1 Inhaler(s)',
        '2. Renewal duration: 14 days',
        '3. Date prescribed: 18-Sept-2026',
      ].join('\n'),
      'Prescriber Communication',
    );
    assert.match(html, /<p><strong>Patient:<\/strong> Dane/);
    assert.match(html, /<p><strong>Re:<\/strong>/);
    assert.match(html, /<p><strong>Quantity:<\/strong>/);
    assert.match(html, /<p><strong>Renewal duration:<\/strong>/);
    assert.match(html, /<p><strong>Date prescribed:<\/strong>/);
    assert.doesNotMatch(html, /<ol[\s>]/i);
    assert.doesNotMatch(html, /1\.\s+Patient/);
    assert.doesNotMatch(html, /1\.\s+Quantity/);
  });
});

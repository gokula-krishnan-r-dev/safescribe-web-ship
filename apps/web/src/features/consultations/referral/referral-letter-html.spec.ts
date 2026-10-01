import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isLegacyReferralLetterDump, referralLetterToHtml } from './referral-letter-html';

describe('referralLetterToHtml', () => {
  it('renders a conventional letter without turning the salutation into a heading', () => {
    const html = referralLetterToHtml(
      [
        'REFERRAL LETTER — DRAFT',
        'City Care Pharmacy',
        '29-Aug-2026',
        'To: Emergency department clinician',
        'Subject: Immediate assessment requested — suspected septic arthritis',
        'Age: 35 years  |  Sex: Male',
        'Dear Colleague,',
        'Please assess this patient immediately in the emergency department for suspected septic arthritis.',
        'Sincerely,',
        'Jane Pharmacist',
      ].join('\n'),
    );
    assert.match(html, /<h1>Referral letter<\/h1>/i);
    assert.match(html, /<p>Dear Colleague,<\/p>/);
    assert.match(html, /<p>Sincerely,<\/p>/);
    assert.doesNotMatch(html, /<h2>Dear Colleague,/i);
    assert.match(html, /<strong>Subject:<\/strong>/);
    assert.match(html, /<strong>City Care Pharmacy<\/strong>/);
    assert.doesNotMatch(html, /Presenting concern/);
  });

  it('escapes untrusted notes instead of rendering HTML', () => {
    const html = referralLetterToHtml(
      ['REFERRAL LETTER', 'Dear Colleague,', '<script>alert(1)</script>', 'Sincerely,'].join(
        '\n',
      ),
    );
    assert.doesNotMatch(html, /<script>/i);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  });

  it('detects the previous numbered dump so unapproved drafts can be rebuilt', () => {
    assert.equal(
      isLegacyReferralLetterDump('Presenting concern / pathway\nName: Not recorded in consultation'),
      true,
    );
    assert.equal(
      isLegacyReferralLetterDump(
        'REFERRAL LETTER\nTo: Emergency department clinician\nDear Colleague,',
      ),
      false,
    );
  });
});

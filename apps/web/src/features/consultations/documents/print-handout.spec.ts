import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildHandoutPrintDocument } from './print-handout';

describe('buildHandoutPrintDocument', () => {
  it('includes UTF-8 meta charset', () => {
    const html = buildHandoutPrintDocument('<p>Hello</p>', 'en', 'ltr');
    assert.match(html, /<meta\s+charset=["']UTF-8["']/i);
  });

  it('sets lang and dir attributes correctly for LTR Punjabi', () => {
    const punjabiContent = '<h1>ਤੁਹਾਡੀ ਦੇਖਭਾਲ ਯੋਜਨਾ</h1><p>ਤੁਹਾਡਾ ਮੁਲਾਂਕਣ</p>';
    const html = buildHandoutPrintDocument(punjabiContent, 'pa', 'ltr');
    assert.match(html, /<html\s+lang="pa"\s+dir="ltr">/i);
    assert.match(html, /<article class="patient-care-summary"\s+lang="pa"\s+dir="ltr">/i);
    assert.ok(html.includes(punjabiContent), 'Preserves native Gurmukhi characters without corruption');
  });

  it('sets lang and dir attributes correctly for RTL Arabic', () => {
    const arabicContent = '<h1>خطة الرعاية الخاصة بك</h1><p>التقييم الخاص بك</p>';
    const html = buildHandoutPrintDocument(arabicContent, 'ar', 'rtl');
    assert.match(html, /<html\s+lang="ar"\s+dir="rtl">/i);
    assert.match(html, /<article class="patient-care-summary"\s+lang="ar"\s+dir="rtl">/i);
    assert.ok(html.includes(arabicContent), 'Preserves native Arabic characters');
  });

  it('includes Noto Sans multilingual font stack in CSS', () => {
    const html = buildHandoutPrintDocument('<p>Content</p>', 'pa', 'ltr');
    assert.match(html, /Noto Sans Gurmukhi/i);
    assert.match(html, /Noto Sans Devanagari/i);
    assert.match(html, /Noto Sans Arabic/i);
    assert.match(html, /Noto Sans SC/i);
    assert.match(html, /print-color-adjust:\s*exact/i);
  });

  it('includes Google Fonts link when useFontsCdn is true', () => {
    const html = buildHandoutPrintDocument('<p>Content</p>', 'en', 'ltr', true);
    assert.match(html, /fonts\.googleapis\.com/i);
    assert.match(html, /family=Noto\+Sans/i);
  });

  it('omits Google Fonts link when useFontsCdn is false (offline mode)', () => {
    const html = buildHandoutPrintDocument('<p>Content</p>', 'en', 'ltr', false);
    assert.doesNotMatch(html, /fonts\.googleapis\.com/i);
  });

  it('includes counselling card CSS rules for treatment, expectedResponse, seekCare, etc.', () => {
    const html = buildHandoutPrintDocument('<p>Content</p>', 'en', 'ltr');
    assert.match(html, /data-field=['"]treatment['"]/);
    assert.match(html, /data-field=['"]seekCare['"]/);
    assert.match(html, /#fff8eb/); // Amber caution card background
  });

  it('sanitizes unsafe language code characters', () => {
    const html = buildHandoutPrintDocument('<p>Content</p>', 'pa"><script>alert(1)</script>', 'ltr');
    assert.doesNotMatch(html, /<script>alert/);
    assert.match(html, /lang="pascriptalert1script"/);
  });
});

/**
 * Unicode-safe patient handout printing.
 *
 * jsPDF uses Latin-only fonts (Helvetica/Times) which cannot render Indic,
 * Arabic, CJK, or other non-Latin scripts — causing the "$A9>!@" corruption
 * seen in Punjabi/Gurmukhi PDF output.
 *
 * The fix: for patient handouts we bypass jsPDF entirely and print via the
 * browser's Chromium engine using a hidden iframe. Chromium handles Unicode,
 * complex-script shaping, bidi, ligatures, and combining marks correctly,
 * provided the correct fonts are loaded.
 *
 * We load Noto Sans variants from Google Fonts (subset-optimised) which gives
 * broad multilingual coverage. Noto is specifically designed as a pan-Unicode
 * typeface with no tofu (missing-glyph boxes).
 *
 * Scope: Patient Care Summary / patient handout ONLY.
 * Do NOT apply this to DAP, PCP letter, or prescription.
 */

import { printHtmlDocument } from './print-html-document';

// ── Google Fonts Noto Sans URL ────────────────────────────────────────────────
// Covers all SafeScribe supported languages:
//   Punjabi (Gurmukhi)       → Noto Sans Gurmukhi
//   Hindi (Devanagari)       → Noto Sans Devanagari
//   Arabic / Urdu / Farsi    → Noto Sans Arabic + Noto Naskh Arabic
//   Tamil                    → Noto Sans Tamil
//   Gujarati                 → Noto Sans Gujarati
//   Bengali                  → Noto Sans Bengali
//   Chinese (Simplified)     → Noto Sans SC
//   Chinese (Traditional)    → Noto Sans TC
//   Korean                   → Noto Sans KR
//   Vietnamese / Cyrillic    → Noto Sans
const NOTO_GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?' +
  'family=Noto+Sans:ital,wght@0,400;0,600;0,700;1,400' +
  '&family=Noto+Sans+Arabic:wght@400;600;700' +
  '&family=Noto+Naskh+Arabic:wght@400;700' +
  '&family=Noto+Sans+Devanagari:wght@400;600;700' +
  '&family=Noto+Sans+Gurmukhi:wght@400;600;700' +
  '&family=Noto+Sans+Gujarati:wght@400;600;700' +
  '&family=Noto+Sans+Bengali:wght@400;600;700' +
  '&family=Noto+Sans+Tamil:wght@400;600;700' +
  '&family=Noto+Sans+SC:wght@400;600;700' +
  '&family=Noto+Sans+TC:wght@400;600;700' +
  '&family=Noto+Sans+KR:wght@400;700' +
  '&display=swap';

// Comprehensive font-family fallback stack including Google Fonts AND system native fonts.
const HANDOUT_FONT_STACK = [
  '"Noto Sans"',
  '"Noto Sans Gurmukhi"', '"Gurmukhi MN"', '"Gurmukhi Sangam MN"', 'Raavi',
  '"Noto Sans Devanagari"', '"Devanagari Sangam MN"', '"Kohinoor Devanagari"', 'Mangal',
  '"Noto Sans Arabic"', '"Noto Naskh Arabic"', '"Geeza Pro"', 'Damascus',
  '"Noto Sans Tamil"', '"Tamil Sangam MN"', 'Latha',
  '"Noto Sans Gujarati"', '"Gujarati Sangam MN"', 'Shruti',
  '"Noto Sans Bengali"', '"Bangla Sangam MN"', 'Vrinda',
  '"Noto Sans SC"', '"PingFang SC"', '"Microsoft YaHei"',
  '"Noto Sans TC"', '"PingFang TC"',
  '"Noto Sans KR"', '"Apple SD Gothic Neo"', '"Malgun Gothic"',
  'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif',
].join(', ');

// Styles matching the on-screen NotionDocumentEditor counselling cards
const BASE_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  @page {
    margin: 14mm 16mm;
    size: letter portrait;
  }
  body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #111827;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .patient-care-summary {
    font-family: ${HANDOUT_FONT_STACK};
    font-size: 11pt;
    line-height: 1.55;
    max-width: 100%;
    margin: 0 auto;
    color: #111827;
  }
  .patient-care-summary h1 {
    font-size: 19pt;
    font-weight: 700;
    margin: 0 0 14px 0;
    line-height: 1.25;
    letter-spacing: -0.02em;
    color: #111827;
  }
  .patient-care-summary h2 {
    font-size: 11.5pt;
    font-weight: 700;
    margin: 16px 0 6px 0;
    line-height: 1.35;
    color: #111827;
  }
  .patient-care-summary h3 {
    font-size: 10.5pt;
    font-weight: 600;
    margin: 12px 0 4px 0;
    color: #273442;
  }
  .patient-care-summary p {
    margin: 4px 0 8px 0;
    min-height: 1.2em;
  }
  .patient-care-summary ul {
    margin: 4px 0 10px 0;
    padding-left: 20px;
    list-style: disc;
  }
  .patient-care-summary ol {
    margin: 4px 0 10px 0;
    padding-left: 22px;
    list-style: decimal;
  }
  .patient-care-summary li {
    margin: 3px 0;
  }
  .patient-care-summary li p {
    margin: 1px 0;
  }
  .patient-care-summary strong {
    font-weight: 700;
    color: #111827;
  }
  .patient-care-summary em {
    font-style: italic;
  }
  .patient-care-summary hr {
    border: none;
    border-top: 1px solid #d5e2e6;
    margin: 14px 0;
  }

  /* Counselling Cards — matches .notion-doc-prose card styling */
  .patient-care-summary h2[data-field='treatment'],
  .patient-care-summary h2[data-field='expectedResponse'],
  .patient-care-summary h2[data-field='selfCare'],
  .patient-care-summary h2[data-field='seekCare'],
  .patient-care-summary h2[data-field='followUp'] {
    margin: 14px 0 0 0;
    padding: 10px 14px 4px;
    background: #f6fbfb;
    border: 1px solid #d5e4e6;
    border-bottom: none;
    border-radius: 10px 10px 0 0;
    font-size: 11pt;
    font-weight: 700;
    color: #0f3f3c;
  }
  .patient-care-summary h2[data-field='treatment'] + ul,
  .patient-care-summary h2[data-field='treatment'] + ol,
  .patient-care-summary h2[data-field='treatment'] + p,
  .patient-care-summary h2[data-field='expectedResponse'] + ul,
  .patient-care-summary h2[data-field='expectedResponse'] + ol,
  .patient-care-summary h2[data-field='expectedResponse'] + p,
  .patient-care-summary h2[data-field='selfCare'] + ul,
  .patient-care-summary h2[data-field='selfCare'] + ol,
  .patient-care-summary h2[data-field='selfCare'] + p,
  .patient-care-summary h2[data-field='seekCare'] + ul,
  .patient-care-summary h2[data-field='seekCare'] + ol,
  .patient-care-summary h2[data-field='seekCare'] + p,
  .patient-care-summary h2[data-field='followUp'] + ul,
  .patient-care-summary h2[data-field='followUp'] + ol,
  .patient-care-summary h2[data-field='followUp'] + p {
    margin: 0 0 12px 0;
    padding: 4px 14px 10px 22px;
    background: #f6fbfb;
    border: 1px solid #d5e4e6;
    border-top: none;
    border-radius: 0 0 10px 10px;
  }

  /* When to Seek Care — Amber caution card */
  .patient-care-summary h2[data-field='seekCare'] {
    background: #fff8eb;
    border-color: #efc57f;
    color: #7a4b00;
  }
  .patient-care-summary h2[data-field='seekCare'] + ul,
  .patient-care-summary h2[data-field='seekCare'] + ol,
  .patient-care-summary h2[data-field='seekCare'] + p {
    background: #fff8eb;
    border-color: #efc57f;
  }

  /* Questions contact footer */
  .patient-care-summary h2[data-field='questionsContact'] {
    margin: 18px 0 4px 0;
    font-size: 11pt;
    font-weight: 700;
    color: #111827;
  }

  /* Language-specific font overrides */
  .patient-care-summary[lang='pa'] {
    font-family: 'Noto Sans Gurmukhi', 'Gurmukhi MN', 'Gurmukhi Sangam MN', 'Raavi', ${HANDOUT_FONT_STACK} !important;
  }
  .patient-care-summary[lang='hi'] {
    font-family: 'Noto Sans Devanagari', 'Devanagari Sangam MN', 'Kohinoor Devanagari', 'Mangal', ${HANDOUT_FONT_STACK} !important;
  }
  .patient-care-summary[lang='ar'],
  .patient-care-summary[lang='ur'],
  .patient-care-summary[lang='fa'] {
    font-family: 'Noto Naskh Arabic', 'Noto Sans Arabic', 'Geeza Pro', 'Damascus', ${HANDOUT_FONT_STACK} !important;
  }
  .patient-care-summary[lang='ta'] {
    font-family: 'Noto Sans Tamil', 'Tamil Sangam MN', 'Latha', ${HANDOUT_FONT_STACK} !important;
  }
  .patient-care-summary[lang='gu'] {
    font-family: 'Noto Sans Gujarati', 'Gujarati Sangam MN', 'Shruti', ${HANDOUT_FONT_STACK} !important;
  }
  .patient-care-summary[lang='bn'] {
    font-family: 'Noto Sans Bengali', 'Bangla Sangam MN', 'Vrinda', ${HANDOUT_FONT_STACK} !important;
  }
  .patient-care-summary[lang='zh-CN'] {
    font-family: 'Noto Sans SC', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', ${HANDOUT_FONT_STACK} !important;
  }
  .patient-care-summary[lang='zh-TW'] {
    font-family: 'Noto Sans TC', 'PingFang TC', 'Hiragino Sans CNS', 'Microsoft JhengHei', ${HANDOUT_FONT_STACK} !important;
  }
  .patient-care-summary[lang='ko'] {
    font-family: 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', ${HANDOUT_FONT_STACK} !important;
  }

  /* RTL Support */
  [dir='rtl'] .patient-care-summary,
  .patient-care-summary[dir='rtl'] {
    direction: rtl;
    text-align: right;
    unicode-bidi: isolate;
  }
  [dir='rtl'] .patient-care-summary ul,
  .patient-care-summary[dir='rtl'] ul {
    padding-right: 22px;
    padding-left: 0;
  }
  [dir='rtl'] .patient-care-summary ol,
  .patient-care-summary[dir='rtl'] ol {
    padding-right: 24px;
    padding-left: 0;
  }
  [dir='rtl'] .patient-care-summary h2[data-field='treatment'] + ul,
  [dir='rtl'] .patient-care-summary h2[data-field='expectedResponse'] + ul,
  [dir='rtl'] .patient-care-summary h2[data-field='selfCare'] + ul,
  [dir='rtl'] .patient-care-summary h2[data-field='seekCare'] + ul,
  [dir='rtl'] .patient-care-summary h2[data-field='followUp'] + ul {
    padding: 4px 22px 10px 14px;
  }

  @media print {
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      margin: 0;
      padding: 0;
    }
    .patient-care-summary {
      font-family: ${HANDOUT_FONT_STACK} !important;
    }
    .patient-care-summary h2[data-field='treatment'],
    .patient-care-summary h2[data-field='expectedResponse'],
    .patient-care-summary h2[data-field='selfCare'],
    .patient-care-summary h2[data-field='seekCare'],
    .patient-care-summary h2[data-field='followUp'] {
      break-inside: avoid;
      page-break-inside: avoid;
    }
  }
`;

/**
 * Build a complete UTF-8 HTML document wrapping the handout body HTML.
 *
 * @param bodyHtml    - The inner HTML to print (TipTap/Notion editor output).
 * @param lang        - BCP-47 language code, e.g. "en", "pa", "ar", "zh".
 * @param dir         - Text direction: "ltr" or "rtl".
 * @param useFontsCdn - Whether to load Google Fonts (requires network).
 */
export function buildHandoutPrintDocument(
  bodyHtml: string,
  lang: string,
  dir: 'ltr' | 'rtl',
  useFontsCdn = true,
): string {
  const safeLang = (lang || 'en').replace(/[^a-zA-Z0-9-]/g, '');
  const safeDir = dir === 'rtl' ? 'rtl' : 'ltr';

  const fontLink = useFontsCdn
    ? `<link rel="preconnect" href="https://fonts.googleapis.com">
       <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
       <link rel="stylesheet" href="${NOTO_GOOGLE_FONTS_URL}">`
    : '';

  return `<!DOCTYPE html>
<html lang="${safeLang}" dir="${safeDir}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Patient Care Summary</title>
  ${fontLink}
  <style>
    ${BASE_CSS}
  </style>
</head>
<body>
  <article class="patient-care-summary" lang="${safeLang}" dir="${safeDir}">
    ${bodyHtml}
  </article>
</body>
</html>`;
}

/**
 * Print a patient handout with full Unicode / multilingual font support.
 *
 * Uses a hidden iframe so the browser's Chromium engine handles:
 *  - Unicode complex-script shaping (Indic ligatures, Arabic joining)
 *  - Bidirectional text rendering (Arabic / Hebrew / Urdu)
 *  - CJK glyph rendering
 *  - @font-face loading before print capture
 *
 * @param bodyHtml - The TipTap/Notion editor HTML body content.
 * @param lang     - BCP-47 language tag (e.g. "pa", "hi", "ar", "en").
 * @param dir      - Text direction: "ltr" or "rtl".
 */
export async function printPatientHandout(
  bodyHtml: string,
  lang: string,
  dir: 'ltr' | 'rtl',
): Promise<void> {
  const html = buildHandoutPrintDocument(bodyHtml, lang, dir);
  return printHtmlDocument(html);
}

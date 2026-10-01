import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clinicalMarkdownToHtml,
  hydrateMarkdownInHtml,
  stripInlineMarkdown,
  unwrapWrappingQuotes,
} from './clinical-markdown';
import { fieldToPlainText, toEditorHtml } from './tiptap-text';

describe('clinical document markdown', () => {
  it('turns **drug:** markers into bold without leftover stars', () => {
    const html = clinicalMarkdownToHtml(
      '**omeprazole:** Take 20 mg by mouth once daily.',
    );
    assert.match(html, /<strong>omeprazole:<\/strong>/);
    assert.doesNotMatch(html, /\*\*/);
  });

  it('numbers consecutive treatments as 1. and 2.', () => {
    const html = clinicalMarkdownToHtml(
      [
        '**omeprazole:** Take 20 mg by mouth once daily, preferably approximately 30 minutes before breakfast.',
        '**aluminum hydroxide:** Take 20 mL by mouth three times daily for 5 days.',
      ].join('\n\n'),
    );
    assert.match(html, /^<ol>/);
    assert.equal((html.match(/<li>/g) ?? []).length, 2);
    assert.match(html, /<strong>omeprazole:<\/strong>/);
    assert.match(html, /<strong>aluminum hydroxide:<\/strong>/);
    assert.doesNotMatch(html, /\*\*/);
  });

  it('splits two treatments that arrived in one paragraph', () => {
    const html = clinicalMarkdownToHtml(
      '**omeprazole:** Take 20 mg daily. **aluminum hydroxide:** Take 20 mL three times daily.',
    );
    assert.match(html, /<ol>/);
    assert.equal((html.match(/<li>/g) ?? []).length, 2);
  });

  it('strips wrapping quotes and blockquote prefixes', () => {
    assert.equal(unwrapWrappingQuotes('"Take with food."'), 'Take with food.');
    const html = clinicalMarkdownToHtml('> **omeprazole:** Take 20 mg daily.');
    assert.match(html, /<strong>omeprazole:<\/strong>/);
    assert.doesNotMatch(html, /^>\s/m);
    assert.doesNotMatch(html, /&quot;Take/);
  });

  it('hydrates leftover markdown inside saved HTML', () => {
    const html = hydrateMarkdownInHtml(
      '<h2 data-field="plan">P — Plan</h2><p>**omeprazole:** Take 20 mg daily.</p><p>**aluminum hydroxide:** Take 20 mL three times daily.</p>',
    );
    assert.match(html, /<ol>/);
    assert.match(html, /<strong>omeprazole:<\/strong>/);
    assert.doesNotMatch(html, /\*\*/);
    assert.match(html, /data-field="plan"/);
  });

  it('keeps two PCP treatments inside one Treatment card', () => {
    const html = hydrateMarkdownInHtml(
      [
        '<h2 data-field="treatment">Treatment:</h2>',
        '<p>FAMVIR: Take 500 mg by mouth once.</p>',
        '<p>ZOVIRAX: Apply 1 application topically 5 times a day for up to 4 days.</p>',
        '<h2 data-field="followUp">Follow-up:</h2>',
        '<p>Reassess if symptoms are not improving.</p>',
      ].join(''),
    );
    assert.match(
      html,
      /data-field="treatment">Treatment:<\/h2><p>FAMVIR:[\s\S]*<br>ZOVIRAX:/,
    );
    assert.equal((html.match(/<h2[^>]*data-field="treatment"/g) ?? []).length, 1);
    assert.match(html, /data-field="followUp"/);
  });

  it('does not rewrite chrome paragraphs into a treatment list', () => {
    const html = hydrateMarkdownInHtml(
      '<p data-field="clinicalReferences">Clinical resources consulted: CPS.</p>',
    );
    assert.match(html, /data-field="clinicalReferences"/);
    assert.doesNotMatch(html, /<ol>/);
  });

  it('drops duplicate plan regimens after a numbered treatment list', () => {
    const html = hydrateMarkdownInHtml(
      [
        '<h2 data-field="plan">P — Plan</h2>',
        '<ol>',
        '<li><p><strong>XERESE:</strong> Apply 1 application topically 5 times a day for 5 days.</p></li>',
        '<li><p><strong>valacyclovir:</strong> Take 2 tablets by mouth two times daily for 1 day.</p></li>',
        '</ol>',
        '<p><strong>XERESE:</strong> Apply 1 application topically 5 times a day for 5 days.</p>',
        '<p><strong>valacyclovir:</strong> Take 2 tablets by mouth two times daily for 1 day.</p>',
      ].join(''),
    );
    assert.equal((html.match(/<ol>/g) ?? []).length, 1);
    assert.equal((html.match(/XERESE:/g) ?? []).length, 1);
    assert.equal((html.match(/valacyclovir:/g) ?? []).length, 1);
  });

  it('strips Clinical pathway chrome from clinicalReferences HTML', () => {
    const html = hydrateMarkdownInHtml(
      [
        '<p data-field="clinicalReferences">',
        'Clinical resources consulted: VALTREX Product Monograph (2024) and CPS (2025).',
        '<br><br>Clinical pathway: Cold sores (oral herpes labialis) (v25). Last reviewed 11-Sep-2026.',
        '</p>',
      ].join(''),
    );
    assert.match(html, /Clinical resources consulted:/);
    assert.doesNotMatch(html, /Clinical pathway:/);
    assert.doesNotMatch(html, /Last reviewed/);
  });

  it('feeds the Notion editor converted HTML, not raw stars', () => {
    const html = toEditorHtml(
      '**valacyclovir:** Take 2 g by mouth twice daily for 1 day.',
    );
    assert.match(html, /<strong>valacyclovir:<\/strong>/);
    assert.doesNotMatch(html, /\*\*/);
  });

  it('strips markdown from clipboard / Kroll plain text and numbers treatments', () => {
    const plain = fieldToPlainText(
      [
        '**omeprazole:** Take 20 mg by mouth once daily.',
        '**aluminum hydroxide:** Take 20 mL by mouth three times daily.',
      ].join('\n\n'),
    );
    assert.match(plain, /^1\. omeprazole:/);
    assert.match(plain, /2\. aluminum hydroxide:/);
    assert.doesNotMatch(plain, /\*\*/);
    assert.equal(
      stripInlineMarkdown('**omeprazole:** Take 20 mg'),
      'omeprazole: Take 20 mg',
    );
  });
});

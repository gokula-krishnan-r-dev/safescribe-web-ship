import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { printHtmlDocument } from './print-html-document';

describe('printHtmlDocument', () => {
  it('rejects empty markup', async () => {
    await assert.rejects(() => printHtmlDocument('   '), /Nothing to print|only available in the browser/);
  });
});

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  awaitDocumentationPrefetch,
  clearDocumentationPrefetch,
  getDocumentationPrefetchStatus,
  peekDocumentationPrefetch,
  resetDocumentationPrefetchForTests,
  startDocumentationPrefetch,
} from './documentation-prefetch';
import type { DocumentationPackage } from './types';

describe('documentation prefetch registry', () => {
  beforeEach(() => {
    resetDocumentationPrefetchForTests();
  });

  it('deduplicates concurrent starts for the same consultation', async () => {
    let runs = 0;
    const run = async () => {
      runs += 1;
      await new Promise((r) => setTimeout(r, 20));
      return { revision: 1, documents: {} } as DocumentationPackage;
    };

    const a = startDocumentationPrefetch('c1', run);
    const b = startDocumentationPrefetch('c1', run);
    assert.equal(getDocumentationPrefetchStatus('c1'), 'pending');
    const [ra, rb] = await Promise.all([a, b]);
    assert.equal(runs, 1);
    assert.equal(ra.revision, 1);
    assert.equal(rb.revision, 1);
    assert.equal(getDocumentationPrefetchStatus('c1'), 'ready');
    assert.equal(peekDocumentationPrefetch('c1')?.revision, 1);
  });

  it('awaits a pending prefetch and returns null after clear', async () => {
    const pending = startDocumentationPrefetch('c2', async () => {
      await new Promise((r) => setTimeout(r, 10));
      return { revision: 3 } as DocumentationPackage;
    });
    const awaited = await awaitDocumentationPrefetch('c2');
    assert.equal(awaited?.revision, 3);
    await pending;
    clearDocumentationPrefetch('c2');
    assert.equal(getDocumentationPrefetchStatus('c2'), 'idle');
    assert.equal(await awaitDocumentationPrefetch('c2'), null);
  });

  it('times out a hung prefetch so Documents can fall back', async () => {
    startDocumentationPrefetch('c3', async () => {
      await new Promise((r) => setTimeout(r, 500));
      return { revision: 9 } as DocumentationPackage;
    });
    const raced = await awaitDocumentationPrefetch('c3', 20);
    assert.equal(raced, null);
  });
});

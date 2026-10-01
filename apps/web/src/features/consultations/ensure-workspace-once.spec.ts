import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ensureWorkspaceOnce, resetEnsureWorkspaceOnce } from './ensure-workspace-once';

describe('ensureWorkspaceOnce', () => {
  it('reuses one in-flight promise per key', async () => {
    resetEnsureWorkspaceOnce();
    let calls = 0;
    const run = () => {
      calls += 1;
      return Promise.resolve({ id: 'c1' });
    };
    const [a, b] = await Promise.all([
      ensureWorkspaceOnce('prescribe', run),
      ensureWorkspaceOnce('prescribe', run),
    ]);
    assert.equal(calls, 1);
    assert.equal(a.id, 'c1');
    assert.equal(b.id, 'c1');
  });

  it('runs again after the first call settles', async () => {
    resetEnsureWorkspaceOnce();
    let calls = 0;
    const run = () => {
      calls += 1;
      return Promise.resolve({ id: `c${calls}` });
    };
    await ensureWorkspaceOnce('prescribe', run);
    const second = await ensureWorkspaceOnce('prescribe', run);
    assert.equal(calls, 2);
    assert.equal(second.id, 'c2');
  });
});

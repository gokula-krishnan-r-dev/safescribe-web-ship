import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shouldBlockParentDialogClose } from './nested-dialog-dismiss';

describe('shouldBlockParentDialogClose', () => {
  it('blocks while the nested dialog is open', () => {
    assert.equal(shouldBlockParentDialogClose(true, 0, 1_000), true);
  });

  it('blocks during the post-close hold so the same click cannot dismiss the parent', () => {
    assert.equal(shouldBlockParentDialogClose(false, 1_250, 1_000), true);
  });

  it('allows the parent to close after the hold expires', () => {
    assert.equal(shouldBlockParentDialogClose(false, 1_000, 1_320), false);
  });
});

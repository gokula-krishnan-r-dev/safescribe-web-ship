import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isOpenWorkspaceStatus } from './active-consultation.types';

describe('isOpenWorkspaceStatus', () => {
  it('treats draft and in-progress consultations as the live work queue', () => {
    assert.equal(isOpenWorkspaceStatus('DRAFT'), true);
    assert.equal(isOpenWorkspaceStatus('IN_PROGRESS'), true);
  });

  it('excludes finished, cancelled, and missing statuses', () => {
    assert.equal(isOpenWorkspaceStatus('COMPLETED'), false);
    assert.equal(isOpenWorkspaceStatus('CANCELLED'), false);
    assert.equal(isOpenWorkspaceStatus(undefined), false);
    assert.equal(isOpenWorkspaceStatus(null), false);
    assert.equal(isOpenWorkspaceStatus(''), false);
  });
});

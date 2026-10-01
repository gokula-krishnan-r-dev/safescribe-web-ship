import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isRenewUiEnabled } from './renew-flag';

describe('isRenewUiEnabled', () => {
  it('always enables staging.safescribe.ca', () => {
    assert.equal(
      isRenewUiEnabled({ hostname: 'staging.safescribe.ca', envFlag: 'false' }),
      true,
    );
  });

  it('enables production marketing hosts only when the env flag is true', () => {
    assert.equal(isRenewUiEnabled({ hostname: 'safescribe.ca', envFlag: 'true' }), true);
    assert.equal(isRenewUiEnabled({ hostname: 'app.safescribe.ca', envFlag: 'true' }), true);
    assert.equal(isRenewUiEnabled({ hostname: 'www.safescribe.ca', envFlag: 'true' }), true);
    assert.equal(isRenewUiEnabled({ hostname: 'safescribe.ca', envFlag: 'false' }), false);
    assert.equal(isRenewUiEnabled({ hostname: 'safescribe.ca', envFlag: undefined }), false);
  });

  it('enables local development hosts', () => {
    assert.equal(isRenewUiEnabled({ hostname: 'localhost:3000', envFlag: 'false' }), true);
    assert.equal(isRenewUiEnabled({ hostname: '127.0.0.1', envFlag: 'false' }), true);
  });

  it('uses the env flag for preview URLs', () => {
    assert.equal(
      isRenewUiEnabled({ hostname: 'safescribe-web-abc.vercel.app', envFlag: 'true' }),
      true,
    );
    assert.equal(
      isRenewUiEnabled({ hostname: 'safescribe-web-abc.vercel.app', envFlag: 'false' }),
      false,
    );
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isAdaptUiEnabled } from './adapt-flag';

describe('isAdaptUiEnabled', () => {
  it('always enables staging.safescribe.ca', () => {
    assert.equal(
      isAdaptUiEnabled({ hostname: 'staging.safescribe.ca', envFlag: 'false' }),
      true,
    );
  });

  it('enables production marketing hosts only when env flag is true', () => {
    assert.equal(isAdaptUiEnabled({ hostname: 'safescribe.ca', envFlag: 'true' }), true);
    assert.equal(isAdaptUiEnabled({ hostname: 'app.safescribe.ca', envFlag: 'true' }), true);
    assert.equal(isAdaptUiEnabled({ hostname: 'www.safescribe.ca', envFlag: 'true' }), true);
    assert.equal(isAdaptUiEnabled({ hostname: 'safescribe.ca', envFlag: 'false' }), false);
    assert.equal(isAdaptUiEnabled({ hostname: 'app.safescribe.ca', envFlag: undefined }), false);
  });

  it('enables local development hosts', () => {
    assert.equal(isAdaptUiEnabled({ hostname: 'localhost:3000', envFlag: 'false' }), true);
    assert.equal(isAdaptUiEnabled({ hostname: '127.0.0.1', envFlag: 'false' }), true);
  });

  it('uses the env flag for preview URLs (default off)', () => {
    assert.equal(
      isAdaptUiEnabled({ hostname: 'safescribe-web-abc.vercel.app', envFlag: 'true' }),
      true,
    );
    assert.equal(
      isAdaptUiEnabled({ hostname: 'safescribe-web-abc.vercel.app', envFlag: 'false' }),
      false,
    );
    assert.equal(
      isAdaptUiEnabled({ hostname: 'safescribe-web-abc.vercel.app', envFlag: undefined }),
      false,
    );
  });
});

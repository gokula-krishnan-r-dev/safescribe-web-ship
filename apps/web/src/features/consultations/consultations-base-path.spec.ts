import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ROLES } from '@safescript/shared';
import { consultationsBasePath } from './consultations-base-path';

describe('consultationsBasePath', () => {
  it('routes pharmacy administrators to the admin workspace', () => {
    assert.equal(consultationsBasePath(ROLES.PHARMACIST_ADMIN), '/admin/consultations');
  });

  it('routes pharmacists to the pharmacist workspace', () => {
    assert.equal(consultationsBasePath(ROLES.PHARMACIST), '/pharmacist/consultations');
    assert.equal(consultationsBasePath(undefined), '/pharmacist/consultations');
  });
});

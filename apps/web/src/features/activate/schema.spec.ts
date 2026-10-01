import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { activateFormSchema } from './schema';

describe('activateFormSchema', () => {
  const valid = {
    pharmacyName: 'Main Street Pharmacy',
    licenceNumber: '123456',
    contactName: 'Jane Smith',
    email: 'jane@pharmacy.ca',
    phone: '',
  };

  it('accepts a complete required payload', () => {
    const parsed = activateFormSchema.parse(valid);
    assert.equal(parsed.email, 'jane@pharmacy.ca');
  });

  it('requires pharmacy name, licence, contact, and email', () => {
    const result = activateFormSchema.safeParse({
      pharmacyName: ' ',
      licenceNumber: '',
      contactName: '',
      email: 'not-an-email',
      phone: '',
    });
    assert.equal(result.success, false);
  });

  it('allows a valid optional phone and rejects a short one', () => {
    assert.equal(activateFormSchema.safeParse({ ...valid, phone: '7801234567' }).success, true);
    assert.equal(activateFormSchema.safeParse({ ...valid, phone: '123' }).success, false);
  });
});

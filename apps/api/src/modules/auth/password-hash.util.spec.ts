import * as argon2 from 'argon2';
import bcrypt from 'bcryptjs';
import {
  isArgon2Hash,
  isBcryptHash,
  looksLikePasswordHash,
  verifyPassword,
} from './password-hash.util';

describe('password-hash.util', () => {
  it('detects argon2 and bcrypt prefixes', () => {
    expect(isArgon2Hash('$argon2id$v=19$m=65536,t=3,p=4$abc')).toBe(true);
    expect(isBcryptHash('$2a$12$abcdefghijklmnopqrstuv')).toBe(true);
    expect(isBcryptHash('$2b$10$abcdefghijklmnopqrstuv')).toBe(true);
    expect(looksLikePasswordHash('plaintext')).toBe(false);
  });

  it('verifies argon2 and bcrypt hashes and rejects the other algorithm', async () => {
    const password = 'PhixSamePass1!';
    const argon = await argon2.hash(password);
    const hashed = await bcrypt.hash(password, 10);

    expect(await verifyPassword(argon, password)).toBe(true);
    expect(await verifyPassword(hashed, password)).toBe(true);
    expect(await verifyPassword(argon, 'wrong')).toBe(false);
    expect(await verifyPassword(hashed, 'wrong')).toBe(false);
    expect(await verifyPassword('not-a-hash', password)).toBe(false);
  });
});

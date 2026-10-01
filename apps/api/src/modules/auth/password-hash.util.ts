import * as argon2 from 'argon2';
import bcrypt from 'bcryptjs';

export function isArgon2Hash(hash: string): boolean {
  return hash.startsWith('$argon2');
}

export function isBcryptHash(hash: string): boolean {
  return /^\$2[aby]\$/.test(hash);
}

/** Verify a stored hash. Supports native argon2 and Phix bcrypt copies. */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  if (!hash || !password) return false;
  try {
    if (isArgon2Hash(hash)) return argon2.verify(hash, password);
    if (isBcryptHash(hash)) return bcrypt.compare(password, hash);
    return false;
  } catch {
    return false;
  }
}

export function looksLikePasswordHash(value: string): boolean {
  return isArgon2Hash(value) || isBcryptHash(value);
}

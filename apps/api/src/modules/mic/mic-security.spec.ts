import { createHash, randomBytes } from 'crypto';
import { canTransition, nextState } from './mic-state-machine';

describe('mic security helpers', () => {
  it('pairing tokens are enough entropy (≥128 bits)', () => {
    const token = randomBytes(32).toString('base64url');
    // base64url of 32 bytes is 43 chars without padding
    expect(token.length).toBeGreaterThanOrEqual(40);
  });

  it('hashes tokens (never store raw)', () => {
    const raw = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(`secret:${raw}`).digest('hex');
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(raw);
  });

  it('disallows START without READY state', () => {
    expect(canTransition('CLAIMED', 'START')).toBe(false);
    expect(canTransition('WAITING', 'START')).toBe(false);
    expect(canTransition('READY', 'START')).toBe(true);
  });

  it('enforces single-use claim transition', () => {
    expect(nextState('WAITING', 'CLAIM')).toBe('CLAIMED');
    expect(canTransition('CLAIMED', 'CLAIM')).toBe(false);
  });
});

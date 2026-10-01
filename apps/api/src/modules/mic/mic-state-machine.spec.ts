import { canTransition, nextState, isTerminal } from './mic-state-machine';

describe('mic-state-machine', () => {
  it('allows WAITING → CLAIMED', () => {
    expect(canTransition('WAITING', 'CLAIM')).toBe(true);
    expect(nextState('WAITING', 'CLAIM')).toBe('CLAIMED');
  });

  it('allows consent from CLAIMED or CONSENT_REQUIRED to READY', () => {
    expect(nextState('CLAIMED', 'CONSENT')).toBe('READY');
    expect(nextState('CONSENT_REQUIRED', 'CONSENT')).toBe('READY');
  });

  it('allows recording lifecycle', () => {
    expect(nextState('READY', 'START')).toBe('RECORDING');
    expect(nextState('RECORDING', 'PAUSE')).toBe('PAUSED');
    expect(nextState('PAUSED', 'RESUME')).toBe('RECORDING');
    expect(nextState('RECORDING', 'END')).toBe('FINALIZING');
  });

  it('rejects illegal transitions', () => {
    expect(canTransition('WAITING', 'START')).toBe(false);
    expect(() => nextState('WAITING', 'START')).toThrow();
  });

  it('marks terminal states', () => {
    expect(isTerminal('COMPLETED')).toBe(true);
    expect(isTerminal('RECORDING')).toBe(false);
  });
});

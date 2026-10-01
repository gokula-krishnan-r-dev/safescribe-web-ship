import { Prisma } from '@prisma/client';
import {
  isPrismaTransactionTimeout,
  promotePublicMessage,
} from './promote-errors';

describe('promote error mapping', () => {
  it('detects Prisma interactive transaction timeouts', () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      'Transaction already closed: The timeout for this transaction was 5000 ms',
      { code: 'P2028', clientVersion: '6.19.3' },
    );
    expect(isPrismaTransactionTimeout(err)).toBe(true);
    expect(promotePublicMessage(err, 12)).toContain('paused after 12 row(s)');
    expect(promotePublicMessage(err, 12)).not.toContain('prisma.');
  });

  it('keeps domain errors intact', () => {
    const err = new Error(
      'Rule code SS-DDI-1 already exists with type DRUG_INTERACTION, cannot promote as PREGNANCY',
    );
    expect(promotePublicMessage(err, 0)).toContain('already exists with type');
  });

  it('does not leak Prisma invocation dumps', () => {
    const err = new Error(
      'Invalid `prisma.safetyRuleEvidence.create()` invocation:\n\nTransaction API error',
    );
    const msg = promotePublicMessage(err, 0);
    expect(msg).not.toContain('prisma.safetyRuleEvidence');
    expect(msg).toContain('retry');
  });
});

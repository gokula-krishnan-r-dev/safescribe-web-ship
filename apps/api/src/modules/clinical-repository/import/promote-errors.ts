import { Prisma } from '@prisma/client';

/**
 * Prisma P2028 is raised when an interactive transaction expires or cannot start.
 * Staging logs also include "Transaction already closed" / "Transaction not found".
 */
export function isPrismaTransactionTimeout(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2028') {
    return true;
  }
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /expired transaction|Transaction already closed|Transaction not found|interactive transaction timeout/i.test(
    message,
  );
}

export function isClientSafePromoteError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : '';
  return (
    message.startsWith('Cannot promote') ||
    message.includes('already exists with type') ||
    message.startsWith('Unsupported promotion') ||
    message.includes('Batch has no file type')
  );
}

export function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/** Message safe to return to the admin UI — never the raw Prisma invocation dump. */
export function promotePublicMessage(err: unknown, committedRows: number): string {
  if (isPrismaTransactionTimeout(err)) {
    if (committedRows > 0) {
      return `Promotion paused after ${committedRows} row(s) due to a database timeout. Click Promote remaining to continue from where it left off.`;
    }
    return 'Promotion timed out while writing draft rules. Retry — already-imported rows will be skipped.';
  }
  if (isClientSafePromoteError(err) && err instanceof Error) {
    return err.message;
  }
  if (isUniqueConstraintError(err)) {
    return committedRows > 0
      ? `Promotion hit a unique-key conflict after ${committedRows} row(s). Retry to continue remaining rows, or review the workbook for duplicate business keys.`
      : 'Promotion hit a unique-key conflict. Review the workbook for duplicate business keys and retry.';
  }
  if (committedRows > 0) {
    return `Promotion failed after ${committedRows} row(s). You can retry to continue remaining rows.`;
  }
  return 'Promotion failed. Please retry. If it keeps failing, check the import workbook and try again.';
}

export class PromoteBatchException extends Error {
  constructor(
    message: string,
    readonly timedOut: boolean,
    readonly committedRows: number,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PromoteBatchException';
  }
}

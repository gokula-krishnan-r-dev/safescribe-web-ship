'use client';

import { useCallback, useEffect, useRef } from 'react';

/** Hold the parent dialog closed-state after a nested dialog unmounts on the same click. */
export const NESTED_DIALOG_DISMISS_HOLD_MS = 320;

export function shouldBlockParentDialogClose(
  nestedOpen: boolean,
  holdUntilMs: number,
  nowMs: number,
): boolean {
  return nestedOpen || nowMs < holdUntilMs;
}

/**
 * Nested Radix dialogs (Send fax over document preview) fire the parent's dismiss
 * on the same pointer event that closed the child. Arm the hold synchronously in
 * the child's onClose, and keep the parent open while the nested dialog is open.
 */
export function useBlockParentDialogClose(nestedOpen: boolean) {
  const nestedOpenRef = useRef(nestedOpen);
  nestedOpenRef.current = nestedOpen;
  const holdUntilRef = useRef(0);
  const previousOpenRef = useRef(nestedOpen);

  useEffect(() => {
    if (previousOpenRef.current && !nestedOpen) {
      holdUntilRef.current = Date.now() + NESTED_DIALOG_DISMISS_HOLD_MS;
    }
    previousOpenRef.current = nestedOpen;
  }, [nestedOpen]);

  const arm = useCallback(() => {
    holdUntilRef.current = Date.now() + NESTED_DIALOG_DISMISS_HOLD_MS;
  }, []);

  const shouldBlock = useCallback(
    () =>
      shouldBlockParentDialogClose(
        nestedOpenRef.current,
        holdUntilRef.current,
        Date.now(),
      ),
    [],
  );

  return { shouldBlock, arm };
}

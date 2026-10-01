'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ConfirmedAge, OptionalDobStatus, OptionalDobValidationResult } from '@safescript/shared';
import {
  optionalDobBlocksDocumentActions,
  settleOptionalDobResult,
  validateOptionalDob,
} from '@safescript/shared';
import type { ApiError } from '@/lib/api-client';
import {
  useConfirmMatchingDob,
  useResolveAgeDobConflict,
  useValidateOptionalDob,
} from '../hooks';

export type OptionalDobUiStatus = OptionalDobStatus | 'VALIDATING' | 'NETWORK_ERROR';

const INCOMPLETE_SETTLE_MS = 600;
const BACKEND_DEBOUNCE_MS = 320;

function isApiError(error: unknown): error is ApiError {
  return Boolean(error && typeof error === 'object' && 'statusCode' in error);
}

export function useOptionalDobValidation(opts: {
  enabled: boolean;
  consultationId: string;
  recordedAge: ConfirmedAge | null;
  consultationDate: string;
  snapshotVersion: number;
  value: string;
}) {
  const { enabled, recordedAge, consultationDate, snapshotVersion, value } = opts;
  const requestSeq = useRef(0);
  const lastChecked = useRef('');
  const snapshotRef = useRef(snapshotVersion);
  snapshotRef.current = snapshotVersion;

  const [serverResult, setServerResult] = useState<OptionalDobValidationResult | null>(null);
  const [uiStatus, setUiStatus] = useState<OptionalDobUiStatus>('NOT_ENTERED');
  const [networkError, setNetworkError] = useState(false);
  const [incompleteSettled, setIncompleteSettled] = useState(false);

  const recordedKey = recordedAge
    ? `${recordedAge.value}:${recordedAge.unit}:${recordedAge.asOfDate}`
    : '';

  const local: OptionalDobValidationResult = useMemo(() => {
    if (!recordedAge) {
      return { status: value.trim() ? 'EDITING' : 'NOT_ENTERED' };
    }
    return validateOptionalDob({ dob: value, recordedAge, consultationDate });
  }, [consultationDate, recordedAge, recordedKey, value]);

  const settledLocal = settleOptionalDobResult(local, { settled: incompleteSettled });
  const localStatus = local.status;

  const validateMut = useValidateOptionalDob(opts.consultationId);
  const confirmMut = useConfirmMatchingDob(opts.consultationId);
  const resolveMut = useResolveAgeDobConflict(opts.consultationId);
  const validateAsync = validateMut.mutateAsync;
  const confirmAsync = confirmMut.mutateAsync;
  const resolveAsync = resolveMut.mutateAsync;

  const runBackend = useCallback(
    async (dob: string) => {
      if (!enabled || !recordedAge) return;
      const localNow = validateOptionalDob({ dob, recordedAge, consultationDate });
      if (localNow.status !== 'MATCH' && localNow.status !== 'MISMATCH') {
        setUiStatus(localNow.status);
        setNetworkError(false);
        return;
      }
      const seq = ++requestSeq.current;
      setNetworkError(false);
      // Keep MATCH/MISMATCH on screen while the server confirms — never flash
      // a spinner that unmounts the error/success state (that reads as blinking).
      try {
        const remote = await validateAsync({
          dob,
          expectedPatientSnapshotVersion: snapshotRef.current,
        });
        if (seq !== requestSeq.current) return;
        setServerResult(remote);
        if (remote.status === 'MATCH' && remote.dob) {
          await confirmAsync({
            dob: remote.dob,
            expectedPatientSnapshotVersion:
              remote.patientSnapshotVersion ?? snapshotRef.current,
          });
          if (seq !== requestSeq.current) return;
        }
        if (
          remote.status === 'MATCH' ||
          remote.status === 'MISMATCH' ||
          remote.status === 'INVALID'
        ) {
          setUiStatus(remote.status);
        } else {
          setUiStatus(localNow.status);
        }
      } catch (error) {
        if (seq !== requestSeq.current) return;
        if (isApiError(error) && error.statusCode === 409) {
          setUiStatus(localNow.status);
          return;
        }
        setNetworkError(true);
        setUiStatus('NETWORK_ERROR');
        setServerResult(localNow);
      }
    },
    [confirmAsync, consultationDate, enabled, recordedAge, recordedKey, validateAsync],
  );

  useEffect(() => {
    if (localStatus !== 'EDITING') {
      setIncompleteSettled(false);
      return;
    }
    setIncompleteSettled(false);
    const timer = window.setTimeout(() => setIncompleteSettled(true), INCOMPLETE_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [localStatus, value]);

  useEffect(() => {
    if (!enabled) {
      lastChecked.current = '';
      setUiStatus('NOT_ENTERED');
      setServerResult(null);
      setNetworkError(false);
      return;
    }
    if (localStatus === 'NOT_ENTERED' || localStatus === 'EDITING') {
      requestSeq.current += 1;
      lastChecked.current = '';
      setNetworkError(false);
      setUiStatus((prev) => (prev === localStatus ? prev : localStatus));
      return;
    }
    if (localStatus === 'INVALID') {
      requestSeq.current += 1;
      lastChecked.current = value;
      setNetworkError(false);
      setUiStatus((prev) => (prev === 'INVALID' ? prev : 'INVALID'));
      return;
    }
    if (lastChecked.current === value) return;
    const handle = window.setTimeout(() => {
      lastChecked.current = value;
      setUiStatus(localStatus);
      void runBackend(value);
    }, BACKEND_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [enabled, localStatus, runBackend, value]);

  const displayResult =
    settledLocal.status === 'MISMATCH' || settledLocal.status === 'INVALID'
      ? settledLocal
      : localStatus === 'MATCH' || localStatus === 'MISMATCH' || localStatus === 'INVALID'
        ? local
        : (serverResult ?? settledLocal);

  const status: OptionalDobUiStatus = !enabled
    ? 'NOT_ENTERED'
    : networkError
      ? 'NETWORK_ERROR'
      : settledLocal.status === 'INVALID'
        ? 'INVALID'
        : localStatus === 'MATCH' || localStatus === 'MISMATCH' || localStatus === 'INVALID'
          ? localStatus
          : uiStatus;

  const actionStatus: OptionalDobStatus =
    status === 'VALIDATING' || status === 'NETWORK_ERROR' ? localStatus : status;
  const blocks =
    enabled &&
    (status === 'NETWORK_ERROR' || optionalDobBlocksDocumentActions(actionStatus));

  const removeDob = useCallback(async () => {
    requestSeq.current += 1;
    lastChecked.current = '';
    setNetworkError(false);
    setIncompleteSettled(false);
    setServerResult({ status: 'NOT_ENTERED' });
    setUiStatus('NOT_ENTERED');
    try {
      await resolveAsync({
        resolution: 'KEEP_MANUAL_AGE_REMOVE_DOB',
        expectedPatientSnapshotVersion: snapshotRef.current,
      });
    } catch {
      /* local clear is enough when the draft was never committed */
    }
  }, [resolveAsync]);

  const useDobRecheck = useCallback(
    async (dob: string) =>
      resolveAsync({
        resolution: 'USE_DOB_RECHECK_AGE',
        dob,
        expectedPatientSnapshotVersion: snapshotRef.current,
      }),
    [resolveAsync],
  );

  const onBlur = useCallback(() => {
    if (localStatus === 'EDITING') setIncompleteSettled(true);
  }, [localStatus]);

  return {
    local,
    result: displayResult,
    status,
    blocksActions: blocks,
    validating: false,
    networkError,
    retry: () => {
      lastChecked.current = '';
      void runBackend(value);
    },
    removeDob,
    useDobRecheck,
    resolving: resolveMut.isPending,
    onBlur,
  };
}

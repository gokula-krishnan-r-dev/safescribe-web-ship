'use client';

/**
 * Production notification layer for SafeScribe.
 *
 * Policy (clinical OS UX):
 * - Routine success / info → silent. The UI already reflects the change.
 * - Validation / API failures → show a single, dismissible error toast.
 * - Rare critical confirmations (auth, clipboard, downloads) → opt-in via
 *   `{ announce: true }` on success / message.
 *
 * Call sites keep using `toast.*` so existing code stays readable; this
 * module is the only place that talks to Sonner.
 */

import { toast as sonner, type ExternalToast } from 'sonner';
import type { ReactNode } from 'react';

export type NotifyOptions = ExternalToast & {
  /** Show even when the global success/info policy is silent. */
  announce?: boolean;
};

const ERROR_DURATION_MS = 5_500;
const ANNOUNCE_DURATION_MS = 3_200;
const DEDUPE_WINDOW_MS = 2_400;

const recentErrors = new Map<string, number>();

function dedupeKey(title: string, description?: unknown): string {
  const detail =
    typeof description === 'string'
      ? description
      : description && typeof description === 'object' && 'message' in description
        ? String((description as { message?: unknown }).message ?? '')
        : '';
  return `${title}::${detail}`;
}

function shouldShowError(title: string, options?: NotifyOptions): boolean {
  const key = dedupeKey(title, options?.description);
  const now = Date.now();
  const last = recentErrors.get(key);
  if (last && now - last < DEDUPE_WINDOW_MS) return false;
  recentErrors.set(key, now);
  if (recentErrors.size > 40) {
    for (const [k, ts] of recentErrors) {
      if (now - ts > DEDUPE_WINDOW_MS) recentErrors.delete(k);
    }
  }
  return true;
}

function stripAnnounce(options?: NotifyOptions): ExternalToast | undefined {
  if (!options) return undefined;
  const { announce: _announce, ...rest } = options;
  return rest;
}

function toastSuccess(message: string | ReactNode, options?: NotifyOptions): string | number {
  if (!options?.announce) return '';
  return sonner.success(message, {
    duration: ANNOUNCE_DURATION_MS,
    ...stripAnnounce(options),
  });
}

function toastMessage(message: string | ReactNode, options?: NotifyOptions): string | number {
  if (!options?.announce) return '';
  return sonner.message(message, {
    duration: ANNOUNCE_DURATION_MS,
    ...stripAnnounce(options),
  });
}

function toastInfo(message: string | ReactNode, options?: NotifyOptions): string | number {
  if (!options?.announce) return '';
  return sonner.info(message, {
    duration: ANNOUNCE_DURATION_MS,
    ...stripAnnounce(options),
  });
}

function toastWarning(message: string | ReactNode, options?: NotifyOptions): string | number {
  return sonner.warning(message, {
    duration: ERROR_DURATION_MS,
    ...stripAnnounce(options),
  });
}

function toastError(message: string | ReactNode, options?: NotifyOptions): string | number {
  const title = typeof message === 'string' ? message : 'Something went wrong';
  if (!shouldShowError(title, options)) return '';
  return sonner.error(message, {
    duration: ERROR_DURATION_MS,
    ...stripAnnounce(options),
  });
}

/**
 * Drop-in replacement for `toast` from `sonner`.
 * Success / info / message are silent unless `{ announce: true }`.
 */
export const toast = Object.assign(
  (message: string | ReactNode, options?: NotifyOptions) => toastMessage(message, options),
  {
    success: toastSuccess,
    error: toastError,
    message: toastMessage,
    info: toastInfo,
    warning: toastWarning,
    promise: sonner.promise.bind(sonner),
    dismiss: sonner.dismiss.bind(sonner),
    loading: sonner.loading.bind(sonner),
    custom: sonner.custom.bind(sonner),
  },
);

/** Explicit critical announcement (auth, clipboard, download). */
export function announce(
  message: string,
  options?: Omit<NotifyOptions, 'announce'>,
): string | number {
  return toastSuccess(message, { ...options, announce: true });
}

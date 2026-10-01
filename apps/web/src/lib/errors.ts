import { toast } from '@/lib/notify';

export function getErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  const err = error as {
    message?: string | string[] | { code?: string; message?: string };
    code?: string;
  };
  if (Array.isArray(err.message)) return err.message[0] ?? fallback;
  if (typeof err.message === 'string' && err.message.trim()) return err.message;
  if (err.message && typeof err.message === 'object' && typeof err.message.message === 'string') {
    return err.message.message;
  }
  return fallback;
}

export function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const err = error as {
    error?: unknown;
    code?: unknown;
    message?: string | { code?: string; message?: string };
  };
  if (typeof err.error === 'string') return err.error;
  if (typeof err.code === 'string') return err.code;
  if (err.message && typeof err.message === 'object' && typeof err.message.code === 'string') {
    return err.message.code;
  }
  return undefined;
}

export function getErrorStatus(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const code = (error as { statusCode?: unknown }).statusCode;
    if (typeof code === 'number') return code;
  }
  return undefined;
}

/**
 * Show a consistent, human-readable error toast. Surfaces the backend's own
 * message (e.g. "Cannot edit a completed consultation") instead of a generic
 * "failed" string, with an optional contextual title.
 */
export function toastError(error: unknown, title = 'Could not complete that'): string {
  const message = getErrorMessage(error, title);
  // If the backend message already reads well on its own, use it as the toast
  // title; otherwise keep the provided context title with the detail below.
  if (message === title) {
    toast.error(title);
  } else {
    toast.error(title, { description: message });
  }
  return message;
}

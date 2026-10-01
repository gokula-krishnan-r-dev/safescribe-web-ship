const inflight = new Map<string, Promise<unknown>>();

/**
 * Deduplicate concurrent "open or create workspace" calls (React Strict Mode,
 * double-mount, overlapping landing pages).
 */
export function ensureWorkspaceOnce<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const pending = run().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, pending);
  return pending;
}

export function resetEnsureWorkspaceOnce() {
  inflight.clear();
}

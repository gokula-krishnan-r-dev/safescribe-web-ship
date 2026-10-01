/** Sync Active Consultations rail between main nav (Prescribe) and the wizard. */

export const CONSULT_SIDEBAR_KEY = 'safescript-consult-sidebar';
export const CONSULT_SIDEBAR_EVENT = 'safescript-consult-sidebar';

export function readConsultSidebarOpen(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const stored = localStorage.getItem(CONSULT_SIDEBAR_KEY);
    // Default open; only hide when explicitly closed
    return stored !== 'closed';
  } catch {
    return true;
  }
}

export function setConsultSidebarOpen(open: boolean) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CONSULT_SIDEBAR_KEY, open ? 'open' : 'closed');
    window.dispatchEvent(
      new CustomEvent(CONSULT_SIDEBAR_EVENT, { detail: { open } }),
    );
  } catch {
    /* ignore */
  }
}

export function toggleConsultSidebarOpen(): boolean {
  const next = !readConsultSidebarOpen();
  setConsultSidebarOpen(next);
  return next;
}

/** Ask the open clinical wizard to persist its draft before a nav-driven unmount. */
export const WORKSPACE_FLUSH_EVENT = 'safescript-flush-workspace';

export function flushOpenWorkspace() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(WORKSPACE_FLUSH_EVENT));
}

import { clearConsultationFaxRecipient } from './documents/fax-recipient-storage';
import { clearConsultationDraft } from './consultation-draft-cache';

const INTAKE_DRAFT_PREFIX = 'safescribe:intake-draft:';
const SESSION_CONSULT_PREFIX = 'safescript:consultation:';

/**
 * Wipe browser-held temporary data for one consultation after Complete & Delete.
 * Does not touch pharmacy-wide settings (user fax memory, UI chrome).
 */
export function purgeConsultationLocalState(
  consultationId: string,
  scope?: { tenantId?: string | null; userId?: string | null },
): void {
  if (!consultationId) return;
  clearConsultationDraft(consultationId);
  if (typeof window === 'undefined') return;

  const exactKeys = [
    `${INTAKE_DRAFT_PREFIX}${consultationId}`,
    `${SESSION_CONSULT_PREFIX}${consultationId}`,
  ];

  for (const key of exactKeys) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* private mode */
    }
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      /* private mode */
    }
  }

  sweepStorage(window.localStorage, consultationId);
  sweepStorage(window.sessionStorage, consultationId);

  if (scope) {
    clearConsultationFaxRecipient({
      tenantId: scope.tenantId,
      userId: scope.userId,
      consultationId,
    });
  }
}

function sweepStorage(storage: Storage, consultationId: string) {
  try {
    const remove: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && key.includes(consultationId)) remove.push(key);
    }
    for (const key of remove) storage.removeItem(key);
  } catch {
    /* quota / private mode */
  }
}

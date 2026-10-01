/**
 * Client-only fax recipient memory for Send Fax.
 * Never reads pharmacy-admin Fax Contacts — only what this user typed.
 *
 * Keys include pharmacy (tenant) + user so values don't leak across accounts.
 * Consultation-scoped entries prefer the last send in the open consult;
 * user-scoped entries restore the last successful recipient across consults.
 */

export type FaxRecipientDraft = {
  recipientName: string;
  faxNumber: string;
  updatedAt: number;
  consultationId?: string;
};

const STORAGE_PREFIX = 'safescribe.faxRecipient.v1';

function safeTenant(tenantId: string | null | undefined): string {
  return tenantId?.trim() || 'no-tenant';
}

function safeUser(userId: string | null | undefined): string {
  return userId?.trim() || 'anonymous';
}

function userKey(tenantId: string | null | undefined, userId: string | null | undefined): string {
  return `${STORAGE_PREFIX}:user:${safeTenant(tenantId)}:${safeUser(userId)}`;
}

function consultationKey(
  tenantId: string | null | undefined,
  userId: string | null | undefined,
  consultationId: string,
): string {
  return `${STORAGE_PREFIX}:consult:${safeTenant(tenantId)}:${safeUser(userId)}:${consultationId}`;
}

function readJson(key: string): FaxRecipientDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FaxRecipientDraft>;
    const recipientName = typeof parsed.recipientName === 'string' ? parsed.recipientName.trim() : '';
    const faxNumber = typeof parsed.faxNumber === 'string' ? parsed.faxNumber.trim() : '';
    if (recipientName.length < 2 || faxNumber.replace(/\D/g, '').length < 10) return null;
    return {
      recipientName,
      faxNumber,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
      consultationId:
        typeof parsed.consultationId === 'string' ? parsed.consultationId : undefined,
    };
  } catch {
    return null;
  }
}

function writeJson(key: string, draft: FaxRecipientDraft): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    /* quota / private mode — ignore */
  }
}

export type FaxRecipientScope = {
  tenantId?: string | null;
  userId?: string | null;
  consultationId: string;
};

/** Prefer this consultation’s last recipient; fall back to this user’s pharmacy memory. */
export function loadFaxRecipientDraft(scope: FaxRecipientScope): FaxRecipientDraft | null {
  const fromConsult = readJson(
    consultationKey(scope.tenantId, scope.userId, scope.consultationId),
  );
  if (fromConsult) return fromConsult;
  return readJson(userKey(scope.tenantId, scope.userId));
}

/** Persist after a successful send — both consultation and user/pharmacy scopes. */
export function saveFaxRecipientDraft(
  scope: FaxRecipientScope,
  values: { recipientName: string; faxNumber: string },
): void {
  const draft: FaxRecipientDraft = {
    recipientName: values.recipientName.trim(),
    faxNumber: values.faxNumber.trim(),
    updatedAt: Date.now(),
    consultationId: scope.consultationId,
  };
  writeJson(consultationKey(scope.tenantId, scope.userId, scope.consultationId), draft);
  writeJson(userKey(scope.tenantId, scope.userId), draft);
}

/** Drop this consultation's fax draft only — keep the pharmacist's last recipient. */
export function clearConsultationFaxRecipient(scope: FaxRecipientScope): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(
      consultationKey(scope.tenantId, scope.userId, scope.consultationId),
    );
  } catch {
    /* private mode */
  }
}

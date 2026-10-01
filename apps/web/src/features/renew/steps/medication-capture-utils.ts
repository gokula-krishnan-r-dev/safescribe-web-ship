export type CaptureAction = 'search' | 'screenshot' | 'upload';
export type CaptureMode = CaptureAction | 'none';

export const MAX_SCREENSHOTS = 8;
export const MAX_BYTES = 10 * 1024 * 1024;
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/jpg,image/webp';
export const UPLOAD_ACCEPT = 'application/pdf,image/png,image/jpeg,image/jpg,.pdf,.png,.jpg,.jpeg';
export const INLINE_RESULTS_LIMIT = 6;

export const POPULAR_RENEW_SEARCHES = [
  'Amlodipine',
  'Metformin',
  'Ramipril',
  'Rosuvastatin',
  'Pantoprazole',
] as const;

export function formatFileBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImageFile(file: File) {
  const type = file.type.toLowerCase();
  if (type.startsWith('image/')) {
    return type === 'image/png' || type === 'image/jpeg' || type === 'image/jpg' || type === 'image/webp';
  }
  return /\.(png|jpe?g|webp)$/i.test(file.name);
}

export function isUploadFile(file: File) {
  const ext = `.${(file.name.split('.').pop() ?? '').toLowerCase()}`;
  return (
    ['.pdf', '.png', '.jpg', '.jpeg'].includes(ext) ||
    file.type === 'application/pdf' ||
    file.type.startsWith('image/')
  );
}

export function filesFromClipboard(event: ClipboardEvent): File[] {
  const out: File[] = [];
  for (const item of Array.from(event.clipboardData?.items ?? [])) {
    if (!item.type.startsWith('image/')) continue;
    const blob = item.getAsFile();
    if (!blob) continue;
    const ext = item.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
    out.push(
      new File([blob], `screenshot-${Date.now()}-${out.length + 1}.${ext}`, {
        type: item.type || 'image/png',
      }),
    );
  }
  return out;
}

export function captureGridClass(mode: CaptureMode) {
  if (mode === 'none') return 'renew-capture-grid none';
  if (mode === 'search') return 'renew-capture-grid search';
  if (mode === 'screenshot') return 'renew-capture-grid paste';
  return 'renew-capture-grid upload';
}

export function pasteEventShouldIgnore(target: EventTarget | null) {
  if (!target || typeof target !== 'object') return false;
  const el = target as { tagName?: string; isContentEditable?: boolean };
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return Boolean(el.isContentEditable);
}

export function digitsOnly(value?: string | null): string | null {
  const digits = value?.replace(/[^\d]/g, '') ?? '';
  return digits || null;
}

export type RenewSearchAddedLookup = {
  conceptIds: Set<string>;
  dins: Set<string>;
};

export function renewSearchAddedLookup(
  items: Array<{ normalized: { medicationConceptId?: string | null; din?: string | null } }>,
): RenewSearchAddedLookup {
  const conceptIds = new Set<string>();
  const dins = new Set<string>();
  for (const item of items) {
    const conceptId = item.normalized.medicationConceptId?.trim();
    if (conceptId) conceptIds.add(conceptId);
    const din = digitsOnly(item.normalized.din);
    if (din) dins.add(din);
  }
  return { conceptIds, dins };
}

export function isRenewSearchResultAdded(
  drug: { id: string; codeDisplay?: string; ndc?: string },
  lookup: RenewSearchAddedLookup,
): boolean {
  if (lookup.conceptIds.has(drug.id)) return true;
  const din = digitsOnly(drug.codeDisplay) || digitsOnly(drug.ndc);
  return Boolean(din && lookup.dins.has(din));
}

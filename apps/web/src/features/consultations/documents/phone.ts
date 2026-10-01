export const PHONE_DIGIT_COUNT = 10;

/** NANP digits only: drop a leading country-code 1, then cap at 10. */
export function extractNanpDigits(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('1')) digits = digits.slice(1);
  return digits.slice(0, PHONE_DIGIT_COUNT);
}

export function formatNanpPhoneFromDigits(digits: string): string {
  const nanp = digits.slice(0, PHONE_DIGIT_COUNT);
  if (nanp.length <= 3) return nanp;
  if (nanp.length <= 6) return `${nanp.slice(0, 3)}-${nanp.slice(3)}`;
  return `${nanp.slice(0, 3)}-${nanp.slice(3, 6)}-${nanp.slice(6)}`;
}

/** Progressive Canada/US display: 780 → 780-250 → 780-250-2555. */
export function formatNanpPhoneDisplay(raw: string): string {
  return formatNanpPhoneFromDigits(extractNanpDigits(raw));
}

function caretAfterDigits(formatted: string, digitCount: number): number {
  if (digitCount <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    if (/\d/.test(formatted[i] ?? '')) {
      seen += 1;
      if (seen === digitCount) return i + 1;
    }
  }
  return formatted.length;
}

export function formatNanpPhoneInput(
  raw: string,
  caret = raw.length,
): { value: string; caret: number } {
  let prefixDigits = raw.slice(0, Math.max(0, caret)).replace(/\D/g, '');
  if (prefixDigits.startsWith('1')) prefixDigits = prefixDigits.slice(1);
  const digits = extractNanpDigits(raw);
  const value = formatNanpPhoneFromDigits(digits);
  const digitIndex = Math.min(prefixDigits.length, digits.length);
  return { value, caret: caretAfterDigits(value, digitIndex) };
}

function isValidNanp(digits: string): boolean {
  if (digits.length !== PHONE_DIGIT_COUNT) return false;
  const area = digits[0];
  const exchange = digits[3];
  return area !== '0' && area !== '1' && exchange !== '0' && exchange !== '1';
}

/** Optional field: blank is allowed; any value must be a 10-digit NANP number. */
export function optionalPhoneError(raw: string): string | undefined {
  if (!raw.trim()) return undefined;
  const digits = extractNanpDigits(raw);
  if (!isValidNanp(digits) || formatNanpPhoneDisplay(raw) !== raw.trim()) {
    return 'Enter a 10-digit Canada or US number (e.g. 780-555-0123), or leave blank.';
  }
  return undefined;
}

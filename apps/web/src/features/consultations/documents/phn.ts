export const PHN_DIGIT_COUNT = 9;

/** Keep only digits, capped at a 9-digit PHN. */
export function formatPhnDigits(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, PHN_DIGIT_COUNT);
}

/** Optional field: blank is allowed; any value must be exactly 9 digits. */
export function optionalPhnError(raw: string): string | undefined {
  if (!raw.trim()) return undefined;
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== PHN_DIGIT_COUNT || digits !== raw.trim()) {
    return 'Enter a 9-digit PHN, or leave blank.';
  }
  return undefined;
}

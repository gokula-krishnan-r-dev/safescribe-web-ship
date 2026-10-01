/**
 * Canadian manufacturer / house-brand prefixes used to detect explicit
 * product identity. Keep this as shared reference data — do not copy into UI.
 */
export const MEDICATION_PRODUCT_PREFIXES: ReadonlyArray<{
  prefix: string;
  manufacturerName: string;
}> = [
  { prefix: 'APO', manufacturerName: 'Apotex' },
  { prefix: 'AURO', manufacturerName: 'Auro Pharma' },
  { prefix: 'TEVA', manufacturerName: 'Teva' },
  { prefix: 'PMS', manufacturerName: 'Pharmascience' },
  { prefix: 'JAMP', manufacturerName: 'JAMP Pharma' },
  { prefix: 'SANDOZ', manufacturerName: 'Sandoz' },
  { prefix: 'ACT', manufacturerName: 'Actavis' },
  { prefix: 'MYLAN', manufacturerName: 'Mylan' },
  { prefix: 'TARO', manufacturerName: 'Taro' },
  { prefix: 'RIVA', manufacturerName: 'Riva' },
  { prefix: 'ACH', manufacturerName: 'Accord' },
  { prefix: 'DOM', manufacturerName: 'Dominion' },
  { prefix: 'ACCEL', manufacturerName: 'Accel' },
  { prefix: 'CIPLA', manufacturerName: 'Cipla' },
  { prefix: 'RAN', manufacturerName: 'Ranbaxy' },
  { prefix: 'NOVO', manufacturerName: 'Novopharm' },
  { prefix: 'RATIO', manufacturerName: 'Ratiopharm' },
  { prefix: 'MINT', manufacturerName: 'Mint' },
  { prefix: 'MAR', manufacturerName: 'Marcan' },
  { prefix: 'NAT', manufacturerName: 'Nat-Pharma' },
  { prefix: 'PHL', manufacturerName: 'Pharmel' },
  { prefix: 'GD', manufacturerName: 'GenMed' },
  { prefix: 'NRA', manufacturerName: 'NRA' },
  { prefix: 'SIV', manufacturerName: 'Sivem' },
  { prefix: 'VAN', manufacturerName: 'Vancocin / generic house' },
];

const PREFIX_BY_KEY = new Map(
  MEDICATION_PRODUCT_PREFIXES.map((row) => [row.prefix.toUpperCase(), row]),
);

export function lookupMedicationProductPrefix(token: string): {
  prefix: string;
  manufacturerName: string;
} | null {
  const key = token.replace(/[^A-Za-z]/g, '').toUpperCase();
  if (!key) return null;
  return PREFIX_BY_KEY.get(key) ?? null;
}

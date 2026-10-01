/**
 * Build Adapt dose dropdown options from the *selected* medication context.
 * Never inject drug-agnostic defaults (e.g. metformin 850/1000 or statin 10/20/40).
 */

export type AdaptDoseOption = { value: string; label: string };

function parseStrength(raw: string | undefined | null): {
  amount: number;
  unit: string;
  text: string;
} | null {
  const text = (raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const m = text.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Zµμ/%]+(?:\s*\/\s*\d+\s*[a-zA-Zµμ]+)?)?/);
  if (!m) return { amount: NaN, unit: '', text };
  const amount = Number(m[1]);
  const unit = (m[2] || '').replace(/\s+/g, ' ').trim();
  if (!Number.isFinite(amount) || amount <= 0) return { amount: NaN, unit, text };
  return { amount, unit, text };
}

function formatAmount(amount: number, unit: string): string {
  const rounded =
    Math.abs(amount - Math.round(amount)) < 1e-6
      ? String(Math.round(amount))
      : String(Number(amount.toFixed(2))).replace(/\.?0+$/, '');
  return unit ? `${rounded} ${unit}` : rounded;
}

/** Related strengths for the same unit around the selected dose (halves / doubles). */
function relatedAmounts(amount: number): number[] {
  const candidates = [
    amount / 4,
    amount / 2,
    amount,
    amount * 2,
    amount * 4,
  ].filter((n) => Number.isFinite(n) && n > 0);
  // Prefer clean clinical tablet strengths when the base looks like one.
  if (amount >= 100 && amount % 25 === 0) {
    candidates.push(amount - 250, amount - 125, amount + 125, amount + 250);
  }
  return Array.from(
    new Set(
      candidates
        .map((n) => Math.round(n * 1000) / 1000)
        .filter((n) => n > 0 && n <= amount * 8),
    ),
  ).sort((a, b) => a - b);
}

/**
 * @param seeds - Preferred values (current dose, product strength, catalogue strengths)
 * @param extras - Optional already-built options from a product/pathway card
 */
export function buildAdaptDoseOptions(
  seeds: Array<string | undefined | null>,
  extras: AdaptDoseOption[] = [],
): AdaptDoseOption[] {
  const seen = new Set<string>();
  const out: AdaptDoseOption[] = [];

  const push = (raw: string | undefined | null) => {
    const value = (raw || '').replace(/\s+/g, ' ').trim();
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ value, label: value });
  };

  for (const opt of extras) push(opt.value);
  for (const seed of seeds) push(seed);

  // Derive sibling strengths from the strongest seed we can parse.
  const primary =
    seeds.map((s) => parseStrength(s)).find((p) => p && Number.isFinite(p.amount) && p.unit) ??
    null;

  if (primary && primary.unit) {
    for (const amt of relatedAmounts(primary.amount)) {
      push(formatAmount(amt, primary.unit));
    }
  }

  if (out.length === 0) {
    return [{ value: '', label: 'Select dose' }];
  }

  // Keep current/first seed near the top when present.
  const preferred = (seeds.find((s) => (s || '').trim()) || '').replace(/\s+/g, ' ').trim();
  if (preferred) {
    const rest = out.filter((o) => o.value.toLowerCase() !== preferred.toLowerCase());
    const head = out.find((o) => o.value.toLowerCase() === preferred.toLowerCase());
    return head ? [head, ...rest] : out;
  }
  return out;
}

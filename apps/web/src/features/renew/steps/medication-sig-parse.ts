export type SigMissingField = 'dose' | 'route' | 'frequency';

export type ParsedCurrentSig = {
  rawText: string;
  doseQuantity?: number;
  doseUnit?: string;
  route?: string;
  frequencyDisplay?: string;
  frequencyCode?: string;
  prn?: boolean;
  missing: SigMissingField[];
  status: 'empty' | 'parsed' | 'partial';
};

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  half: 0.5,
};

const DOSE_UNIT_ALIASES: Record<string, string> = {
  capsule: 'capsule',
  capsules: 'capsule',
  cap: 'capsule',
  caps: 'capsule',
  tablet: 'tablet',
  tablets: 'tablet',
  tab: 'tablet',
  tabs: 'tablet',
  puff: 'puff',
  puffs: 'puff',
  pf: 'puff',
  pfs: 'puff',
  spray: 'spray',
  sprays: 'spray',
  drop: 'drop',
  drops: 'drop',
  gtt: 'drop',
  gtts: 'drop',
  patch: 'patch',
  patches: 'patch',
  ml: 'mL',
  millilitre: 'mL',
  milliliter: 'mL',
  millilitres: 'mL',
  milliliters: 'mL',
  unit: 'unit',
  units: 'unit',
  application: 'application',
  applications: 'application',
  inhalation: 'inhalation',
  inhalations: 'inhalation',
  inh: 'inhalation',
  suppository: 'suppository',
  suppositories: 'suppository',
  lozenge: 'lozenge',
  lozenges: 'lozenge',
};

const DOSE_UNITS = Object.keys(DOSE_UNIT_ALIASES);

export const SIG_DOSE_UNIT_OPTIONS: Array<{ value: string; label: string; keywords?: string }> = [
  { value: 'puff', label: 'puff', keywords: 'pf pfs puffs inhalation inhaler hfa mdi puffer' },
  { value: 'tablet', label: 'tablet', keywords: 'tab tabs' },
  { value: 'capsule', label: 'capsule', keywords: 'cap caps' },
  { value: 'mL', label: 'mL', keywords: 'ml millilitre milliliter' },
  { value: 'spray', label: 'spray' },
  { value: 'drop', label: 'drop', keywords: 'gtt gtts' },
  { value: 'patch', label: 'patch' },
  { value: 'inhalation', label: 'inhalation', keywords: 'inh inhale' },
  { value: 'application', label: 'application' },
  { value: 'unit', label: 'unit' },
  { value: 'lozenge', label: 'lozenge' },
  { value: 'suppository', label: 'suppository' },
];

const ROUTE_PATTERNS: Array<[RegExp, string]> = [
  [/\b(by mouth|orally|oral|p\.?o\.?)\b/i, 'oral'],
  [/\b(topically|topical|apply(?:\s+to)?)\b/i, 'topical'],
  [/\b(subcutaneously|subcutaneous|s\.?c\.?|subcut)\b/i, 'subcutaneous'],
  [/\b(intramuscular(?:ly)?|i\.?m\.?)\b/i, 'intramuscular'],
  [/\b(intravenous(?:ly)?|i\.?v\.?)\b/i, 'intravenous'],
  [/\b(sublingual(?:ly)?|s\.?l\.?|under the tongue)\b/i, 'sublingual'],
  [/\b(intranasal(?:ly)?|nasally|in the nose)\b/i, 'nasal'],
  [/\b(inhale[ds]?|inhalation)\b/i, 'inhalation'],
  [/\b(rectally|rectal|per rectum)\b/i, 'rectal'],
  [/\b(ophthalmic|into the eye|in(to)? (the )?eyes?)\b/i, 'ophthalmic'],
  [/\b(otic|into the ear)\b/i, 'otic'],
  [/\b(vaginally|vaginal)\b/i, 'vaginal'],
  [/\b(transdermal)\b/i, 'transdermal'],
];

const FREQUENCY_PATTERNS: Array<[RegExp, { display: string; code: string }]> = [
  [/\b(twice daily|two times daily|twice a day|b\.?i\.?d\.?)\b/i, { display: 'twice daily', code: 'BID' }],
  [/\b(three times daily|three times a day|t\.?i\.?d\.?)\b/i, { display: 'three times daily', code: 'TID' }],
  [/\b(four times daily|four times a day|q\.?i\.?d\.?)\b/i, { display: 'four times daily', code: 'QID' }],
  [/\b(once daily|once a day|every day|q\.?d\.?|q24h?)\b/i, { display: 'once daily', code: 'QD' }],
  [/\bdaily\b/i, { display: 'once daily', code: 'QD' }],
  [/\b(at bedtime|every night at bedtime|q\.?h\.?s\.?)\b/i, { display: 'at bedtime', code: 'QHS' }],
  [/\b(every morning|qam)\b/i, { display: 'every morning', code: 'QAM' }],
  [/\b(every evening|qpm)\b/i, { display: 'every evening', code: 'QPM' }],
  [/\bevery\s+(\d+)\s*hours?\b/i, { display: 'every hours', code: 'QNH' }],
  [/\bq(\d+)\s*h\b/i, { display: 'every hours', code: 'QNH' }],
  [/\b(as directed|asdir)\b/i, { display: 'as directed', code: 'ASDIR' }],
  [/\b(once a week|weekly|once weekly)\b/i, { display: 'once a week', code: '1x/week' }],
  [/\b(once|one time only|single dose)\b/i, { display: 'one time only', code: 'ONCE' }],
];

function normalize(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function parseDose(text: string): { quantity?: number; unit?: string } {
  const unitGroup = [...DOSE_UNITS].sort((a, b) => b.length - a.length).join('|');
  const numeric = text.match(
    new RegExp(
      `(?:take|use|give|inhale|insert|apply|instill)?\\s*(\\d+(?:\\.\\d+)?(?:\\s*/\\s*\\d+)?)\\s*(${unitGroup})\\b`,
      'i',
    ),
  );
  if (numeric) {
    const rawQty = numeric[1].replace(/\s/g, '');
    const quantity = rawQty.includes('/')
      ? Number(rawQty.split('/')[0]) / Number(rawQty.split('/')[1])
      : Number(rawQty);
    if (!Number.isFinite(quantity) || quantity <= 0) return {};
    return { quantity, unit: canonicalDoseUnit(numeric[2]) };
  }

  const worded = text.match(
    new RegExp(`\\b(one|two|three|four|five|six|seven|eight|nine|ten|half)\\s+(${unitGroup})\\b`, 'i'),
  );
  if (worded) {
    return { quantity: WORD_NUMBERS[worded[1].toLowerCase()], unit: canonicalDoseUnit(worded[2]) };
  }

  const wordedQty = text.match(
    /^(?:take|use|give|inhale|insert|apply|instill)?\s*(one|two|three|four|five|six|seven|eight|nine|ten|half)\b(?!\s+times?\b)/i,
  );
  if (wordedQty) {
    return { quantity: WORD_NUMBERS[wordedQty[1].toLowerCase()] };
  }

  return {};
}

export function canonicalDoseUnit(unit: string | null | undefined): string | undefined {
  const lower = unit?.trim().toLowerCase();
  if (!lower) return undefined;
  return DOSE_UNIT_ALIASES[lower] ?? (lower.endsWith('s') ? DOSE_UNIT_ALIASES[lower.slice(0, -1)] : undefined) ?? lower;
}

function parseRoute(text: string): string | undefined {
  for (const [pattern, route] of ROUTE_PATTERNS) {
    if (pattern.test(text)) return route;
  }
  return undefined;
}

function parsePrn(text: string): boolean {
  return /\b(?:p\.?\s*r\.?\s*n\.?|as needed|when needed|if needed|if required)\b/i.test(text);
}

function parseFrequency(text: string): { display?: string; code?: string } {
  for (const [pattern, value] of FREQUENCY_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    if (value.code === 'QNH') {
      const hours = Number(match[1]);
      if (!Number.isInteger(hours) || hours < 1) continue;
      return { display: `every ${hours} hours`, code: `Q${hours}H` };
    }
    return { display: value.display, code: value.code };
  }
  return {};
}

/**
 * Deterministic SIG parser for the current-regimen directions field.
 * Does not invent dose from product strength, or assume route/frequency.
 */
function missingFields(parsed: Pick<ParsedCurrentSig, 'doseQuantity' | 'doseUnit' | 'route' | 'frequencyDisplay' | 'prn'>): SigMissingField[] {
  const missing: SigMissingField[] = [];
  if (parsed.doseQuantity == null || !parsed.doseUnit) missing.push('dose');
  if (!parsed.route) missing.push('route');
  if (!parsed.frequencyDisplay && !parsed.prn) missing.push('frequency');
  return missing;
}

export function withMissing(parsed: Omit<ParsedCurrentSig, 'missing' | 'status'> & { status?: ParsedCurrentSig['status'] }): ParsedCurrentSig {
  const missing = missingFields(parsed);
  const empty = parsed.status === 'empty';
  return {
    ...parsed,
    missing,
    status: empty ? 'empty' : missing.length ? 'partial' : 'parsed',
  };
}

export function parseCurrentDirections(raw: string | null | undefined): ParsedCurrentSig {
  const rawText = normalize(raw ?? '');
  if (rawText.length < 4) {
    return { rawText, missing: ['dose', 'route', 'frequency'], status: 'empty' };
  }

  const dose = parseDose(rawText);
  const route = parseRoute(rawText);
  const frequency = parseFrequency(rawText);
  const prn = parsePrn(rawText);

  return withMissing({
    rawText,
    doseQuantity: dose.quantity,
    doseUnit: dose.unit,
    route,
    frequencyDisplay: frequency.display,
    frequencyCode: frequency.code,
    prn: prn || undefined,
  });
}

export type ProductSigHints = {
  route?: string | null;
  doseUnit?: string | null;
  dosageForm?: string | null;
  label?: string | null;
};

const PRODUCT_ROUTE_PATTERNS: Array<[RegExp, string]> = [
  [/\boral\b/i, 'oral'],
  [/\btopical\b/i, 'topical'],
  [/\binhal/i, 'inhalation'],
  [/\b(hfa|mdi|dpi|puffer|diskus|ellipta|respimat)\b/i, 'inhalation'],
  [/\bnasal\b/i, 'nasal'],
  [/\bophthalm|\beye\b/i, 'ophthalmic'],
  [/\botic|\bear\b/i, 'otic'],
  [/\bsublingual\b/i, 'sublingual'],
  [/\brectal\b/i, 'rectal'],
  [/\bvaginal\b/i, 'vaginal'],
  [/\btransdermal|\bpatch\b/i, 'transdermal'],
  [/\binject|intramuscular|intravenous|subcut/i, 'injection'],
];

/** Route implied by the selected product (dosage form / labeled route), not the SIG text. */
export function inferRouteFromProductHints(product: ProductSigHints): string | undefined {
  const explicit = product.route?.trim().toLowerCase();
  if (explicit) return explicit;
  const haystack = `${product.dosageForm ?? ''} ${product.label ?? ''}`.replace(/\s+/g, ' ').trim();
  if (!haystack) return undefined;
  for (const [pattern, route] of PRODUCT_ROUTE_PATTERNS) {
    if (pattern.test(haystack)) return route;
  }
  return undefined;
}

/**
 * Fill SIG fields the directions text omitted when the selected product
 * already identifies them. Does not invent dose quantity or frequency.
 */
export function applyProductSigDefaults(
  parsed: ParsedCurrentSig,
  product: ProductSigHints,
): ParsedCurrentSig {
  if (parsed.status === 'empty' && !parsed.rawText) return parsed;

  const doseUnit = parsed.doseUnit || inferDoseUnitFromProductHints(product) || undefined;
  const route =
    parsed.route ||
    inferRouteFromProductHints(product) ||
    (doseUnit === 'puff' ? 'inhalation' : undefined);
  return withMissing({
    ...parsed,
    route,
    doseUnit,
    status: parsed.status === 'empty' ? undefined : parsed.status,
  });
}

function inferDoseUnitFromProductHints(product: ProductSigHints): string | undefined {
  const fromProduct = canonicalDoseUnit(product.doseUnit);
  if (fromProduct) return fromProduct;
  const haystack = `${product.dosageForm ?? ''} ${product.label ?? ''}`.replace(/\s+/g, ' ');
  if (!haystack) return undefined;
  if (
    /\b(hfa|mdi|dpi|puffer|diskus|ellipta|respimat|turbuhaler|genuair|breezhaler|accuhaler)\b/i.test(
      haystack,
    )
  ) {
    return 'puff';
  }
  if (/\bpuffs?\b/i.test(haystack)) return 'puff';
  if (/\btablets?\b/i.test(haystack)) return 'tablet';
  if (/\bcapsules?\b/i.test(haystack)) return 'capsule';
  return undefined;
}

export type ParsedSigOverride = Partial<
  Pick<ParsedCurrentSig, 'doseQuantity' | 'doseUnit' | 'route' | 'frequencyDisplay' | 'frequencyCode' | 'prn'>
>;

/** Pharmacist SIG edits layered on top of the latest parse + product defaults. */
export function applyParsedSigOverride(
  fromText: ParsedCurrentSig,
  override: ParsedSigOverride,
): ParsedCurrentSig {
  if (!Object.keys(override).length) return fromText;
  return withMissing({
    ...fromText,
    ...override,
    status: fromText.status === 'empty' && !fromText.rawText ? 'empty' : undefined,
  });
}

export function parsePositiveDoseInput(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '.') return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function formatParsedSigLine(parsed: ParsedCurrentSig): string | null {
  const frequency = parsed.frequencyDisplay
    ? parsed.prn
      ? `${parsed.frequencyDisplay} as needed`
      : parsed.frequencyDisplay
    : parsed.prn
      ? 'as needed'
      : null;
  const parts = [
    parsed.doseQuantity != null && parsed.doseUnit
      ? `${parsed.doseQuantity} ${parsed.doseUnit}`
      : null,
    parsed.route,
    frequency,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

export function unresolvedSigLabel(field: SigMissingField): string {
  if (field === 'dose') return 'Dose could not be identified';
  if (field === 'route') return 'Route could not be identified';
  return 'Frequency could not be identified';
}

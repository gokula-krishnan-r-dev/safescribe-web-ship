export interface UnitSelectOption {
  value: string;
  label: string;
  keywords?: string;
}

/**
 * Dose form / quantity-unit labels from the clinical SIG picker (alphabetical).
 * Exact wording matches the production screenshot, including pluralization.
 */
export const FORM_OPTIONS = [
  'Application(s)',
  'Applicator',
  'Bag(s)',
  'Bottle',
  'Box(es)',
  'Buccal Tablet',
  'Can',
  'Capsule(s)',
  'Cartridge(s)',
  'Cream',
  'Cubic centimeter',
  'Cup(s)',
  'Disks',
  'Dose',
  'Drop(s)',
  'Each',
  'Fluid Ounce',
  'g',
  'Implant(s)',
  'Inhalation(s)',
  'Insert(s)',
  'International units',
  'kg',
  'Litre(s)',
  'Lozenge(s)',
  'mcg',
  'mEq',
  'mg',
  'Micromole',
  'Millimole',
  'Milliunit',
  'mL',
  'Mole',
  'Nebule(s)',
  'Ounce',
  'Package(s)',
  'Packet(s)',
  'Pad(s)',
  'Patch(es)',
  'Pellet(s)',
  'Pen',
  'Pint',
  'Protein Unit',
  'Puffs',
  'Ring(s)',
  'Sniff(s)',
  'Spray(s)',
  'Stick(s)',
  'Strip(s)',
  'Suppositories',
  'Tablespoon(s)',
  'Tablet(s)',
  'Tampon(s)',
  'Teaspoon(s)',
  'Tube',
  'Unit',
  'Units',
  'Vial(s)',
  'Wafer(s)',
] as const;

export type FormOption = (typeof FORM_OPTIONS)[number];

/** Extra dispense units used by device/kit inference; not shown on the Form picker. */
export const QUANTITY_ONLY_UNITS = [
  'Canister(s)',
  'Device(s)',
  'Inhaler(s)',
  'Kit(s)',
] as const;

export const QUANTITY_UNITS = [
  ...FORM_OPTIONS,
  ...QUANTITY_ONLY_UNITS,
].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));

export type QuantityUnit = (typeof QUANTITY_UNITS)[number] | string;

const SEARCH_KEYWORDS: Record<string, string> = {
  'Application(s)': 'apply application cream ointment gel topical',
  'Buccal Tablet': 'buccal cheek tab tablet',
  Bottle: 'bottle bottles',
  'Capsule(s)': 'cap caps capsule capsules',
  'Canister(s)': 'canister canisters foam spray',
  Cream: 'cream ointment topical',
  'Cubic centimeter': 'cc cm3 centimetre centimeter cube cubic',
  'Inhaler(s)': 'inhaler inhalers mdi puffer',
  'Drop(s)': 'gtt drops',
  'Fluid Ounce': 'fl oz fluid ounce',
  g: 'gram grams gm',
  'Inhalation(s)': 'inhale inhaler puff',
  'International units': 'iu i.u. international unit',
  kg: 'kilogram kilograms',
  'Litre(s)': 'l liter litre liters litres',
  'Lozenge(s)': 'lozenge troche',
  mcg: 'microgram mcg ug µg',
  mEq: 'milliequivalent meq',
  mg: 'milligram milligrams',
  mL: 'ml millilitre milliliter millilitres milliliters',
  'Nebule(s)': 'nebulizer nebule neb',
  Ounce: 'oz ounce',
  'Package(s)': 'pack package packs',
  'Patch(es)': 'patch transdermal',
  Puffs: 'puff puffs inhalation inhaler',
  'Suppositories': 'suppository pr rectal',
  'Tablespoon(s)': 'tbsp tablespoon',
  'Tablet(s)': 'tab tabs tablet tablets',
  'Teaspoon(s)': 'tsp teaspoon',
  Tube: 'tube tubes tube(s)',
  'Tube(s)': 'tube tubes',
  Units: 'unit units unit(s)',
  'Vial(s)': 'vial injection',
  'Wafer(s)': 'wafer film',
  'Device(s)': 'device inhaler spacer',
  'Kit(s)': 'kit kits',
};

function normalizeUnitKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\(ies\)/gi, '')
    .replace(/\(e?s\)/gi, '')
    .replace(/\s+/g, ' ');
}

const UNIT_INDEX: Map<string, string> = (() => {
  const index = new Map<string, string>();
  const set = (key: string, canonical: string) => {
    const normalized = normalizeUnitKey(key);
    if (normalized && !index.has(normalized)) index.set(normalized, canonical);
  };

  for (const value of QUANTITY_UNITS) {
    set(value, value);
  }

  const aliases: Array<[string, string]> = [
    ['puff(s)', 'Puffs'],
    ['puff', 'Puffs'],
    ['puffs', 'Puffs'],
    ['suppository', 'Suppositories'],
    ['suppositories', 'Suppositories'],
    ['suppository(ies)', 'Suppositories'],
    ['bottle(s)', 'Bottle'],
    ['bottles', 'Bottle'],
    ['tube(s)', 'Tube'],
    ['tubes', 'Tube'],
    ['canister(s)', 'Canister(s)'],
    ['canisters', 'Canister(s)'],
    ['inhaler(s)', 'Inhaler(s)'],
    ['inhalers', 'Inhaler(s)'],
    ['pack(s)', 'Package(s)'],
    ['pack', 'Package(s)'],
    ['packs', 'Package(s)'],
    ['tab', 'Tablet(s)'],
    ['tabs', 'Tablet(s)'],
    ['tablet', 'Tablet(s)'],
    ['cap', 'Capsule(s)'],
    ['caps', 'Capsule(s)'],
    ['capsule', 'Capsule(s)'],
  ];
  for (const [alias, canonical] of aliases) {
    set(alias, canonical);
  }
  return index;
})();

function catalogKeywordsFor(value: string): string | undefined {
  if (SEARCH_KEYWORDS[value]) return SEARCH_KEYWORDS[value];
  const canonical = UNIT_INDEX.get(normalizeUnitKey(value));
  if (canonical && SEARCH_KEYWORDS[canonical]) return SEARCH_KEYWORDS[canonical];
  return undefined;
}

function toSelectOption(value: string): UnitSelectOption {
  return {
    value,
    label: value,
    keywords: catalogKeywordsFor(value),
  };
}

export const FORM_SELECT_OPTIONS: UnitSelectOption[] = FORM_OPTIONS.map(toSelectOption);

const QUANTITY_SELECT_OPTIONS: UnitSelectOption[] = QUANTITY_UNITS.map(toSelectOption);

export function findFormOption(raw?: string | null): string | undefined {
  const value = (raw ?? '').trim();
  if (!value) return undefined;
  return UNIT_INDEX.get(normalizeUnitKey(value));
}

/** Canonical catalog value, keeping unknown custom text intact. */
export function resolveFormValue(raw?: string | null): string {
  const value = (raw ?? '').trim();
  if (!value) return '';
  return findFormOption(value) ?? value;
}

function identityKey(value: string): string {
  return findFormOption(value) ?? (normalizeUnitKey(value) || value);
}

/** True when two unit labels are the same clinical unit (Tube vs Tube(s)). */
export function unitsMatch(a?: string | null, b?: string | null): boolean {
  const left = (a ?? '').trim();
  const right = (b ?? '').trim();
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.toLowerCase() === right.toLowerCase()) return true;
  return identityKey(left) === identityKey(right);
}

export function findSelectOption(
  options: UnitSelectOption[],
  current?: string | null,
): UnitSelectOption | undefined {
  const value = (current ?? '').trim();
  if (!value) return undefined;
  return (
    options.find((option) => option.value === value) ??
    options.find((option) => unitsMatch(option.value, value) || unitsMatch(option.label, value))
  );
}

/** Option value to bind on the select so aliases like Tube still show Tube(s). */
export function resolveSelectValue(
  options: UnitSelectOption[],
  current?: string | null,
): string {
  const value = (current ?? '').trim();
  if (!value) return '';
  return findSelectOption(options, value)?.value ?? value;
}

function withCurrentOption(
  options: UnitSelectOption[],
  current?: string,
): UnitSelectOption[] {
  const extra = current?.trim();
  if (!extra) return options;
  if (options.some((option) => unitsMatch(option.value, extra))) return options;
  return [toSelectOption(extra), ...options];
}

function preferredSelectOptions(
  catalog: UnitSelectOption[],
  preferred: string[],
  current?: string,
): UnitSelectOption[] {
  const seen = new Set<string>();
  const options: UnitSelectOption[] = [];
  for (const raw of preferred) {
    const value = raw.trim();
    if (!value) continue;
    const key = identityKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    options.push(toSelectOption(value));
  }
  return withCurrentOption(options.length ? options : catalog, current);
}

function extraSearchOptions(
  catalog: UnitSelectOption[],
  visible: UnitSelectOption[],
  current?: string,
): UnitSelectOption[] {
  return withCurrentOption(catalog, current).filter(
    (option) => !visible.some((item) => unitsMatch(item.value, option.value)),
  );
}

export function formSelectOptions(current?: string, allowed?: string[]): UnitSelectOption[] {
  if (allowed?.length) return preferredSelectOptions(FORM_SELECT_OPTIONS, allowed, current);
  return withCurrentOption(FORM_SELECT_OPTIONS, current);
}

export function quantityUnitSelectOptions(
  current?: string,
  allowed?: string[],
): UnitSelectOption[] {
  if (allowed?.length) {
    return preferredSelectOptions(QUANTITY_SELECT_OPTIONS, allowed, current);
  }
  return withCurrentOption(QUANTITY_SELECT_OPTIONS, current);
}

export function formSearchCatalog(
  current?: string,
  visible: UnitSelectOption[] = FORM_SELECT_OPTIONS,
): UnitSelectOption[] {
  return extraSearchOptions(FORM_SELECT_OPTIONS, visible, current);
}

export function quantityUnitSearchCatalog(
  current?: string,
  visible: UnitSelectOption[] = QUANTITY_SELECT_OPTIONS,
): UnitSelectOption[] {
  return extraSearchOptions(QUANTITY_SELECT_OPTIONS, visible, current);
}

export function unitSelectBinding(
  kind: 'form' | 'quantity',
  current: string,
  allowed?: string[],
): {
  value: string;
  options: UnitSelectOption[];
  searchOptions: UnitSelectOption[];
  valuesEqual: typeof unitsMatch;
} {
  const options =
    kind === 'form'
      ? formSelectOptions(current, allowed)
      : quantityUnitSelectOptions(current, allowed);
  const searchOptions =
    kind === 'form'
      ? formSearchCatalog(current, options)
      : quantityUnitSearchCatalog(current, options);
  return {
    value: resolveSelectValue(options, current),
    options,
    searchOptions,
    valuesEqual: unitsMatch,
  };
}

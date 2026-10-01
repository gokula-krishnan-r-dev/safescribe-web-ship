/**
 * Shared medication-dose calculation: product strength × administration
 * quantity → administered ingredient dose. Pure and decimal-safe.
 * Never treats product strength as the prescribed dose.
 */

export type AdministeredDoseStatus =
  | 'CALCULATED'
  | 'NOT_APPLICABLE'
  | 'NOT_CALCULABLE'
  | 'REVIEW_REQUIRED';

export type ProductStrength = {
  value: number;
  unit: string;
  perValue: number | null;
  perUnit: string | null;
  combination: boolean;
  qualitative: boolean;
};

export type AdministrationQuantity = {
  minimum: number;
  maximum: number | null;
  unitCode: string;
  unitLabel: string;
};

export type AdministeredIngredientDose = {
  value: number | null;
  minimum: number | null;
  maximum: number | null;
  unit: string | null;
  status: AdministeredDoseStatus;
};

const MASS_TO_MG: Record<string, number> = {
  mcg: 0.001,
  ug: 0.001,
  µg: 0.001,
  mg: 1,
  g: 1000,
};

const VOLUME_TO_ML: Record<string, number> = {
  ml: 1,
  l: 1000,
};

const DISCRETE_FORM: Record<string, { code: string; label: string }> = {
  tablet: { code: 'TABLET', label: 'tablet' },
  tablets: { code: 'TABLET', label: 'tablet' },
  tab: { code: 'TABLET', label: 'tablet' },
  tabs: { code: 'TABLET', label: 'tablet' },
  caplet: { code: 'CAPLET', label: 'caplet' },
  caplets: { code: 'CAPLET', label: 'caplet' },
  capsule: { code: 'CAPSULE', label: 'capsule' },
  capsules: { code: 'CAPSULE', label: 'capsule' },
  spray: { code: 'SPRAY', label: 'spray' },
  sprays: { code: 'SPRAY', label: 'spray' },
  puff: { code: 'PUFF', label: 'puff' },
  puffs: { code: 'PUFF', label: 'puff' },
  drop: { code: 'DROP', label: 'drop' },
  drops: { code: 'DROP', label: 'drop' },
  patch: { code: 'PATCH', label: 'patch' },
  patches: { code: 'PATCH', label: 'patch' },
  suppository: { code: 'SUPPOSITORY', label: 'suppository' },
  suppositories: { code: 'SUPPOSITORY', label: 'suppository' },
  lozenge: { code: 'LOZENGE', label: 'lozenge' },
  lozenges: { code: 'LOZENGE', label: 'lozenge' },
  application: { code: 'APPLICATION', label: 'application' },
  applications: { code: 'APPLICATION', label: 'application' },
  unit: { code: 'UNIT', label: 'unit' },
  units: { code: 'UNIT', label: 'unit' },
  wafer: { code: 'WAFER', label: 'wafer' },
  wafers: { code: 'WAFER', label: 'wafer' },
  gummy: { code: 'GUMMY', label: 'gummy' },
  gummies: { code: 'GUMMY', label: 'gummy' },
};

function compact(text: string | null | undefined): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function decimalsOf(value: number): number {
  const text = String(value);
  if (/e/i.test(text)) return 8;
  const index = text.indexOf('.');
  return index === -1 ? 0 : text.length - index - 1;
}

/** Decimal-safe multiply that avoids typical IEEE remainder artifacts. */
export function decimalMultiply(a: number, b: number): number {
  const scale = 10 ** (decimalsOf(a) + decimalsOf(b));
  return Math.round(a * b * scale) / scale;
}

export function decimalDivide(a: number, b: number): number | null {
  if (!Number.isFinite(b) || b === 0) return null;
  const scale = 10 ** Math.max(decimalsOf(a) + 4, decimalsOf(b) + 4, 6);
  return Math.round((a / b) * scale) / scale;
}

export function normalizeMassUnit(raw: string): string | null {
  const unit = compact(raw).toLowerCase();
  if (unit === 'µg' || unit === 'ug') return 'mcg';
  if (unit === 'mcg' || unit === 'mg' || unit === 'g') return unit;
  return null;
}

export function normalizeVolumeUnit(raw: string): string | null {
  const unit = compact(raw).toLowerCase();
  if (unit === 'ml') return 'mL';
  if (unit === 'l') return 'L';
  return null;
}

export function isMassUnit(raw: string | null | undefined): boolean {
  return Boolean(normalizeMassUnit(raw ?? ''));
}

export function isVolumeUnit(raw: string | null | undefined): boolean {
  const unit = compact(raw).toLowerCase();
  return unit === 'ml' || unit === 'l';
}

export function normalizeFormUnit(
  raw: string | null | undefined,
): { code: string; label: string } | null {
  const text = compact(raw)
    .toLowerCase()
    .replace(/\(e?s\)/g, '')
    .trim();
  if (!text) return null;
  if (/tablespoon|teaspoon/.test(text)) return null;
  if (DISCRETE_FORM[text]) return DISCRETE_FORM[text];
  if (/tablet/.test(text)) return DISCRETE_FORM.tablet;
  if (/capsule/.test(text)) return DISCRETE_FORM.capsule;
  if (/spray/.test(text)) return DISCRETE_FORM.spray;
  if (/\bpuffs?\b/.test(text)) return DISCRETE_FORM.puff;
  if (/\bdrops?\b/.test(text)) return DISCRETE_FORM.drop;
  if (/patch/.test(text)) return DISCRETE_FORM.patch;
  if (/suppositor/.test(text)) return DISCRETE_FORM.suppository;
  if (/lozenge/.test(text)) return DISCRETE_FORM.lozenge;
  if (/application/.test(text)) return DISCRETE_FORM.application;
  return null;
}

export function parseProductStrength(
  raw: string | null | undefined,
): ProductStrength | null {
  const text = compact(raw);
  if (!text) return null;

  if (/^\d+(?:\.\d+)?\s*%/.test(text)) {
    const value = Number(text.match(/^(\d+(?:\.\d+)?)/)?.[1]);
    if (!Number.isFinite(value)) return null;
    return {
      value,
      unit: '%',
      perValue: null,
      perUnit: null,
      combination: false,
      qualitative: true,
    };
  }

  const combination = text.match(
    /^(\d+(?:\.\d+)?)\s*(mcg|µg|ug|mg|g)\s*\/\s*(\d+(?:\.\d+)?)\s*(mcg|µg|ug|mg|g)\b/i,
  );
  if (combination) {
    return {
      value: Number(combination[1]),
      unit: normalizeMassUnit(combination[2]) ?? combination[2],
      perValue: null,
      perUnit: null,
      combination: true,
      qualitative: false,
    };
  }

  const concentration = text.match(
    /^(\d+(?:\.\d+)?)\s*(mcg|µg|ug|mg|g)\s*\/\s*(\d+(?:\.\d+)?)\s*(ml|l)\b/i,
  );
  if (concentration) {
    const value = Number(concentration[1]);
    const perValue = Number(concentration[3]);
    if (!Number.isFinite(value) || !Number.isFinite(perValue) || perValue <= 0) {
      return null;
    }
    return {
      value,
      unit: normalizeMassUnit(concentration[2]) ?? concentration[2],
      perValue,
      perUnit: normalizeVolumeUnit(concentration[4]),
      combination: false,
      qualitative: false,
    };
  }

  const concentrationBare = text.match(
    /^(\d+(?:\.\d+)?)\s*(mcg|µg|ug|mg|g)\s*\/\s*(ml|l)\b/i,
  );
  if (concentrationBare) {
    const value = Number(concentrationBare[1]);
    if (!Number.isFinite(value)) return null;
    return {
      value,
      unit: normalizeMassUnit(concentrationBare[2]) ?? concentrationBare[2],
      perValue: 1,
      perUnit: normalizeVolumeUnit(concentrationBare[3]),
      combination: false,
      qualitative: false,
    };
  }

  const simple = text.match(/^(\d+(?:\.\d+)?)\s*(mcg|µg|ug|mg|g|ml)\b/i);
  if (!simple) return null;
  const value = Number(simple[1]);
  if (!Number.isFinite(value)) return null;
  const mass = normalizeMassUnit(simple[2]);
  const volume = normalizeVolumeUnit(simple[2]);
  const rest = text.slice(simple[0].length);
  const per = rest.match(
    /(?:\/\s*|per\s+)?(\d+(?:\.\d+)?)?\s*(tablet|capsule|caplet|spray|puff|drop|unit|ml|l)s?\b/i,
  );
  const form = per ? normalizeFormUnit(per[2]) : null;
  const perVolume = per ? normalizeVolumeUnit(per[2]) : null;
  return {
    value,
    unit: mass ?? volume ?? simple[2],
    perValue: per?.[1] ? Number(per[1]) : form || perVolume ? 1 : null,
    perUnit: form?.label ?? perVolume,
    combination: false,
    qualitative: false,
  };
}

export function parseMassAmount(
  raw: string | null | undefined,
): { value: number; unit: string } | null {
  const text = compact(raw);
  if (!text) return null;
  if (/\/\s*kg/i.test(text)) return null;
  const match = text.match(/^(\d+(?:\.\d+)?)\s*(mcg|µg|ug|mg|g|ml)\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const mass = normalizeMassUnit(match[2]);
  const volume = normalizeVolumeUnit(match[2]);
  return { value, unit: mass ?? volume ?? match[2] };
}

export function parseAdministrationQuantity(
  amount: string | null | undefined,
  unit: string | null | undefined,
): AdministrationQuantity | null {
  const amountText = compact(amount);
  if (!amountText) return null;
  if (!/^\d/.test(amountText)) return null;
  if (parseMassAmount(amountText) && !normalizeFormUnit(unit)) return null;

  const range = amountText.match(
    /^(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)/,
  );
  const minimum = Number(range?.[1] ?? amountText.match(/^(\d+(?:\.\d+)?)/)?.[1]);
  const maximum = range ? Number(range[2]) : null;
  if (!Number.isFinite(minimum) || minimum <= 0) return null;
  if (maximum != null && (!Number.isFinite(maximum) || maximum <= 0)) return null;

  const remainder = amountText.replace(
    /^\d+(?:\.\d+)?(?:\s*[–-]\s*\d+(?:\.\d+)?)?/,
    '',
  ).trim();
  if (parseMassAmount(amountText) && !normalizeFormUnit(remainder || unit)) {
    return null;
  }

  const form = normalizeFormUnit(remainder || unit);
  if (!form) {
    if (isVolumeUnit(remainder || unit || '')) {
      return {
        minimum,
        maximum,
        unitCode: 'ML',
        unitLabel: 'mL',
      };
    }
    return null;
  }
  return {
    minimum,
    maximum,
    unitCode: form.code,
    unitLabel: form.label,
  };
}

export function isInstructionalAdministration(raw: string | null | undefined): boolean {
  const text = compact(raw);
  if (!text || /^\d/.test(text)) return false;
  return /[a-zA-Z]/.test(text);
}

function unitsCompatible(
  strength: ProductStrength,
  quantity: AdministrationQuantity,
): boolean {
  if (strength.combination || strength.qualitative) return false;
  const per = (strength.perUnit ?? '').toLowerCase();
  const qty = quantity.unitLabel.toLowerCase();
  if (per) {
    if (per === 'ml' && qty === 'ml') return true;
    return per === qty;
  }
  if (quantity.unitCode === 'ML') return false;
  return Boolean(DISCRETE_FORM[qty] || quantity.unitCode !== 'ML');
}

export function multiplyStrengthByQuantity(
  strength: ProductStrength,
  quantity: AdministrationQuantity,
): AdministeredIngredientDose {
  if (strength.combination) {
    return {
      value: null,
      minimum: null,
      maximum: null,
      unit: null,
      status: 'NOT_APPLICABLE',
    };
  }
  if (strength.qualitative || !unitsCompatible(strength, quantity)) {
    return {
      value: null,
      minimum: null,
      maximum: null,
      unit: null,
      status: 'NOT_CALCULABLE',
    };
  }

  const perValue = strength.perValue && strength.perValue > 0 ? strength.perValue : 1;
  const factorMin = decimalDivide(quantity.minimum, perValue);
  if (factorMin == null) {
    return {
      value: null,
      minimum: null,
      maximum: null,
      unit: null,
      status: 'NOT_CALCULABLE',
    };
  }
  const min = decimalMultiply(strength.value, factorMin);
  const max =
    quantity.maximum != null
      ? decimalMultiply(
          strength.value,
          decimalDivide(quantity.maximum, perValue) ?? 0,
        )
      : null;

  return {
    value: max == null ? min : null,
    minimum: min,
    maximum: max != null && max !== min ? max : null,
    unit: strength.unit,
    status: 'CALCULATED',
  };
}

export function formatDoseNumber(value: number, locale = 'en-CA'): string {
  if (!Number.isFinite(value)) return '';
  const fraction = decimalsOf(value);
  if (Number.isInteger(value)) {
    const grouped = value.toLocaleString(locale, {
      maximumFractionDigits: 0,
      useGrouping: true,
    });
    if (Math.abs(value) >= 1000 && !/[,\s.]/.test(grouped.replace(/^-/, ''))) {
      return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    return grouped;
  }
  return value.toLocaleString(locale, {
    maximumFractionDigits: Math.min(Math.max(fraction, 0), 4),
    minimumFractionDigits: 0,
    useGrouping: true,
  });
}

export function formatMassLabel(
  value: number,
  unit: string,
  locale = 'en-CA',
): string {
  return `${formatDoseNumber(value, locale)} ${unit}`;
}

export function pluralizeAdministrationUnit(
  label: string,
  count: number,
  ranged: boolean,
): string {
  if (label === 'mL' || isMassUnit(label)) return label;
  if (!ranged && count === 1) return label;
  if (label === 'puff') return 'puffs';
  if (label === 'drop') return 'drops';
  if (label === 'spray') return 'sprays';
  if (label === 'lozenge') return 'lozenges';
  if (label === 'patch') return 'patches';
  if (label === 'suppository') return 'suppositories';
  if (label === 'gummy') return 'gummies';
  if (/y$/.test(label) && !/[aeiou]y$/.test(label)) return `${label.slice(0, -1)}ies`;
  if (/s$/.test(label)) return label;
  return `${label}s`;
}

export function formatAdministrationQuantity(
  quantity: AdministrationQuantity,
  locale = 'en-CA',
): string {
  const ranged =
    quantity.maximum != null && quantity.maximum !== quantity.minimum;
  const unit = pluralizeAdministrationUnit(
    quantity.unitLabel,
    ranged ? 2 : quantity.minimum,
    ranged,
  );
  if (ranged) {
    return `${formatDoseNumber(quantity.minimum, locale)}–${formatDoseNumber(
      quantity.maximum!,
      locale,
    )} ${unit}`;
  }
  return `${formatDoseNumber(quantity.minimum, locale)} ${unit}`;
}

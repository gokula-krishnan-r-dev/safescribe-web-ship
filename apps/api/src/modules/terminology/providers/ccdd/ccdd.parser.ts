/**
 * Parse CCDD concept display strings into structured fields.
 *
 * MP:  "APO-AMOXI (amoxicillin (amoxicillin trihydrate) 500 mg oral capsule) APOTEX INC"
 * NTP: "amoxicillin 500 mg oral capsule"
 * TM:  "amoxicillin"
 */

const STRENGTH_RE =
  /(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?\s*(?:mg|mcg|µg|g|ml|mL|%|unit|units|iu|IU)(?:\s*per\s*\d+(?:\.\d+)?\s*(?:ml|mL|g))?)/i;

const FORM_TOKENS =
  /\b(oral\s+capsule|oral\s+tablet|chewable\s+tablet|oral\s+suspension|oral\s+solution|delayed[\s-]release\s+tablet|extended[\s-]release\s+tablet|enteric[\s-]coated\s+tablet|film[\s-]coated\s+tablet|sublingual\s+tablet|effervescent\s+tablet|powder\s+for\s+solution|powder\s+for\s+suspension|injection|injectable|cream|ointment|gel|patch|inhaler|nasal\s+spray|eye\s+drops|ear\s+drops|suppository|capsule|tablet|suspension|solution|syrup|spray|drops|lozenge|granules|powder)\b/i;

const PLACEHOLDER_VALUE_RE =
  /^(unknown|n\/a|n\.a\.|na|unspecified|not specified|not known|not stated|none|null|-)$/i;

/** CCDD often stores manufacturer as the literal "Unknown" — omit from clinical UI. */
export function omitPlaceholderValue(value?: string | null): string | undefined {
  const t = value?.trim();
  if (!t || PLACEHOLDER_VALUE_RE.test(t)) return undefined;
  return t;
}

export interface ParsedCcdDDisplay {
  brandName?: string;
  genericName?: string;
  strength?: string;
  dosageForm?: string;
  manufacturer?: string;
  label: string;
}

/** Manufactured Product display */
export function parseMpDisplay(display: string): ParsedCcdDDisplay {
  const trimmed = display.trim();
  const mpMatch = trimmed.match(/^(.+?)\s+\((.+)\)\s+(.+)$/);
  if (!mpMatch) {
    return { brandName: titleCase(trimmed), label: trimmed };
  }

  const brand = omitPlaceholderValue(mpMatch[1].trim());
  const inner = mpMatch[2].trim();
  const manufacturer = omitPlaceholderValue(mpMatch[3].trim());
  const { genericName, strength, dosageForm } = parseStrengthForm(inner);
  const generic = genericName ? titleCase(genericName) : undefined;
  const brandName = brand || generic || titleCase(trimmed);

  const label =
    generic && brandName.toLowerCase() !== generic.toLowerCase()
      ? `${generic} · ${brandName}`
      : brandName;

  return {
    brandName,
    genericName: generic,
    strength: omitPlaceholderValue(strength),
    dosageForm: dosageForm ? titleCase(dosageForm) : undefined,
    manufacturer,
    label,
  };
}

/** Non-proprietary Therapeutic Product display */
export function parseNtpDisplay(display: string): ParsedCcdDDisplay {
  const trimmed = display.trim();
  const { genericName, strength, dosageForm } = parseStrengthForm(trimmed);
  const name = genericName || trimmed;

  return {
    brandName: titleCase(name),
    genericName: titleCase(name),
    strength: omitPlaceholderValue(strength),
    dosageForm: dosageForm ? titleCase(dosageForm) : undefined,
    label: titleCase(trimmed),
  };
}

/** Therapeutic Moiety (substance) display — lowercase for reference-style UI */
export function parseTmDisplay(display: string): ParsedCcdDDisplay {
  const name = display.trim().toLowerCase();
  return {
    brandName: name,
    genericName: name,
    label: name,
  };
}

function parseStrengthForm(text: string): {
  genericName?: string;
  strength?: string;
  dosageForm?: string;
} {
  const strengthMatch = text.match(STRENGTH_RE);
  if (!strengthMatch || strengthMatch.index == null) {
    return { genericName: stripTrailingSalt(text) };
  }

  const strength = strengthMatch[0].replace(/\s+/g, ' ').trim();
  const before = text.slice(0, strengthMatch.index).trim();
  const after = text.slice(strengthMatch.index + strengthMatch[0].length).trim();

  const formMatch = after.match(FORM_TOKENS) ?? text.match(FORM_TOKENS);
  const dosageForm = formMatch?.[0]?.replace(/\s+/g, ' ').trim();

  return {
    genericName: stripTrailingSalt(before) || undefined,
    strength,
    dosageForm,
  };
}

/** Prefer base ingredient over salt form in parentheses */
function stripTrailingSalt(name: string): string {
  return name
    .replace(/\s*\([^)]*(?:hydrate|hydrochloride|sodium|potassium|mesylate|besylate|maleate|sulfate|sulphate|acetate|fumarate|tartrate|citrate)[^)]*\)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function titleCase(s: string): string {
  if (!s) return s;
  // Keep all-caps brand tokens (APO-AMOXI, VALTREX) as-is when mostly uppercase
  if (s === s.toUpperCase() && /[A-Z]/.test(s) && s.length <= 40) {
    return s;
  }
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function scoreCcdDResult(
  query: string,
  brand: string,
  generic: string | undefined,
  conceptType: 'tm' | 'ntp' | 'mp',
): number {
  const q = query.toLowerCase().trim();
  const b = brand.toLowerCase();
  const g = (generic ?? '').toLowerCase();
  let score = 0;

  if (conceptType === 'mp') score += 20;
  else if (conceptType === 'ntp') score += 12;
  else score += 8;

  if (b === q || g === q) score += 100;
  else if (b.startsWith(q) || g.startsWith(q)) {
    score += 70;
    // Prefer shorter substance names for doctor-friendly short queries (valsartan > vandetanib)
    const name = g || b;
    score += Math.max(0, 36 - name.length);
  } else if (b.includes(q) || g.includes(q)) score += 35;

  if (conceptType === 'tm' && b.length <= q.length + 12) score += 8;

  if (conceptType === 'mp' && b.replace(/[^a-z0-9]/g, '').startsWith(q.replace(/[^a-z0-9]/g, ''))) {
    score += 15;
  }

  // Deprioritize combo / parenthetical salts for allergy pickers
  if (/\band\b/.test(g) || g.includes(' and ')) score -= 25;
  if (/\([^)]+\)/.test(g)) score -= 10;

  return score;
}

/**
 * Post-enrichment ranking for Canadian clinical pickers.
 * Surfaces common outpatient drugs (Valtrex / antiviral, ARB…) ahead of rare specialty agents.
 */
export function scoreClinicalRelevance(
  query: string,
  item: {
    genericName?: string;
    brandName?: string;
    drugClass?: string;
    strength?: string;
  },
): number {
  const q = query.toLowerCase().trim();
  const g = (item.genericName ?? item.brandName ?? '').toLowerCase().trim();
  const brand = (item.brandName ?? '').toLowerCase().trim();
  const cls = (item.drugClass ?? '').trim();
  let score = 0;

  if (!g) return -100;

  if (g === q) score += 200;
  else if (g.startsWith(q)) {
    score += 120;
    // Prefer compact names: valsartan (9) over valganciclovir (14)
    score += Math.max(0, 55 - g.length * 3);
  } else if (g.includes(q)) {
    score += 45;
    score += Math.max(0, 40 - g.length * 2);
  }

  // Tier-1 classes match the reference UI (antiviral, ARB, statin, benzodiazepine…)
  if (/^(ARB|statin|antiviral|benzodiazepine|penicillin|NSAID|PPI|SSRI|ACE inhibitor)$/i.test(cls)) {
    score += 55;
    // Prefer compact outpatient agents (valsartan) over longer specialty antivirals
    if (g.length <= 12) score += 12;
  } else if (cls && cls.length <= 22) {
    score += 8;
  } else if (cls.length > 28) {
    score -= 15;
  }

  // Distinctive trade name helps, but not more than class/name fit
  if (brand && brand !== g && /^[a-z][a-z0-9\-]*$/i.test(brand) && brand.length <= 12) {
    score += 18;
  } else if (brand && brand !== g) {
    score += 6;
  }

  // Treatment UX: prefer products that include a parsed strength
  if (item.strength?.trim()) score += 40;

  // Allergy UX: single substances over combos / salts
  if (/\band\b/.test(g) || g.includes('+')) score -= 50;
  if (/\([^)]+\)/.test(g)) score -= 18;

  // Soft-downrank specialty oncology / biologic suffixes on short queries
  if (q.length <= 3 && /(nib|mab|ciclib|parin)$/i.test(g)) score -= 30;

  return score;
}

/** Reference-style display: lowercase generic substance names */
export function formatGenericDisplay(name?: string): string | undefined {
  if (!name?.trim()) return undefined;
  return name.trim().toLowerCase();
}

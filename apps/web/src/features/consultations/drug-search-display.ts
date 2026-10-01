import type { DrugSearchResult } from './medication-utils';

const MAX_GENERIC_DISPLAY = 64;

/** Drop the CCDD prefix from coded labels so pharmacists never see that acronym. */
function stripCcdDLabel(value?: string): string | undefined {
  if (!value?.trim()) return undefined;
  const cleaned = value.replace(/\bCCDD\s+/gi, '').trim();
  return cleaned || undefined;
}

/** Trim long homeopathic / multi-ingredient generic strings for UI display */
export function truncateGenericName(generic?: string): string | undefined {
  if (!generic?.trim()) return undefined;
  const trimmed = generic.trim();
  if (trimmed.length <= MAX_GENERIC_DISPLAY) return trimmed;

  const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    const lead = parts[0];
    if (lead.length <= MAX_GENERIC_DISPLAY - 10) {
      return `${lead} + ${parts.length - 1} more`;
    }
  }
  return `${trimmed.slice(0, MAX_GENERIC_DISPLAY).trim()}…`;
}

/**
 * Screenshot layout (Canada CCDD + SNOMED):
 *   amlodipine · NORVASC · 5 mg   ← name · brand · strength (strength always visible)
 *   oral tablet · calcium channel blocker
 */
export function formatDrugResultDisplay(item: DrugSearchResult) {
  const rawGeneric = truncateGenericName(item.genericName);
  const generic = rawGeneric ? rawGeneric.toLowerCase() : undefined;
  const brand = item.brandName?.trim();
  const same =
    Boolean(generic) &&
    Boolean(brand) &&
    generic!.toLowerCase() === brand!.toLowerCase();

  const primaryName = generic || (brand ? brand.toLowerCase() : undefined) || item.label.toLowerCase();
  const brandBeside =
    generic && brand && !same ? brand : undefined;

  const structuralClass =
    item.drugClass &&
    !/^(SCD|SBD|GPCK|BPCK|IN|PIN|MIN|BN|SY|Manufactured product|Non-proprietary product|Therapeutic moiety)$/i.test(
      item.drugClass,
    )
      ? item.drugClass
      : undefined;

  const strength = item.strength?.replace(/\s+/g, ' ').trim() || undefined;
  const dosageForm = item.dosageForm?.replace(/\s+/g, ' ').trim() || undefined;
  // Strength is rendered on the primary line — keep secondary for form + class only
  const secondaryParts = [dosageForm, structuralClass].filter(Boolean);
  const secondary = secondaryParts.length ? secondaryParts.join(' · ') : undefined;
  const meta = [strength, dosageForm].filter(Boolean).join(' · ') || undefined;

  return {
    /** Bold generic / primary name (lowercase) */
    primary: primaryName,
    /** Optional brand shown after · in muted weight */
    brand: brandBeside,
    /** Second line — form + clinical class (strength shown on primary) */
    secondary,
    drugClass: structuralClass,
    meta,
    source: item.source,
    code:
      stripCcdDLabel(item.codeDisplay) ||
      (item.rxcui ? `RxNorm: ${item.rxcui}` : item.ndc ? `DIN: ${item.ndc}` : undefined),
    strength,
    dosageForm,
  };
}

export interface DropdownPosition {
  top: number;
  left: number;
  width: number;
  placement: 'above' | 'below';
  maxHeight: number;
}

/**
 * Anchor the menu to the input. Prefer below; flip above only when needed.
 * Uses measured dropdown height so empty/short menus don't jump to the top of the card.
 */
export function measureDropdownPosition(
  anchor: HTMLElement,
  measuredHeight = 0,
  preferredMaxHeight = 280,
): DropdownPosition {
  const rect = anchor.getBoundingClientRect();
  const viewportH = window.innerHeight;
  const gap = 6;
  const edgePad = 8;

  const spaceBelow = Math.max(0, viewportH - rect.bottom - edgePad);
  const spaceAbove = Math.max(0, rect.top - edgePad);

  const minUseful = 140;
  const openAbove = spaceBelow < minUseful && spaceAbove > spaceBelow;

  const available = openAbove ? spaceAbove : spaceBelow;
  const maxHeight = Math.min(preferredMaxHeight, Math.max(120, available - gap));
  const height = measuredHeight > 0 ? Math.min(measuredHeight, maxHeight) : Math.min(160, maxHeight);

  if (openAbove) {
    return {
      top: Math.max(edgePad, rect.top - gap - height),
      left: rect.left,
      width: rect.width,
      placement: 'above',
      maxHeight,
    };
  }

  return {
    top: rect.bottom + gap,
    left: rect.left,
    width: rect.width,
    placement: 'below',
    maxHeight,
  };
}

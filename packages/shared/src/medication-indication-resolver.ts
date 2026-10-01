/**
 * MedicationIndicationResolver — Approved Indications Repository integration.
 *
 * Pure, deterministic resolver used by Adapt (and reusable by Renew).
 * AI ranking is optional and only invoked by callers when `needsAIRanking` is true.
 *
 * Spec contract (Adapt Step 1):
 *   MedicationIndicationResolver.resolve({
 *     medicationConceptId, productConceptId, clinicalDrugConceptId,
 *     ingredientConceptIds, jurisdiction, patientConditionConceptIds
 *   })
 *   → approvedMappings, patientConditionMatches, needsAIRanking, repositoryVersion
 */

import { ingredientAliasMatches } from './renew-workflow';
import type { RenewIndicationCandidate } from './renew';
import {
  resolveIndicationMapping,
  sortIndicationCandidates,
  type CuratedIndicationRow,
  type RenewConditionCatalogItem,
} from './renew-therapy';

export const MEDICATION_INDICATION_REPOSITORY_VERSION = 'approved-indications-v1';

export type MedicationIndicationMappingStrength =
  CuratedIndicationRow['mappingStrength'];

/** One approved medication→indication mapping from the repository. */
export interface ApprovedIndicationMapping {
  mappingId: string;
  conditionId: string;
  conditionCode: string;
  displayName: string;
  mappingStrength: MedicationIndicationMappingStrength;
  autoGroupAllowed: boolean;
  alwaysRequireConfirmation: boolean;
  rankingWeight?: number | null;
  /** Ingredient / concept key that matched the medication. */
  matchedIngredientKey?: string | null;
}

export interface MedicationIndicationResolveInput {
  /** Primary normalized medication concept (CCDD TM / ingredient id). */
  medicationConceptId?: string | null;
  /** Marketed product concept (CCDD MP) when available. */
  productConceptId?: string | null;
  /** Clinical drug / NTP concept when available. */
  clinicalDrugConceptId?: string | null;
  /** Ingredient / synonym keys used for repository matching. */
  ingredientConceptIds: string[];
  /** Jurisdiction code (AB, ON, …) — reserved for jurisdiction-scoped maps. */
  jurisdiction?: string | null;
  /**
   * Structured patient condition concept IDs and/or display labels.
   * Prefer catalog condition IDs; free-text labels are matched by alias/name.
   */
  patientConditionConceptIds?: string[];
  patientConditionLabels?: string[];
}

export interface MedicationIndicationResolveResult {
  approvedMappings: ApprovedIndicationMapping[];
  /** Ranked candidates derived from approved mappings (for UI lists). */
  candidates: RenewIndicationCandidate[];
  /** Approved mappings that also intersect patient conditions. */
  patientConditionMatches: RenewConditionCatalogItem[];
  /**
   * True when multiple approved mappings remain and patient-condition
   * intersection does not yield a single clear result.
   */
  needsAIRanking: boolean;
  repositoryVersion: string;
  /** Deterministic provisional pick when unambiguous (never auto-confirmed). */
  provisionalConditionId: string | null;
  status: 'empty' | 'provisional' | 'needs_confirmation';
}

export interface MedicationIndicationRepositoryRow {
  mappingId: string;
  ingredientId: string | null;
  medicationConceptId: string | null;
  conditionId: string;
  conditionCode: string;
  displayName: string;
  mappingStrength: string;
  autoGroupAllowed: boolean;
  alwaysRequireConfirmation: boolean;
  rankingWeight?: number | null;
  active?: boolean;
}

function asStrength(value: string): MedicationIndicationMappingStrength {
  if (value === 'primary' || value === 'common' || value === 'possible' || value === 'rare') {
    return value;
  }
  return 'possible';
}

function normalizeLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function labelsOverlap(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.includes(a)) return true;
  if (b.length >= 4 && a.includes(b)) return true;
  return false;
}

/**
 * Filter repository rows to those matching the medication concept/ingredient keys.
 */
export function matchApprovedIndicationMappings(
  repository: MedicationIndicationRepositoryRow[],
  ingredientConceptIds: string[],
  catalogById?: Map<string, RenewConditionCatalogItem>,
): ApprovedIndicationMapping[] {
  const keys = ingredientConceptIds.map((k) => k.trim()).filter(Boolean);
  if (!keys.length) return [];

  const byCondition = new Map<string, ApprovedIndicationMapping>();

  for (const row of repository) {
    if (row.active === false) continue;
    if (catalogById && !catalogById.has(row.conditionId)) continue;

    const matchKey =
      [row.ingredientId, row.medicationConceptId]
        .map((v) => (v ?? '').trim())
        .find((v) => v && ingredientAliasMatches(v, keys)) ?? null;
    if (!matchKey) continue;

    const catalog = catalogById?.get(row.conditionId);
    const mapping: ApprovedIndicationMapping = {
      mappingId: row.mappingId,
      conditionId: row.conditionId,
      conditionCode: catalog?.code ?? row.conditionCode,
      displayName: catalog?.displayName ?? row.displayName,
      mappingStrength: asStrength(row.mappingStrength),
      autoGroupAllowed: row.autoGroupAllowed,
      alwaysRequireConfirmation: row.alwaysRequireConfirmation,
      rankingWeight: row.rankingWeight ?? null,
      matchedIngredientKey: matchKey,
    };

    const existing = byCondition.get(mapping.conditionId);
    if (
      !existing ||
      (mapping.rankingWeight ?? 0) > (existing.rankingWeight ?? 0) ||
      STRENGTH_ORDER[mapping.mappingStrength] > STRENGTH_ORDER[existing.mappingStrength]
    ) {
      byCondition.set(mapping.conditionId, mapping);
    }
  }

  return [...byCondition.values()].sort((a, b) => {
    const wa = a.rankingWeight ?? STRENGTH_ORDER[a.mappingStrength];
    const wb = b.rankingWeight ?? STRENGTH_ORDER[b.mappingStrength];
    if (wb !== wa) return wb - wa;
    return a.displayName.localeCompare(b.displayName);
  });
}

const STRENGTH_ORDER: Record<MedicationIndicationMappingStrength, number> = {
  primary: 100,
  common: 70,
  possible: 40,
  rare: 15,
};

export function matchPatientConditionsAgainstCatalog(
  catalog: RenewConditionCatalogItem[],
  options: {
    patientConditionConceptIds?: string[];
    patientConditionLabels?: string[];
    /** When set, prefer matches that are also approved for the medication. */
    approvedConditionIds?: Set<string>;
  },
): RenewConditionCatalogItem[] {
  const idSet = new Set(
    (options.patientConditionConceptIds ?? []).map((id) => id.trim()).filter(Boolean),
  );
  const labels = (options.patientConditionLabels ?? [])
    .map(normalizeLabel)
    .filter(Boolean);

  const matches: RenewConditionCatalogItem[] = [];
  const seen = new Set<string>();

  for (const item of catalog) {
    if (item.code === 'OTHER_CUSTOM') continue;
    let hit = idSet.has(item.id) || idSet.has(item.code);

    if (!hit && labels.length) {
      const display = normalizeLabel(item.displayName);
      const code = normalizeLabel(item.code);
      hit = labels.some(
        (label) =>
          labelsOverlap(label, display) ||
          labelsOverlap(label, code) ||
          label === code,
      );
    }

    if (!hit || seen.has(item.id)) continue;
    seen.add(item.id);
    matches.push(item);
  }

  // Prefer approved intersections first for UI stability.
  if (options.approvedConditionIds?.size) {
    matches.sort((a, b) => {
      const aa = options.approvedConditionIds!.has(a.id) ? 0 : 1;
      const bb = options.approvedConditionIds!.has(b.id) ? 0 : 1;
      if (aa !== bb) return aa - bb;
      return a.displayPriority - b.displayPriority || a.displayName.localeCompare(b.displayName);
    });
  }

  return matches.slice(0, 20);
}

function toCurated(mapping: ApprovedIndicationMapping): CuratedIndicationRow {
  return {
    conditionId: mapping.conditionId,
    conditionCode: mapping.conditionCode,
    displayName: mapping.displayName,
    mappingStrength: mapping.mappingStrength,
    autoGroupAllowed: mapping.autoGroupAllowed,
    alwaysRequireConfirmation: mapping.alwaysRequireConfirmation,
    rankingWeight: mapping.rankingWeight,
  };
}

/**
 * Deterministic MedicationIndicationResolver.
 * Does not call AI — callers may rank approved candidate IDs when `needsAIRanking`.
 */
export const MedicationIndicationResolver = {
  resolve(args: {
    input: MedicationIndicationResolveInput;
    repository: MedicationIndicationRepositoryRow[];
    catalog: RenewConditionCatalogItem[];
    repositoryVersion?: string;
  }): MedicationIndicationResolveResult {
    const catalogById = new Map(args.catalog.map((row) => [row.id, row]));
    const ingredientConceptIds = [
      ...args.input.ingredientConceptIds,
      args.input.medicationConceptId,
      args.input.productConceptId,
      args.input.clinicalDrugConceptId,
    ]
      .map((v) => (v ?? '').trim())
      .filter(Boolean);

    const approvedMappings = matchApprovedIndicationMappings(
      args.repository,
      ingredientConceptIds,
      catalogById,
    );

    const curated = approvedMappings.map(toCurated);
    const resolved = resolveIndicationMapping(curated);
    const candidates =
      resolved.candidates.length > 0
        ? resolved.candidates
        : sortIndicationCandidates(curated);

    const approvedIds = new Set(approvedMappings.map((m) => m.conditionId));
    const patientConditionMatches = matchPatientConditionsAgainstCatalog(args.catalog, {
      patientConditionConceptIds: args.input.patientConditionConceptIds,
      patientConditionLabels: args.input.patientConditionLabels,
      approvedConditionIds: approvedIds,
    });

    const clearPatientIntersection = patientConditionMatches.filter((row) =>
      approvedIds.has(row.id),
    );

    const needsAIRanking =
      approvedMappings.length > 1 && clearPatientIntersection.length !== 1;

    let status: MedicationIndicationResolveResult['status'] = 'empty';
    if (approvedMappings.length === 0) status = 'empty';
    else if (resolved.status === 'provisional' && resolved.conditionId) status = 'provisional';
    else status = 'needs_confirmation';

    // Single clear patient-condition intersection is also provisional (still pharmacist-confirmed).
    const provisionalConditionId =
      clearPatientIntersection.length === 1
        ? clearPatientIntersection[0]!.id
        : resolved.conditionId;

    if (clearPatientIntersection.length === 1 && approvedMappings.length > 0) {
      status = 'provisional';
    }

    return {
      approvedMappings,
      candidates,
      patientConditionMatches,
      needsAIRanking,
      repositoryVersion: args.repositoryVersion ?? MEDICATION_INDICATION_REPOSITORY_VERSION,
      provisionalConditionId,
      status,
    };
  },
};

export type MedicationIndicationResolverType = typeof MedicationIndicationResolver;

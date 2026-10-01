/**
 * SafeScribe Adapt — AdaptReferenceSelector Deduplication & Finding Linking
 *
 * Deduplication, finding-level attachment, and coverage calculation
 * as specified in Sections 21, 22, 25, 29–31 of
 * SafeScribe_AdaptReferenceSelector_Backend_Cursor_Instructions.md.
 */

import { CHECK_TAGS } from './adapt-reference-selector.config';
import type { ClinicalUseTagCode } from './clinical-use-tags';
import type {
  AdaptReferenceSelectorCoverage,
  FindingReferenceLink,
  SelectedAdaptReference,
} from './adapt-reference-selector.types';

function normalizeKey(title: string, org?: string | null, year?: string | null): string {
  const t = title.toLowerCase().replace(/[^a-z0-9]/g, '');
  const o = (org ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const y = (year ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${t}|${o}|${y}`;
}

/**
 * Section 21 & 22: Deduplicate and merge references
 * Merges matched tags, check codes, rule IDs, and relevant sections.
 */
export function dedupeAndMergeReferences(
  references: SelectedAdaptReference[],
  limit = 5,
): SelectedAdaptReference[] {
  const byId = new Map<string, SelectedAdaptReference>();
  const byStableKey = new Map<string, string>(); // key -> referenceId

  for (const ref of references) {
    const key = normalizeKey(ref.title, ref.organizationPublisher, ref.yearEdition);
    const existingId = byId.has(ref.referenceId) ? ref.referenceId : byStableKey.get(key);

    if (existingId && byId.has(existingId)) {
      const existing = byId.get(existingId)!;

      // Merge tags
      const mergedTags = Array.from(new Set([...existing.matchedTags, ...ref.matchedTags]));
      // Merge check codes
      const mergedChecks = Array.from(
        new Set([...(existing.matchedCheckCodes ?? []), ...(ref.matchedCheckCodes ?? [])]),
      );
      // Merge rule IDs
      const mergedRules = Array.from(
        new Set([...(existing.matchedRuleIds ?? []), ...(ref.matchedRuleIds ?? [])]),
      );
      // Merge relevant sections
      const mergedSections = Array.from(
        new Set([...(existing.relevantSections ?? []), ...(ref.relevantSections ?? [])]),
      );

      existing.matchedTags = mergedTags;
      existing.matchedCheckCodes = mergedChecks.length ? mergedChecks : undefined;
      existing.matchedRuleIds = mergedRules.length ? mergedRules : undefined;
      existing.relevantSections = mergedSections.length ? mergedSections : undefined;

      // Keep higher priority score
      if (ref.priorityScore > existing.priorityScore) {
        existing.priorityScore = ref.priorityScore;
        existing.displayReason = ref.displayReason;
      }

      // Preserve safety rule source if present
      if (ref.source === 'safety_rule') {
        existing.source = 'safety_rule';
      }
    } else {
      byId.set(ref.referenceId, { ...ref });
      byStableKey.set(key, ref.referenceId);
    }
  }

  // Sort descending by priority score
  const sorted = Array.from(byId.values()).sort((a, b) => b.priorityScore - a.priorityScore);

  // Separate safety rule references and pathway references
  const safetyRefs = sorted.filter((r) => r.source === 'safety_rule');
  const pathwayRefs = sorted.filter((r) => r.source !== 'safety_rule');

  // Section 22: Top 3 pathway references + all materially relevant safety engine references
  const maxPathway = Math.max(1, limit - safetyRefs.length);
  const selectedPathway = pathwayRefs.slice(0, maxPathway);

  const combined = [...safetyRefs, ...selectedPathway].sort(
    (a, b) => b.priorityScore - a.priorityScore,
  );

  return combined.slice(0, Math.max(limit, safetyRefs.length));
}

/**
 * Section 25: Coverage Calculation
 */
export function calculateCoverage(params: {
  requestedTags: ClinicalUseTagCode[];
  selectedReferences: SelectedAdaptReference[];
}): AdaptReferenceSelectorCoverage {
  const { requestedTags, selectedReferences } = params;

  const supportedTags = new Set<ClinicalUseTagCode>();
  let hasPathwayReference = false;
  let hasSafetyRuleReference = false;

  for (const ref of selectedReferences) {
    if (ref.source === 'pathway_library') hasPathwayReference = true;
    if (ref.source === 'safety_rule') hasSafetyRuleReference = true;
    for (const tag of ref.matchedTags) {
      supportedTags.add(tag);
    }
  }

  const missingTags = requestedTags.filter((t) => !supportedTags.has(t));

  return {
    hasAnySupportingReference: selectedReferences.length > 0,
    hasPathwayReference,
    hasSafetyRuleReference,
    missingTags,
  };
}

/**
 * Section 29–31: Finding-Level Reference Linking
 * For each check code, attaches the primary reference and additional references.
 */
export function linkReferencesToFindings(params: {
  triggeredCheckCodes: string[];
  selectedReferences: SelectedAdaptReference[];
}): Record<string, FindingReferenceLink> {
  const { triggeredCheckCodes, selectedReferences } = params;
  const links: Record<string, FindingReferenceLink> = {};

  for (const checkCode of triggeredCheckCodes) {
    const targetTags = new Set(CHECK_TAGS[checkCode] ?? []);

    // Filter references that support this check
    const matching = selectedReferences.filter((ref) => {
      // Direct check code match
      if (ref.matchedCheckCodes?.includes(checkCode)) return true;
      // Tag intersection match
      return ref.matchedTags.some((t) => targetTags.has(t));
    });

    if (matching.length > 0) {
      // Sort matching so highest priority score is first
      matching.sort((a, b) => b.priorityScore - a.priorityScore);
      const primary = matching[0];
      const additional = matching.slice(1).map((r) => r.referenceId);

      links[checkCode] = {
        checkCode,
        primaryReferenceId: primary.referenceId,
        additionalReferenceIds: additional,
      };
    } else {
      links[checkCode] = {
        checkCode,
        primaryReferenceId: undefined,
        additionalReferenceIds: [],
      };
    }
  }

  return links;
}

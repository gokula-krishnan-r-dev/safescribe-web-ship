/**
 * SafeScribe Adapt — AdaptReferenceSelector Service
 *
 * Deterministic, tag-based reference selection engine for Adapt Step 3B
 * as specified in SafeScribe_AdaptReferenceSelector_Backend_Cursor_Instructions.md.
 */

import {
  BUILTIN_SAFETY_RULE_REFERENCES,
  DEFAULT_PHARMACIST_CONSULTED_REFERENCES,
} from './adapt-reference-selector.config';
import {
  calculateCoverage,
  dedupeAndMergeReferences,
  linkReferencesToFindings,
} from './adapt-reference-selector.dedupe';
import {
  buildRequestedTags,
  scoreCandidateReference,
} from './adapt-reference-selector.scoring';
import type {
  AdaptReferenceSelectorInput,
  AdaptReferenceSelectorResult,
  AdaptReferenceSelectorWarning,
  CandidateReference,
  SelectedAdaptReference,
} from './adapt-reference-selector.types';

export * from './adapt-reference-selector.types';
export * from './adapt-reference-selector.config';
export * from './adapt-reference-selector.scoring';
export * from './adapt-reference-selector.dedupe';

const PRODUCTION_ELIGIBLE_STATUSES = new Set(['verified', 'approved', 'published', 'active']);

/**
 * Main selector function as specified in Section 4, 23, 24 of cursor instructions.
 */
export function selectAdaptReferences(
  input: AdaptReferenceSelectorInput,
  candidatePathwayReferences: CandidateReference[] = [],
): AdaptReferenceSelectorResult {
  const warnings: AdaptReferenceSelectorWarning[] = [];
  const limit = input.limit ?? 5;

  // 1. Build requested tag set
  const requestedTags = buildRequestedTags({
    adaptationType: input.adaptationType,
    adaptationReasonCode: input.adaptationReasonCode,
    triggeredCheckCodes: input.triggeredCheckCodes ?? [],
  });

  // 2. Filter and score pathway references
  const pathwaySelected: SelectedAdaptReference[] = [];

  for (const candidate of candidatePathwayReferences) {
    // Check status eligibility (Section 13)
    const normStatus = (candidate.status ?? '').toLowerCase().trim();
    if (!PRODUCTION_ELIGIBLE_STATUSES.has(normStatus)) {
      continue;
    }

    // Check verification required (Section 14)
    if (candidate.verificationRequired === true) {
      continue;
    }

    // Must match at least one requested tag
    const hasTagMatch = candidate.tags.some((t) => requestedTags.includes(t));
    if (!hasTagMatch) {
      continue;
    }

    const { priorityScore, matchedTags, displayReason } = scoreCandidateReference({
      candidate,
      requestedTags,
      jurisdiction: input.jurisdiction,
      pathwayId: input.pathwayId,
      adaptationReasonCode: input.adaptationReasonCode,
      triggeredCheckCodes: input.triggeredCheckCodes,
      adaptationType: input.adaptationType,
    });

    pathwaySelected.push({
      referenceId: candidate.id,
      title: candidate.title,
      organizationPublisher: candidate.organizationPublisher,
      documentType: candidate.documentType,
      jurisdiction: candidate.jurisdiction,
      yearEdition: candidate.yearEdition,
      version: candidate.version,
      url: candidate.url,
      doi: candidate.doi,
      source: 'pathway_library',
      matchedTags,
      matchedCheckCodes: input.triggeredCheckCodes?.filter((code) =>
        candidate.tags.some((t) => (t as string).includes(code) || (code as string).includes(t)),
      ),
      relevantSections: candidate.relevantSections,
      priorityScore,
      displayReason,
      statusSnapshot: candidate.status,
      verificationRequired: false,
    });
  }

  if (input.pathwayId && candidatePathwayReferences.length === 0) {
    warnings.push({
      code: 'NO_PATHWAY_MATCH',
      message: 'No SafeScribe pathway reference set is available for this indication.',
    });
  }

  // 3. Safety Engine Rule References (Section 19 & 20)
  const safetyRuleSelected: SelectedAdaptReference[] = [];

  if (input.includeSafetyRuleReferences !== false) {
    // If specific rule IDs triggered, retrieve them
    const ruleIds = input.triggeredRuleIds ?? [];

    // Automatically associate builtin safety rules based on triggered checks
    const activeRuleIds = new Set<string>(ruleIds);
    if (input.triggeredCheckCodes?.includes('renal_function')) {
      activeRuleIds.add('METFORMIN_RENAL_45');
    }
    if (input.triggeredCheckCodes?.includes('allergies')) {
      activeRuleIds.add('ALLERGY_BETA_LACTAM_CONTRAINDICATION');
    }
    if (input.triggeredCheckCodes?.includes('drug_interactions')) {
      activeRuleIds.add('DRUG_INTERACTION_MAJOR');
    }
    if (input.triggeredCheckCodes?.includes('dose_regimen') && activeRuleIds.size === 0) {
      activeRuleIds.add('DOSE_REGIMEN_APPROPRIATE');
    }

    for (const ruleId of activeRuleIds) {
      const builtin = BUILTIN_SAFETY_RULE_REFERENCES[ruleId];
      if (builtin) {
        // Compute priority score: Safety rules get high clinical priority
        const priorityScore = 15;
        const displayReason = 'Authoritative Safety Engine rule monograph and clinical check reference.';

        safetyRuleSelected.push({
          ...builtin,
          priorityScore,
          displayReason,
        });
      }
    }
  }

  // 4. Combine & Deduplicate (Section 21)
  const allSelectedReferences = dedupeAndMergeReferences(
    [...pathwaySelected, ...safetyRuleSelected],
    limit,
  );

  // 5. Calculate Coverage (Section 25)
  const coverage = calculateCoverage({
    requestedTags,
    selectedReferences: allSelectedReferences,
  });

  // 6. Finding-level reference attachment (Sections 29–31)
  const findingLinks = linkReferencesToFindings({
    triggeredCheckCodes: input.triggeredCheckCodes ?? [],
    selectedReferences: allSelectedReferences,
  });

  return {
    consultationId: input.consultationId,
    pathwayMatched: Boolean(input.pathwayId),
    pathwayId: input.pathwayId ?? null,
    requestedTags,
    pathwayReferences: pathwaySelected,
    safetyRuleReferences: safetyRuleSelected,
    allSelectedReferences,
    coverage,
    findingLinks,
    warnings,
    generatedAt: new Date().toISOString(),
  };
}

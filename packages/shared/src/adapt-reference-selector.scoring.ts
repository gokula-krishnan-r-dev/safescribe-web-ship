/**
 * SafeScribe Adapt — AdaptReferenceSelector Scoring & Tag Resolution
 *
 * Deterministic tag assembly, relevance scoring, and display reason generation
 * as specified in Sections 10, 11, 15, 17, 18 of
 * SafeScribe_AdaptReferenceSelector_Backend_Cursor_Instructions.md.
 */

import type { AdaptationType } from './adapt';
import type { ClinicalUseTagCode } from './clinical-use-tags';
import {
  ADAPTATION_REASON_TAGS,
  ADAPTATION_TYPE_TAGS,
  CHECK_TAGS,
  SOURCE_TYPE_PRIORITY,
  TAG_WEIGHTS,
} from './adapt-reference-selector.config';
import type {
  CandidateReference,
  SelectedAdaptReference,
} from './adapt-reference-selector.types';

export interface BuildRequestedTagsParams {
  adaptationType: AdaptationType;
  adaptationReasonCode: string;
  triggeredCheckCodes?: string[];
}

/**
 * Section 10: Build the Requested Tag Set
 * Merges: adaptation type + adaptation reason + triggered clinical checks.
 * Deduplicates in stable deterministic order.
 */
export function buildRequestedTags(params: BuildRequestedTagsParams): ClinicalUseTagCode[] {
  const seen = new Set<ClinicalUseTagCode>();
  const requested: ClinicalUseTagCode[] = [];

  const addTags = (tags?: ClinicalUseTagCode[]) => {
    if (!tags) return;
    for (const tag of tags) {
      if (!seen.has(tag)) {
        seen.add(tag);
        requested.push(tag);
      }
    }
  };

  // 1. Adaptation reason tags (high priority)
  addTags(ADAPTATION_REASON_TAGS[params.adaptationReasonCode]);

  // 2. Triggered check tags
  if (params.triggeredCheckCodes) {
    for (const code of params.triggeredCheckCodes) {
      addTags(CHECK_TAGS[code]);
    }
  }

  // 3. Adaptation type tags
  addTags(ADAPTATION_TYPE_TAGS[params.adaptationType]);

  return requested;
}

export interface ScoreReferenceParams {
  candidate: CandidateReference;
  requestedTags: ClinicalUseTagCode[];
  jurisdiction: string;
  pathwayId?: string | null;
  adaptationReasonCode: string;
  triggeredCheckCodes?: string[];
  adaptationType: AdaptationType;
}

/**
 * Section 11, 15, 18: Score candidate reference
 */
export function scoreCandidateReference(
  params: ScoreReferenceParams,
): {
  priorityScore: number;
  matchedTags: ClinicalUseTagCode[];
  displayReason: string;
} {
  const {
    candidate,
    requestedTags,
    jurisdiction,
    pathwayId,
    adaptationReasonCode,
    triggeredCheckCodes = [],
    adaptationType,
  } = params;

  const reasonTags = new Set(ADAPTATION_REASON_TAGS[adaptationReasonCode] ?? []);
  const checkTags = new Set(triggeredCheckCodes.flatMap((c) => CHECK_TAGS[c] ?? []));
  const typeTags = new Set(ADAPTATION_TYPE_TAGS[adaptationType] ?? []);

  // 1. Calculate tag matches & tag scores
  const matchedTags: ClinicalUseTagCode[] = [];
  let tagScore = 0;

  for (const tag of candidate.tags) {
    if (requestedTags.includes(tag)) {
      matchedTags.push(tag);

      if (reasonTags.has(tag)) {
        tagScore += TAG_WEIGHTS.reasonSpecificTag;
      } else if (checkTags.has(tag)) {
        tagScore += TAG_WEIGHTS.triggeredCheckTag;
      } else if (typeTags.has(tag)) {
        tagScore += TAG_WEIGHTS.adaptationTypeTag;
      } else {
        tagScore += 1;
      }
    }
  }

  // 2. Pathway match score
  let pathwayScore = 0;
  if (pathwayId && candidate.pathwayId === pathwayId) {
    pathwayScore = TAG_WEIGHTS.exactPathwayMatch;
  }

  // 3. Jurisdiction score
  let jurisdictionScore = 0;
  const jur = jurisdiction.trim().toUpperCase();
  const candJur = (candidate.jurisdiction ?? '').trim().toUpperCase();

  if (candJur === jur) {
    jurisdictionScore = TAG_WEIGHTS.exactJurisdictionMatch;
  } else if (candJur === 'CA' || candJur === 'CANADA') {
    jurisdictionScore = TAG_WEIGHTS.canadaWideReference;
  }

  // 4. Source authority score
  const docType = (candidate.documentType ?? '').toLowerCase().replace(/[\s-]/g, '_');
  const sourceScore = SOURCE_TYPE_PRIORITY[docType] ?? SOURCE_TYPE_PRIORITY.other ?? 2;

  const priorityScore = tagScore + pathwayScore + jurisdictionScore + sourceScore;

  const displayReason = determineDisplayReason(matchedTags, candidate.source ?? 'pathway_library');

  return {
    priorityScore,
    matchedTags,
    displayReason,
  };
}

/**
 * Section 17: Deterministic display reason generation
 */
export function determineDisplayReason(
  matchedTags: ClinicalUseTagCode[],
  source: 'pathway_library' | 'safety_rule' | 'other_approved_source',
): string {
  if (source === 'safety_rule') {
    return 'Authoritative Safety Engine rule monograph and clinical check reference.';
  }

  if (matchedTags.length === 0) {
    return 'Approved clinical reference supporting adaptation protocol.';
  }

  const humanTags = matchedTags
    .map((t) => t.replace(/_/g, ' '))
    .slice(0, 3);

  if (humanTags.length === 1) {
    return `Matches ${humanTags[0]} evidence for this adaptation.`;
  }

  if (humanTags.length === 2) {
    return `Matches ${humanTags[0]} and ${humanTags[1]} evidence for this adaptation.`;
  }

  return `Matches ${humanTags[0]}, ${humanTags[1]}, and ${humanTags[2]} evidence needs for this adaptation.`;
}

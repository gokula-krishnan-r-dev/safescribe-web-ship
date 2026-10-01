/**
 * SafeScribe Adapt — AdaptReferenceSelector Types
 *
 * Controlled vocabulary, input, output, and finding-level mapping interfaces
 * as specified in SafeScribe_AdaptReferenceSelector_Backend_Cursor_Instructions.md.
 */

import type { AdaptationType } from './adapt';
import type { ClinicalUseTagCode } from './clinical-use-tags';

export interface AdaptReferenceSelectorInput {
  consultationId: string;
  jurisdiction: string;

  pathwayId?: string | null;
  conditionCode?: string | null;
  indicationText?: string | null;

  adaptationType: AdaptationType;
  adaptationReasonCode: string;
  adaptationReasonLabel?: string;

  originalDrugIds?: string[];
  proposedDrugIds?: string[];

  triggeredCheckCodes?: string[];
  triggeredRuleIds?: string[];

  includeSafetyRuleReferences?: boolean;

  limit?: number;
}

export interface CandidateReference {
  id: string;
  title: string;
  organizationPublisher?: string | null;
  documentType?: string | null;
  jurisdiction?: string | null;
  yearEdition?: string | null;
  version?: string | null;
  url?: string | null;
  doi?: string | null;
  status: string;
  verificationRequired?: boolean;
  tags: ClinicalUseTagCode[];
  pathwayId?: string | null;
  relevantSections?: string[];
  source?: 'pathway_library' | 'safety_rule' | 'other_approved_source';
}

export interface SelectedAdaptReference {
  referenceId: string;
  title: string;
  organizationPublisher?: string | null;

  documentType?: string | null;
  jurisdiction?: string | null;

  yearEdition?: string | null;
  version?: string | null;

  url?: string | null;
  doi?: string | null;

  source: 'pathway_library' | 'safety_rule' | 'other_approved_source';

  matchedTags: ClinicalUseTagCode[];

  matchedCheckCodes?: string[];
  matchedRuleIds?: string[];

  relevantSections?: string[];

  priorityScore: number;

  displayReason: string;

  statusSnapshot: string;

  verificationRequired?: boolean;

  deepLink?: {
    page?: number;
    section?: string;
    anchor?: string;
  };
}

export interface FindingReferenceLink {
  checkCode: string;
  primaryReferenceId?: string;
  additionalReferenceIds: string[];
}

export interface AdaptReferenceSelectorWarning {
  code: string;
  message: string;
}

export interface AdaptReferenceSelectorCoverage {
  hasAnySupportingReference: boolean;
  hasPathwayReference: boolean;
  hasSafetyRuleReference: boolean;
  missingTags: ClinicalUseTagCode[];
}

export interface AdaptReferenceSelectorResult {
  consultationId: string;

  pathwayMatched: boolean;
  pathwayId?: string | null;

  requestedTags: ClinicalUseTagCode[];

  pathwayReferences: SelectedAdaptReference[];
  safetyRuleReferences: SelectedAdaptReference[];

  allSelectedReferences: SelectedAdaptReference[];

  coverage: AdaptReferenceSelectorCoverage;

  findingLinks: Record<string, FindingReferenceLink>;

  warnings: AdaptReferenceSelectorWarning[];

  generatedAt: string;
}

export interface AdaptEvidenceGapEvent {
  pathwayId?: string;
  conditionCode?: string;

  drugIds?: string[];

  adaptationType: string;
  adaptationReasonCode: string;

  requestedTags: ClinicalUseTagCode[];
  missingTags: ClinicalUseTagCode[];

  consultationId: string;
  createdAt: string;
}

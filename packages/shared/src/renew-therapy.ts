/**
 * SafeScribe Renew — Step 2 therapy-review grouping, mapping rules, and completion gates.
 * Curated maps and AI rank candidates. The pharmacist confirms every indication.
 */

import { baseIngredientKeys } from './treatment-duplicate';
import {
  RENEW_ADHERENCE_CATEGORIES,
  RENEW_CONCERN_ACTIONS,
  RENEW_CONCERN_CATEGORIES,
  type RenewConditionReview,
  type RenewIndicationCandidate,
  type RenewMedication,
  type RenewMedicationIndication,
  type RenewTherapyIssue,
  type RenewTherapyReviewState,
  medicationShortName,
} from './renew';
import {
  getEffectivenessReviewCopy,
  isUnableToAssessStatus,
} from './renew-effectiveness';

export function isEffectivenessConcern(status: string | null | undefined): boolean {
  return status === 'no' || isUnableToAssessStatus(status);
}

export interface CuratedIndicationRow {
  conditionId: string;
  conditionCode: string;
  displayName: string;
  mappingStrength: 'primary' | 'common' | 'possible' | 'rare';
  autoGroupAllowed: boolean;
  alwaysRequireConfirmation: boolean;
  rankingWeight?: number | null;
}

export interface RenewConditionCatalogItem {
  id: string;
  code: string;
  displayName: string;
  category: string | null;
  description: string | null;
  defaultEffectivenessQuestion: string | null;
  commonForRenewal: boolean;
  displayPriority: number;
}

export interface TherapyConditionGroup {
  key: string;
  conditionId: string | null;
  customConditionText: string | null;
  displayName: string;
  conditionCode: string | null;
  category: string | null;
  effectivenessQuestion: string;
  medicationIds: string[];
  review: RenewConditionReview;
}

export interface TherapyReviewExceptionGlance {
  key: string;
  label: string;
  detail: string;
}

export interface TherapyReviewGate {
  ok: boolean;
  unresolvedMedicationIds: string[];
  incompleteReviewKeys: string[];
  incompleteIssueKeys: string[];
  attentionCount: number;
  linkedCount: number;
  totalMedications: number;
  conditionsConfirmed: number;
  conditionsReviewedCount: number;
  exceptionsDocumentedCount: number;
  itemsNeedingCompletion: number;
  exceptionGlance: TherapyReviewExceptionGlance[];
  adherenceReviewed: boolean;
  effectivenessReviewed: boolean;
  tolerabilityReviewed: boolean;
  adherenceReviewedCount: number;
  effectivenessReviewedCount: number;
  tolerabilityReviewedCount: number;
  reviewableCount: number;
  concernCount: number;
  adherenceConcernCount: number;
  effectivenessConcernCount: number;
  unableToAssessCount: number;
  medicationConcernCount: number;
  therapyStatus: 'not_started' | 'in_progress' | 'complete';
}

const STRENGTH_WEIGHT: Record<CuratedIndicationRow['mappingStrength'], number> = {
  primary: 100,
  common: 70,
  possible: 40,
  rare: 15,
};

export function medicationIngredientKeys(med: RenewMedication): string[] {
  return baseIngredientKeys(
    med.normalized.medicationConceptId,
    med.normalized.genericName,
    med.normalized.brandName,
    med.raw.medicationText,
  );
}

export function medicationFingerprint(items: RenewMedication[]): string {
  return items
    .map((m) => m.id)
    .sort()
    .join(',');
}

export function conditionGroupKey(
  conditionId: string | null | undefined,
  customText?: string | null,
): string {
  if (conditionId) return `cond:${conditionId}`;
  const text = (customText ?? '').trim().toLowerCase();
  return text ? `custom:${text}` : 'unassigned';
}

export function isIndicationResolved(mapping: RenewMedicationIndication): boolean {
  return Boolean(mapping.conditionId) || Boolean(mapping.customIndicationText?.trim());
}

export function sortIndicationCandidates(
  rows: CuratedIndicationRow[],
): RenewIndicationCandidate[] {
  return [...rows]
    .sort((a, b) => {
      const wa = a.rankingWeight ?? STRENGTH_WEIGHT[a.mappingStrength];
      const wb = b.rankingWeight ?? STRENGTH_WEIGHT[b.mappingStrength];
      if (wb !== wa) return wb - wa;
      return a.displayName.localeCompare(b.displayName);
    })
    .map((row, index) => ({
      conditionId: row.conditionId,
      conditionCode: row.conditionCode,
      displayName: row.displayName,
      mappingStrength: row.mappingStrength,
      rank: index + 1,
      confidenceBand: row.mappingStrength === 'primary' || row.mappingStrength === 'common' ? 'high' : 'moderate',
    }));
}

export function resolveIndicationMapping(curated: CuratedIndicationRow[]): {
  status: RenewMedicationIndication['status'];
  conditionId: string | null;
  mappingSource: RenewMedicationIndication['mappingSource'];
  candidates: RenewIndicationCandidate[];
} {
  const candidates = sortIndicationCandidates(curated);
  if (!curated.length) {
    return {
      status: 'needs_confirmation',
      conditionId: null,
      mappingSource: 'curated_auto',
      candidates: [],
    };
  }

  const alwaysConfirm = curated.some((row) => row.alwaysRequireConfirmation);
  const primary = curated.filter((row) => row.mappingStrength === 'primary' && row.autoGroupAllowed);

  if (!alwaysConfirm && primary.length === 1 && primary[0]) {
    return {
      status: 'provisional',
      conditionId: primary[0].conditionId,
      mappingSource: 'curated_auto',
      candidates,
    };
  }

  return {
    status: 'needs_confirmation',
    conditionId: null,
    mappingSource: 'ai_ranked',
    candidates,
  };
}

export function defaultEffectivenessQuestion(item?: RenewConditionCatalogItem | null): string {
  return item?.defaultEffectivenessQuestion?.trim() || 'Therapy effective / condition stable?';
}

function emptyReview(keyParts: {
  conditionId: string | null;
  customConditionText: string | null;
  id?: string;
}): RenewConditionReview {
  return {
    id: keyParts.id ?? `rrev_${conditionGroupKey(keyParts.conditionId, keyParts.customConditionText)}`,
    conditionId: keyParts.conditionId,
    customConditionText: keyParts.customConditionText,
    adherenceStatus: null,
    effectivenessStatus: null,
    medicationConcernStatus: null,
    answerSource: null,
    issues: [],
    manuallyPreserved: false,
  };
}

export function syncConditionReviews(
  mappings: RenewMedicationIndication[],
  reviews: RenewConditionReview[],
): RenewConditionReview[] {
  const byKey = new Map<string, RenewConditionReview>();
  for (const review of reviews) {
    byKey.set(conditionGroupKey(review.conditionId, review.customConditionText), review);
  }

  const used = new Set<string>();
  for (const mapping of mappings) {
    if (!isIndicationResolved(mapping)) continue;
    const key = conditionGroupKey(mapping.conditionId, mapping.customIndicationText);
    used.add(key);
    if (!byKey.has(key)) {
      byKey.set(
        key,
        emptyReview({
          conditionId: mapping.conditionId,
          customConditionText: mapping.customIndicationText,
        }),
      );
    }
  }

  return [...byKey.values()].filter((review) => {
    const key = conditionGroupKey(review.conditionId, review.customConditionText);
    return used.has(key) || review.manuallyPreserved;
  });
}

export function isConfirmedConditionGroup(group: TherapyConditionGroup): boolean {
  return group.medicationIds.length > 0 || group.review.manuallyPreserved;
}

export function isReviewableConditionGroup(group: TherapyConditionGroup): boolean {
  return group.medicationIds.length > 0;
}

export function groupTherapyConditions(
  items: RenewMedication[],
  therapy: RenewTherapyReviewState,
  catalog: RenewConditionCatalogItem[],
): TherapyConditionGroup[] {
  const catalogById = new Map(catalog.map((row) => [row.id, row]));
  const reviews = syncConditionReviews(therapy.mappings, therapy.reviews);
  const medsByCondition = new Map<string, string[]>();

  for (const mapping of therapy.mappings) {
    if (!isIndicationResolved(mapping)) continue;
    const key = conditionGroupKey(mapping.conditionId, mapping.customIndicationText);
    const list = medsByCondition.get(key) ?? [];
    list.push(mapping.medicationId);
    medsByCondition.set(key, list);
  }

  const groups: TherapyConditionGroup[] = [];
  const seen = new Set<string>();

  for (const review of reviews) {
    const key = conditionGroupKey(review.conditionId, review.customConditionText);
    if (seen.has(key)) continue;
    seen.add(key);
    const catalogItem = review.conditionId ? catalogById.get(review.conditionId) : undefined;
    groups.push({
      key,
      conditionId: review.conditionId,
      customConditionText: review.customConditionText,
      displayName:
        catalogItem?.displayName ??
        review.customConditionText?.trim() ??
        'Other / custom',
      conditionCode: catalogItem?.code ?? null,
      category: catalogItem?.category ?? null,
      effectivenessQuestion: defaultEffectivenessQuestion(catalogItem),
      medicationIds: medsByCondition.get(key) ?? [],
      review,
    });
  }

  const itemIndex = new Map(items.map((med, index) => [med.id, index]));
  groups.sort((a, b) => {
    const pa = a.conditionId
      ? catalogById.get(a.conditionId)?.displayPriority ?? 500
      : 900;
    const pb = b.conditionId
      ? catalogById.get(b.conditionId)?.displayPriority ?? 500
      : 900;
    if (pa !== pb) return pa - pb;
    return a.displayName.localeCompare(b.displayName);
  });

  for (const group of groups) {
    group.medicationIds.sort((a, b) => (itemIndex.get(a) ?? 0) - (itemIndex.get(b) ?? 0));
  }

  return groups;
}

export function unresolvedMappings(
  items: RenewMedication[],
  mappings: RenewMedicationIndication[],
): RenewMedication[] {
  const byId = new Map(mappings.map((row) => [row.medicationId, row]));
  return items.filter((med) => {
    const mapping = byId.get(med.id);
    return !mapping || !isIndicationResolved(mapping);
  });
}

export function therapyIndicationsReady(
  items: RenewMedication[],
  therapy: RenewTherapyReviewState,
): boolean {
  return items.length > 0 && unresolvedMappings(items, therapy.mappings).length === 0;
}

function issueForType(
  review: RenewConditionReview,
  type: RenewTherapyIssue['issueType'],
): RenewTherapyIssue | undefined {
  return review.issues.find((issue) => issue.issueType === type);
}

export function adherenceConcerns(review: RenewConditionReview): RenewTherapyIssue[] {
  return review.issues.filter((issue) => issue.issueType === 'adherence');
}

export function medicationConcerns(review: RenewConditionReview): RenewTherapyIssue[] {
  return review.issues.filter((issue) => issue.issueType === 'medication_concern');
}

export function reviewHasDocumentedConcerns(review: RenewConditionReview): boolean {
  return review.issues.some(
    (issue) =>
      issue.issueType === 'adherence' ||
      issue.issueType === 'effectiveness' ||
      issue.issueType === 'medication_concern',
  );
}

export type AffectedMedicationSelectorMode = 'HIDDEN' | 'TWO_MED_CHIPS' | 'MULTI_CHECKBOX';

export function getAffectedMedicationSelectorMode(
  linkedMedicationCount: number,
): AffectedMedicationSelectorMode {
  if (linkedMedicationCount <= 1) return 'HIDDEN';
  if (linkedMedicationCount === 2) return 'TWO_MED_CHIPS';
  return 'MULTI_CHECKBOX';
}

export function sameMedicationIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((id, index) => id === right[index]);
}

export function isDuplicateAdherenceConcern(
  existing: RenewTherapyIssue[],
  next: Pick<RenewTherapyIssue, 'medicationIds' | 'issueCategory'>,
  ignoreId?: string | null,
): boolean {
  return existing.some(
    (issue) =>
      issue.issueType === 'adherence' &&
      issue.id !== ignoreId &&
      issue.issueCategory === next.issueCategory &&
      sameMedicationIdSet(issue.medicationIds, next.medicationIds),
  );
}

export function isDuplicateMedicationConcern(
  existing: RenewTherapyIssue[],
  next: Pick<RenewTherapyIssue, 'medicationIds' | 'issueCategory' | 'actionTaken'>,
  ignoreId?: string | null,
): boolean {
  return existing.some(
    (issue) =>
      issue.issueType === 'medication_concern' &&
      issue.id !== ignoreId &&
      issue.issueCategory === next.issueCategory &&
      issue.actionTaken === next.actionTaken &&
      sameMedicationIdSet(issue.medicationIds, next.medicationIds),
  );
}

export function medicationConcernLabel(category?: string | null): string {
  return RENEW_CONCERN_CATEGORIES.find((row) => row.id === category)?.label ?? 'Medication concern';
}

export function medicationConcernActionLabel(action?: string | null): string {
  return RENEW_CONCERN_ACTIONS.find((row) => row.id === action)?.label ?? 'Action documented';
}

export function formatMedicationConcernsNarrative(
  issues: RenewTherapyIssue[],
  medications: RenewMedication[],
): string | null {
  const rows = issues.filter((issue) => issue.issueType === 'medication_concern');
  if (!rows.length) return null;
  return rows
    .map((issue) => {
      const names = linkedMedicationNames(issue.medicationIds, medications);
      const who =
        names.length >= 2
          ? `the regimen (${names.join(' and ')})`
          : names[0] ?? 'the medication';
      const concern =
        issue.issueCategory === 'other'
          ? issue.otherText?.trim() || medicationConcernLabel(issue.issueCategory).toLowerCase()
          : medicationConcernLabel(issue.issueCategory).toLowerCase();
      const action =
        issue.actionTaken === 'other'
          ? issue.otherActionText?.trim() || medicationConcernActionLabel(issue.actionTaken)
          : medicationConcernActionLabel(issue.actionTaken);
      const extra = issue.details?.trim();
      const lead = extra
        ? `${extra.replace(/\.$/, '')} related to ${who}`
        : `${concern} related to ${who}`;
      return extra ? `${lead}. ${action}.` : `${lead[0]!.toUpperCase()}${lead.slice(1)}. ${action}.`;
    })
    .join(' ');
}

export function formatAffectedMedicationsLabel(
  affectedIds: string[],
  linkedIds: string[],
  medications: RenewMedication[],
): string {
  if (!affectedIds.length) return 'selected medications';
  if (linkedIds.length === 2 && sameMedicationIdSet(affectedIds, linkedIds)) {
    return 'both medications';
  }
  if (linkedIds.length > 2 && sameMedicationIdSet(affectedIds, linkedIds)) {
    return 'all medications';
  }
  const names = linkedMedicationNames(affectedIds, medications);
  return names.join(', ') || 'selected medications';
}

export function adherenceIssueLabel(category?: string | null): string {
  return RENEW_ADHERENCE_CATEGORIES.find((row) => row.id === category)?.label ?? 'Adherence concern';
}

const ADHERENCE_NARRATIVE_PHRASE: Record<string, string> = {
  missed_occasionally: 'occasional missed doses',
  missed_frequently: 'frequent missed doses',
  taking_differently: 'taking the medication differently than prescribed',
  stopped: 'the medication was stopped',
  unable_to_obtain: 'unable to obtain the medication',
  prn_instead_of_scheduled: 'taking the medication only when needed',
  timing_issue: 'a dose timing issue',
  administration_difficulty: 'difficulty using the medication',
  cost_access: 'a cost or access issue',
  missed_doses: 'missed doses',
};

export function formatAdherenceConcernsNarrative(
  issues: RenewTherapyIssue[],
  medications: RenewMedication[],
): string | null {
  const rows = issues.filter((issue) => issue.issueType === 'adherence');
  if (!rows.length) return null;
  return rows
    .map((issue) => {
      const names = linkedMedicationNames(issue.medicationIds, medications);
      const who =
        names.length === 2
          ? `both ${names.join(' and ')}`
          : names.length
            ? names.join(' and ')
            : 'the medication';
      const phrase =
        (issue.issueCategory && ADHERENCE_NARRATIVE_PHRASE[issue.issueCategory]) ||
        adherenceIssueLabel(issue.issueCategory).toLowerCase();
      const extra = issue.otherText?.trim() || issue.details?.trim();
      const lead = `Patient reports ${phrase} of ${who}`;
      return extra ? `${lead}. ${extra}` : `${lead}.`;
    })
    .join(' ');
}

export function effectivenessIssue(review: RenewConditionReview): RenewTherapyIssue | undefined {
  return issueForType(review, 'effectiveness');
}

export function formatEffectivenessNarrative(
  review: RenewConditionReview,
  displayName: string,
  conditionCode?: string | null,
): string | null {
  const issue = effectivenessIssue(review);
  if (!issue && !isEffectivenessConcern(review.effectivenessStatus)) return null;
  const copy = getEffectivenessReviewCopy(conditionCode, displayName);
  const extra = issue?.otherText?.trim() || issue?.details?.trim();
  if (isUnableToAssessStatus(review.effectivenessStatus)) {
    const reason = effectivenessReasonLabelFor(issue?.issueCategory, copy.unableReasons);
    const lead = `${displayName} control could not be assessed${reason ? ` because ${reason.toLowerCase()}` : ''}`;
    return extra ? `${lead}. ${extra}` : `${lead}.`;
  }
  if (review.effectivenessStatus === 'no') {
    const reason = effectivenessReasonLabelFor(issue?.issueCategory, copy.noReasons);
    const lead = `${displayName} control appears suboptimal${reason ? ` (${reason.toLowerCase()})` : ''}`;
    return extra ? `${lead}. ${extra}` : `${lead}.`;
  }
  return null;
}

function effectivenessReasonLabelFor(
  reasonId: string | null | undefined,
  options: Array<{ id: string; label: string }>,
): string | null {
  if (!reasonId) return null;
  return options.find((row) => row.id === reasonId)?.label ?? null;
}

function issueComplete(
  review: RenewConditionReview,
  type: RenewTherapyIssue['issueType'],
  medicationCount: number,
): boolean {
  if (type === 'adherence') {
    const issues = adherenceConcerns(review);
    if (!issues.length) return false;
    return issues.every((issue) => {
      if (!issue.issueCategory) return false;
      if (issue.issueCategory === 'other' && !issue.otherText?.trim()) return false;
      if (medicationCount > 1 && issue.medicationIds.length === 0) return false;
      return true;
    });
  }
  if (type === 'medication_concern') {
    const issues = medicationConcerns(review);
    if (!issues.length) return false;
    return issues.every((issue) => {
      if (!issue.issueCategory || !issue.actionTaken) return false;
      if (issue.issueCategory === 'other' && !issue.otherText?.trim()) return false;
      if (issue.actionTaken === 'other' && !issue.otherActionText?.trim()) return false;
      if (medicationCount > 1 && issue.medicationIds.length === 0) return false;
      return true;
    });
  }
  const issue = issueForType(review, type);
  if (!issue) return false;
  if (type === 'effectiveness') {
    if (issue.issueCategory === 'other' && !issue.otherText?.trim()) return false;
    return Boolean(issue.issueCategory) || Boolean(issue.details?.trim());
  }
  return false;
}

export function isConditionReviewComplete(
  review: RenewConditionReview,
  medicationCount: number,
): boolean {
  return therapyReviewFieldErrors(review, medicationCount).length === 0;
}

export type ConditionReviewCompletion =
  | 'INCOMPLETE'
  | 'COMPLETE_STABLE'
  | 'COMPLETE_WITH_CONCERN'
  | 'COMPLETE_UNABLE_TO_ASSESS';

export function getConditionReviewCompletion(
  review: RenewConditionReview,
  medicationCount: number,
): ConditionReviewCompletion {
  if (!isConditionReviewComplete(review, medicationCount)) return 'INCOMPLETE';
  if (isUnableToAssessStatus(review.effectivenessStatus)) return 'COMPLETE_UNABLE_TO_ASSESS';
  if (
    review.adherenceStatus === 'no' ||
    review.effectivenessStatus === 'no' ||
    review.medicationConcernStatus === 'yes'
  ) {
    return 'COMPLETE_WITH_CONCERN';
  }
  return 'COMPLETE_STABLE';
}

export function therapyReviewIntegrityError(review: RenewConditionReview): string | null {
  if (adherenceConcerns(review).length > 0 && review.adherenceStatus !== 'no') {
    return 'Adherence concerns require Taking as prescribed = No.';
  }
  if (issueForType(review, 'effectiveness') && !isEffectivenessConcern(review.effectivenessStatus)) {
    return 'Effectiveness concerns require No or Unable to assess.';
  }
  if (issueForType(review, 'medication_concern') && review.medicationConcernStatus !== 'yes') {
    return 'Medication-related concerns require Yes.';
  }
  return null;
}

function exceptionGlanceDetail(review: RenewConditionReview): string {
  if (isUnableToAssessStatus(review.effectivenessStatus)) return 'Unable to assess';
  if (review.adherenceStatus === 'no') return 'Adherence concern';
  if (review.effectivenessStatus === 'no') return 'Effectiveness concern';
  if (review.medicationConcernStatus === 'yes') return 'Medication-related concern';
  return 'Exception documented';
}

export type TherapyReviewField = 'adherence' | 'effectiveness' | 'medicationConcern';

export interface TherapyReviewFieldError {
  field: TherapyReviewField;
  message: string;
}

export function therapyReviewFieldErrors(
  review: RenewConditionReview,
  medicationCount: number,
): TherapyReviewFieldError[] {
  const errors: TherapyReviewFieldError[] = [];
  if (!review.adherenceStatus) {
    errors.push({
      field: 'adherence',
      message: 'Select whether the patient is taking this as prescribed.',
    });
  } else if (review.adherenceStatus === 'no' && !issueComplete(review, 'adherence', medicationCount)) {
    errors.push({
      field: 'adherence',
      message: 'Document the adherence concern, then save it.',
    });
  }

  if (!review.effectivenessStatus) {
    errors.push({
      field: 'effectiveness',
      message: 'Select whether therapy is effective / the condition is stable.',
    });
  } else if (
    isEffectivenessConcern(review.effectivenessStatus) &&
    !issueComplete(review, 'effectiveness', medicationCount)
  ) {
    errors.push({
      field: 'effectiveness',
      message: isUnableToAssessStatus(review.effectivenessStatus)
        ? 'Select why control cannot be assessed, then save it.'
        : 'Document the effectiveness concern, then save it.',
    });
  }

  if (!review.medicationConcernStatus) {
    errors.push({
      field: 'medicationConcern',
      message: 'Select whether there are any medication-related concerns.',
    });
  } else if (
    review.medicationConcernStatus === 'yes' &&
    !issueComplete(review, 'medication_concern', medicationCount)
  ) {
    errors.push({
      field: 'medicationConcern',
      message: 'Document the medication-related concern to continue.',
    });
  }
  return errors;
}

export function evaluateTherapyReviewGate(
  items: RenewMedication[],
  therapy: RenewTherapyReviewState,
  catalog: RenewConditionCatalogItem[],
): TherapyReviewGate {
  const groups = groupTherapyConditions(items, therapy, catalog).filter(isConfirmedConditionGroup);
  const reviewGroups = groups.filter(isReviewableConditionGroup);
  const unresolvedMedicationIds = unresolvedMappings(items, therapy.mappings).map((med) => med.id);
  const incompleteReviewKeys: string[] = [];
  const incompleteIssueKeys: string[] = [];

  for (const group of reviewGroups) {
    if (!isConditionReviewComplete(group.review, group.medicationIds.length)) {
      incompleteReviewKeys.push(group.key);
      const r = group.review;
      if (r.adherenceStatus === 'no' && !issueComplete(r, 'adherence', group.medicationIds.length)) {
        incompleteIssueKeys.push(`${group.key}:adherence`);
      }
      if (
        isEffectivenessConcern(r.effectivenessStatus) &&
        !issueComplete(r, 'effectiveness', group.medicationIds.length)
      ) {
        incompleteIssueKeys.push(`${group.key}:effectiveness`);
      }
      if (
        r.medicationConcernStatus === 'yes' &&
        !issueComplete(r, 'medication_concern', group.medicationIds.length)
      ) {
        incompleteIssueKeys.push(`${group.key}:concern`);
      }
    }
  }

  const linkedCount = items.length - unresolvedMedicationIds.length;
  const conditionsConfirmed = groups.length;
  const reviewableCount = reviewGroups.length;
  const adherenceReviewedCount = reviewGroups.filter(
    (g) =>
      g.review.adherenceStatus === 'yes' ||
      (g.review.adherenceStatus === 'no' && issueComplete(g.review, 'adherence', g.medicationIds.length)),
  ).length;
  const effectivenessReviewedCount = reviewGroups.filter((g) =>
    g.review.effectivenessStatus === 'yes' ||
    (isEffectivenessConcern(g.review.effectivenessStatus) &&
      issueComplete(g.review, 'effectiveness', g.medicationIds.length)),
  ).length;
  const tolerabilityReviewedCount = reviewGroups.filter(
    (g) =>
      g.review.medicationConcernStatus === 'no' ||
      (g.review.medicationConcernStatus === 'yes' &&
        issueComplete(g.review, 'medication_concern', g.medicationIds.length)),
  ).length;
  const adherenceReviewed = reviewableCount > 0 && adherenceReviewedCount === reviewableCount;
  const effectivenessReviewed =
    reviewableCount > 0 && effectivenessReviewedCount === reviewableCount;
  const tolerabilityReviewed =
    reviewableCount > 0 && tolerabilityReviewedCount === reviewableCount;
  const adherenceConcernCount = reviewGroups.filter(
    (g) => g.review.adherenceStatus === 'no' && adherenceConcerns(g.review).length > 0,
  ).length;
  const effectivenessConcernCount = reviewGroups.filter(
    (g) => g.review.effectivenessStatus === 'no' && issueForType(g.review, 'effectiveness'),
  ).length;
  const unableToAssessCount = reviewGroups.filter(
    (g) =>
      isUnableToAssessStatus(g.review.effectivenessStatus) &&
      issueForType(g.review, 'effectiveness'),
  ).length;
  const medicationConcernCount = reviewGroups.filter(
    (g) =>
      g.review.medicationConcernStatus === 'yes' &&
      issueComplete(g.review, 'medication_concern', g.medicationIds.length),
  ).length;
  const completions = reviewGroups.map((g) => ({
    group: g,
    completion: getConditionReviewCompletion(g.review, g.medicationIds.length),
  }));
  const conditionsReviewedCount = completions.filter((row) => row.completion !== 'INCOMPLETE').length;
  const exceptionRows = completions.filter(
    (row) =>
      row.completion === 'COMPLETE_WITH_CONCERN' || row.completion === 'COMPLETE_UNABLE_TO_ASSESS',
  );
  const exceptionsDocumentedCount = exceptionRows.length;
  const concernCount = exceptionsDocumentedCount;
  const exceptionGlance = exceptionRows.map((row) => ({
    key: row.group.key,
    label: row.group.displayName,
    detail: exceptionGlanceDetail(row.group.review),
  }));
  const itemsNeedingCompletion = incompleteReviewKeys.length;

  const ok =
    items.length > 0 &&
    unresolvedMedicationIds.length === 0 &&
    incompleteReviewKeys.length === 0 &&
    reviewGroups.length > 0;

  let therapyStatus: TherapyReviewGate['therapyStatus'] = 'not_started';
  if (ok) therapyStatus = 'complete';
  else if (
    reviewGroups.some(
      (g) =>
        g.review.adherenceStatus ||
        g.review.effectivenessStatus ||
        g.review.medicationConcernStatus,
    )
  ) {
    therapyStatus = 'in_progress';
  }

  return {
    ok,
    unresolvedMedicationIds,
    incompleteReviewKeys,
    incompleteIssueKeys,
    attentionCount: unresolvedMedicationIds.length + incompleteReviewKeys.length,
    linkedCount,
    totalMedications: items.length,
    conditionsConfirmed,
    conditionsReviewedCount,
    exceptionsDocumentedCount,
    itemsNeedingCompletion,
    exceptionGlance,
    adherenceReviewed,
    effectivenessReviewed,
    tolerabilityReviewed,
    adherenceReviewedCount,
    effectivenessReviewedCount,
    tolerabilityReviewedCount,
    reviewableCount,
    concernCount,
    adherenceConcernCount,
    effectivenessConcernCount,
    unableToAssessCount,
    medicationConcernCount,
    therapyStatus,
  };
}

export interface ApplyStableResponsesResult {
  reviews: RenewConditionReview[];
  updatedCount: number;
  preservedCount: number;
  skippedUnsavedCount: number;
}

export function applyStableResponses(
  reviews: RenewConditionReview[],
  mappings: RenewMedicationIndication[] = [],
  options?: { skipReviewIds?: Iterable<string> },
): ApplyStableResponsesResult {
  const skip = new Set(options?.skipReviewIds ?? []);
  const linkedKeys = new Set(
    mappings
      .filter(isIndicationResolved)
      .map((row) => conditionGroupKey(row.conditionId, row.customIndicationText)),
  );
  let updatedCount = 0;
  let preservedCount = 0;
  let skippedUnsavedCount = 0;

  const nextReviews = reviews.map((review) => {
    const key = conditionGroupKey(review.conditionId, review.customConditionText);
    const linked = linkedKeys.size > 0 ? linkedKeys.has(key) : !review.manuallyPreserved;
    if (!linked) return review;
    if (skip.has(review.id)) {
      skippedUnsavedCount += 1;
      return review;
    }

    const next: RenewConditionReview = { ...review };
    let changed = false;
    if (!next.adherenceStatus) {
      next.adherenceStatus = 'yes';
      changed = true;
    }
    if (!next.effectivenessStatus) {
      next.effectivenessStatus = 'yes';
      changed = true;
    }
    if (!next.medicationConcernStatus) {
      next.medicationConcernStatus = 'no';
      changed = true;
    }
    if (!changed) {
      if (
        review.adherenceStatus ||
        review.effectivenessStatus ||
        review.medicationConcernStatus ||
        reviewHasDocumentedConcerns(review)
      ) {
        preservedCount += 1;
      }
      return review;
    }
    if (!review.adherenceStatus && !review.effectivenessStatus && !review.medicationConcernStatus) {
      next.answerSource = 'pharmacist_bulk_action';
    } else if (!next.answerSource) {
      next.answerSource = 'pharmacist_bulk_action';
    }
    if (reviewHasDocumentedConcerns(review) || review.adherenceStatus || review.effectivenessStatus) {
      preservedCount += 1;
    }
    updatedCount += 1;
    return next;
  });

  return {
    reviews: nextReviews,
    updatedCount,
    preservedCount,
    skippedUnsavedCount,
  };
}

export function formatConditionCategory(category: string | null | undefined): string | null {
  const raw = category?.trim();
  if (!raw) return null;
  const words = raw
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return null;
  const [first, ...rest] = words;
  return [`${first![0]!.toUpperCase()}${first!.slice(1)}`, ...rest].join(' ');
}

export function therapyReviewProgressCopy(input: {
  reviewedCount: number;
  totalCount: number;
  findingCount: number;
}): string {
  const reviewed = Math.max(0, input.reviewedCount);
  const total = Math.max(0, input.totalCount);
  const findings = Math.max(0, input.findingCount);
  if (total === 0) return 'No conditions to review';
  if (reviewed < total) return `${reviewed} of ${total} reviewed`;
  if (findings === 0) return `${reviewed} reviewed · No findings`;
  return `${reviewed} reviewed · ${findings} finding${findings === 1 ? '' : 's'}`;
}

/**
 * Internal model keeps effectivenessStatus `yes` = therapy is effective/stable.
 * The pharmacist-facing question is inverted: “Effectiveness / stability concerns?”
 */
export function effectivenessConcernAnswer(
  status: string | null | undefined,
): 'yes' | 'no' | null {
  if (status === 'yes') return 'no';
  if (status === 'no' || isUnableToAssessStatus(status)) return 'yes';
  return null;
}

export function effectivenessStatusFromConcernAnswer(
  answer: 'yes' | 'no' | null,
): 'yes' | 'no' | null {
  if (answer === 'no') return 'yes';
  if (answer === 'yes') return 'no';
  return null;
}

export function undoBulkStablePatch(
  current: RenewConditionReview,
  previous: RenewConditionReview,
): Partial<
  Pick<RenewConditionReview, 'adherenceStatus' | 'effectivenessStatus' | 'medicationConcernStatus'>
> | null {
  const patch: Partial<
    Pick<RenewConditionReview, 'adherenceStatus' | 'effectivenessStatus' | 'medicationConcernStatus'>
  > = {};
  if (previous.adherenceStatus == null && current.adherenceStatus === 'yes') {
    patch.adherenceStatus = null;
  }
  if (previous.effectivenessStatus == null && current.effectivenessStatus === 'yes') {
    patch.effectivenessStatus = null;
  }
  if (previous.medicationConcernStatus == null && current.medicationConcernStatus === 'no') {
    patch.medicationConcernStatus = null;
  }
  return Object.keys(patch).length ? patch : null;
}

export function applyStableToReviews(
  reviews: RenewConditionReview[],
  mappings: RenewMedicationIndication[] = [],
  options?: { skipReviewIds?: Iterable<string> },
): RenewConditionReview[] {
  return applyStableResponses(reviews, mappings, options).reviews;
}

export function confirmAllMappings(
  mappings: RenewMedicationIndication[],
): RenewMedicationIndication[] {
  return mappings.map((mapping) =>
    isIndicationResolved(mapping)
      ? {
          ...mapping,
          pharmacistConfirmed: true,
          status: mapping.customIndicationText && !mapping.conditionId ? 'custom' : 'pharmacist_confirmed',
        }
      : mapping,
  );
}

export function linkedMedicationNames(
  medicationIds: string[],
  items: RenewMedication[],
): string[] {
  const byId = new Map(items.map((med) => [med.id, med]));
  return medicationIds
    .map((id) => byId.get(id))
    .filter((med): med is RenewMedication => Boolean(med))
    .map(medicationShortName);
}

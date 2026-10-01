import type { PathwayReference } from '../assessment/assessment-types';
import { asArray, asRecord, asString, normalizeDifferentials } from '../safe-data';

export type SafetyOutcomeKind =
  | 'continue'
  | 'continue_with_caution'
  | 'requires_clarification'
  | 'referral_recommended'
  | 'do_not_proceed_in_pathway';

export type SafetyOutcome = {
  kind: SafetyOutcomeKind;
  title: string;
  detail?: string;
  requiresResolution: boolean;
  allowJudgmentOverride: boolean;
};

export type ClinicalReviewAuditEvent = {
  action: string;
  at: string;
  subjectId?: string;
};

export type PharmacistDifferential = {
  id: string;
  displayName: string;
  source: 'pharmacist';
  addedBy?: string;
  addedAt?: string;
  order: number;
};

export type DifferentialReviewState = {
  reviewed: boolean;
  reviewedBy?: string;
  reviewedAt?: string;
  pharmacistAddedDifferentials: PharmacistDifferential[];
  auditEvents: ClinicalReviewAuditEvent[];
};

export type DifferentialViewItem = {
  id: string;
  displayName: string;
  frequencyLabel: 'common' | 'less_common' | 'rare' | null;
  distinguishingFeatures: string[];
  rationale?: string;
  remember?: string;
  screeningQuestion?: string;
  positiveResult?: string;
  required?: boolean;
  evidenceRefIds: string[];
  source: 'pathway' | 'pharmacist';
  addedBy?: string;
  addedAt?: string;
  order: number;
};

export type RedFlagViewItem = {
  id: string;
  label: string;
  whyText?: string;
  required: boolean;
  evidenceRefIds: string[];
  outcome: SafetyOutcome;
  actionCode?: string;
};

const NAME_MAX = 100;

export function clampDifferentialName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

export function splitFeatureLines(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(/\n+|•|(?:^|\s)[–—-]\s+/)
    .map((line) => line.replace(/^[-–—*•]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 8);
}

function frequencyOf(value: unknown): DifferentialViewItem['frequencyLabel'] {
  const raw = asString(value).toUpperCase();
  if (raw === 'COMMON') return 'common';
  if (raw === 'LESS_COMMON') return 'less_common';
  if (raw === 'RARE') return 'rare';
  return null;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => asString(item).trim()).filter(Boolean);
  }
  const single = asString(value).trim();
  return single ? [single] : [];
}

export function mapPathwayDifferentials(raw: unknown): DifferentialViewItem[] {
  const normalized = normalizeDifferentials(raw);
  const rawById = new Map<string, Record<string, unknown>>();
  asArray(raw).forEach((row, index) => {
    const rec = asRecord(row);
    if (!rec) return;
    rawById.set(asString(rec.id, `ddx-${index}`), rec);
  });
  return normalized.map((item, index) => {
    const rec = rawById.get(item.id) ?? {};
    const features = [
      ...splitFeatureLines(item.distinguishingFeatures),
      ...splitFeatureLines(item.keySymptoms),
    ];
    const uniqueFeatures = features.filter((line, featureIndex) => features.indexOf(line) === featureIndex);
    const rationale =
      asString(rec.whyItMatters || rec.rationale || item.whyItMatters || item.recommendedAction).trim() ||
      undefined;
    const remember = asString(rec.remember || rec.clinicalReminder || rec.reminder).trim() || undefined;
    return {
      id: item.id,
      displayName: item.condition,
      frequencyLabel: frequencyOf(item.likelihood),
      distinguishingFeatures: uniqueFeatures,
      rationale,
      remember,
      screeningQuestion: item.question?.trim() || undefined,
      positiveResult: item.suggestedPathway?.trim() || undefined,
      required: item.required !== false,
      evidenceRefIds: item.evidenceRefIds.length
        ? item.evidenceRefIds
        : stringList(rec.evidenceRefIds ?? rec.referenceIds),
      source: 'pathway',
      order: index,
    };
  });
}

export function pharmacistItem(item: PharmacistDifferential): DifferentialViewItem {
  return {
    id: item.id,
    displayName: item.displayName,
    frequencyLabel: null,
    distinguishingFeatures: [],
    evidenceRefIds: [],
    source: 'pharmacist',
    addedBy: item.addedBy,
    addedAt: item.addedAt,
    order: item.order,
  };
}

export function emptyDifferentialReview(): DifferentialReviewState {
  return { reviewed: false, pharmacistAddedDifferentials: [], auditEvents: [] };
}

export function parseDifferentialReview(value: unknown): DifferentialReviewState {
  const rec = asRecord(value);
  if (!rec) return emptyDifferentialReview();
  const added = asArray(rec.pharmacistAddedDifferentials).flatMap((row, index) => {
    const item = asRecord(row);
    if (!item) return [];
    const displayName = clampDifferentialName(asString(item.displayName || item.condition));
    if (!displayName) return [];
    return [
      {
        id: asString(item.id, `added-${index}`),
        displayName,
        source: 'pharmacist' as const,
        addedBy: asString(item.addedBy) || undefined,
        addedAt: asString(item.addedAt) || undefined,
        order: typeof item.order === 'number' ? item.order : index,
      },
    ];
  });
  const events = asArray(rec.auditEvents).flatMap((row) => {
    const item = asRecord(row);
    if (!item) return [];
    const action = asString(item.action).trim();
    const at = asString(item.at).trim();
    if (!action || !at) return [];
    return [{ action, at, subjectId: asString(item.subjectId) || undefined }];
  });
  return {
    reviewed: rec.reviewed === true,
    reviewedBy: asString(rec.reviewedBy) || undefined,
    reviewedAt: asString(rec.reviewedAt) || undefined,
    pharmacistAddedDifferentials: added,
    auditEvents: events.slice(-40),
  };
}

export function reviewedFromLegacyQuestion(value: unknown): boolean {
  const rec = asRecord(value);
  if (!rec) return false;
  return rec.answer === true || asString(rec.answerText).toLowerCase() === 'reviewed';
}

export function redFlagLabel(title: string | null | undefined): string {
  const text = String(title ?? '')
    .replace(/^is the following present:\s*/i, '')
    .trim();
  if (!text) return 'Safety finding?';
  return text.endsWith('?') ? text : `${text}?`;
}

export function mapSafetyOutcome(input: {
  action?: string | null;
  severity?: string | null;
  description?: string | null;
}): SafetyOutcome {
  const action = input.action?.trim() ?? '';
  const code = action.toUpperCase();
  const detail = action && !/^[A-Z][A-Z0-9_]+$/.test(action) ? action : input.description?.trim() || undefined;
  const severity = (input.severity ?? '').toUpperCase();

  if (code === 'EMERGENCY' || severity === 'EMERGENCY') {
    return {
      kind: 'do_not_proceed_in_pathway',
      title: 'Do not proceed in this pathway',
      detail: detail ?? 'This finding may require emergency or medical assessment.',
      requiresResolution: true,
      allowJudgmentOverride: false,
    };
  }
  if (code === 'PATHWAY_EXCLUDED') {
    return {
      kind: 'do_not_proceed_in_pathway',
      title: 'Pathway not appropriate',
      detail: detail ?? 'This finding excludes treatment through this pathway.',
      requiresResolution: true,
      allowJudgmentOverride: true,
    };
  }
  if (code === 'IMMEDIATE_REFERRAL' || code === 'SAME_DAY_PHYSICIAN' || severity === 'CRITICAL') {
    return {
      kind: 'referral_recommended',
      title: 'Referral / further assessment recommended',
      detail: detail ?? 'This finding may require medical assessment.',
      requiresResolution: true,
      allowJudgmentOverride: severity !== 'CRITICAL',
    };
  }
  if (code === 'PHARMACIST_DISCRETION') {
    return {
      kind: 'continue_with_caution',
      title: 'Continue with clinical judgment',
      detail: detail ?? 'Pathway rules leave this finding to pharmacist judgment.',
      requiresResolution: false,
      allowJudgmentOverride: true,
    };
  }
  if (action || severity === 'WARNING') {
    return {
      kind: 'referral_recommended',
      title: 'Referral / further assessment recommended',
      detail: detail ?? 'This finding may require referral or further assessment.',
      requiresResolution: true,
      allowJudgmentOverride: severity !== 'CRITICAL' && severity !== 'EMERGENCY',
    };
  }
  return {
    kind: 'requires_clarification',
    title: 'Further assessment recommended',
    detail: 'Pathway rules do not define an automatic action for this finding.',
    requiresResolution: true,
    allowJudgmentOverride: true,
  };
}

export function mapRedFlagItems(
  raw: unknown,
): RedFlagViewItem[] {
  return asArray(raw).flatMap((row, index) => {
    const rec = asRecord(row);
    if (!rec) return [];
    const title = asString(rec.title || rec.flag || rec.name).trim();
    if (!title) return [];
    const action = asString(rec.action || rec.recommendedAction) || undefined;
    const description = asString(rec.question || rec.description || rec.reasoning) || undefined;
    const why =
      asString(rec.whyItMatters || rec.whyText || rec.why || description).trim() || undefined;
    const severity = asString(rec.severity, 'WARNING');
    return [
      {
        id: asString(rec.id, `pathway-rf-${index}`),
        label: redFlagLabel(title),
        whyText: why,
        required: rec.required !== false,
        evidenceRefIds: stringList(rec.evidenceRefIds ?? rec.referenceIds),
        outcome: mapSafetyOutcome({ action, severity, description }),
        actionCode: action,
      },
    ];
  });
}

export function referencesForIds(
  references: PathwayReference[],
  ids: string[],
  itemId: string,
): PathwayReference[] {
  const tokens = new Set(
    [itemId, ...ids].map((id) => id.trim().toLowerCase()).filter(Boolean),
  );
  if (!tokens.size) return [];
  const matched = references.filter((reference) => {
    if (ids.length && tokens.has(reference.id.trim().toLowerCase())) return true;
    return reference.supportsSections.some((sectionName) => {
      const token = sectionName.trim().toLowerCase();
      return tokens.has(token);
    });
  });
  const seen = new Set<string>();
  return matched.filter((reference) => {
    if (seen.has(reference.id)) return false;
    seen.add(reference.id);
    return true;
  });
}

export function sectionReferences(
  references: PathwayReference[],
  section: 'differential' | 'red-flag',
): PathwayReference[] {
  const token = section === 'red-flag' ? 'red' : 'differential';
  return references.filter((reference) =>
    reference.supportsSections.some((sectionName) => {
      const value = sectionName.trim().toLowerCase();
      return value.includes(token) || value.includes(section);
    }),
  );
}

export function safetyScreenComplete(
  flags: Array<{ id: string; required: boolean }>,
  answers: Record<string, 'yes' | 'no' | null | undefined>,
): boolean {
  return flags
    .filter((flag) => flag.required)
    .every((flag) => answers[flag.id] === 'yes' || answers[flag.id] === 'no');
}

export function unresolvedSafetyIds(input: {
  flags: RedFlagViewItem[];
  answers: Record<string, 'yes' | 'no' | null | undefined>;
  resolvedIds: ReadonlySet<string>;
}): string[] {
  return input.flags
    .filter((flag) => {
      if (input.answers[flag.id] !== 'yes') return false;
      if (!flag.outcome.requiresResolution) return false;
      return !input.resolvedIds.has(flag.id);
    })
    .map((flag) => flag.id);
}

export function canContinueToTreatment(input: {
  differentialReviewed: boolean;
  safetyComplete: boolean;
  unresolvedSafetyIds: string[];
}): boolean {
  return (
    input.differentialReviewed &&
    input.safetyComplete &&
    input.unresolvedSafetyIds.length === 0
  );
}

export function appendAudit(
  state: DifferentialReviewState,
  action: string,
  subjectId?: string,
  at = new Date().toISOString(),
): DifferentialReviewState {
  return {
    ...state,
    auditEvents: [...state.auditEvents, { action, at, subjectId }].slice(-40),
  };
}

export function duplicateDifferentialName(
  name: string,
  pathwayNames: string[],
  added: PharmacistDifferential[],
  ignoreId?: string,
): boolean {
  const key = clampDifferentialName(name).toLowerCase();
  if (!key) return false;
  if (pathwayNames.some((item) => item.trim().toLowerCase() === key)) return true;
  return added.some((item) => item.id !== ignoreId && item.displayName.toLowerCase() === key);
}

import { uniqueIdList } from '@safescript/shared';
import { RED_FLAG_ACTIONS } from '../pathway-constants';
import type { PathwayEvidenceMapping, RedFlag } from '../types';

export const RED_FLAGS_SUBTITLE =
  'Warning signs that need urgent action, referral, or stopping treatment.';

export const RED_FLAGS_BANNER =
  'If any red flag is present, follow the recommended action. This section does not replace your clinical judgement.';

export function actionLabel(action: string | null | undefined): string {
  if (!action) return '';
  return RED_FLAG_ACTIONS.find((a) => a.value === action)?.label ?? action;
}

export function redFlagQuestionText(flag: Pick<RedFlag, 'question' | 'description'>): string {
  return (flag.question?.trim() || flag.description?.trim() || '').trim();
}

export function duplicateRedFlagTitle(title: string): string {
  const trimmed = title.trim();
  return /\bcopy$/i.test(trimmed) ? trimmed : `${trimmed} Copy`;
}

export function linkedIdsForRedFlag(
  flag: Pick<RedFlag, 'id' | 'evidenceRefIds'>,
  mappings: PathwayEvidenceMapping[] = [],
): string[] {
  return uniqueIdList([
    ...(flag.evidenceRefIds ?? []),
    ...mappings
      .filter(
        (m) =>
          m.section === 'red_flags' &&
          m.mappingType === 'red_flag' &&
          m.targetId === flag.id,
      )
      .map((m) => m.referenceId),
  ]);
}

export function sectionEvidenceIds(mappings: PathwayEvidenceMapping[] = []): string[] {
  return uniqueIdList(
    mappings
      .filter((m) => m.section === 'red_flags' && m.mappingType === 'section')
      .map((m) => m.referenceId),
  );
}

export function toRedFlagPayload(flag: RedFlag) {
  const question = redFlagQuestionText(flag) || null;
  return {
    id: flag.id || undefined,
    title: flag.title,
    severity: flag.severity,
    description: question,
    question,
    whyItMatters: flag.whyItMatters?.trim() || null,
    actionNote: flag.actionNote?.trim() || null,
    action: flag.action ?? null,
    required: flag.required !== false,
    evidenceRefIds: uniqueIdList(flag.evidenceRefIds ?? []),
  };
}

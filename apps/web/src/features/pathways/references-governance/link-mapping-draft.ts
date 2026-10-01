import { EVIDENCE_SECTIONS, SECTION_FULL_LABELS, type EvidenceSection } from '@safescript/shared';
import type { ClinicalPathway, PathwayEvidenceMapping } from '../types';

export type DraftKey = string;

export type SectionItem = { id: string; label: string; mappingType: string };

export type SectionGroup = {
  section: EvidenceSection;
  label: string;
  sectionKey: DraftKey;
  items: SectionItem[];
  itemKeys: DraftKey[];
};

export function keyOf(section: string, mappingType: string, targetId?: string | null): DraftKey {
  return `${section}::${mappingType}::${targetId?.trim() || ''}`;
}

export function parseKey(key: DraftKey): {
  section: string;
  mappingType: string;
  targetId: string | null;
} {
  const [section, mappingType, targetId = ''] = key.split('::');
  return { section, mappingType, targetId: targetId || null };
}

export function eligibleItems(
  pathway: ClinicalPathway,
  section: EvidenceSection,
): SectionItem[] {
  if (section === 'presentation_review') {
    return (pathway.questions ?? []).map((q, i) => ({
      id: q.id,
      label: `Q${i + 1} ${q.question}`,
      mappingType: 'question',
    }));
  }
  if (section === 'differential_review') {
    return (pathway.differentials ?? []).map((d) => ({
      id: d.id,
      label: d.condition,
      mappingType: 'differential',
    }));
  }
  if (section === 'red_flags') {
    return (pathway.redFlags ?? []).map((f) => ({
      id: f.id,
      label: f.title,
      mappingType: 'red_flag',
    }));
  }
  if (section === 'treatment_options') {
    return (pathway.treatments ?? [])
      .filter((t) => t.isActive !== false && !t.archivedAt)
      .map((t) => ({
        id: t.id,
        label: t.medicationName,
        mappingType: 'treatment',
      }));
  }
  return (pathway.counsellings ?? [])
    .filter((c) => !c.archivedAt)
    .map((c) => ({
      id: c.id,
      label: c.point,
      mappingType: 'guidance',
    }));
}

export function buildGroups(pathway: ClinicalPathway): SectionGroup[] {
  return EVIDENCE_SECTIONS.map((section) => {
    const items = eligibleItems(pathway, section);
    return {
      section,
      label: SECTION_FULL_LABELS[section],
      sectionKey: keyOf(section, 'section', null),
      items,
      itemKeys: items.map((item) => keyOf(section, item.mappingType, item.id)),
    };
  });
}

/** Build the initial draft, expanding section-wide → every item in that section. */
export function buildExpandedDraft(
  existing: PathwayEvidenceMapping[],
  groups: SectionGroup[],
): Set<DraftKey> {
  const next = new Set(
    existing.map((m) => keyOf(m.section, m.mappingType, m.targetId)),
  );
  for (const group of groups) {
    if (!next.has(group.sectionKey)) continue;
    for (const itemKey of group.itemKeys) next.add(itemKey);
  }
  return next;
}

export function sectionSelectionState(draft: Set<DraftKey>, group: SectionGroup) {
  const selectedCount = group.itemKeys.reduce(
    (count, key) => count + (draft.has(key) ? 1 : 0),
    0,
  );
  const allItemsSelected =
    group.itemKeys.length > 0 && selectedCount === group.itemKeys.length;
  const someItemsSelected = selectedCount > 0 && !allItemsSelected;
  const sectionWide = draft.has(group.sectionKey);
  return {
    selectedCount,
    allItemsSelected,
    someItemsSelected,
    sectionWide,
    /** Master checkbox: on when section-wide or every item is selected. */
    applyAllChecked: sectionWide || allItemsSelected,
    applyAllIndeterminate: !sectionWide && someItemsSelected,
  };
}

export function applyAllToDraft(
  prev: Set<DraftKey>,
  group: SectionGroup,
  turnOn: boolean,
): Set<DraftKey> {
  const next = new Set(prev);
  if (turnOn) {
    next.add(group.sectionKey);
    for (const key of group.itemKeys) next.add(key);
  } else {
    next.delete(group.sectionKey);
    for (const key of group.itemKeys) next.delete(key);
  }
  return next;
}

export function toggleItemInDraft(
  prev: Set<DraftKey>,
  group: SectionGroup,
  itemKey: DraftKey,
): Set<DraftKey> {
  const next = new Set(prev);
  if (next.has(itemKey)) next.delete(itemKey);
  else next.add(itemKey);

  const allSelected =
    group.itemKeys.length > 0 && group.itemKeys.every((key) => next.has(key));
  if (allSelected) next.add(group.sectionKey);
  else next.delete(group.sectionKey);

  return next;
}

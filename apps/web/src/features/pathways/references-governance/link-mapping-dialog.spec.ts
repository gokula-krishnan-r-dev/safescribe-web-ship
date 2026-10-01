import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyAllToDraft,
  buildExpandedDraft,
  buildGroups,
  sectionSelectionState,
  toggleItemInDraft,
} from './link-mapping-draft';
import type { ClinicalPathway, PathwayEvidenceMapping } from '../types';

describe('link-mapping apply-to-all', () => {
  const pathway = {
    questions: [
      { id: 'q1', question: 'Tingling?' },
      { id: 'q2', question: 'Recurrent?' },
    ],
    differentials: [],
    redFlags: [],
    treatments: [],
    counsellings: [],
  } as unknown as ClinicalPathway;

  it('expands section-wide into every presentation item key', () => {
    const groups = buildGroups(pathway);
    const existing: PathwayEvidenceMapping[] = [
      {
        id: 'm1',
        pathwayId: 'p1',
        referenceId: 'r1',
        section: 'presentation_review',
        mappingType: 'section',
        targetId: null,
        suggested: true,
      },
    ];

    const draft = buildExpandedDraft(existing, groups);
    assert.equal(draft.has('presentation_review::section::'), true);
    assert.equal(draft.has('presentation_review::question::q1'), true);
    assert.equal(draft.has('presentation_review::question::q2'), true);

    const presentation = groups.find((g) => g.section === 'presentation_review')!;
    const state = sectionSelectionState(draft, presentation);
    assert.equal(state.applyAllChecked, true);
    assert.equal(state.selectedCount, 2);
  });

  it('apply-all selects and clears every item', () => {
    const presentation = buildGroups(pathway).find((g) => g.section === 'presentation_review')!;
    const on = applyAllToDraft(new Set(), presentation, true);
    assert.equal(on.has(presentation.sectionKey), true);
    assert.equal(on.has(presentation.itemKeys[0]!), true);
    assert.equal(on.has(presentation.itemKeys[1]!), true);

    const off = applyAllToDraft(on, presentation, false);
    assert.equal(off.size, 0);
  });

  it('toggling one item off clears apply-all / section-wide', () => {
    const presentation = buildGroups(pathway).find((g) => g.section === 'presentation_review')!;
    const all = applyAllToDraft(new Set(), presentation, true);
    const next = toggleItemInDraft(all, presentation, presentation.itemKeys[0]!);
    assert.equal(next.has(presentation.sectionKey), false);
    assert.equal(next.has(presentation.itemKeys[0]!), false);
    assert.equal(next.has(presentation.itemKeys[1]!), true);
    assert.equal(sectionSelectionState(next, presentation).applyAllIndeterminate, true);
  });
});

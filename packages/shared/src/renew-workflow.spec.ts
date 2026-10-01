import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  answersMatchTrigger,
  indicationMatches,
  ingredientAliasMatches,
  strongerRequirement,
  toRenewValueShape,
} from './renew-workflow';
import { classAliasMembers } from './renew-class-aliases';

describe('renew workflow matching', () => {
  it('matches spreadsheet ingredient aliases to captured medication keys', () => {
    assert.equal(ingredientAliasMatches('METFORMIN', ['metformin', 'glucophage']), true);
    assert.equal(ingredientAliasMatches('DOXYLAMINE_PYRIDOXINE', ['doxylamine', 'diclectin']), true);
    assert.equal(ingredientAliasMatches('RAMIPRIL', ['atorvastatin']), false);
  });

  it('treats ANY indication as a match and HTN as equivalent to hypertension alias', () => {
    assert.equal(indicationMatches('ANY', ['T2DM']), true);
    assert.equal(indicationMatches('HTN', ['HTN', 'HYPERTENSION']), true);
    assert.equal(indicationMatches('HTN', ['HYPERTENSION']), true);
    assert.equal(indicationMatches('HYPERTENSION', ['HTN']), true);
    assert.equal(indicationMatches('T2DM', ['HTN']), false);
  });

  it('matches ACE inhibitor class members without using safety thresholds', () => {
    const members = classAliasMembers('ACE_INHIBITOR');
    assert.equal(members.includes('ramipril'), true);
    assert.equal(ingredientAliasMatches('ramipril', ['ramipril', 'altace']), true);
  });

  it('covers Ramipril via ACE_INHIBITOR and Metformin+T2DM via ingredient + indication', () => {
    assert.equal(
      classAliasMembers('ACE_INHIBITOR').some((alias) =>
        ingredientAliasMatches(alias, ['ramipril']),
      ),
      true,
    );
    assert.equal(ingredientAliasMatches('METFORMIN', ['metformin']), true);
    assert.equal(indicationMatches('T2DM', ['T2DM']), true);
    assert.equal(indicationMatches('T2DM', ['HTN']), false);
  });

  it('merges duplicate EGFR requirements to the stronger of REQUIRED vs RELEVANT', () => {
    assert.equal(strongerRequirement('RELEVANT', 'REQUIRED'), 'REQUIRED');
    assert.equal(strongerRequirement('REQUIRED', 'RELEVANT'), 'REQUIRED');
  });

  it('matches Diclectin to the doxylamine/pyridoxine ingredient alias', () => {
    assert.equal(ingredientAliasMatches('DOXYLAMINE_PYRIDOXINE', ['doxylamine', 'diclectin']), true);
  });

  it('keeps REQUIRED stronger than RELEVANT', () => {
    assert.equal(strongerRequirement('RELEVANT', 'REQUIRED'), 'REQUIRED');
  });

  it('maps BP_INPUT to a composite value shape', () => {
    assert.equal(toRenewValueShape('COMPOSITE', 'BP_INPUT'), 'SYSTOLIC_DIASTOLIC');
    assert.equal(toRenewValueShape('DECIMAL', 'LAB_INPUT'), 'NUMERIC');
  });

  it('matches yes/no trigger answers deterministically', () => {
    assert.equal(answersMatchTrigger('yes', 'YES'), true);
    assert.equal(answersMatchTrigger('no', 'YES'), false);
  });
});

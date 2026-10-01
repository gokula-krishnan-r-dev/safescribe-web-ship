import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MEDICATION_INDICATION_REPOSITORY_VERSION,
  MedicationIndicationResolver,
  matchApprovedIndicationMappings,
  matchPatientConditionsAgainstCatalog,
  type MedicationIndicationRepositoryRow,
} from './medication-indication-resolver';
import type { RenewConditionCatalogItem } from './renew-therapy';

const catalog: RenewConditionCatalogItem[] = [
  {
    id: 'cond_dyslip',
    code: 'DYSLIPIDEMIA',
    displayName: 'Hyperlipidemia (dyslipidemia)',
    category: 'cardiovascular',
    description: null,
    defaultEffectivenessQuestion: null,
    commonForRenewal: true,
    displayPriority: 10,
  },
  {
    id: 'cond_cv',
    code: 'CV_RISK',
    displayName: 'Cardiovascular risk reduction',
    category: 'cardiovascular',
    description: null,
    defaultEffectivenessQuestion: null,
    commonForRenewal: true,
    displayPriority: 20,
  },
  {
    id: 'cond_htn',
    code: 'HYPERTENSION',
    displayName: 'Hypertension',
    category: 'cardiovascular',
    description: null,
    defaultEffectivenessQuestion: null,
    commonForRenewal: true,
    displayPriority: 5,
  },
];

const repository: MedicationIndicationRepositoryRow[] = [
  {
    mappingId: 'map_rosu_dyslip',
    ingredientId: 'rosuvastatin',
    medicationConceptId: null,
    conditionId: 'cond_dyslip',
    conditionCode: 'DYSLIPIDEMIA',
    displayName: 'Hyperlipidemia (dyslipidemia)',
    mappingStrength: 'primary',
    autoGroupAllowed: true,
    alwaysRequireConfirmation: false,
    rankingWeight: 100,
  },
  {
    mappingId: 'map_rosu_cv',
    ingredientId: 'rosuvastatin',
    medicationConceptId: null,
    conditionId: 'cond_cv',
    conditionCode: 'CV_RISK',
    displayName: 'Cardiovascular risk reduction',
    mappingStrength: 'common',
    autoGroupAllowed: false,
    alwaysRequireConfirmation: true,
    rankingWeight: 70,
  },
  {
    mappingId: 'map_ram_htn',
    ingredientId: 'ramipril',
    medicationConceptId: null,
    conditionId: 'cond_htn',
    conditionCode: 'HYPERTENSION',
    displayName: 'Hypertension',
    mappingStrength: 'primary',
    autoGroupAllowed: true,
    alwaysRequireConfirmation: false,
    rankingWeight: 100,
  },
];

describe('MedicationIndicationResolver', () => {
  it('returns approved mappings for matching ingredient keys', () => {
    const matched = matchApprovedIndicationMappings(repository, ['rosuvastatin', 'crestor'], new Map(catalog.map((c) => [c.id, c])));
    assert.equal(matched.length, 2);
    assert.equal(matched[0]?.conditionId, 'cond_dyslip');
    assert.equal(matched[0]?.mappingId, 'map_rosu_dyslip');
  });

  it('does not invent mappings for unknown ingredients', () => {
    const matched = matchApprovedIndicationMappings(repository, ['acetaminophen']);
    assert.equal(matched.length, 0);
  });

  it('matches patient conditions by label and prefers approved intersections', () => {
    const matches = matchPatientConditionsAgainstCatalog(catalog, {
      patientConditionLabels: ['dyslipidemia', 'elevated cholesterol'],
      approvedConditionIds: new Set(['cond_dyslip']),
    });
    assert.ok(matches.some((m) => m.id === 'cond_dyslip'));
    assert.equal(matches[0]?.id, 'cond_dyslip');
  });

  it('resolve returns needsAIRanking when multiple approved mappings and no single patient hit', () => {
    const result = MedicationIndicationResolver.resolve({
      input: {
        ingredientConceptIds: ['rosuvastatin'],
        jurisdiction: 'AB',
        patientConditionLabels: [],
      },
      repository,
      catalog,
    });
    assert.equal(result.approvedMappings.length, 2);
    assert.equal(result.needsAIRanking, true);
    assert.equal(result.repositoryVersion, MEDICATION_INDICATION_REPOSITORY_VERSION);
    assert.equal(result.status, 'needs_confirmation');
  });

  it('resolve clears needsAIRanking when one patient condition intersects approved maps', () => {
    const result = MedicationIndicationResolver.resolve({
      input: {
        ingredientConceptIds: ['rosuvastatin'],
        jurisdiction: 'AB',
        patientConditionLabels: ['Hyperlipidemia'],
      },
      repository,
      catalog,
    });
    assert.equal(result.needsAIRanking, false);
    assert.equal(result.provisionalConditionId, 'cond_dyslip');
    assert.equal(result.patientConditionMatches[0]?.id, 'cond_dyslip');
    assert.equal(result.status, 'provisional');
  });

  it('resolve is provisional for a single primary auto-group mapping', () => {
    const result = MedicationIndicationResolver.resolve({
      input: {
        ingredientConceptIds: ['ramipril'],
        jurisdiction: 'AB',
      },
      repository,
      catalog,
    });
    assert.equal(result.approvedMappings.length, 1);
    assert.equal(result.needsAIRanking, false);
    assert.equal(result.provisionalConditionId, 'cond_htn');
    assert.equal(result.status, 'provisional');
  });

  it('resolves amoxicillin to infection indications (Adapt antibiotic coverage)', () => {
    const infectionCatalog: RenewConditionCatalogItem[] = [
      {
        id: 'cond_aom',
        code: 'ACUTE_OTITIS_MEDIA',
        displayName: 'Acute otitis media',
        category: 'infectious',
        description: null,
        defaultEffectivenessQuestion: null,
        commonForRenewal: false,
        displayPriority: 260,
      },
      {
        id: 'cond_pharyngitis',
        code: 'PHARYNGITIS',
        displayName: 'Pharyngitis / tonsillitis',
        category: 'infectious',
        description: null,
        defaultEffectivenessQuestion: null,
        commonForRenewal: false,
        displayPriority: 270,
      },
    ];
    const infectionRepo: MedicationIndicationRepositoryRow[] = [
      {
        mappingId: 'map_amox_aom',
        ingredientId: 'amoxicillin',
        medicationConceptId: null,
        conditionId: 'cond_aom',
        conditionCode: 'ACUTE_OTITIS_MEDIA',
        displayName: 'Acute otitis media',
        mappingStrength: 'common',
        autoGroupAllowed: false,
        alwaysRequireConfirmation: true,
        rankingWeight: 70,
      },
      {
        mappingId: 'map_amox_pharyngitis',
        ingredientId: 'amox',
        medicationConceptId: null,
        conditionId: 'cond_pharyngitis',
        conditionCode: 'PHARYNGITIS',
        displayName: 'Pharyngitis / tonsillitis',
        mappingStrength: 'common',
        autoGroupAllowed: false,
        alwaysRequireConfirmation: true,
        rankingWeight: 70,
      },
    ];

    const result = MedicationIndicationResolver.resolve({
      input: {
        // Pro-amox-500 keys typically resolve to amoxicillin + amox
        ingredientConceptIds: ['amoxicillin', 'amox'],
        jurisdiction: 'AB',
      },
      repository: infectionRepo,
      catalog: infectionCatalog,
    });

    assert.equal(result.approvedMappings.length, 2);
    assert.ok(result.approvedMappings.some((m) => m.conditionCode === 'ACUTE_OTITIS_MEDIA'));
    assert.ok(result.approvedMappings.some((m) => m.conditionCode === 'PHARYNGITIS'));
    assert.equal(result.needsAIRanking, true);
    assert.equal(result.status, 'needs_confirmation');
  });
});

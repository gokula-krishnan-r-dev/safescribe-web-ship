import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  consultationNoteSnapshotText,
  matchSingleApprovedPathway,
  pathwayDisplayLabel,
  readClinicalAssessment,
} from './clinical-assessment-match';

const PATHWAYS = [
  {
    id: 'herpes',
    name: 'Cold Sore',
    condition: 'Herpes Labialis',
    routingAliases: ['cold sore', 'cold sores', 'herpes labialis'],
    routingPresentingComplaints: ['tingling on lip', 'fever blister'],
  },
  {
    id: 'uti',
    name: 'Acute Uncomplicated Cystitis',
    condition: 'UTI',
    routingAliases: ['uti', 'cystitis'],
    routingPresentingComplaints: ['dysuria'],
  },
  {
    id: 'migraine',
    name: 'Migraine',
    condition: 'Migraine',
    routingAliases: ['migraine'],
    routingPresentingComplaints: [],
  },
];

const CATALOG = [
  ...PATHWAYS,
  {
    id: 'uri',
    name: 'Common Cold',
    condition: 'Upper Respiratory Infection',
    routingAliases: ['common cold', 'cold', 'uri'],
    routingPresentingComplaints: ['runny nose', 'nasal congestion'],
  },
];

describe('matchSingleApprovedPathway', () => {
  it('maps cold sore to only the herpes labialis pathway', () => {
    const result = matchSingleApprovedPathway('cold sore', PATHWAYS);
    assert.equal(result.status, 'matched');
    assert.equal(result.pathwayId, 'herpes');
    assert.equal(result.matchMethod, 'exact_alias');
  });

  it('matches concatenated cold sore queries that omit the space', () => {
    for (const query of ['coldsore', 'coldstore', 'coldsores']) {
      const result = matchSingleApprovedPathway(query, CATALOG);
      assert.equal(result.status, 'matched', query);
      assert.equal(result.pathwayId, 'herpes', query);
    }
  });

  it('does not let a short cold alias steal a cold-sore compact query', () => {
    const result = matchSingleApprovedPathway('coldstore', CATALOG);
    assert.equal(result.pathwayId, 'herpes');
    assert.notEqual(result.pathwayId, 'uri');
  });

  it('matches word-by-word fragments against presenting complaints', () => {
    const result = matchSingleApprovedPathway('tingling lip', PATHWAYS);
    assert.equal(result.status, 'matched');
    assert.equal(result.pathwayId, 'herpes');
  });

  it('matches resource labels beyond the pathway title', () => {
    const result = matchSingleApprovedPathway('hsv-1', [
      {
        id: 'herpes',
        name: 'Cold Sore',
        condition: 'Herpes Labialis',
        routingAliases: ['cold sore'],
        differentials: [{ condition: 'HSV-1' }, { name: 'aphthous ulcer' }],
        redFlags: [{ title: 'ocular involvement' }],
      },
      {
        id: 'uti',
        name: 'UTI',
        routingAliases: ['cystitis'],
      },
    ]);
    assert.equal(result.status, 'matched');
    assert.equal(result.pathwayId, 'herpes');

    const flag = matchSingleApprovedPathway('ocular involvement', [
      {
        id: 'herpes',
        name: 'Cold Sore',
        routingAliases: ['cold sore'],
        redFlags: [{ title: 'ocular involvement' }],
      },
      { id: 'uti', name: 'UTI', routingAliases: ['cystitis'] },
    ]);
    assert.equal(flag.status, 'matched');
    assert.equal(flag.pathwayId, 'herpes');
  });

  it('does not return a ranked list when the assessment is unrelated', () => {
    const result = matchSingleApprovedPathway('perioral dermatitis', PATHWAYS);
    assert.equal(result.status, 'none');
    assert.equal(result.pathwayId, null);
  });

  it('treats an ambiguous overlap as no single match', () => {
    const result = matchSingleApprovedPathway('infection', [
      { id: 'a', name: 'Skin Infection', routingAliases: ['infection'] },
      { id: 'b', name: 'UTI', routingAliases: ['infection'] },
    ]);
    assert.equal(result.status, 'ambiguous');
    assert.equal(result.pathwayId, null);
    assert.equal(result.candidates.length, 2);
  });

  it('corrects a close typo without diagnosing', () => {
    const result = matchSingleApprovedPathway('coldsoar', PATHWAYS);
    assert.equal(result.status, 'matched');
    assert.equal(result.pathwayId, 'herpes');
    assert.equal(result.matchMethod, 'fuzzy');
  });

  it('matches misspellings and partial phrases across the catalog', () => {
    assert.equal(matchSingleApprovedPathway('migrane', PATHWAYS).pathwayId, 'migraine');
    assert.equal(matchSingleApprovedPathway('cystits', PATHWAYS).pathwayId, 'uti');
    assert.equal(matchSingleApprovedPathway('herpes lab', PATHWAYS).pathwayId, 'herpes');
    assert.equal(matchSingleApprovedPathway('fever blister', PATHWAYS).pathwayId, 'herpes');
  });

  it('matches short clinical aliases like uti without requiring routing aliases', () => {
    const result = matchSingleApprovedPathway('uti', [
      {
        id: 'uti',
        name: 'Acute Uncomplicated Cystitis',
        condition: 'Acute uncomplicated cystitis',
        routingAliases: [],
      },
      {
        id: 'herpes',
        name: 'Cold Sore',
        condition: 'Herpes Labialis',
        routingAliases: ['cold sore'],
      },
    ]);
    assert.equal(result.status, 'matched');
    assert.equal(result.pathwayId, 'uti');
    assert.ok(result.candidates.length >= 1);
  });

  it('matches uti case-insensitively and ignores competing differential labels', () => {
    const catalog = [
      {
        id: 'cystitis',
        name: 'Cystitis - Acute, Uncomplicated',
        condition: 'Uncomplicated urinary tract infection (UTI)',
        description: 'Uncomplicated urinary tract infection (UTI)',
        routingAliases: [],
      },
      {
        id: 'yeast',
        name: 'Vulvovaginal candidiasis',
        condition: 'Vulvovaginal candidiasis',
        routingAliases: ['yeast infection', 'vvc'],
        differentials: [
          { name: 'Urinary Tract Infection', condition: 'Uncomplicated Urinary Tract Infection' },
          { whyItMatters: 'Urinary frequency and urgency suggest a UTI' },
        ],
      },
      {
        id: 'nvp',
        name: 'Nausea and Vomiting of Pregnancy',
        condition: 'NVP',
        routingAliases: ['morning sickness'],
        differentials: [{ name: 'Urinary Tract Infection' }],
      },
    ];
    for (const query of ['uti', 'UTI', 'Uti', ' uti ']) {
      const result = matchSingleApprovedPathway(query, catalog);
      assert.equal(result.status, 'matched', query);
      assert.equal(result.pathwayId, 'cystitis', query);
    }
  });

  it('matches partial pathway titles such as contraception → Emergency Contraception', () => {
    const catalog = [
      {
        id: 'ec',
        name: 'Emergency Contraception',
        condition: 'Emergency contraception',
        routingAliases: [],
      },
      {
        id: 'hormonal',
        name: 'Hormonal Contraception Initiation',
        condition: 'Combined hormonal contraception',
        routingAliases: ['birth control start'],
      },
      {
        id: 'herpes',
        name: 'Cold Sore',
        condition: 'Herpes Labialis',
        routingAliases: ['cold sore'],
      },
    ];
    const result = matchSingleApprovedPathway('contraception', catalog);
    assert.equal(result.status, 'ambiguous');
    assert.equal(result.pathwayId, null);
    const ids = result.candidates.map((c) => c.pathwayId).sort();
    assert.deepEqual(ids, ['ec', 'hormonal']);
  });
});

describe('pathwayDisplayLabel', () => {
  it('shows condition in parentheses when it adds information', () => {
    assert.equal(
      pathwayDisplayLabel({ name: 'Cold Sore', condition: 'Herpes Labialis' }),
      'Cold Sore (Herpes Labialis)',
    );
  });
});

describe('readClinicalAssessment', () => {
  it('does not treat the consultation note as the pharmacist assessment', () => {
    const stored = readClinicalAssessment({
      consultationIntake: {
        structuredNote: {
          presentingConcern: 'Tingling on upper lip since yesterday',
          relevantClinicalInformation: [{ text: 'Type 2 diabetes' }],
        },
      },
    });
    assert.equal(stored, null);
  });

  it('restores only pharmacist-authored assessment text', () => {
    const stored = readClinicalAssessment({
      clinicalAssessment: { assessmentText: 'cold sore', assessmentSource: 'pharmacist' },
    });
    assert.equal(stored?.assessmentText, 'cold sore');
    assert.equal(stored?.assessmentSource, 'pharmacist');
  });
});

describe('consultationNoteSnapshotText', () => {
  it('joins presenting concern and clinical items with dots', () => {
    const snap = consultationNoteSnapshotText({
      presentingConcern: 'Tingling on upper lip since yesterday',
      items: ['Type 2 diabetes', 'Metformin', 'Amoxicillin allergy'],
    });
    assert.equal(
      snap.summary,
      'Tingling on upper lip since yesterday · Type 2 diabetes · Metformin · Amoxicillin allergy',
    );
  });
});

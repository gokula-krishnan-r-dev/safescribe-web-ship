import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import {
  expandUniqueVariants,
  parsePathwayQaWorkbook,
  parsePatientFixture,
} from './pathway-qa.parser';
import { matchPathwayCondition, scoreConditionMatch } from './pathway-qa.match';
import { dispositionFromFindings, summarizeResults } from './pathway-qa.runner';
import type { PathwayQaVariantResult } from './pathway-qa.types';
import { PATHWAY_QA_LAYERS, PATHWAY_QA_VERDICTS } from './pathway-qa.types';

function buildWorkbook(): Buffer {
  const wb = XLSX.utils.book_new();
  const cases = [
    [
      'Case ID',
      'Pathway #',
      'Condition',
      'Validation Layer',
      'Priority',
      'Scenario / Objective',
      'Patient & Preconditions',
      'Test Data / Three Variants',
      'Execution Steps',
      'Expected Rules Engine',
      'Expected Treatment Result',
      'Expected Flow / UI',
      'Negative Assertions',
      'Audit / Evidence Assertions',
      'Permutation Expansion',
      'Expected Disposition',
      'Rule / Source Basis',
      'Automation Tags',
    ],
    [
      'SS-01-SE',
      '1',
      'Acne Vulgaris',
      'Safety Engine',
      'Critical',
      'Safety Engine: three-variant verification for Acne Vulgaris',
      'Synthetic QA',
      '1. DX–DRUG | Pregnancy=yes; candidates doxycycline, topical adapalene and spironolactone\n1. DRUG–DRUG | Candidate spironolactone; current ramipril; potassium/renal data current\n1. NEGATIVE | Pregnancy=no; no allergies; benzoyl peroxide topical candidate; no matched interacting medication',
      'Run each variant',
      'DX–DRUG → block pregnancy-restricted candidates',
      'Blocked candidates disabled',
      'Safety panel updates',
      'No substring matching',
      'Audit events',
      'SAF-001',
      'Per variant: BLOCK / WARN-REVIEW / ALLOW BY THIS RULE',
      'SRC-REQ-01',
      'api; rules-engine',
    ],
    [
      'SS-01-TV',
      '1',
      'Acne Vulgaris',
      'Treatment Validation',
      'High',
      'Treatment Validation',
      'Synthetic QA',
      '1. VALID | Mild inflammatory acne; benzoyl peroxide plus an approved topical retinoid; route, frequency and duration populated\n1. INVALID | Topical antibiotic monotherapy proposed with no benzoyl peroxide component\n1. BOUNDARY | Adequate adherence but no improvement at the configured reassessment threshold',
      'Run',
      'Safety first',
      'VALID → accept matching regimen',
      'Cannot confirm until fields pass',
      'No default strength',
      'Audit',
      'TRT-001',
      'VALID / INVALID / REFERRAL',
      'SRC-REQ-01',
      'api; regimen',
    ],
    [
      'SS-01-PF',
      '1',
      'Acne Vulgaris',
      'Pathway & Flow Validation',
      'High',
      'Flow',
      'Synthetic QA',
      '1. HAPPY | Typical mild acne, no exclusions; pharmacist confirms Acne pathway\n1. RED FLAG | Nodulocystic lesions, scarring or severe psychosocial impact selected\n1. STATE | AI suggests Acne with low confidence; pharmacist chooses none-of-these-fit',
      'Run',
      'Deterministic',
      'HAPPY unlocks options',
      'RED FLAG referral',
      'No treatment before confirmation',
      'Audit',
      'FLW-001',
      'ELIGIBLE / URGENT REFERRAL / MANUAL SELECTION',
      'SRC-REQ-01',
      'ui; workflow',
    ],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['SafeScribe pack'], ['Test clock: 2026-08-23, America/Edmonton'], ['Pathways', '48']]), 'README');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['note'], [], ...cases]), 'Test_Cases');
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Coverage'],
      [],
      [],
      ['#', 'Condition', 'Total Cases', 'Safety', 'Treatment', 'Pathway/Flow', 'DX–DRUG', 'DRUG–DRUG', 'Coverage Status'],
      ['1', 'Acne Vulgaris', 3, 1, 1, 1, 1, 1, 'PASS'],
    ]),
    'Coverage',
  );
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

describe('pathway QA parser', () => {
  it('parses unique variants from a 48-pathway shaped workbook', () => {
    const { parsed } = parsePathwayQaWorkbook(buildWorkbook(), 'pack.xlsx');
    expect(parsed.cases).toHaveLength(3);
    expect(parsed.coverage[0]?.condition).toBe('Acne Vulgaris');
    const variants = parsed.cases.flatMap((item) => expandUniqueVariants(item));
    expect(variants.map((v) => v.uniqueKey).sort()).toEqual([
      'SS-01-PF::HAPPY',
      'SS-01-PF::RED FLAG',
      'SS-01-PF::STATE',
      'SS-01-SE::DRUG-DRUG',
      'SS-01-SE::DX-DRUG',
      'SS-01-SE::NEGATIVE',
      'SS-01-TV::BOUNDARY',
      'SS-01-TV::INVALID',
      'SS-01-TV::VALID',
    ]);
    const dx = variants.find((v) => v.uniqueKey === 'SS-01-SE::DX-DRUG')!;
    expect(dx.patient.pregnancy).toBe('yes');
    expect(dx.patient.candidates).toEqual(
      expect.arrayContaining(['doxycycline', 'adapalene', 'spironolactone']),
    );
    const ddi = variants.find((v) => v.uniqueKey === 'SS-01-SE::DRUG-DRUG')!;
    expect(ddi.patient.currentMedications.join(' ')).toMatch(/ramipril/i);
    expect(ddi.patient.potassium).toBe('4.2');
  });

  it('parses the checked-in 48-pathway developer pack when present', () => {
    const file = path.resolve(__dirname, '../../../../../SafeScribe_48_Pathway_Developer_Test_Cases.xlsx');
    if (!fs.existsSync(file)) return;
    const { parsed } = parsePathwayQaWorkbook(fs.readFileSync(file), 'SafeScribe_48_Pathway_Developer_Test_Cases.xlsx');
    expect(parsed.cases).toHaveLength(144);
    expect(new Set(parsed.cases.map((c) => c.condition)).size).toBe(48);
    const unique = parsed.cases.flatMap((item) => expandUniqueVariants(item));
    expect(unique.length).toBe(432);
    expect(unique.filter((v) => v.layer === PATHWAY_QA_LAYERS.SAFETY_ENGINE)).toHaveLength(144);
  });

  it('extracts renal and ulcer fixtures', () => {
    const fixture = parsePatientFixture(
      'Active peptic-ulcer bleed or severe renal impairment; candidate naproxen',
    );
    expect(fixture.candidates).toEqual(expect.arrayContaining(['naproxen']));
    expect(fixture.conditions).toEqual(expect.arrayContaining(['peptic ulcer']));
    expect(fixture.egfr).toBe('18');
  });
});

describe('pathway QA matching', () => {
  it('matches UTI aliases and ranks suggestions', () => {
    expect(scoreConditionMatch('UTI', 'Acute Uncomplicated Cystitis (UTI)')).toBeGreaterThan(0.7);
    const match = matchPathwayCondition('Cold Sores', 'Herpes Labialis', [
      {
        caseId: 'SS-24-SE',
        pathwayNumber: '24',
        condition: 'Herpes Labialis (Cold Sores)',
        layer: PATHWAY_QA_LAYERS.SAFETY_ENGINE,
        priority: 'High',
        scenario: '',
        preconditions: '',
        variantsRaw: '',
        executionSteps: '',
        expectedRulesEngine: '',
        expectedTreatment: '',
        expectedFlow: '',
        negativeAssertions: '',
        auditAssertions: '',
        permutationExpansion: '',
        expectedDisposition: '',
        ruleSourceBasis: '',
        automationTags: [],
        sourceRow: 2,
      },
    ]);
    expect(match.condition).toContain('Herpes Labialis');
    expect(match.score).toBeGreaterThan(0.7);
  });
});

describe('pathway QA dispositions', () => {
  it('maps evaluator findings onto pack dispositions', () => {
    expect(dispositionFromFindings('COMPLETE_NO_FINDINGS', [])).toBe('ALLOW_BY_THIS_RULE');
    expect(
      dispositionFromFindings('COMPLETE_WITH_FINDINGS', [
        {
          findingType: 'pregnancy',
          summary: 'Avoid doxycycline in pregnancy',
          detail: 'Contraindicated',
          clinicalSeverity: 'CRITICAL',
          recommendedAction: 'Do not initiate',
          overrideAllowed: false,
          overrideReasonRequired: false,
        },
      ]),
    ).toBe('BLOCK');
    expect(dispositionFromFindings('INPUT_INCOMPLETE', [])).toBe('MORE_INFORMATION_REQUIRED');
  });

  it('summarizes pass/fail mix', () => {
    const summary = summarizeResults([
      { verdict: PATHWAY_QA_VERDICTS.PASS, layer: PATHWAY_QA_LAYERS.SAFETY_ENGINE, priority: 'High', issues: [] },
      {
        verdict: PATHWAY_QA_VERDICTS.FAIL,
        layer: PATHWAY_QA_LAYERS.TREATMENT,
        priority: 'Critical',
        issues: [{ source: 'PATHWAY_CONTENT' }],
      },
    ] as unknown as PathwayQaVariantResult[]);
    expect(summary.total).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.criticalFailed).toBe(1);
    expect(summary.bySource.PATHWAY_CONTENT).toBe(1);
  });
});

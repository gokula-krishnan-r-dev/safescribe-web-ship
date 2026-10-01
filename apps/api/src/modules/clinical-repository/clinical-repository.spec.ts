import { createHash } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as XLSX from 'xlsx';
import {
  ALLERGY_CROSS_REACTIVITY_HEADERS,
  WORKBOOK_REGISTRY,
  fingerprintWorkbook,
  buildHeaderFingerprint,
  normalizeHeader,
} from './contracts/workbook-registry';
import {
  parseClinicalWorkbook,
  WorkbookParserError,
} from './import/parse-xlsx';
import { validateWorkbookRow } from './import/validate-row';
import { summarizeImportIssues } from './contracts/workbook-registry';

function bufferFromHeadersAndRows(
  headers: readonly string[],
  rows: unknown[][],
  sheetName = 'Sheet1',
): Buffer {
  const aoa = [headers as unknown as string[], ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('clinical repository workbook registry', () => {
  it('registers clinical safety and Renew workflow file types', () => {
    expect(Object.keys(WORKBOOK_REGISTRY)).toHaveLength(16);
  });

  it('fingerprints allergy cross-reactivity headers', () => {
    const key = fingerprintWorkbook([...ALLERGY_CROSS_REACTIVITY_HEADERS]);
    expect(key).toBe('allergy_cross_reactivity_rules');
  });

  it('rejects reordered headers', () => {
    const reordered = [
      ALLERGY_CROSS_REACTIVITY_HEADERS[1],
      ALLERGY_CROSS_REACTIVITY_HEADERS[0],
      ...ALLERGY_CROSS_REACTIVITY_HEADERS.slice(2),
    ];
    expect(fingerprintWorkbook(reordered)).toBeNull();
  });

  it('normalizeHeader lowercases and snake_cases', () => {
    expect(normalizeHeader(' Alert Severity ')).toBe('alert_severity');
  });
});

describe('parseClinicalWorkbook', () => {
  it('identifies allergy workbook by headers not filename', () => {
    const buf = bufferFromHeadersAndRows(ALLERGY_CROSS_REACTIVITY_HEADERS, [
      [
        'ROW-1',
        'CREATE_NEW_RULE',
        'SS-ACR-TEST',
        '1.0-draft',
        'CA',
        'INGREDIENT_SELECTOR',
        'SEL-AMOXICILLIN',
        null,
        'INGREDIENT_SELECTOR',
        'SEL-CEFADROXIL',
        null,
        'SIDE_CHAIN',
        'VERIFIED',
        'IMMEDIATE',
        'ALERT',
        'HIGH',
        'AVOID',
        'Summary',
        'Detail',
        'TRUE',
        'TRUE',
        'NONE',
        'DEDUP-1',
        100,
        'EVID-1',
        'https://example.com',
        'DRAFT',
        null,
        'change',
        'notes',
      ],
    ]);
    const parsed = parseClinicalWorkbook(buf, 'something-else.xlsx');
    expect(parsed.fileTypeKey).toBe('allergy_cross_reactivity_rules');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.sha256).toHaveLength(64);
  });

  it('rejects non-xlsx extension', () => {
    expect(() => parseClinicalWorkbook(Buffer.from('x'), 'file.csv')).toThrow(
      WorkbookParserError,
    );
  });

  it('detects duplicate business keys', () => {
    const row = [
      'ROW-1',
      'CREATE_NEW_RULE',
      'SS-ACR-TEST',
      '1.0-draft',
      'CA',
      'INGREDIENT_SELECTOR',
      'SEL-AMOXICILLIN',
      null,
      'INGREDIENT_SELECTOR',
      'SEL-CEFADROXIL',
      null,
      'SIDE_CHAIN',
      'VERIFIED',
      'IMMEDIATE',
      'ALERT',
      'HIGH',
      'AVOID',
      'Summary',
      'Detail',
      'TRUE',
      'TRUE',
      'NONE',
      'DEDUP-1',
      100,
      'EVID-1',
      'https://example.com',
      'DRAFT',
      null,
      'change',
      'notes',
    ];
    const buf = bufferFromHeadersAndRows(ALLERGY_CROSS_REACTIVITY_HEADERS, [row, row]);
    const parsed = parseClinicalWorkbook(buf, 'dup.xlsx');
    expect(parsed.issues.some((i) => i.code === 'DUPLICATE_BUSINESS_KEY')).toBe(true);
  });

  it('rejects wrong headers', () => {
    const bad = bufferFromHeadersAndRows(['foo', 'bar'], [['a', 'b']]);
    expect(() => parseClinicalWorkbook(bad, 'bad.xlsx')).toThrow(WorkbookParserError);
  });
});

describe('validateWorkbookRow', () => {
  it('flags override_reason_required without override_allowed', () => {
    const issues = validateWorkbookRow('drug_disease_rules', 2, {
      rule_code: 'R1',
      rule_version: '1',
      drug_selector_type: 'INGREDIENT_SELECTOR',
      drug_selector_code: 'SEL-X',
      condition_concept_code: '123',
      rule_effect: 'HARD_STOP',
      alert_severity: 'HIGH',
      alert_summary: 'x',
      override_allowed: 'FALSE',
      override_reason_required: 'TRUE',
    });
    expect(issues.some((i) => i.code === 'OVERRIDE_INCONSISTENT')).toBe(true);
  });

  it('flags renal min > max', () => {
    const issues = validateWorkbookRow('renal_rules', 2, {
      rule_code: 'R1',
      drug_selector_code: 'SEL-METFORMIN',
      renal_metric_code: 'EGFR',
      renal_metric_unit: 'mL/min/1.73m2',
      threshold_min_value: 50,
      threshold_max_value: 30,
      alert_summary: 'x',
      alert_severity: 'MODERATE',
    });
    expect(issues.some((i) => i.code === 'THRESHOLD_ORDER')).toBe(true);
  });
});

describe('header fingerprint stability', () => {
  it('matches sha contract of normalized join', () => {
    const fp = buildHeaderFingerprint(['A', 'B']);
    expect(fp).toBe('a|b');
    expect(createHash('sha256').update(fp).digest('hex')).toHaveLength(64);
  });
});

describe('summarizeImportIssues', () => {
  it('groups warnings and explains unresolved selectors', () => {
    const summary = summarizeImportIssues([
      {
        severity: 'WARNING',
        code: 'UNRESOLVED_SELECTOR',
        row: 2,
        message: 'The selector could not be resolved',
      },
      {
        severity: 'WARNING',
        code: 'UNRESOLVED_SELECTOR',
        row: 9,
        message: 'The selector could not be resolved',
      },
      {
        severity: 'ERROR',
        code: 'REQUIRED_FIELD',
        row: 3,
        message: 'rule_code is required.',
      },
    ]);
    expect(summary[0].severity).toBe('ERROR');
    expect(summary[1].code).toBe('UNRESOLVED_SELECTOR');
    expect(summary[1].count).toBe(2);
    expect(summary[1].reason).toContain('terminology');
  });
});

describe('Renew workflow workbooks', () => {
  const root = join(__dirname, '../../../../../');
  const pack = join(root, 'renew-workflow');
  const workbook = (name: string) => {
    const inPack = join(pack, name);
    return existsSync(inPack) ? inPack : join(root, name);
  };

  it('identifies input definitions despite a README sheet', () => {
    const buf = readFileSync(workbook('renew-input-definitions.xlsx'));
    const parsed = parseClinicalWorkbook(buf, 'unrelated-name.xlsx');
    expect(parsed.fileTypeKey).toBe('renew_input_definitions');
    expect(parsed.rows.length).toBeGreaterThan(20);
    expect(parsed.rows.some((row) => String(row.raw.input_code).toUpperCase() === 'BP')).toBe(true);
    const issues = validateWorkbookRow('renew_input_definitions', 2, parsed.rows[0].raw);
    expect(issues.filter((i) => i.severity === 'ERROR')).toHaveLength(0);
  });

  it('identifies monitoring rules by headers', () => {
    const buf = readFileSync(workbook('renew-monitoring-rules.xlsx'));
    const parsed = parseClinicalWorkbook(buf, 'monitoring.xlsx');
    expect(parsed.fileTypeKey).toBe('renew_monitoring_rules');
    expect(parsed.rows[0].raw.rule_id).toBeTruthy();
    expect(parsed.rows.some((row) => String(row.raw.applies_to_id).toUpperCase() === 'ACE_INHIBITOR')).toBe(
      true,
    );
  });

  it('identifies medication indications and conditional questions despite README sheets', () => {
    const indications = parseClinicalWorkbook(
      readFileSync(workbook('renew-medication-indications.xlsx')),
      'indications.xlsx',
    );
    expect(indications.fileTypeKey).toBe('renew_medication_indications');
    expect(indications.rows.length).toBeGreaterThan(50);

    const questions = parseClinicalWorkbook(
      readFileSync(workbook('renew-conditional-questions.xlsx')),
      'questions.xlsx',
    );
    expect(questions.fileTypeKey).toBe('renew_conditional_questions');
    expect(questions.rows.some((row) => String(row.raw.applies_to_id).toUpperCase().includes('DOXYLAMINE'))).toBe(
      true,
    );
  });

  it('validates every governed Renew pack row without errors', () => {
    const files: Array<{ name: string; type: 'renew_input_definitions' | 'renew_medication_indications' | 'renew_monitoring_rules' | 'renew_conditional_questions'; minRows: number }> = [
      { name: 'renew-input-definitions.xlsx', type: 'renew_input_definitions', minRows: 60 },
      { name: 'renew-medication-indications.xlsx', type: 'renew_medication_indications', minRows: 200 },
      { name: 'renew-conditional-questions.xlsx', type: 'renew_conditional_questions', minRows: 70 },
      { name: 'renew-monitoring-rules.xlsx', type: 'renew_monitoring_rules', minRows: 300 },
    ];
    for (const file of files) {
      const parsed = parseClinicalWorkbook(readFileSync(workbook(file.name)), file.name);
      expect(parsed.fileTypeKey).toBe(file.type);
      expect(parsed.rows.length).toBeGreaterThanOrEqual(file.minRows);
      const errors = parsed.rows.flatMap((row) =>
        validateWorkbookRow(parsed.fileTypeKey, row.sourceRowNumber, row.raw).filter(
          (issue) => issue.severity === 'ERROR',
        ),
      );
      expect(errors.slice(0, 5).map((issue) => `r${issue.row}:${issue.code}:${issue.message}`)).toEqual([]);
    }
  });
});

import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import {
  normalizeClinicalYesNo,
  type ClinicalYesNo,
} from '@safescript/shared';
import {
  normalizeRecommendationLevel,
  normalizeTreatmentCategory,
} from './normalize-extracted';

/** Canonical Excel / CSV column headers for pathway treatment import */
export const TREATMENT_IMPORT_COLUMNS = [
  'medication_name',
  'generic_name',
  'brand_name',
  'category',
  'recommendation_level',
  'strength',
  'dose',
  'route',
  'frequency',
  'duration',
  'quantity',
  'directions',
  'clinical_indication',
  'eligibility',
  'province_availability',
  'pregnancy_flag',
  'pregnancy_reason',
  'renal_flag',
  'renal_reason',
  'hepatic_flag',
  'hepatic_reason',
  'monitoring_flag',
  'monitoring_reason',
  'counselling_notes',
  'follow_up_advice',
  'warnings',
] as const;

export type TreatmentImportColumn = (typeof TREATMENT_IMPORT_COLUMNS)[number];

export interface TreatmentImportRow {
  medicationName: string;
  genericName: string | null;
  brandName: string | null;
  category: string;
  recommendationLevel: string;
  strength: string | null;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  duration: string | null;
  quantity: string | null;
  directions: string | null;
  clinicalIndication: string | null;
  eligibility: string | null;
  provinceAvailability: string | null;
  pregnancyNotes: ClinicalYesNo | null;
  pregnancyReason: string | null;
  renalAdjustment: ClinicalYesNo | null;
  renalAdjustmentReason: string | null;
  hepaticAdjustment: ClinicalYesNo | null;
  hepaticAdjustmentReason: string | null;
  monitoring: ClinicalYesNo | null;
  monitoringReason: string | null;
  counsellingNotes: string | null;
  followUpAdvice: string | null;
  warnings: string[];
}

export interface TreatmentImportValidationError {
  sheet: string;
  row?: number;
  column?: string;
  message: string;
}

export interface TreatmentImportPreviewRow {
  row: number;
  medicationName: string;
  status: 'valid' | 'error';
  messages: string[];
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s/-]+/g, '_')
    .replace(/_+/g, '_');
}

const HEADER_ALIASES: Record<string, TreatmentImportColumn> = {
  medication_name: 'medication_name',
  medication: 'medication_name',
  name: 'medication_name',
  drug_name: 'medication_name',
  generic_name: 'generic_name',
  generic: 'generic_name',
  brand_name: 'brand_name',
  brand: 'brand_name',
  category: 'category',
  recommendation_level: 'recommendation_level',
  recommendation: 'recommendation_level',
  strength: 'strength',
  dose: 'dose',
  route: 'route',
  frequency: 'frequency',
  duration: 'duration',
  quantity: 'quantity',
  directions: 'directions',
  clinical_indication: 'clinical_indication',
  indication: 'clinical_indication',
  eligibility: 'eligibility',
  province_availability: 'province_availability',
  provinces: 'province_availability',
  pregnancy_flag: 'pregnancy_flag',
  pregnancy: 'pregnancy_flag',
  pregnancy_lactation: 'pregnancy_flag',
  pregnancy_reason: 'pregnancy_reason',
  pregnancy_warning_reason: 'pregnancy_reason',
  renal_flag: 'renal_flag',
  renal_adjustment: 'renal_flag',
  renal: 'renal_flag',
  renal_reason: 'renal_reason',
  renal_adjustment_reason: 'renal_reason',
  hepatic_flag: 'hepatic_flag',
  hepatic_adjustment: 'hepatic_flag',
  hepatic: 'hepatic_flag',
  hepatic_reason: 'hepatic_reason',
  hepatic_adjustment_reason: 'hepatic_reason',
  monitoring_flag: 'monitoring_flag',
  monitoring: 'monitoring_flag',
  monitoring_reason: 'monitoring_reason',
  monitoring_warning_reason: 'monitoring_reason',
  counselling_notes: 'counselling_notes',
  counseling_notes: 'counselling_notes',
  follow_up_advice: 'follow_up_advice',
  followup_advice: 'follow_up_advice',
  warnings: 'warnings',
};

function cell(row: Record<string, string>, key: TreatmentImportColumn): string {
  return (row[key] ?? '').trim();
}

function parseWarnings(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(/[;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function flagOrNull(raw: string): ClinicalYesNo | null {
  const n = normalizeClinicalYesNo(raw);
  return n || null;
}

function reasonForFlag(
  flag: ClinicalYesNo | null,
  reason: string,
): string | null {
  if (flag !== 'Yes') return null;
  return reason.trim() || null;
}

@Injectable()
export class TreatmentExcelImportParser {
  parse(buffer: Buffer, fileName: string): Record<string, string>[] {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'csv') {
      return this.parseCsv(buffer);
    }
    return this.parseExcel(buffer);
  }

  validate(buffer: Buffer, fileName: string): {
    valid: boolean;
    errors: TreatmentImportValidationError[];
    preview: TreatmentImportPreviewRow[];
    rows: TreatmentImportRow[];
  } {
    const errors: TreatmentImportValidationError[] = [];
    const preview: TreatmentImportPreviewRow[] = [];
    const rows: TreatmentImportRow[] = [];

    let rawRows: Record<string, string>[];
    try {
      rawRows = this.parse(buffer, fileName);
    } catch (err) {
      return {
        valid: false,
        errors: [{ sheet: 'Treatments', message: String(err) }],
        preview: [],
        rows: [],
      };
    }

    if (!rawRows.length) {
      return {
        valid: false,
        errors: [{ sheet: 'Treatments', message: 'No data rows found' }],
        preview: [],
        rows: [],
      };
    }

    rawRows.forEach((raw, index) => {
      const rowNum = index + 2;
      const messages: string[] = [];
      const medicationName = cell(raw, 'medication_name');
      if (!medicationName) messages.push('medication_name is required');

      const pregnancyFlag = flagOrNull(cell(raw, 'pregnancy_flag'));
      const renalFlag = flagOrNull(cell(raw, 'renal_flag'));
      const hepaticFlag = flagOrNull(cell(raw, 'hepatic_flag'));
      const monitoringFlag = flagOrNull(cell(raw, 'monitoring_flag'));

      const pregnancyReason = cell(raw, 'pregnancy_reason');
      const renalReason = cell(raw, 'renal_reason');
      const hepaticReason = cell(raw, 'hepatic_reason');
      const monitoringReason = cell(raw, 'monitoring_reason');

      if (pregnancyFlag === 'Yes' && !pregnancyReason) {
        messages.push('pregnancy_reason is required when pregnancy_flag is Yes');
      }
      if (renalFlag === 'Yes' && !renalReason) {
        messages.push('renal_reason is required when renal_flag is Yes');
      }
      if (hepaticFlag === 'Yes' && !hepaticReason) {
        messages.push('hepatic_reason is required when hepatic_flag is Yes');
      }
      if (monitoringFlag === 'Yes' && !monitoringReason) {
        messages.push('monitoring_reason is required when monitoring_flag is Yes');
      }

      for (const [col, value] of [
        ['pregnancy_flag', cell(raw, 'pregnancy_flag')],
        ['renal_flag', cell(raw, 'renal_flag')],
        ['hepatic_flag', cell(raw, 'hepatic_flag')],
        ['monitoring_flag', cell(raw, 'monitoring_flag')],
      ] as const) {
        if (!value) continue;
        // Accept Yes/No; legacy free-text is allowed (normalizeClinicalYesNo → Yes)
        if (!/^(yes|no)$/i.test(value) && normalizeClinicalYesNo(value) === '') {
          messages.push(`${col} must be Yes or No`);
        }
      }

      const mapped: TreatmentImportRow = {
        medicationName,
        genericName: cell(raw, 'generic_name') || null,
        brandName: cell(raw, 'brand_name') || null,
        category: normalizeTreatmentCategory(cell(raw, 'category') || 'PRESCRIPTION'),
        recommendationLevel: normalizeRecommendationLevel(
          cell(raw, 'recommendation_level') || 'FIRST_LINE',
        ),
        strength: cell(raw, 'strength') || null,
        dose: cell(raw, 'dose') || null,
        route: cell(raw, 'route') || null,
        frequency: cell(raw, 'frequency') || null,
        duration: cell(raw, 'duration') || null,
        quantity: cell(raw, 'quantity') || null,
        directions: cell(raw, 'directions') || null,
        clinicalIndication: cell(raw, 'clinical_indication') || null,
        eligibility: cell(raw, 'eligibility') || null,
        provinceAvailability: cell(raw, 'province_availability') || 'ALL',
        pregnancyNotes: pregnancyFlag,
        pregnancyReason: reasonForFlag(pregnancyFlag, pregnancyReason),
        renalAdjustment: renalFlag,
        renalAdjustmentReason: reasonForFlag(renalFlag, renalReason),
        hepaticAdjustment: hepaticFlag,
        hepaticAdjustmentReason: reasonForFlag(hepaticFlag, hepaticReason),
        monitoring: monitoringFlag,
        monitoringReason: reasonForFlag(monitoringFlag, monitoringReason),
        counsellingNotes: cell(raw, 'counselling_notes') || null,
        followUpAdvice: cell(raw, 'follow_up_advice') || null,
        warnings: parseWarnings(cell(raw, 'warnings')),
      };

      if (messages.length) {
        errors.push(
          ...messages.map((message) => ({
            sheet: 'Treatments',
            row: rowNum,
            message,
          })),
        );
        preview.push({
          row: rowNum,
          medicationName: medicationName || '(missing)',
          status: 'error',
          messages,
        });
      } else {
        rows.push(mapped);
        preview.push({
          row: rowNum,
          medicationName,
          status: 'valid',
          messages: [],
        });
      }
    });

    return {
      valid: errors.length === 0,
      errors,
      preview,
      rows,
    };
  }

  buildTemplate(): Buffer {
    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      [...TREATMENT_IMPORT_COLUMNS],
      [
        'Acyclovir',
        'acyclovir',
        '',
        'PRESCRIPTION',
        'FIRST_LINE',
        '400 mg',
        '400 mg',
        'PO',
        'five times daily',
        '5 days',
        '25',
        'Take with water; stay hydrated',
        'Immunocompetent adults with typical HSV presentation',
        'Adults ≥18 years with confirmed pathway diagnosis',
        'Hypersensitivity to acyclovir',
        'ALL',
        'Yes',
        'Limited human data in pregnancy — confirm benefit outweighs risk; prefer specialist advice in first trimester',
        'Yes',
        'Reduce dose when eGFR is below 30 mL/min — risk of accumulation and neurotoxicity',
        'No',
        '',
        'Yes',
        'Recheck symptoms in 48–72 hours; seek care if lesions worsen or fever develops',
        'Complete full course; hydrate well',
        'Return if no improvement in 72 hours',
        'Hydration recommended',
      ],
      [
        'Ibuprofen',
        'ibuprofen',
        'Advil',
        'OTC',
        'ADJUNCTIVE',
        '200 mg',
        '200–400 mg',
        'PO',
        'every 6–8 hours PRN',
        'as needed',
        '',
        'Take with food',
        'Mild pain / inflammation adjunct',
        'Adults without GI ulcer history',
        'Active peptic ulcer; severe renal impairment',
        'ALL',
        'Yes',
        'Avoid in pregnancy after 20 weeks — fetal renal and ductus arteriosus risk',
        'Yes',
        'Avoid or reduce dose in significant renal impairment — NSAID nephrotoxicity risk',
        'Yes',
        'Use caution with elevated LFTs or known hepatic disease',
        'No',
        '',
        'Take with food; do not exceed max daily dose',
        '',
        '',
      ],
    ]);
    XLSX.utils.book_append_sheet(wb, sheet, 'Treatments');

    const guide = XLSX.utils.aoa_to_sheet([
      ['Column', 'Required', 'Allowed values / notes'],
      ['medication_name', 'Yes', 'Display name shown in consultation'],
      ['category', 'No', 'PRESCRIPTION | OTC | SUPPLEMENT | NON_DRUG (default PRESCRIPTION)'],
      ['recommendation_level', 'No', 'FIRST_LINE | SECOND_LINE | ALTERNATIVE | ADJUNCTIVE | SUPPORTIVE_CARE'],
      ['pregnancy_flag', 'No', 'Yes | No — pregnancy/lactation caution'],
      ['pregnancy_reason', 'If flag=Yes', 'Why this caution appears in consultation (patient must be pregnant)'],
      ['renal_flag', 'No', 'Yes | No'],
      ['renal_reason', 'If flag=Yes', 'Why renal caution is shown'],
      ['hepatic_flag', 'No', 'Yes | No'],
      ['hepatic_reason', 'If flag=Yes', 'Why hepatic caution is shown'],
      ['monitoring_flag', 'No', 'Yes | No'],
      ['monitoring_reason', 'If flag=Yes', 'Why monitoring banner is shown'],
      ['warnings', 'No', 'Optional extra warnings separated by ; or |'],
    ]);
    XLSX.utils.book_append_sheet(wb, guide, 'Column_Guide');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  private parseExcel(buffer: Buffer): Record<string, string>[] {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    const sheetName =
      wb.SheetNames.find((n) => normalizeHeader(n) === 'treatments') ??
      wb.SheetNames[0];
    if (!sheetName) throw new Error('Workbook has no sheets');
    const sheet = wb.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
    }) as unknown[][];
    if (!aoa.length) return [];
    return this.rowsFromAoa(aoa);
  }

  private parseCsv(buffer: Buffer): Record<string, string>[] {
    const wb = XLSX.read(buffer.toString('utf-8'), { type: 'string' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
    }) as unknown[][];
    return this.rowsFromAoa(aoa);
  }

  private rowsFromAoa(aoa: unknown[][]): Record<string, string>[] {
    const headerRow = (aoa[0] ?? []).map((h) => normalizeHeader(h));
    const colMap: Array<TreatmentImportColumn | null> = headerRow.map(
      (h) => HEADER_ALIASES[h] ?? null,
    );
    if (!colMap.includes('medication_name')) {
      throw new Error(
        'Missing required column: medication_name (or alias medication / name)',
      );
    }

    const out: Record<string, string>[] = [];
    for (let i = 1; i < aoa.length; i++) {
      const line = aoa[i] ?? [];
      const row: Record<string, string> = {};
      let empty = true;
      colMap.forEach((col, idx) => {
        if (!col) return;
        const value = String(line[idx] ?? '').trim();
        if (value) empty = false;
        row[col] = value;
      });
      if (!empty) out.push(row);
    }
    return out;
  }
}

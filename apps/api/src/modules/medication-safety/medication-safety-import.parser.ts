import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { SAFETY_RULE_TYPES, SAFETY_CLINICAL_SEVERITIES, SAFETY_SELECTOR_TYPES } from './medication-safety.types';
import {
  IMPORT_CLASS_COLUMNS,
  IMPORT_DDI_COLUMNS,
  IMPORT_INGREDIENT_COLUMNS,
  IMPORT_LAB_RULE_COLUMNS,
  IMPORT_DRUG_CATALOG_COLUMNS,
  IMPORT_DRUG_CLASS_TAXONOMY_COLUMNS,
  IMPORT_LACTATION_COLUMNS,
  IMPORT_PREGNANCY_COLUMNS,
  IMPORT_RENAL_COLUMNS,
  IMPORT_RULE_COLUMNS,
  SAFETY_CLINICAL_ACTIONS,
  SAFETY_INTERACTION_SEVERITIES,
  SAFETY_LAB_COMPARATORS,
  SAFETY_LACTATION_RISKS,
  SAFETY_MATCH_TYPES,
  SAFETY_MISSING_LAB_ACTIONS,
  SAFETY_PREGNANCY_CATEGORIES,
  SAFETY_RENAL_BAND_SEVERITIES,
  isValidSafetyMatchType,
  normalizeSafetyMatchType,
  type ImportPreviewRow,
  type ImportValidationError,
} from './medication-safety.types';
import {
  mapActionRequired,
  mapBandSeverityFromImport,
  mapImportSeverityToClinical,
  mapInteractionSeverityToClinical,
  mapLactationRisk,
  mapPregnancyCategory,
  overridePolicyForAction,
} from './utils/patient-context.util';
import { normalizeDrugKey } from './utils/drug-name.util';
import { parseBrandList, parseRiskTags } from './utils/class-index.util';

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function findSheet(sheetNames: string[], target: string): string | null {
  const norm = target.toLowerCase().replace(/\s+/g, '_');
  return sheetNames.find((s) => s.toLowerCase().replace(/\s+/g, '_') === norm) ?? null;
}

function parseBool(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

export interface ParsedImportData {
  rules: Array<Record<string, string>>;
  labRules: Array<Record<string, string>>;
  ddiRules: Array<Record<string, string>>;
  pregnancyRules: Array<Record<string, string>>;
  lactationRules: Array<Record<string, string>>;
  renalRules: Array<Record<string, string>>;
  ingredients: Array<Record<string, string>>;
  classes: Array<Record<string, string>>;
  classTaxonomy: Array<Record<string, string>>;
  drugs: Array<Record<string, string>>;
}

@Injectable()
export class MedicationSafetyImportParser {
  parse(buffer: Buffer, fileName: string): ParsedImportData {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'csv') {
      return this.parseCsv(buffer);
    }
    return this.parseExcel(buffer);
  }

  validate(buffer: Buffer, fileName: string): {
    valid: boolean;
    errors: ImportValidationError[];
    preview: ImportPreviewRow[];
    data?: ParsedImportData;
  } {
    const errors: ImportValidationError[] = [];
    const preview: ImportPreviewRow[] = [];

    let data: ParsedImportData;
    try {
      data = this.parse(buffer, fileName);
    } catch (err) {
      return {
        valid: false,
        errors: [{ sheet: 'Workbook', message: String(err) }],
        preview: [],
      };
    }

    const seenCodes = new Set<string>();

    data.rules.forEach((row, index) => {
      const rowNum = index + 2;
      const messages: string[] = [];
      const code = row.rule_code?.trim();
      if (!code) messages.push('rule_code is required');
      if (code && seenCodes.has(code)) messages.push(`Duplicate rule_code: ${code}`);
      if (code) seenCodes.add(code);

      const ruleType = row.rule_type?.trim();
      if (!ruleType || !Object.values(SAFETY_RULE_TYPES).includes(ruleType as never)) {
        messages.push('rule_type must be ALLERGY_DIRECT, CROSS_REACTIVITY, or LAB_THRESHOLD');
      }

      const severity = row.clinical_severity?.trim();
      if (!severity || !Object.values(SAFETY_CLINICAL_SEVERITIES).includes(severity as never)) {
        messages.push('clinical_severity must be INFO, LOW, MODERATE, HIGH, or CRITICAL');
      }

      if (!row.allergen_substance?.trim() && ruleType !== 'LAB_THRESHOLD') {
        messages.push('allergen_substance is required');
      }
      if (!row.alert_summary?.trim()) messages.push('alert_summary is required');
      if (!row.alert_detail?.trim()) messages.push('alert_detail is required');

      const status = (row.status ?? 'draft').trim().toLowerCase();
      if (status !== 'draft') messages.push('status must be draft on import');

      const allergenSelector = row.allergen_selector?.trim();
      if (allergenSelector && !Object.values(SAFETY_SELECTOR_TYPES).includes(allergenSelector as never)) {
        messages.push('Invalid allergen_selector');
      }

      const matchTypeRaw = row.match_type?.trim();
      if (matchTypeRaw && !isValidSafetyMatchType(matchTypeRaw)) {
        messages.push(
          `match_type must be one of: ${SAFETY_MATCH_TYPES.join(', ')} (aliases like structural_relationship → side_chain_structural are accepted)`,
        );
      }

      if (messages.length) {
        for (const msg of messages) {
          errors.push({ sheet: 'safety_rules', row: rowNum, message: msg });
        }
      }

      preview.push({
        rowNumber: rowNum,
        sheet: 'safety_rules',
        status: messages.length ? 'error' : 'valid',
        data: row,
        messages,
      });
    });

    data.labRules.forEach((row, index) => {
      const rowNum = index + 2;
      const messages: string[] = [];
      const code = row.rule_code?.trim();
      if (!code) messages.push('rule_code is required');
      if (code && seenCodes.has(code)) messages.push(`Duplicate rule_code: ${code}`);
      if (code) seenCodes.add(code);

      if (row.rule_type?.trim() !== 'LAB_THRESHOLD') {
        messages.push('rule_type must be LAB_THRESHOLD');
      }
      if (!row.drug_ingredient?.trim()) messages.push('drug_ingredient is required');
      if (!row.observation_key?.trim()) messages.push('observation_key is required');
      const comparator = row.comparator?.trim();
      if (!comparator || !SAFETY_LAB_COMPARATORS.includes(comparator as never)) {
        messages.push('comparator must be LT, LTE, GT, GTE, EQ, or BETWEEN');
      }
      if (!row.threshold_low?.trim() && comparator !== 'BETWEEN') {
        messages.push('threshold_low is required');
      }
      if (comparator === 'BETWEEN' && (!row.threshold_low?.trim() || !row.threshold_high?.trim())) {
        messages.push('BETWEEN comparator requires threshold_low and threshold_high');
      }
      const missingAction = (row.missing_lab_action ?? 'REQUIRE_REVIEW').trim();
      if (!SAFETY_MISSING_LAB_ACTIONS.includes(missingAction as never)) {
        messages.push('missing_lab_action must be REQUIRE_REVIEW or SKIP_RULE');
      }
      const severity = row.clinical_severity?.trim();
      if (!severity || !Object.values(SAFETY_CLINICAL_SEVERITIES).includes(severity as never)) {
        messages.push('clinical_severity must be INFO, LOW, MODERATE, HIGH, or CRITICAL');
      }
      if (!row.alert_summary?.trim()) messages.push('alert_summary is required');
      if (!row.alert_detail?.trim()) messages.push('alert_detail is required');
      const status = (row.status ?? 'draft').trim().toLowerCase();
      if (status !== 'draft') messages.push('status must be draft on import');

      if (messages.length) {
        for (const msg of messages) {
          errors.push({ sheet: 'lab_rules', row: rowNum, message: msg });
        }
      }
      preview.push({
        rowNumber: rowNum,
        sheet: 'lab_rules',
        status: messages.length ? 'error' : 'valid',
        data: row,
        messages,
      });
    });

    data.ddiRules.forEach((row, index) => {
      const rowNum = index + 2;
      const messages: string[] = [];
      if (!row.drug_a?.trim()) messages.push('drug_a is required');
      if (!row.drug_b?.trim()) messages.push('drug_b is required');
      if (row.drug_a?.trim() && row.drug_b?.trim() && normalizeDrugKey(row.drug_a) === normalizeDrugKey(row.drug_b)) {
        messages.push('drug_a and drug_b must be different');
      }
      const severity = (row.severity ?? 'major').trim().toUpperCase();
      if (!SAFETY_INTERACTION_SEVERITIES.includes(severity as never)) {
        messages.push('severity must be major, moderate, or minor');
      }
      if (!row.description?.trim()) messages.push('description is required');
      const action = mapActionRequired(row.action_required);
      if (!SAFETY_CLINICAL_ACTIONS.includes(action as never)) {
        messages.push('action_required must be hard_stop, pharmacist_review, monitor, or info_only');
      }
      if (messages.length) {
        for (const msg of messages) {
          errors.push({ sheet: 'drug_interactions', row: rowNum, message: msg });
        }
      }
      preview.push({
        rowNumber: rowNum,
        sheet: 'drug_interactions',
        status: messages.length ? 'error' : 'valid',
        data: row,
        messages,
      });
    });

    data.pregnancyRules.forEach((row, index) => {
      const rowNum = index + 2;
      const messages: string[] = [];
      if (!row.drug_name?.trim()) messages.push('drug_name is required');
      const category = mapPregnancyCategory(row.pregnancy_category);
      if (!SAFETY_PREGNANCY_CATEGORIES.includes(category as never)) {
        messages.push('pregnancy_category must be contraindicated, caution, preferred, or unknown');
      }
      if (!row.recommendation?.trim()) messages.push('recommendation is required');
      const action = mapActionRequired(row.action_required);
      if (!SAFETY_CLINICAL_ACTIONS.includes(action as never)) {
        messages.push('action_required must be hard_stop, pharmacist_review, monitor, or info_only');
      }
      if (messages.length) {
        for (const msg of messages) {
          errors.push({ sheet: 'pregnancy_rules', row: rowNum, message: msg });
        }
      }
      preview.push({
        rowNumber: rowNum,
        sheet: 'pregnancy_rules',
        status: messages.length ? 'error' : 'valid',
        data: row,
        messages,
      });
    });

    data.lactationRules.forEach((row, index) => {
      const rowNum = index + 2;
      const messages: string[] = [];
      if (!row.drug_name?.trim()) messages.push('drug_name is required');
      const risk = mapLactationRisk(row.lactation_risk);
      if (!SAFETY_LACTATION_RISKS.includes(risk as never)) {
        messages.push('lactation_risk must be high_risk, moderate_risk, low_risk, or unknown');
      }
      if (!row.recommendation?.trim()) messages.push('recommendation is required');
      const band = mapBandSeverityFromImport(row.severity);
      if (!SAFETY_RENAL_BAND_SEVERITIES.includes(band as never)) {
        messages.push('severity must be block, caution, or safe');
      }
      const action = mapActionRequired(row.action_required);
      if (!SAFETY_CLINICAL_ACTIONS.includes(action as never)) {
        messages.push('action_required must be hard_stop, pharmacist_review, monitor, info_only, or none');
      }
      if (messages.length) {
        for (const msg of messages) {
          errors.push({ sheet: 'lactation_rules', row: rowNum, message: msg });
        }
      }
      preview.push({
        rowNumber: rowNum,
        sheet: 'lactation_rules',
        status: messages.length ? 'error' : 'valid',
        data: row,
        messages,
      });
    });

    data.renalRules.forEach((row, index) => {
      const rowNum = index + 2;
      const messages: string[] = [];
      if (!row.drug_name?.trim()) messages.push('drug_name is required');
      const egfrMin = Number(row.egfr_min);
      const egfrMax = Number(row.egfr_max);
      if (!Number.isFinite(egfrMin) || !Number.isFinite(egfrMax)) {
        messages.push('egfr_min and egfr_max must be numeric');
      } else if (egfrMin > egfrMax) {
        messages.push('egfr_min must be <= egfr_max');
      }
      const band = mapBandSeverityFromImport(row.severity);
      if (!SAFETY_RENAL_BAND_SEVERITIES.includes(band as never)) {
        messages.push('severity must be block, caution, or safe');
      }
      if (!row.recommendation?.trim()) messages.push('recommendation is required');
      const action = mapActionRequired(row.action_required);
      if (!SAFETY_CLINICAL_ACTIONS.includes(action as never)) {
        messages.push('action_required must be hard_stop, pharmacist_review, monitor, info_only, or none');
      }
      if (messages.length) {
        for (const msg of messages) {
          errors.push({ sheet: 'renal_rules', row: rowNum, message: msg });
        }
      }
      preview.push({
        rowNumber: rowNum,
        sheet: 'renal_rules',
        status: messages.length ? 'error' : 'valid',
        data: row,
        messages,
      });
    });

    data.ingredients.forEach((row, index) => {
      const rowNum = index + 2;
      const messages: string[] = [];
      if (!row.product_name?.trim()) messages.push('product_name is required');
      if (!row.ingredients?.trim()) messages.push('ingredients is required');
      if (messages.length) {
        for (const msg of messages) {
          errors.push({ sheet: 'medication_ingredients', row: rowNum, message: msg });
        }
      }
      preview.push({
        rowNumber: rowNum,
        sheet: 'medication_ingredients',
        status: messages.length ? 'error' : 'valid',
        data: row,
        messages,
      });
    });

    data.classTaxonomy.forEach((row, index) => {
      const rowNum = index + 2;
      const messages: string[] = [];
      if (!row.class_name?.trim()) messages.push('class_name is required');
      if (messages.length) {
        for (const msg of messages) {
          errors.push({ sheet: 'drug_classes', row: rowNum, message: msg });
        }
      }
      preview.push({
        rowNumber: rowNum,
        sheet: 'drug_classes',
        status: messages.length ? 'error' : 'valid',
        data: row,
        messages,
      });
    });

    data.drugs.forEach((row, index) => {
      const rowNum = index + 2;
      const messages: string[] = [];
      if (!row.drug_name?.trim()) messages.push('drug_name is required');
      if (!row.class_name?.trim()) messages.push('class_name is required');
      if (messages.length) {
        for (const msg of messages) {
          errors.push({ sheet: 'drugs', row: rowNum, message: msg });
        }
      }
      preview.push({
        rowNumber: rowNum,
        sheet: 'drugs',
        status: messages.length ? 'error' : 'valid',
        data: row,
        messages,
      });
    });

    data.classes.forEach((row, index) => {
      const rowNum = index + 2;
      const messages: string[] = [];
      if (!row.drug_name?.trim()) messages.push('drug_name is required');
      if (!row.class_name?.trim()) messages.push('class_name is required');
      if (messages.length) {
        for (const msg of messages) {
          errors.push({ sheet: 'drug_class_membership', row: rowNum, message: msg });
        }
      }
      preview.push({
        rowNumber: rowNum,
        sheet: 'drug_class_membership',
        status: messages.length ? 'error' : 'valid',
        data: row,
        messages,
      });
    });

    return {
      valid: errors.length === 0,
      errors,
      preview,
      data: errors.length === 0 ? data : undefined,
    };
  }

  buildTemplateWorkbook(): Buffer {
    const wb = XLSX.utils.book_new();
    const rulesSheet = XLSX.utils.aoa_to_sheet([
      [...IMPORT_RULE_COLUMNS],
      [
        'ALLERGY-AMOX-DIRECT',
        'ALLERGY_DIRECT',
        'ALL',
        'amoxicillin',
        'EXACT_INGREDIENT',
        'amoxicillin',
        'EXACT_INGREDIENT',
        'exact_ingredient',
        '',
        'HIGH',
        'Review allergy history before proceeding',
        'Recorded amoxicillin allergy',
        'Patient has a recorded allergy to amoxicillin.',
        'true',
        'true',
        'SafeScribe Clinical Policy',
        'Allergy §1',
        'draft',
      ],
      [
        'ALLERGY-AMOX-COMBO',
        'ALLERGY_DIRECT',
        'ALL',
        'amoxicillin',
        'EXACT_INGREDIENT',
        '',
        'HAS_INGREDIENT',
        'combination_product_contains_exact_ingredient',
        '',
        'CRITICAL',
        'Select an alternative when clinically appropriate',
        'Product contains amoxicillin',
        'The selected product contains amoxicillin as an active ingredient.',
        'true',
        'true',
        'SafeScribe Clinical Policy',
        'Allergy §2',
        'draft',
      ],
      [
        'TEST-CROSS-AMOX-CEFADROXIL',
        'CROSS_REACTIVITY',
        'ALL',
        'amoxicillin',
        'EXACT_INGREDIENT',
        'cefadroxil',
        'EXACT_INGREDIENT',
        'side_chain_structural',
        'side_chain_structural',
        'HIGH',
        'Review reaction phenotype and evidence-supported side-chain risk',
        'Potential side-chain cross-reactivity',
        'This explicit ingredient-to-ingredient rule tests side-chain-aware matching.',
        'true',
        'true',
        'SafeScribe Clinical Policy',
        'Explicit side-chain relationship',
        'draft',
      ],
    ]);
    const ingredientsSheet = XLSX.utils.aoa_to_sheet([
      [...IMPORT_INGREDIENT_COLUMNS],
      ['Clavulin 875 mg / 125 mg tablet', 'amoxicillin-clavulanate', 'amoxicillin|clavulanic acid'],
      ['Amoxil 500 mg capsule', 'amoxicillin', 'amoxicillin'],
    ]);
    const labRulesSheet = XLSX.utils.aoa_to_sheet([
      [...IMPORT_LAB_RULE_COLUMNS],
      [
        'LAB-METFORMIN-EGFR',
        'LAB_THRESHOLD',
        'ALL',
        'metformin',
        'egfr',
        'eGFR',
        '33914-3',
        'LT',
        '30',
        '',
        'mL/min',
        '365',
        'REQUIRE_REVIEW',
        'HIGH',
        'Avoid or use specialist-guided dose reduction',
        'eGFR below 30 mL/min',
        'Patient eGFR is {lab_value} mL/min. Metformin is contraindicated when eGFR < 30.',
        'true',
        'true',
        'SafeScribe Clinical Policy',
        'Renal §1',
        'draft',
      ],
    ]);
    const classTaxonomySheet = XLSX.utils.aoa_to_sheet([
      [...IMPORT_DRUG_CLASS_TAXONOMY_COLUMNS],
      ['penicillin', 'beta-lactam', 'antibiotic', 'allergy'],
      ['cephalosporin', 'beta-lactam', 'antibiotic', 'allergy'],
      ['NSAID', 'anti-inflammatory', 'analgesic', 'renal,GI,allergy'],
      ['biguanide', 'antidiabetic', 'endocrine', 'renal'],
      ['ACE inhibitor', 'RAAS inhibitor', 'cardiovascular', 'renal,potassium'],
    ]);
    const drugsSheet = XLSX.utils.aoa_to_sheet([
      [...IMPORT_DRUG_CATALOG_COLUMNS],
      ['amoxicillin', 'penicillin', 'amoxicillin', 'Amoxil', 'very common'],
      ['cephalexin', 'cephalosporin', 'cephalexin', 'Keflex', ''],
      ['ibuprofen', 'NSAID', 'ibuprofen', 'Advil', 'renal/GI'],
      ['metformin', 'biguanide', 'metformin', '—', 'renal critical'],
      ['ramipril', 'ACE inhibitor', 'ramipril', 'Altace', 'renal/K+'],
    ]);
    XLSX.utils.book_append_sheet(wb, rulesSheet, 'safety_rules');
    XLSX.utils.book_append_sheet(wb, labRulesSheet, 'lab_rules');
    const ddiSheet = XLSX.utils.aoa_to_sheet([
      [...IMPORT_DDI_COLUMNS],
      ['azithromycin', 'amiodarone', 'major', 'QT prolongation risk', 'hard_stop'],
      ['ciprofloxacin', 'prednisone', 'moderate', 'increased tendon rupture risk', 'pharmacist_review'],
    ]);
    const pregnancySheet = XLSX.utils.aoa_to_sheet([
      [...IMPORT_PREGNANCY_COLUMNS],
      ['isotretinoin', 'contraindicated', 'all', 'block', 'do not use', 'teratogenic', 'hard_stop'],
      ['warfarin', 'contraindicated', 'all', 'block', 'avoid', 'fetal bleeding risk', 'hard_stop'],
    ]);
    const lactationSheet = XLSX.utils.aoa_to_sheet([
      [...IMPORT_LACTATION_COLUMNS],
      ['codeine', 'high_risk', 'block', 'avoid', 'risk of infant respiratory depression', 'hard_stop'],
      ['tramadol', 'high_risk', 'block', 'avoid', 'CNS depression risk', 'hard_stop'],
    ]);
    const renalSheet = XLSX.utils.aoa_to_sheet([
      [...IMPORT_RENAL_COLUMNS],
      ['metformin', '0', '29', 'block', 'contraindicated', 'lactic acidosis risk', 'hard_stop'],
      ['metformin', '30', '44', 'caution', 'reduce dose / review', 'reduced clearance', 'pharmacist_review'],
      ['metformin', '45', '999', 'safe', 'standard dosing', '—', 'none'],
    ]);
    XLSX.utils.book_append_sheet(wb, ddiSheet, 'drug_interactions');
    XLSX.utils.book_append_sheet(wb, pregnancySheet, 'pregnancy_rules');
    XLSX.utils.book_append_sheet(wb, lactationSheet, 'lactation_rules');
    XLSX.utils.book_append_sheet(wb, renalSheet, 'renal_rules');
    XLSX.utils.book_append_sheet(wb, ingredientsSheet, 'medication_ingredients');
    XLSX.utils.book_append_sheet(wb, classTaxonomySheet, 'drug_classes');
    XLSX.utils.book_append_sheet(wb, drugsSheet, 'drugs');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  private parseCsv(buffer: Buffer): ParsedImportData {
    const text = buffer.toString('utf-8');
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) throw new Error('CSV file is empty');

    const headers = lines[0].split(',').map((h) => normalizeHeader(h));
    const rules: Array<Record<string, string>> = [];
    const labRules: Array<Record<string, string>> = [];
    const ddiRules: Array<Record<string, string>> = [];
    const pregnancyRules: Array<Record<string, string>> = [];
    const lactationRules: Array<Record<string, string>> = [];
    const renalRules: Array<Record<string, string>> = [];
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCsvLine(lines[i]);
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] ?? '';
      });
      if (row.rule_type === 'LAB_THRESHOLD') labRules.push(row);
      else if (row.rule_code) rules.push(row);
      else if (row.drug_a && row.drug_b) ddiRules.push(row);
      else if (row.drug_name && row.pregnancy_category) pregnancyRules.push(row);
      else if (row.drug_name && row.lactation_risk) lactationRules.push(row);
      else if (row.drug_name && row.egfr_min !== undefined && row.egfr_max !== undefined) renalRules.push(row);
      else if (row.class_name && row.parent_class !== undefined && !row.drug_name) {
        // single-sheet CSV taxonomy not typical
      }
    }

    if (headers.includes('class_name') && headers.includes('parent_class') && !headers.includes('drug_name')) {
      const classTaxonomy: Array<Record<string, string>> = [];
      for (let i = 1; i < lines.length; i++) {
        const values = this.parseCsvLine(lines[i]);
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] ?? '';
        });
        classTaxonomy.push(row);
      }
      return {
        rules: [],
        labRules: [],
        ddiRules: [],
        pregnancyRules: [],
        lactationRules: [],
        renalRules: [],
        ingredients: [],
        classes: [],
        classTaxonomy,
        drugs: [],
      };
    }

    if (
      headers.includes('drug_name') &&
      headers.includes('class_name') &&
      headers.includes('ingredient') &&
      !headers.includes('pregnancy_category')
    ) {
      const drugs: Array<Record<string, string>> = [];
      for (let i = 1; i < lines.length; i++) {
        const values = this.parseCsvLine(lines[i]);
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] ?? '';
        });
        drugs.push(row);
      }
      return {
        rules: [],
        labRules: [],
        ddiRules: [],
        pregnancyRules: [],
        lactationRules: [],
        renalRules: [],
        ingredients: [],
        classes: [],
        classTaxonomy: [],
        drugs,
      };
    }

    const emptyCatalog = {
      classTaxonomy: [] as Array<Record<string, string>>,
      drugs: [] as Array<Record<string, string>>,
      classes: [] as Array<Record<string, string>>,
    };

    const emptyTail = {
      lactationRules: [] as Array<Record<string, string>>,
      renalRules: [] as Array<Record<string, string>>,
      ...emptyCatalog,
    };

    const ingredients: Array<Record<string, string>> = [];
    if (headers.includes('product_name') && !headers.includes('rule_code')) {
      for (let i = 1; i < lines.length; i++) {
        const values = this.parseCsvLine(lines[i]);
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] ?? '';
        });
        ingredients.push(row);
      }
      return { rules: [], labRules: [], ddiRules: [], pregnancyRules: [], ...emptyTail, ingredients, classes: [] };
    }

    if (headers.includes('drug_a') && headers.includes('drug_b')) {
      return { rules: [], labRules: [], ddiRules, pregnancyRules: [], ...emptyTail, ingredients: [], classes: [] };
    }

    if (headers.includes('drug_name') && headers.includes('pregnancy_category')) {
      return { rules: [], labRules: [], ddiRules: [], pregnancyRules, ...emptyTail, ingredients: [], classes: [] };
    }

    if (headers.includes('drug_name') && headers.includes('lactation_risk')) {
      return {
        rules: [],
        labRules: [],
        ddiRules: [],
        pregnancyRules: [],
        lactationRules,
        renalRules: [],
        ingredients: [],
        ...emptyCatalog,
      };
    }

    if (headers.includes('drug_name') && headers.includes('egfr_min')) {
      return {
        rules: [],
        labRules: [],
        ddiRules: [],
        pregnancyRules: [],
        lactationRules: [],
        renalRules,
        ingredients: [],
        ...emptyCatalog,
      };
    }

    if (headers.includes('observation_key') && !headers.includes('allergen_substance')) {
      return { rules: [], labRules, ddiRules: [], pregnancyRules: [], ...emptyTail, ingredients: [], classes: [] };
    }

    return {
      rules,
      labRules,
      ddiRules,
      pregnancyRules,
      lactationRules,
      renalRules,
      ingredients: [],
      ...emptyCatalog,
    };
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  private parseExcel(buffer: Buffer): ParsedImportData {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    const rulesSheet = findSheet(workbook.SheetNames, 'safety_rules');
    const labRulesSheet = findSheet(workbook.SheetNames, 'lab_rules');
    const ddiSheet = findSheet(workbook.SheetNames, 'drug_interactions');
    const pregnancySheet = findSheet(workbook.SheetNames, 'pregnancy_rules');
    const lactationSheet = findSheet(workbook.SheetNames, 'lactation_rules');
    const renalSheet = findSheet(workbook.SheetNames, 'renal_rules');
    const ingredientsSheet = findSheet(workbook.SheetNames, 'medication_ingredients');
    const classesSheet = findSheet(workbook.SheetNames, 'drug_classes');
    const drugsSheet = findSheet(workbook.SheetNames, 'drugs');

    const rules = rulesSheet
      ? this.sheetToRows(workbook.Sheets[rulesSheet], IMPORT_RULE_COLUMNS)
      : [];
    const labRules = labRulesSheet
      ? this.sheetToRows(workbook.Sheets[labRulesSheet], IMPORT_LAB_RULE_COLUMNS)
      : [];
    const ddiRules = ddiSheet
      ? this.sheetToRows(workbook.Sheets[ddiSheet], IMPORT_DDI_COLUMNS)
      : [];
    const pregnancyRules = pregnancySheet
      ? this.sheetToRows(workbook.Sheets[pregnancySheet], IMPORT_PREGNANCY_COLUMNS)
      : [];
    const lactationRules = lactationSheet
      ? this.sheetToRows(workbook.Sheets[lactationSheet], IMPORT_LACTATION_COLUMNS)
      : [];
    const renalRules = renalSheet
      ? this.sheetToRows(workbook.Sheets[renalSheet], IMPORT_RENAL_COLUMNS)
      : [];
    const ingredients = ingredientsSheet
      ? this.sheetToRows(workbook.Sheets[ingredientsSheet], IMPORT_INGREDIENT_COLUMNS)
      : [];

    let classTaxonomy: Array<Record<string, string>> = [];
    let classes: Array<Record<string, string>> = [];
    if (classesSheet) {
      const classRows = this.sheetToRowsRaw(workbook.Sheets[classesSheet]);
      const hasTaxonomyShape = classRows.some(
        (r) => r.class_name?.trim() && r.parent_class !== undefined && !r.drug_name?.trim(),
      );
      if (hasTaxonomyShape) {
        classTaxonomy = classRows.filter((r) => r.class_name?.trim());
      } else {
        classes = classRows.filter((r) => r.drug_name?.trim() && r.class_name?.trim());
      }
    }

    const drugs = drugsSheet
      ? this.sheetToRows(workbook.Sheets[drugsSheet], IMPORT_DRUG_CATALOG_COLUMNS)
      : [];

    if (
      !rules.length &&
      !labRules.length &&
      !ddiRules.length &&
      !pregnancyRules.length &&
      !lactationRules.length &&
      !renalRules.length &&
      !ingredients.length &&
      !classTaxonomy.length &&
      !drugs.length &&
      !classes.length
    ) {
      throw new Error(
        'Workbook must contain safety_rules, lab_rules, drug_interactions, pregnancy_rules, lactation_rules, renal_rules, drug_classes, drugs and/or medication_ingredients sheets',
      );
    }

    return {
      rules,
      labRules,
      ddiRules,
      pregnancyRules,
      lactationRules,
      renalRules,
      ingredients,
      classes,
      classTaxonomy,
      drugs,
    };
  }

  private sheetToRowsRaw(sheet: XLSX.WorkSheet): Array<Record<string, string>> {
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
    return raw.map((row) => {
      const normalized: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        normalized[normalizeHeader(key)] = String(value ?? '').trim();
      }
      return normalized;
    });
  }

  private sheetToRows(
    sheet: XLSX.WorkSheet,
    expectedColumns: readonly string[],
  ): Array<Record<string, string>> {
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
    return raw.map((row) => {
      const normalized: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        normalized[normalizeHeader(key)] = String(value ?? '').trim();
      }
      for (const col of expectedColumns) {
        if (normalized[col] === undefined) normalized[col] = '';
      }
      return normalized;
    });
  }

  mapDdiRowToCreate(row: Record<string, string>) {
    const drugA = row.drug_a.trim();
    const drugB = row.drug_b.trim();
    const severity = (row.severity ?? 'major').trim().toUpperCase();
    const action = mapActionRequired(row.action_required);
    const override = overridePolicyForAction(action);
    const code = `DDI-${normalizeDrugKey(drugA).replace(/\s+/g, '-')}-${normalizeDrugKey(drugB).replace(/\s+/g, '-')}`.toUpperCase();

    return {
      code,
      ruleType: 'DRUG_INTERACTION',
      jurisdiction: 'ALL',
      summary: `Interaction: ${drugA} + ${drugB}`,
      detail: row.description.trim(),
      clinicalSeverity: mapInteractionSeverityToClinical(severity),
      recommendedAction:
        action === 'HARD_STOP'
          ? 'Do not co-prescribe without specialist review'
          : action === 'PHARMACIST_REVIEW'
            ? 'Pharmacist review required before continuing'
            : 'Monitor closely if co-prescribed',
      overrideAllowed: override.overrideAllowed,
      overrideReasonRequired: override.overrideReasonRequired,
      evidenceSource: 'SafeScribe Clinical Policy',
      evidenceSection: 'DDI',
      participants: [],
      ddiDetail: {
        drugA,
        drugB,
        interactionSeverity: severity,
        actionRequired: action,
      },
    };
  }

  mapPregnancyRowToCreate(row: Record<string, string>) {
    const drugName = row.drug_name.trim();
    const category = mapPregnancyCategory(row.pregnancy_category);
    const action = mapActionRequired(row.action_required);
    const override = overridePolicyForAction(action);
    const severityRaw = (row.severity ?? 'block').trim().toLowerCase();
    const clinicalSeverity =
      severityRaw === 'block' || category === 'CONTRAINDICATED'
        ? 'CRITICAL'
        : severityRaw === 'moderate'
          ? 'MODERATE'
          : 'HIGH';
    const code = `PREG-${normalizeDrugKey(drugName).replace(/\s+/g, '-')}`.toUpperCase();

    return {
      code,
      ruleType: 'PREGNANCY',
      jurisdiction: 'ALL',
      summary: `${drugName} — ${category.toLowerCase()} in pregnancy`,
      detail: [row.note?.trim(), row.recommendation?.trim()].filter(Boolean).join(' '),
      clinicalSeverity,
      recommendedAction: row.recommendation.trim(),
      overrideAllowed: override.overrideAllowed,
      overrideReasonRequired: override.overrideReasonRequired,
      evidenceSource: 'SafeScribe Clinical Policy',
      evidenceSection: 'Pregnancy',
      participants: [],
      pregnancyDetail: {
        drugName,
        pregnancyCategory: category,
        trimester: (row.trimester ?? 'all').trim().toLowerCase(),
        clinicalNote: row.note?.trim() || null,
        actionRequired: action,
      },
    };
  }

  mapLactationRowToCreate(row: Record<string, string>) {
    const drugName = row.drug_name.trim();
    const risk = mapLactationRisk(row.lactation_risk);
    const band = mapBandSeverityFromImport(row.severity);
    const action = mapActionRequired(row.action_required);
    const override = overridePolicyForAction(action);
    const code = `LACT-${normalizeDrugKey(drugName).replace(/\s+/g, '-')}`.toUpperCase();

    return {
      code,
      ruleType: 'LACTATION',
      jurisdiction: 'ALL',
      summary: `${drugName} — lactation risk`,
      detail: [row.note?.trim(), row.recommendation?.trim()].filter(Boolean).join(' '),
      clinicalSeverity: mapImportSeverityToClinical(row.severity),
      recommendedAction: row.recommendation.trim(),
      overrideAllowed: override.overrideAllowed,
      overrideReasonRequired: override.overrideReasonRequired,
      evidenceSource: 'SafeScribe Clinical Policy',
      evidenceSection: 'Lactation',
      participants: [],
      lactationDetail: {
        drugName,
        lactationRisk: risk,
        bandSeverity: band,
        clinicalNote: row.note?.trim() || null,
        actionRequired: action,
      },
    };
  }

  mapRenalRowToCreate(row: Record<string, string>) {
    const drugName = row.drug_name.trim();
    const egfrMin = Number(row.egfr_min);
    const egfrMax = Number(row.egfr_max);
    const band = mapBandSeverityFromImport(row.severity);
    const action = mapActionRequired(row.action_required);
    const override = overridePolicyForAction(action);
    const code = `RENAL-${normalizeDrugKey(drugName).replace(/\s+/g, '-')}-${egfrMin}-${egfrMax}`.toUpperCase();

    return {
      code,
      ruleType: 'RENAL_EGFR_BAND',
      jurisdiction: 'ALL',
      summary: `${drugName} renal band eGFR ${egfrMin}–${egfrMax}`,
      detail: [row.note?.trim(), row.recommendation?.trim()].filter(Boolean).join(' ').replace(/^—$/, '') ||
        `Patient eGFR is {egfr} mL/min (band ${egfrMin}–${egfrMax}).`,
      clinicalSeverity: mapImportSeverityToClinical(row.severity),
      recommendedAction: row.recommendation.trim(),
      overrideAllowed: override.overrideAllowed,
      overrideReasonRequired: override.overrideReasonRequired,
      evidenceSource: 'SafeScribe Clinical Policy',
      evidenceSection: 'Renal eGFR',
      participants: [],
      renalDetail: {
        drugName,
        egfrMin,
        egfrMax,
        bandSeverity: band,
        clinicalNote: row.note?.trim() || null,
        actionRequired: action,
      },
    };
  }

  mapLabRuleRowToCreate(row: Record<string, string>) {
    return {
      code: row.rule_code.trim(),
      ruleType: 'LAB_THRESHOLD',
      jurisdiction: row.jurisdiction?.trim() || 'ALL',
      summary: row.alert_summary.trim(),
      detail: row.alert_detail.trim(),
      clinicalSeverity: row.clinical_severity.trim(),
      recommendedAction: row.recommended_action?.trim() || 'Review before proceeding',
      overrideAllowed: parseBool(row.override_allowed ?? 'true'),
      overrideReasonRequired: parseBool(row.override_reason_required ?? 'true'),
      evidenceSource: row.evidence_source?.trim() || null,
      evidenceSection: row.evidence_section?.trim() || null,
      participants: [],
      labDetail: {
        drugIngredient: row.drug_ingredient.trim(),
        observationKey: row.observation_key.trim(),
        observationDisplay: row.observation_display?.trim() || null,
        loincCode: row.loinc_code?.trim() || null,
        comparator: row.comparator.trim(),
        thresholdLow: row.threshold_low?.trim() ? Number(row.threshold_low) : null,
        thresholdHigh: row.threshold_high?.trim() ? Number(row.threshold_high) : null,
        expectedUnit: row.expected_unit?.trim() || null,
        maxAgeDays: row.max_age_days?.trim() ? Number(row.max_age_days) : 365,
        missingLabAction: row.missing_lab_action?.trim() || 'REQUIRE_REVIEW',
      },
    };
  }

  mapRuleRowToCreate(row: Record<string, string>) {
    const matchTypeRaw = row.match_type?.trim() || null;
    const relationshipTypeRaw = row.relationship_type?.trim() || null;
    const matchType =
      normalizeSafetyMatchType(matchTypeRaw) ?? normalizeSafetyMatchType(relationshipTypeRaw);

    return {
      code: row.rule_code.trim(),
      ruleType: row.rule_type.trim(),
      jurisdiction: row.jurisdiction?.trim() || 'ALL',
      summary: row.alert_summary.trim(),
      detail: row.alert_detail.trim(),
      clinicalSeverity: row.clinical_severity.trim(),
      recommendedAction: row.recommended_action?.trim() || 'Review before proceeding',
      overrideAllowed: parseBool(row.override_allowed ?? 'true'),
      overrideReasonRequired: parseBool(row.override_reason_required ?? 'true'),
      matchType,
      relationshipType: relationshipTypeRaw,
      evidenceSource: row.evidence_source?.trim() || null,
      evidenceSection: row.evidence_section?.trim() || null,
      participants: [
        {
          participantKey: 'allergen',
          selectorType: row.allergen_selector?.trim() || 'EXACT_INGREDIENT',
          conceptText: row.allergen_substance.trim(),
        },
        ...(row.trigger_substance?.trim() || row.trigger_selector?.trim()
          ? [
              {
                participantKey: 'trigger_substance',
                selectorType: row.trigger_selector?.trim() || 'EXACT_INGREDIENT',
                conceptText: row.trigger_substance?.trim() || '',
              },
            ]
          : row.trigger_selector === 'HAS_INGREDIENT'
            ? [
                {
                  participantKey: 'trigger_substance',
                  selectorType: 'HAS_INGREDIENT',
                  conceptText: row.allergen_substance.trim(),
                },
              ]
            : []),
      ],
    };
  }
}

/**
 * Exact header contracts for clinical-repository and Renew workflow workbooks.
 * Headers match the final sample workbooks in Safety_03082026/.
 */

export const XLSX_LIMITS = {
  maxBytes: 15 * 1024 * 1024,
  maxRows: 25_000,
  maxColumns: 80,
  maxCellLength: 20_000,
  expectedSheetCount: 1,
} as const;

export type ClinicalFileTypeKey =
  | 'allergy_cross_reactivity_rules'
  | 'drug_interactions'
  | 'drug_disease_rules'
  | 'renal_rules'
  | 'lab_threshold_rules'
  | 'pregnancy_rules'
  | 'lactation_rules'
  | 'clinical_value_sets'
  | 'clinical_value_set_members'
  | 'rule_evidence'
  | 'test_cases'
  | 'test_inputs'
  | 'renew_medication_indications'
  | 'renew_monitoring_rules'
  | 'renew_input_definitions'
  | 'renew_conditional_questions';

export type WorkbookDomain =
  | 'ALLERGY_CROSS_REACTIVITY'
  | 'DRUG_INTERACTION'
  | 'DRUG_DISEASE'
  | 'RENAL'
  | 'LAB_THRESHOLD'
  | 'PREGNANCY'
  | 'LACTATION'
  | 'VALUE_SET'
  | 'VALUE_SET_MEMBER'
  | 'RULE_EVIDENCE'
  | 'TEST_CASE'
  | 'TEST_INPUT'
  | 'RENEW_MEDICATION_INDICATIONS'
  | 'RENEW_MONITORING_RULES'
  | 'RENEW_INPUT_DEFINITIONS'
  | 'RENEW_CONDITIONAL_QUESTIONS';

export type ImportIssue = {
  severity: 'ERROR' | 'WARNING';
  code: string;
  row: number;
  column?: string;
  value?: unknown;
  message: string;
  suggestedFix?: string;
};

export type ImportIssueSummary = {
  code: string;
  severity: 'ERROR' | 'WARNING';
  message: string;
  suggestedFix?: string;
  count: number;
  sampleRows: number[];
  reason: string;
};

const ISSUE_REASONS: Record<string, string> = {
  UNRESOLVED_SELECTOR:
    'This drug or ingredient code is not in the pinned terminology release. Drafts can still be created; matching in live consultations may miss until the code is resolved.',
  TERMINOLOGY_LOOKUP_FAILED:
    'Terminology lookup timed out or failed. The row was accepted as a draft with a warning so import can continue.',
  MISSING_VALUE_SET:
    'The row references a clinical value set that is not in the repository yet. Upload the value-sets workbook in the same batch, or acknowledge if it will be added later.',
  UNRESOLVED_MEMBER_CODE:
    'This value-set member has no terminology or local code, so it cannot match products until resolved.',
  UNRESOLVED_EVIDENCE_SOURCE:
    'The evidence source is marked unresolved, so it should not be treated as supporting a published rule until reviewed.',
  DRAFT_WITH_EFFECTIVE_DATE:
    'Draft rows usually should not carry a live effective start date. Publishing will still work; confirm the date is intentional.',
  HARD_STOP_OVERRIDE:
    'A HARD_STOP rule allows override without requiring a reason. Pharmacists should record why they overrode a hard stop.',
  UNKNOWN_CONTENT_STATUS:
    'The content status is non-standard and will be treated as DRAFT.',
  MISSING_UNIT:
    'A numeric threshold is present without a unit. Confirm the metric does not require one.',
  REQUIRED_FIELD: 'A required column is empty. Fix the workbook or skip this file.',
  INVALID_SEVERITY: 'Alert severity is not a controlled value (INFO, LOW, MODERATE, HIGH, CRITICAL).',
  THRESHOLD_ORDER: 'The minimum threshold is greater than the maximum.',
};

export function importIssueReason(code: string, fallback: string): string {
  return ISSUE_REASONS[code] ?? fallback;
}

export function summarizeImportIssues(issues: ImportIssue[]): ImportIssueSummary[] {
  const map = new Map<string, ImportIssueSummary>();
  for (const issue of issues) {
    const key = `${issue.severity}:${issue.code}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      if (existing.sampleRows.length < 8) existing.sampleRows.push(issue.row);
      continue;
    }
    map.set(key, {
      code: issue.code,
      severity: issue.severity,
      message: issue.message,
      suggestedFix: issue.suggestedFix,
      count: 1,
      sampleRows: [issue.row],
      reason: importIssueReason(issue.code, issue.message),
    });
  }
  return [...map.values()].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'ERROR' ? -1 : 1;
    return b.count - a.count;
  });
}

export type WorkbookDefinition = {
  typeKey: ClinicalFileTypeKey;
  schemaVersion: string;
  domain: WorkbookDomain;
  exactHeaders: readonly string[];
  businessKeyColumns: readonly string[];
  /** Maps row fields to SafetyRuleType when promoting clinical rules */
  safetyRuleType?: string;
};

export const ALLERGY_CROSS_REACTIVITY_HEADERS = [
  'row_key', 'import_action', 'rule_code', 'rule_version', 'jurisdiction',
  'source_selector_type', 'source_selector_code', 'source_selector_version',
  'target_selector_type', 'target_selector_code', 'target_selector_version',
  'relationship_basis', 'source_allergy_status_required',
  'reaction_phenotype_required', 'rule_effect', 'alert_severity',
  'recommended_action_code', 'alert_summary', 'alert_detail', 'override_allowed',
  'override_reason_required', 'subsequent_tolerance_policy', 'deduplication_group',
  'specificity_rank', 'evidence_reference_code', 'evidence_source_url',
  'content_status', 'effective_start_date', 'change_summary', 'clinical_notes',
] as const;

export const DRUG_INTERACTIONS_HEADERS = [
  'row_key', 'import_action', 'interaction_code', 'rule_version', 'jurisdiction',
  'drug_a_selector_type', 'drug_a_selector_code', 'drug_a_selector_version',
  'drug_a_display_name_snapshot', 'drug_b_selector_type', 'drug_b_selector_code',
  'drug_b_selector_version', 'drug_b_display_name_snapshot', 'pair_match_mode',
  'exposure_window_code', 'interaction_mechanism_code', 'clinical_effect_code',
  'applicability_condition_code', 'rule_effect', 'alert_severity',
  'recommended_action_code', 'alert_summary', 'alert_detail', 'monitoring_code',
  'monitoring_detail', 'override_allowed', 'override_reason_required',
  'deduplication_group', 'specificity_rank', 'evidence_reference_code',
  'evidence_source_url', 'content_status', 'effective_start_date', 'change_summary',
  'clinical_notes',
] as const;

export const DRUG_DISEASE_HEADERS = [
  'row_key', 'import_action', 'rule_code', 'rule_version', 'jurisdiction',
  'drug_selector_type', 'drug_selector_code', 'drug_selector_version',
  'drug_display_name_snapshot', 'drug_route_scope_code', 'condition_code_system_uri',
  'condition_concept_code', 'condition_terminology_version',
  'condition_display_name_snapshot', 'condition_match_mode',
  'condition_clinical_status_required', 'condition_temporality_code',
  'condition_severity_requirement', 'condition_verification_requirement',
  'applicability_condition_code', 'clinical_rationale_code', 'rule_effect',
  'alert_severity', 'recommended_action_code', 'alert_summary', 'alert_detail',
  'monitoring_code', 'monitoring_detail', 'override_allowed',
  'override_reason_required', 'deduplication_group', 'specificity_rank',
  'evidence_reference_code', 'evidence_source_url', 'content_status',
  'effective_start_date', 'change_summary', 'clinical_notes',
] as const;

export const RENAL_RULES_HEADERS = [
  'row_key', 'import_action', 'rule_code', 'rule_version', 'jurisdiction',
  'drug_selector_type', 'drug_selector_code', 'drug_selector_version',
  'drug_display_name_snapshot', 'drug_route_scope_code', 'applicability_indication_code',
  'renal_metric_code', 'renal_metric_unit', 'threshold_min_value', 'threshold_min_inclusive',
  'threshold_max_value', 'threshold_max_inclusive', 'dialysis_status_requirement',
  'renal_function_stability_requirement', 'missing_or_stale_result_action',
  'applicability_condition_code', 'clinical_rationale_code', 'rule_effect',
  'alert_severity', 'recommended_action_code', 'dose_recommendation_scope',
  'recommended_single_dose_value', 'recommended_dose_unit', 'recommended_interval_hours',
  'maximum_daily_dose_value', 'maximum_daily_dose_unit', 'dose_instruction_snapshot',
  'alert_summary', 'alert_detail', 'monitoring_code', 'monitoring_detail',
  'override_allowed', 'override_reason_required', 'deduplication_group',
  'specificity_rank', 'evidence_reference_code', 'evidence_source_url',
  'content_status', 'effective_start_date', 'change_summary', 'clinical_notes',
] as const;

export const LAB_THRESHOLD_HEADERS = [
  'row_key', 'import_action', 'rule_code', 'rule_version', 'jurisdiction',
  'drug_selector_type', 'drug_selector_code', 'drug_selector_version',
  'drug_display_name_snapshot', 'drug_route_scope_code', 'applicability_indication_code',
  'patient_group_code', 'treatment_phase_code', 'observation_code_system_uri',
  'observation_code', 'observation_display_name', 'specimen_type_code',
  'result_value_type', 'expected_unit_ucum_code', 'threshold_basis_code',
  'threshold_min_value', 'threshold_min_inclusive', 'threshold_max_value',
  'threshold_max_inclusive', 'reference_limit_direction', 'change_from_baseline_value',
  'change_direction', 'max_result_age_days', 'confirmation_requirement',
  'missing_or_stale_result_action', 'unit_mismatch_action', 'clinical_rationale_code',
  'rule_effect', 'alert_severity', 'recommended_action_code', 'alert_summary',
  'alert_detail', 'monitoring_code', 'monitoring_detail', 'override_allowed',
  'override_reason_required', 'deduplication_group', 'specificity_rank',
  'evidence_reference_code', 'evidence_source_url', 'content_status',
  'effective_start_date', 'change_summary', 'clinical_notes',
] as const;

export const PREGNANCY_RULES_HEADERS = [
  'row_key', 'import_action', 'rule_code', 'rule_version', 'jurisdiction',
  'drug_selector_type', 'drug_selector_code', 'drug_selector_version',
  'drug_display_name_snapshot', 'drug_route_scope_code', 'pregnancy_status_requirement',
  'pregnancy_status_unknown_action', 'gestational_age_basis', 'gestational_age_min_weeks',
  'gestational_age_min_inclusive', 'gestational_age_max_weeks', 'gestational_age_max_inclusive',
  'trimester_snapshot', 'gestational_age_unknown_action', 'applicability_indication_code',
  'exposure_context_code', 'dose_scope_code', 'dose_threshold_value', 'dose_threshold_unit',
  'monitoring_duration_trigger_hours', 'clinical_rationale_code', 'rule_effect',
  'alert_severity', 'recommended_action_code', 'specialist_review_required',
  'monitoring_code', 'monitoring_detail', 'alert_summary', 'alert_detail',
  'alternative_guidance', 'override_allowed', 'override_reason_required',
  'deduplication_group', 'specificity_rank', 'evidence_reference_code',
  'evidence_source_url', 'evidence_locator', 'content_status', 'effective_start_date',
  'change_summary', 'clinical_notes',
] as const;

export const LACTATION_RULES_HEADERS = [
  'record_id', 'rule_id', 'rule_version', 'rule_name', 'medication_selector_type',
  'medication_selector_code', 'medication_selector_display', 'terminology_system',
  'terminology_version', 'value_set_version', 'route_scope', 'formulation_scope',
  'maternal_indication_qualifier', 'lactation_status', 'feeding_extent',
  'infant_age_min_days', 'infant_age_max_days', 'infant_gestational_context',
  'infant_health_context', 'milk_supply_effect', 'exposure_risk_level',
  'recommendation', 'interruption_required', 'interruption_duration_hours',
  'discard_expressed_milk', 'infant_monitoring_required',
  'infant_monitoring_parameters', 'maternal_monitoring_parameters', 'alert_severity',
  'alert_type', 'clinical_rationale', 'recommended_action', 'safer_alternative_text',
  'override_allowed', 'override_reason_required', 'acknowledgement_required',
  'deduplication_key', 'specificity_rank', 'evidence_id', 'evidence_summary',
  'evidence_url', 'evidence_date', 'review_due_date', 'status',
  'effective_start_date', 'implementation_notes',
] as const;

export const CLINICAL_VALUE_SETS_HEADERS = [
  'row_id', 'value_set_code', 'value_set_version', 'display_name', 'description',
  'clinical_domain', 'intended_use', 'member_concept_type', 'terminology_basis',
  'candidate_generation_method', 'membership_mode', 'route_scope', 'dose_form_scope',
  'inclusion_definition', 'exclusion_definition', 'clinical_steward',
  'review_frequency_months', 'terminology_release_snapshot', 'change_summary',
  'record_status', 'approval_status', 'effective_from', 'effective_to',
  'admin_upload_notes',
] as const;

export const CLINICAL_VALUE_SET_MEMBERS_HEADERS = [
  'row_id', 'value_set_code', 'value_set_version', 'member_sequence',
  'membership_action', 'member_selector_type', 'member_local_code',
  'member_display_name', 'concept_domain', 'terminology_system',
  'terminology_concept_code', 'terminology_display_name', 'terminology_version',
  'route_scope', 'dose_form_scope', 'candidate_source', 'candidate_query_reference',
  'mapping_method', 'mapping_confidence', 'clinical_rationale',
  'clinical_review_status', 'reviewed_by', 'reviewed_at', 'record_status',
  'effective_from', 'effective_to', 'change_summary', 'admin_upload_notes',
] as const;

export const RULE_EVIDENCE_HEADERS = [
  'evidence_link_id', 'rule_code', 'rule_version', 'clinical_domain', 'evidence_role',
  'source_type', 'source_title', 'source_organization', 'source_jurisdiction',
  'source_identifier', 'source_version_or_date', 'source_url', 'source_locator',
  'evidence_summary', 'applicability_to_rule', 'limitations_or_uncertainty',
  'evidence_quality', 'recommendation_strength', 'supports_rule_outcome',
  'extracted_by', 'extraction_date', 'clinical_reviewer', 'clinical_review_date',
  'next_review_due', 'source_status', 'record_status', 'approval_status',
  'effective_from', 'effective_to', 'admin_upload_notes',
] as const;

export const TEST_CASES_HEADERS = [
  'record_id', 'test_case_id', 'suite_version', 'test_case_name', 'safety_domain',
  'test_type', 'priority', 'jurisdiction', 'scenario_summary', 'rule_code_under_test',
  'rule_version_under_test', 'input_bundle_key', 'required_repository_release',
  'required_terminology_release', 'expected_raw_match_count',
  'expected_primary_rule_code', 'expected_rule_effect', 'expected_alert_severity',
  'expected_action_code', 'expected_deduplicated_finding_count',
  'expected_no_match_reason', 'pass_criteria', 'execution_mode', 'content_status',
  'test_owner_role', 'implementation_notes',
] as const;

export const TEST_INPUTS_HEADERS = [
  'record_id', 'input_bundle_key', 'input_sequence', 'input_type', 'entity_role',
  'concept_system', 'concept_code', 'display_name_snapshot', 'ingredient_system',
  'ingredient_code', 'ingredient_display_snapshot', 'route_code', 'route_display',
  'dose_form', 'dose_value', 'dose_unit', 'course_duration_value',
  'course_duration_unit', 'clinical_status', 'verification_status',
  'reaction_phenotype', 'severity_qualifier', 'observation_code',
  'observation_value', 'observation_unit', 'observation_age_days',
  'gestational_age_weeks', 'breastfeeding_status', 'infant_age_days',
  'dialysis_status', 'boolean_value', 'text_value', 'terminology_release',
  'resolution_status', 'content_status', 'implementation_notes',
] as const;

export const RENEW_MEDICATION_INDICATIONS_HEADERS = [
  'ingredient_id', 'drug_name', 'indication_id', 'indication_name',
  'suggestion_rank', 'common_indication', 'active',
] as const;

export const RENEW_MONITORING_RULES_HEADERS = [
  'rule_id', 'applies_to_type', 'applies_to_id', 'indication_id', 'input_type',
  'input_code', 'requirement', 'freshness_days', 'action_if_missing', 'active',
] as const;

export const RENEW_INPUT_DEFINITIONS_HEADERS = [
  'input_code', 'label', 'category', 'data_type', 'unit', 'ui_component',
  'allow_date', 'allow_not_available', 'normal_range_display', 'active',
] as const;

export const RENEW_CONDITIONAL_QUESTIONS_HEADERS = [
  'question_rule_id', 'applies_to_type', 'applies_to_id', 'indication_id',
  'question_code', 'question_text', 'response_type', 'trigger_answer',
  'action_on_trigger', 'followup_prompt', 'active',
] as const;

export const RENEW_WORKFLOW_FILE_TYPES: ClinicalFileTypeKey[] = [
  'renew_medication_indications',
  'renew_monitoring_rules',
  'renew_input_definitions',
  'renew_conditional_questions',
];

export function isRenewWorkflowFileType(key: string | null | undefined): key is ClinicalFileTypeKey {
  return Boolean(key && (RENEW_WORKFLOW_FILE_TYPES as string[]).includes(key));
}

export const WORKBOOK_REGISTRY: Record<ClinicalFileTypeKey, WorkbookDefinition> = {
  allergy_cross_reactivity_rules: {
    typeKey: 'allergy_cross_reactivity_rules',
    schemaVersion: '1.0',
    domain: 'ALLERGY_CROSS_REACTIVITY',
    exactHeaders: ALLERGY_CROSS_REACTIVITY_HEADERS,
    businessKeyColumns: ['rule_code', 'rule_version', 'jurisdiction'],
    safetyRuleType: 'CROSS_REACTIVITY',
  },
  drug_interactions: {
    typeKey: 'drug_interactions',
    schemaVersion: '1.0',
    domain: 'DRUG_INTERACTION',
    exactHeaders: DRUG_INTERACTIONS_HEADERS,
    businessKeyColumns: ['interaction_code', 'rule_version', 'jurisdiction'],
    safetyRuleType: 'DRUG_INTERACTION',
  },
  drug_disease_rules: {
    typeKey: 'drug_disease_rules',
    schemaVersion: '1.0',
    domain: 'DRUG_DISEASE',
    exactHeaders: DRUG_DISEASE_HEADERS,
    businessKeyColumns: ['rule_code', 'rule_version', 'jurisdiction'],
    safetyRuleType: 'DRUG_DISEASE',
  },
  renal_rules: {
    typeKey: 'renal_rules',
    schemaVersion: '1.0',
    domain: 'RENAL',
    exactHeaders: RENAL_RULES_HEADERS,
    businessKeyColumns: ['rule_code', 'rule_version', 'jurisdiction'],
    safetyRuleType: 'RENAL_EGFR_BAND',
  },
  lab_threshold_rules: {
    typeKey: 'lab_threshold_rules',
    schemaVersion: '1.0',
    domain: 'LAB_THRESHOLD',
    exactHeaders: LAB_THRESHOLD_HEADERS,
    businessKeyColumns: ['rule_code', 'rule_version', 'jurisdiction'],
    safetyRuleType: 'LAB_THRESHOLD',
  },
  pregnancy_rules: {
    typeKey: 'pregnancy_rules',
    schemaVersion: '1.0',
    domain: 'PREGNANCY',
    exactHeaders: PREGNANCY_RULES_HEADERS,
    businessKeyColumns: ['rule_code', 'rule_version', 'jurisdiction'],
    safetyRuleType: 'PREGNANCY',
  },
  lactation_rules: {
    typeKey: 'lactation_rules',
    schemaVersion: '1.0',
    domain: 'LACTATION',
    exactHeaders: LACTATION_RULES_HEADERS,
    businessKeyColumns: ['rule_id', 'rule_version'],
    safetyRuleType: 'LACTATION',
  },
  clinical_value_sets: {
    typeKey: 'clinical_value_sets',
    schemaVersion: '1.0',
    domain: 'VALUE_SET',
    exactHeaders: CLINICAL_VALUE_SETS_HEADERS,
    businessKeyColumns: ['value_set_code', 'value_set_version'],
  },
  clinical_value_set_members: {
    typeKey: 'clinical_value_set_members',
    schemaVersion: '1.0',
    domain: 'VALUE_SET_MEMBER',
    exactHeaders: CLINICAL_VALUE_SET_MEMBERS_HEADERS,
    businessKeyColumns: ['value_set_code', 'value_set_version', 'member_sequence'],
  },
  rule_evidence: {
    typeKey: 'rule_evidence',
    schemaVersion: '1.0',
    domain: 'RULE_EVIDENCE',
    exactHeaders: RULE_EVIDENCE_HEADERS,
    businessKeyColumns: ['evidence_link_id'],
  },
  test_cases: {
    typeKey: 'test_cases',
    schemaVersion: '1.0',
    domain: 'TEST_CASE',
    exactHeaders: TEST_CASES_HEADERS,
    businessKeyColumns: ['test_case_id', 'suite_version'],
  },
  test_inputs: {
    typeKey: 'test_inputs',
    schemaVersion: '1.0',
    domain: 'TEST_INPUT',
    exactHeaders: TEST_INPUTS_HEADERS,
    businessKeyColumns: ['record_id'],
  },
  renew_medication_indications: {
    typeKey: 'renew_medication_indications',
    schemaVersion: '1.0',
    domain: 'RENEW_MEDICATION_INDICATIONS',
    exactHeaders: RENEW_MEDICATION_INDICATIONS_HEADERS,
    businessKeyColumns: ['ingredient_id', 'indication_id'],
  },
  renew_monitoring_rules: {
    typeKey: 'renew_monitoring_rules',
    schemaVersion: '1.0',
    domain: 'RENEW_MONITORING_RULES',
    exactHeaders: RENEW_MONITORING_RULES_HEADERS,
    businessKeyColumns: ['rule_id'],
  },
  renew_input_definitions: {
    typeKey: 'renew_input_definitions',
    schemaVersion: '1.0',
    domain: 'RENEW_INPUT_DEFINITIONS',
    exactHeaders: RENEW_INPUT_DEFINITIONS_HEADERS,
    businessKeyColumns: ['input_code'],
  },
  renew_conditional_questions: {
    typeKey: 'renew_conditional_questions',
    schemaVersion: '1.0',
    domain: 'RENEW_CONDITIONAL_QUESTIONS',
    exactHeaders: RENEW_CONDITIONAL_QUESTIONS_HEADERS,
    businessKeyColumns: ['question_rule_id'],
  },
};

export function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export function buildHeaderFingerprint(headers: unknown[]): string {
  return headers.map(normalizeHeader).join('|');
}

export function fingerprintWorkbook(headers: unknown[]): ClinicalFileTypeKey | null {
  const fingerprint = buildHeaderFingerprint(headers);
  for (const def of Object.values(WORKBOOK_REGISTRY)) {
    const expected = buildHeaderFingerprint([...def.exactHeaders]);
    if (fingerprint === expected) return def.typeKey;
  }
  return null;
}

export function isTruthyBool(value: unknown): boolean {
  const v = String(value ?? '')
    .trim()
    .toUpperCase();
  return v === 'TRUE' || v === '1' || v === 'YES' || v === 'Y';
}

export function parseOptionalBool(value: unknown): boolean | null {
  if (value == null || String(value).trim() === '') return null;
  const v = String(value).trim().toUpperCase();
  if (['TRUE', '1', 'YES', 'Y'].includes(v)) return true;
  if (['FALSE', '0', 'NO', 'N'].includes(v)) return false;
  return null;
}

/**
 * Strict Boolean parser for spreadsheet cells. "FALSE" is false.
 * Invalid values throw so import can reject the row instead of treating them as true.
 */
export function parseSpreadsheetBoolean(value: unknown, fieldName: string): boolean | null {
  if (value === null || value === undefined || value === '') return null;

  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;

  if (typeof value === 'string') {
    const normalized = value.trim().toUpperCase();
    if (normalized === 'TRUE' || normalized === 'YES' || normalized === '1') {
      return true;
    }
    if (normalized === 'FALSE' || normalized === 'NO' || normalized === '0') {
      return false;
    }
  }

  throw new Error(`Invalid Boolean for ${fieldName}: ${String(value)}`);
}

export function parseSpreadsheetNumber(value: unknown, fieldName: string): number | null {
  if (value === null || value === undefined || value === '') return null;

  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number for ${fieldName}: ${String(value)}`);
  }
  return parsed;
}

export function parseOptionalNumber(value: unknown): number | null {
  if (value == null || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function cellToString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

export function buildBusinessKey(
  row: Record<string, unknown>,
  columns: readonly string[],
): string {
  return columns.map((c) => cellToString(row[c]) ?? '').join('|');
}

export function mapAlertSeverity(raw: unknown): 'INFO' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' {
  const v = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (v === 'CRITICAL') return 'CRITICAL';
  if (v === 'HIGH') return 'HIGH';
  if (v === 'MODERATE' || v === 'MEDIUM') return 'MODERATE';
  if (v === 'LOW') return 'LOW';
  if (v === 'INFO' || v === 'INFORMATION' || v === 'NONE') return 'INFO';
  // Map worksheet HIGH/MODERATE etc. Fallback for unknown
  if (v.includes('CRIT')) return 'CRITICAL';
  return 'MODERATE';
}

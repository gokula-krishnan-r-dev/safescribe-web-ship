import {
  WORKBOOK_REGISTRY,
  cellToString,
  isTruthyBool,
  mapAlertSeverity,
  parseOptionalBool,
  parseOptionalNumber,
  parseSpreadsheetBoolean,
  type ClinicalFileTypeKey,
  type ImportIssue,
} from '../contracts/workbook-registry';

const SEVERITIES = new Set(['INFO', 'LOW', 'MODERATE', 'HIGH', 'CRITICAL', 'MEDIUM', 'NONE']);
const CONTENT_STATUSES = new Set(['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'RETIRED']);
const MEMBERSHIP_ACTIONS = new Set(['INCLUDE', 'EXCLUDE']);

function issue(
  severity: 'ERROR' | 'WARNING',
  code: string,
  row: number,
  message: string,
  column?: string,
  value?: unknown,
  suggestedFix?: string,
): ImportIssue {
  return { severity, code, row, column, value, message, suggestedFix };
}

function requireField(
  row: Record<string, unknown>,
  column: string,
  sourceRow: number,
  issues: ImportIssue[],
): string | null {
  const v = cellToString(row[column]);
  if (!v) {
    issues.push(
      issue('ERROR', 'REQUIRED_FIELD', sourceRow, `${column} is required.`, column, row[column]),
    );
  }
  return v;
}

/**
 * Stage 3–4 field + semantic validation for a single workbook row.
 */
export function validateWorkbookRow(
  fileTypeKey: ClinicalFileTypeKey,
  sourceRow: number,
  row: Record<string, unknown>,
): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const def = WORKBOOK_REGISTRY[fileTypeKey];

  switch (fileTypeKey) {
    case 'allergy_cross_reactivity_rules': {
      requireField(row, 'rule_code', sourceRow, issues);
      requireField(row, 'rule_version', sourceRow, issues);
      requireField(row, 'source_selector_type', sourceRow, issues);
      requireField(row, 'source_selector_code', sourceRow, issues);
      requireField(row, 'target_selector_type', sourceRow, issues);
      requireField(row, 'target_selector_code', sourceRow, issues);
      requireField(row, 'rule_effect', sourceRow, issues);
      requireField(row, 'alert_severity', sourceRow, issues);
      requireField(row, 'alert_summary', sourceRow, issues);
      validateOverrideConsistency(row, sourceRow, issues);
      validateSeverity(row, sourceRow, issues);
      validateContentStatus(row, 'content_status', sourceRow, issues);
      break;
    }
    case 'drug_interactions': {
      requireField(row, 'interaction_code', sourceRow, issues);
      requireField(row, 'rule_version', sourceRow, issues);
      requireField(row, 'drug_a_selector_type', sourceRow, issues);
      requireField(row, 'drug_a_selector_code', sourceRow, issues);
      requireField(row, 'drug_b_selector_type', sourceRow, issues);
      requireField(row, 'drug_b_selector_code', sourceRow, issues);
      requireField(row, 'pair_match_mode', sourceRow, issues);
      requireField(row, 'rule_effect', sourceRow, issues);
      requireField(row, 'alert_summary', sourceRow, issues);
      validateOverrideConsistency(row, sourceRow, issues);
      validateSeverity(row, sourceRow, issues);
      validateContentStatus(row, 'content_status', sourceRow, issues);
      break;
    }
    case 'drug_disease_rules': {
      requireField(row, 'rule_code', sourceRow, issues);
      requireField(row, 'rule_version', sourceRow, issues);
      requireField(row, 'drug_selector_type', sourceRow, issues);
      requireField(row, 'drug_selector_code', sourceRow, issues);
      requireField(row, 'condition_concept_code', sourceRow, issues);
      requireField(row, 'rule_effect', sourceRow, issues);
      requireField(row, 'alert_summary', sourceRow, issues);
      validateOverrideConsistency(row, sourceRow, issues);
      validateSeverity(row, sourceRow, issues);
      validateContentStatus(row, 'content_status', sourceRow, issues);
      break;
    }
    case 'renal_rules': {
      requireField(row, 'rule_code', sourceRow, issues);
      requireField(row, 'drug_selector_code', sourceRow, issues);
      requireField(row, 'renal_metric_code', sourceRow, issues);
      const min = parseOptionalNumber(row.threshold_min_value);
      const max = parseOptionalNumber(row.threshold_max_value);
      if (min != null && max != null && min > max) {
        issues.push(
          issue(
            'ERROR',
            'THRESHOLD_ORDER',
            sourceRow,
            'threshold_min_value cannot exceed threshold_max_value.',
            'threshold_min_value',
            min,
          ),
        );
      }
      const metric = (cellToString(row.renal_metric_code) ?? '').toUpperCase();
      const isQuantitativeMetric =
        metric.includes('EGFR') ||
        metric.includes('CRCL') ||
        metric.includes('CREAT') ||
        metric.includes('GFR');
      if (isQuantitativeMetric && !cellToString(row.renal_metric_unit)) {
        issues.push(
          issue(
            'ERROR',
            'REQUIRED_FIELD',
            sourceRow,
            'renal_metric_unit is required for quantitative renal metrics (eGFR and CrCl must not be substituted).',
            'renal_metric_unit',
          ),
        );
      } else if (!cellToString(row.renal_metric_unit) && (min != null || max != null)) {
        issues.push(
          issue(
            'WARNING',
            'MISSING_UNIT',
            sourceRow,
            'renal_metric_unit is empty; confirm metric does not require a unit.',
            'renal_metric_unit',
          ),
        );
      }
      requireField(row, 'alert_summary', sourceRow, issues);
      validateOverrideConsistency(row, sourceRow, issues);
      validateSeverity(row, sourceRow, issues);
      break;
    }
    case 'lab_threshold_rules': {
      requireField(row, 'rule_code', sourceRow, issues);
      requireField(row, 'drug_selector_code', sourceRow, issues);
      requireField(row, 'observation_code', sourceRow, issues);
      requireField(row, 'expected_unit_ucum_code', sourceRow, issues);
      requireField(row, 'alert_summary', sourceRow, issues);
      const min = parseOptionalNumber(row.threshold_min_value);
      const max = parseOptionalNumber(row.threshold_max_value);
      if (min != null && max != null && min > max) {
        issues.push(
          issue(
            'ERROR',
            'THRESHOLD_ORDER',
            sourceRow,
            'threshold_min_value cannot exceed threshold_max_value.',
            'threshold_min_value',
            min,
          ),
        );
      }
      validateOverrideConsistency(row, sourceRow, issues);
      validateSeverity(row, sourceRow, issues);
      break;
    }
    case 'pregnancy_rules': {
      requireField(row, 'rule_code', sourceRow, issues);
      requireField(row, 'drug_selector_code', sourceRow, issues);
      requireField(row, 'pregnancy_status_requirement', sourceRow, issues);
      requireField(row, 'alert_summary', sourceRow, issues);
      const gaMin = parseOptionalNumber(row.gestational_age_min_weeks);
      const gaMax = parseOptionalNumber(row.gestational_age_max_weeks);
      if (gaMin != null && gaMax != null && gaMin > gaMax) {
        issues.push(
          issue(
            'ERROR',
            'GESTATIONAL_RANGE',
            sourceRow,
            'gestational_age_min_weeks cannot exceed gestational_age_max_weeks.',
            'gestational_age_min_weeks',
            gaMin,
          ),
        );
      }
      for (const col of [
        'gestational_age_min_inclusive',
        'gestational_age_max_inclusive',
      ] as const) {
        try {
          parseSpreadsheetBoolean(row[col], col);
        } catch {
          issues.push(
            issue(
              'ERROR',
              'INVALID_BOOLEAN',
              sourceRow,
              `Invalid Boolean for ${col}. Use TRUE or FALSE.`,
              col,
              row[col],
            ),
          );
        }
      }
      validateOverrideConsistency(row, sourceRow, issues);
      validateSeverity(row, sourceRow, issues);
      break;
    }
    case 'lactation_rules': {
      requireField(row, 'rule_id', sourceRow, issues);
      requireField(row, 'rule_version', sourceRow, issues);
      requireField(row, 'medication_selector_code', sourceRow, issues);
      requireField(row, 'alert_severity', sourceRow, issues);
      requireField(row, 'recommended_action', sourceRow, issues);
      const ageMin = parseOptionalNumber(row.infant_age_min_days);
      const ageMax = parseOptionalNumber(row.infant_age_max_days);
      if (ageMin != null && ageMax != null && ageMin > ageMax) {
        issues.push(
          issue(
            'ERROR',
            'INFANT_AGE_RANGE',
            sourceRow,
            'infant_age_min_days cannot exceed infant_age_max_days.',
            'infant_age_min_days',
            ageMin,
          ),
        );
      }
      const overrideAllowed = parseOptionalBool(row.override_allowed);
      const overrideReason = parseOptionalBool(row.override_reason_required);
      if (overrideReason === true && overrideAllowed === false) {
        issues.push(
          issue(
            'ERROR',
            'OVERRIDE_INCONSISTENT',
            sourceRow,
            'override_reason_required requires override_allowed = true.',
            'override_reason_required',
          ),
        );
      }
      break;
    }
    case 'clinical_value_sets': {
      requireField(row, 'value_set_code', sourceRow, issues);
      requireField(row, 'value_set_version', sourceRow, issues);
      requireField(row, 'display_name', sourceRow, issues);
      requireField(row, 'clinical_domain', sourceRow, issues);
      requireField(row, 'intended_use', sourceRow, issues);
      requireField(row, 'member_concept_type', sourceRow, issues);
      requireField(row, 'membership_mode', sourceRow, issues);
      requireField(row, 'inclusion_definition', sourceRow, issues);
      validateContentStatus(row, 'record_status', sourceRow, issues);
      break;
    }
    case 'clinical_value_set_members': {
      requireField(row, 'value_set_code', sourceRow, issues);
      requireField(row, 'value_set_version', sourceRow, issues);
      requireField(row, 'member_sequence', sourceRow, issues);
      const action = cellToString(row.membership_action)?.toUpperCase();
      if (!action || !MEMBERSHIP_ACTIONS.has(action)) {
        issues.push(
          issue(
            'ERROR',
            'INVALID_MEMBERSHIP_ACTION',
            sourceRow,
            'membership_action must be INCLUDE or EXCLUDE.',
            'membership_action',
            row.membership_action,
          ),
        );
      }
      requireField(row, 'member_display_name', sourceRow, issues);
      requireField(row, 'concept_domain', sourceRow, issues);
      requireField(row, 'clinical_review_status', sourceRow, issues);
      if (
        !cellToString(row.terminology_concept_code) &&
        !cellToString(row.member_local_code)
      ) {
        issues.push(
          issue(
            'WARNING',
            'UNRESOLVED_MEMBER_CODE',
            sourceRow,
            'Member has neither terminology_concept_code nor member_local_code. Resolve before publication.',
            'terminology_concept_code',
            undefined,
            'Resolve via CCDD/SNOMED before publication.',
          ),
        );
      }
      break;
    }
    case 'rule_evidence': {
      requireField(row, 'evidence_link_id', sourceRow, issues);
      requireField(row, 'rule_code', sourceRow, issues);
      requireField(row, 'rule_version', sourceRow, issues);
      requireField(row, 'clinical_domain', sourceRow, issues);
      requireField(row, 'source_title', sourceRow, issues);
      requireField(row, 'source_organization', sourceRow, issues);
      requireField(row, 'evidence_summary', sourceRow, issues);
      requireField(row, 'source_status', sourceRow, issues);
      const sourceStatus = cellToString(row.source_status)?.toUpperCase();
      if (sourceStatus === 'UNRESOLVED') {
        issues.push(
          issue(
            'WARNING',
            'UNRESOLVED_EVIDENCE_SOURCE',
            sourceRow,
            'Unresolved evidence source cannot support publication.',
            'source_status',
            row.source_status,
          ),
        );
      }
      break;
    }
    case 'test_cases': {
      requireField(row, 'test_case_id', sourceRow, issues);
      requireField(row, 'suite_version', sourceRow, issues);
      requireField(row, 'test_case_name', sourceRow, issues);
      requireField(row, 'safety_domain', sourceRow, issues);
      requireField(row, 'input_bundle_key', sourceRow, issues);
      requireField(row, 'pass_criteria', sourceRow, issues);
      requireField(row, 'execution_mode', sourceRow, issues);
      if (parseOptionalNumber(row.expected_raw_match_count) == null) {
        issues.push(
          issue(
            'ERROR',
            'REQUIRED_FIELD',
            sourceRow,
            'expected_raw_match_count is required and must be numeric.',
            'expected_raw_match_count',
          ),
        );
      }
      if (parseOptionalNumber(row.expected_deduplicated_finding_count) == null) {
        issues.push(
          issue(
            'ERROR',
            'REQUIRED_FIELD',
            sourceRow,
            'expected_deduplicated_finding_count is required and must be numeric.',
            'expected_deduplicated_finding_count',
          ),
        );
      }
      break;
    }
    case 'test_inputs': {
      requireField(row, 'record_id', sourceRow, issues);
      requireField(row, 'input_bundle_key', sourceRow, issues);
      requireField(row, 'input_type', sourceRow, issues);
      requireField(row, 'entity_role', sourceRow, issues);
      if (parseOptionalNumber(row.input_sequence) == null) {
        issues.push(
          issue(
            'ERROR',
            'REQUIRED_FIELD',
            sourceRow,
            'input_sequence is required and must be numeric.',
            'input_sequence',
          ),
        );
      }
      requireField(row, 'resolution_status', sourceRow, issues);
      break;
    }
    case 'renew_medication_indications': {
      requireField(row, 'ingredient_id', sourceRow, issues);
      requireField(row, 'indication_id', sourceRow, issues);
      const rank = parseOptionalNumber(row.suggestion_rank);
      if (rank == null || !Number.isInteger(rank) || rank < 1) {
        issues.push(
          issue(
            'ERROR',
            'INVALID_NUMBER',
            sourceRow,
            'suggestion_rank must be a positive integer.',
            'suggestion_rank',
            row.suggestion_rank,
          ),
        );
      }
      validateRenewBoolean(row, 'common_indication', sourceRow, issues);
      validateRenewBoolean(row, 'active', sourceRow, issues);
      break;
    }
    case 'renew_monitoring_rules': {
      requireField(row, 'rule_id', sourceRow, issues);
      const appliesType = requireField(row, 'applies_to_type', sourceRow, issues)?.toUpperCase();
      requireField(row, 'applies_to_id', sourceRow, issues);
      requireField(row, 'indication_id', sourceRow, issues);
      const inputType = requireField(row, 'input_type', sourceRow, issues)?.toUpperCase();
      requireField(row, 'input_code', sourceRow, issues);
      const requirement = requireField(row, 'requirement', sourceRow, issues)?.toUpperCase();
      const missing = requireField(row, 'action_if_missing', sourceRow, issues)?.toUpperCase();
      if (appliesType && !['CLASS', 'INGREDIENT', 'CCDD_TM', 'CCDD_NTP', 'CCDD_MP'].includes(appliesType)) {
        issues.push(
          issue('ERROR', 'INVALID_ENUM', sourceRow, 'applies_to_type is not supported.', 'applies_to_type', appliesType),
        );
      }
      if (inputType && !['PATIENT_CONTEXT', 'VITAL', 'LAB', 'QUESTION'].includes(inputType)) {
        issues.push(
          issue('ERROR', 'INVALID_ENUM', sourceRow, 'input_type is not supported.', 'input_type', inputType),
        );
      }
      if (requirement && !['REQUIRED', 'RELEVANT', 'CONDITIONAL'].includes(requirement)) {
        issues.push(
          issue('ERROR', 'INVALID_ENUM', sourceRow, 'requirement is not supported.', 'requirement', requirement),
        );
      }
      if (missing && !['NONE', 'REVIEW', 'REFER', 'BLOCK'].includes(missing)) {
        issues.push(
          issue(
            'ERROR',
            'INVALID_ENUM',
            sourceRow,
            'action_if_missing is not supported.',
            'action_if_missing',
            missing,
          ),
        );
      }
      const freshness = parseOptionalNumber(row.freshness_days);
      if (row.freshness_days != null && String(row.freshness_days).trim() !== '') {
        if (freshness == null || freshness < 0 || !Number.isInteger(freshness)) {
          issues.push(
            issue(
              'ERROR',
              'INVALID_NUMBER',
              sourceRow,
              'freshness_days must be an integer >= 0.',
              'freshness_days',
              row.freshness_days,
            ),
          );
        }
      }
      validateRenewBoolean(row, 'active', sourceRow, issues);
      break;
    }
    case 'renew_input_definitions': {
      requireField(row, 'input_code', sourceRow, issues);
      requireField(row, 'label', sourceRow, issues);
      const category = requireField(row, 'category', sourceRow, issues)?.toUpperCase();
      const dataType = requireField(row, 'data_type', sourceRow, issues)?.toUpperCase();
      const ui = requireField(row, 'ui_component', sourceRow, issues)?.toUpperCase();
      if (category && !['PATIENT_CONTEXT', 'VITAL', 'LAB', 'QUESTION'].includes(category)) {
        issues.push(issue('ERROR', 'INVALID_ENUM', sourceRow, 'category is not supported.', 'category', category));
      }
      if (dataType && !['INTEGER', 'DECIMAL', 'TEXT', 'BOOLEAN', 'ENUM', 'DATE', 'COMPOSITE'].includes(dataType)) {
        issues.push(issue('ERROR', 'INVALID_ENUM', sourceRow, 'data_type is not supported.', 'data_type', dataType));
      }
      if (
        ui &&
        !['NUMBER_INPUT', 'TEXT_INPUT', 'SINGLE_SELECT', 'YES_NO', 'DATE_INPUT', 'LAB_INPUT', 'BP_INPUT'].includes(ui)
      ) {
        issues.push(
          issue('ERROR', 'INVALID_ENUM', sourceRow, 'ui_component is not an approved renderer.', 'ui_component', ui),
        );
      }
      if (ui === 'BP_INPUT' && dataType && dataType !== 'COMPOSITE') {
        issues.push(
          issue('ERROR', 'COMPONENT_MISMATCH', sourceRow, 'BP_INPUT requires data_type COMPOSITE.', 'data_type', dataType),
        );
      }
      if (ui === 'LAB_INPUT' && category && category !== 'LAB') {
        issues.push(
          issue('ERROR', 'COMPONENT_MISMATCH', sourceRow, 'LAB_INPUT requires category LAB.', 'category', category),
        );
      }
      validateRenewBoolean(row, 'allow_date', sourceRow, issues);
      validateRenewBoolean(row, 'allow_not_available', sourceRow, issues);
      validateRenewBoolean(row, 'active', sourceRow, issues);
      break;
    }
    case 'renew_conditional_questions': {
      requireField(row, 'question_rule_id', sourceRow, issues);
      const appliesType = requireField(row, 'applies_to_type', sourceRow, issues)?.toUpperCase();
      requireField(row, 'applies_to_id', sourceRow, issues);
      requireField(row, 'indication_id', sourceRow, issues);
      requireField(row, 'question_code', sourceRow, issues);
      requireField(row, 'question_text', sourceRow, issues);
      const responseType = requireField(row, 'response_type', sourceRow, issues)?.toUpperCase();
      requireField(row, 'trigger_answer', sourceRow, issues);
      const action = requireField(row, 'action_on_trigger', sourceRow, issues)?.toUpperCase();
      if (appliesType && !['CLASS', 'INGREDIENT'].includes(appliesType)) {
        issues.push(
          issue('ERROR', 'INVALID_ENUM', sourceRow, 'applies_to_type is not supported.', 'applies_to_type', appliesType),
        );
      }
      if (responseType && !['YES_NO', 'BOOLEAN', 'SINGLE_SELECT', 'TEXT'].includes(responseType)) {
        issues.push(
          issue('ERROR', 'INVALID_ENUM', sourceRow, 'response_type is not supported.', 'response_type', responseType),
        );
      }
      if (action && !['REVIEW', 'REFER', 'BLOCK'].includes(action)) {
        issues.push(
          issue(
            'ERROR',
            'INVALID_ENUM',
            sourceRow,
            'action_on_trigger is not supported.',
            'action_on_trigger',
            action,
          ),
        );
      }
      if (action && action !== 'NONE' && !cellToString(row.followup_prompt)) {
        issues.push(
          issue(
            'ERROR',
            'REQUIRED_FIELD',
            sourceRow,
            'followup_prompt is required when action_on_trigger requires pharmacist review.',
            'followup_prompt',
          ),
        );
      }
      validateRenewBoolean(row, 'active', sourceRow, issues);
      break;
    }
    default: {
      issues.push(
        issue(
          'ERROR',
          'UNKNOWN_FILE_TYPE',
          sourceRow,
          `Unhandled file type ${fileTypeKey as string}`,
        ),
      );
    }
  }

  // Draft content should not carry live effective dates (soft warning for samples)
  const status =
    cellToString(row.content_status) ??
    cellToString(row.record_status) ??
    cellToString(row.status);
  const effective =
    cellToString(row.effective_start_date) ?? cellToString(row.effective_from);
  if (status?.toUpperCase() === 'DRAFT' && effective) {
    issues.push(
      issue(
        'WARNING',
        'DRAFT_WITH_EFFECTIVE_DATE',
        sourceRow,
        'Draft records typically should not have a live effective start date.',
        'effective_start_date',
        effective,
      ),
    );
  }

  // Hard stops must not be silently overridable
  const effect = cellToString(row.rule_effect)?.toUpperCase();
  if (effect === 'HARD_STOP' && isTruthyBool(row.override_allowed) && !isTruthyBool(row.override_reason_required)) {
    issues.push(
      issue(
        'WARNING',
        'HARD_STOP_OVERRIDE',
        sourceRow,
        'HARD_STOP with override_allowed should require an override reason.',
        'override_reason_required',
      ),
    );
  }

  void def;
  return issues;
}

function validateOverrideConsistency(
  row: Record<string, unknown>,
  sourceRow: number,
  issues: ImportIssue[],
) {
  const overrideAllowed = parseOptionalBool(row.override_allowed);
  const overrideReason = parseOptionalBool(row.override_reason_required);
  if (overrideReason === true && overrideAllowed === false) {
    issues.push(
      issue(
        'ERROR',
        'OVERRIDE_INCONSISTENT',
        sourceRow,
        'override_reason_required requires override_allowed = true.',
        'override_reason_required',
      ),
    );
  }
}

function validateSeverity(
  row: Record<string, unknown>,
  sourceRow: number,
  issues: ImportIssue[],
) {
  const sev = cellToString(row.alert_severity)?.toUpperCase();
  if (sev && !SEVERITIES.has(sev)) {
    issues.push(
      issue(
        'ERROR',
        'INVALID_SEVERITY',
        sourceRow,
        `alert_severity "${sev}" is not a controlled value.`,
        'alert_severity',
        row.alert_severity,
      ),
    );
  }
  // force map for type check side-effect
  if (sev) mapAlertSeverity(sev);
}

function validateContentStatus(
  row: Record<string, unknown>,
  column: string,
  sourceRow: number,
  issues: ImportIssue[],
) {
  const status = cellToString(row[column])?.toUpperCase();
  if (status && !CONTENT_STATUSES.has(status) && status !== 'ACTIVE') {
    issues.push(
      issue(
        'WARNING',
        'UNKNOWN_CONTENT_STATUS',
        sourceRow,
        `content status "${status}" is non-standard; treating as DRAFT.`,
        column,
        row[column],
      ),
    );
  }
}

function validateRenewBoolean(
  row: Record<string, unknown>,
  column: string,
  sourceRow: number,
  issues: ImportIssue[],
) {
  try {
    parseSpreadsheetBoolean(row[column], column);
  } catch {
    issues.push(
      issue(
        'ERROR',
        'INVALID_BOOLEAN',
        sourceRow,
        `${column} must be TRUE or FALSE.`,
        column,
        row[column],
      ),
    );
  }
}

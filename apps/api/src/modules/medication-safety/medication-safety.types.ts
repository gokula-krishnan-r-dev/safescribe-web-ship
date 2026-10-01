export type SafetyClinicalSeverity = 'INFO' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export const SAFETY_RULE_TYPES = {
  ALLERGY_DIRECT: 'ALLERGY_DIRECT',
  CROSS_REACTIVITY: 'CROSS_REACTIVITY',
  LAB_THRESHOLD: 'LAB_THRESHOLD',
  DRUG_INTERACTION: 'DRUG_INTERACTION',
  DRUG_DISEASE: 'DRUG_DISEASE',
  PREGNANCY: 'PREGNANCY',
  LACTATION: 'LACTATION',
  RENAL_EGFR_BAND: 'RENAL_EGFR_BAND',
} as const;

export const SAFETY_CLINICAL_SEVERITIES = {
  INFO: 'INFO',
  LOW: 'LOW',
  MODERATE: 'MODERATE',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export const SAFETY_SELECTOR_TYPES = {
  EXACT_INGREDIENT: 'EXACT_INGREDIENT',
  HAS_INGREDIENT: 'HAS_INGREDIENT',
  MEMBER_OF_CLASS: 'MEMBER_OF_CLASS',
  STRUCTURAL_RELATIONSHIP: 'STRUCTURAL_RELATIONSHIP',
} as const;

/** Prisma `SafetyMatchType` enum values (DB-backed). */
export const SAFETY_MATCH_TYPES = [
  'exact_ingredient',
  'combination_product_contains_exact_ingredient',
  'same_class',
  'side_chain_structural',
] as const;

export type SafetyMatchTypeValue = (typeof SAFETY_MATCH_TYPES)[number];

/**
 * Spreadsheet / UI aliases → canonical SafetyMatchType.
 * Common mistake: putting selector-style `structural_relationship` in match_type.
 */
const SAFETY_MATCH_TYPE_ALIASES: Record<string, SafetyMatchTypeValue> = {
  exact_ingredient: 'exact_ingredient',
  exact: 'exact_ingredient',
  combination_product_contains_exact_ingredient: 'combination_product_contains_exact_ingredient',
  combination: 'combination_product_contains_exact_ingredient',
  combo: 'combination_product_contains_exact_ingredient',
  same_class: 'same_class',
  class: 'same_class',
  side_chain_structural: 'side_chain_structural',
  side_chain: 'side_chain_structural',
  structural_relationship: 'side_chain_structural',
  structural: 'side_chain_structural',
};

export function normalizeSafetyMatchType(
  raw: string | null | undefined,
): SafetyMatchTypeValue | null {
  const key = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!key) return null;
  return SAFETY_MATCH_TYPE_ALIASES[key] ?? null;
}

export function isValidSafetyMatchType(value: string | null | undefined): boolean {
  if (value == null || String(value).trim() === '') return true;
  return normalizeSafetyMatchType(value) != null;
}

export const SAFETY_ENGINE_VERSION = 'safety-engine-2.0.1';

export const SAFETY_REDIS_KEYS = {
  ACTIVE_RELEASE_ID: 'safety-engine:active-release-id',
  META: 'safety-engine:meta',
  RULES: 'safety-engine:rules',
  INGREDIENTS: 'safety-engine:ingredients',
  DRUG_CLASSES: 'safety-engine:drug-classes',
  CLASS_INDEX: 'safety-engine:class-index',
  VALUE_SETS: 'safety-engine:value-sets',
} as const;

export type CachedValueSetMember = {
  membershipAction: 'INCLUDE' | 'EXCLUDE';
  memberDisplayName: string;
  memberLocalCode?: string | null;
  memberRowId?: string | null;
  terminologyConceptCode?: string | null;
  terminologyDisplayName?: string | null;
  routeScope?: string | null;
};

export type CachedValueSet = {
  valueSetCode: string;
  valueSetVersion: string;
  displayName: string;
  routeScope?: string | null;
  members: CachedValueSetMember[];
};

export interface CachedSafetyRule {
  ruleId: string;
  versionId: string;
  code: string;
  ruleType: string;
  jurisdiction: string;
  summary: string;
  detail: string;
  clinicalSeverity: SafetyClinicalSeverity;
  recommendedAction: string;
  overrideAllowed: boolean;
  overrideReasonRequired: boolean;
  matchType?: string | null;
  relationshipType?: string | null;
  participants: Array<{
    participantKey: string;
    selectorType: string;
    conceptText: string;
    conceptCode?: string | null;
    selectorVersion?: string | null;
  }>;
  labDetail?: {
    drugIngredient: string;
    observationKey: string;
    observationDisplay?: string | null;
    loincCode?: string | null;
    comparator: string;
    thresholdLow?: number | null;
    thresholdHigh?: number | null;
    expectedUnit?: string | null;
    maxAgeDays: number;
    missingLabAction: string;
  } | null;
  ddiDetail?: {
    drugA: string;
    drugB: string;
    interactionSeverity: string;
    actionRequired: string;
  } | null;
  pregnancyDetail?: {
    drugName: string;
    pregnancyCategory: string;
    trimester: string;
    clinicalNote?: string | null;
    actionRequired: string;
    gestationalAgeMinWeeks?: number | null;
    gestationalAgeMinInclusive?: boolean;
    gestationalAgeMaxWeeks?: number | null;
    gestationalAgeMaxInclusive?: boolean;
  } | null;
  lactationDetail?: {
    drugName: string;
    lactationRisk: string;
    bandSeverity: string;
    clinicalNote?: string | null;
    actionRequired: string;
  } | null;
  renalDetail?: {
    drugName: string;
    egfrMin: number;
    egfrMax: number;
    bandSeverity: string;
    clinicalNote?: string | null;
    actionRequired: string;
  } | null;
  drugDiseaseDetail?: {
    drugSelectorType: string;
    drugSelectorCode: string;
    drugDisplayName?: string | null;
    drugRouteScopeCode?: string | null;
    conditionCodeSystemUri?: string | null;
    conditionConceptCode?: string | null;
    conditionDisplayName?: string | null;
    conditionMatchMode?: string | null;
    conditionClinicalStatusRequired?: string | null;
    conditionTemporalityCode?: string | null;
    conditionSeverityRequirement?: string | null;
    conditionVerificationRequirement?: string | null;
    actionRequired: string;
  } | null;
  deduplicationGroup?: string | null;
  specificityRank?: number;
  ruleEffect?: string | null;
  ruleVersionLabel?: string | null;
}

export interface CachedReleaseMeta {
  releaseId: string;
  version: string;
  checksum: string;
  engineVersion: string;
  ruleCount: number;
  ingredientCount: number;
  classMemberCount: number;
  taxonomyClassCount?: number;
  catalogDrugCount?: number;
  publishedAt: string;
  cachedAt: string;
}

export interface CachedIngredientEntry {
  productName: string;
  genericName?: string | null;
  ingredients: string[];
}

export interface ImportValidationError {
  sheet: string;
  row?: number;
  column?: string;
  message: string;
  /** Present when validating/importing a multi-file batch */
  fileName?: string;
}

export interface ImportPreviewRow {
  rowNumber: number;
  sheet: string;
  status: 'valid' | 'error' | 'warning';
  data: Record<string, string>;
  messages: string[];
}

export interface ImportCommitCounts {
  rulesCreated: number;
  labRulesCreated: number;
  ddiRulesCreated: number;
  pregnancyRulesCreated: number;
  lactationRulesCreated: number;
  renalRulesCreated: number;
  ingredientsCreated: number;
  classesCreated: number;
  taxonomyClassesCreated: number;
  catalogDrugsCreated: number;
}

export interface ImportBatchFileResult extends ImportCommitCounts {
  fileName: string;
  status: 'imported' | 'skipped' | 'failed';
  valid: boolean;
  errorCount: number;
  errors: ImportValidationError[];
  message?: string;
}

export interface ImportBatchCommitResponse {
  fileCount: number;
  importedCount: number;
  failedCount: number;
  skippedCount: number;
  totals: ImportCommitCounts;
  files: ImportBatchFileResult[];
}

export interface ImportBatchPreviewFileResult {
  fileName: string;
  valid: boolean;
  errorCount: number;
  validRowCount: number;
  errors: ImportValidationError[];
}

export interface ImportBatchPreviewResponse {
  valid: boolean;
  fileCount: number;
  validFileCount: number;
  files: ImportBatchPreviewFileResult[];
  errors: ImportValidationError[];
}

export const FINDING_PRIORITY: Record<string, number> = {
  exact_ingredient: 100,
  combination_product_contains_exact_ingredient: 90,
  pregnancy_contraindicated: 95,
  lactation_high_risk: 94,
  renal_band_block: 93,
  ddi_major: 92,
  lab_threshold_violation: 85,
  renal_band_caution: 80,
  ddi_moderate: 75,
  side_chain_structural: 70,
  ddi_minor: 55,
  drug_disease: 88,
  same_class: 50,
};

export const IMPORT_RULE_COLUMNS = [
  'rule_code',
  'rule_type',
  'jurisdiction',
  'allergen_substance',
  'allergen_selector',
  'trigger_substance',
  'trigger_selector',
  'match_type',
  'relationship_type',
  'clinical_severity',
  'recommended_action',
  'alert_summary',
  'alert_detail',
  'override_allowed',
  'override_reason_required',
  'evidence_source',
  'evidence_section',
  'status',
] as const;

export const IMPORT_INGREDIENT_COLUMNS = ['product_name', 'generic_name', 'ingredients'] as const;

export const IMPORT_CLASS_COLUMNS = ['drug_name', 'class_name', 'parent_class', 'therapeutic_group'] as const;

export const IMPORT_DRUG_CLASS_TAXONOMY_COLUMNS = [
  'class_name',
  'parent_class',
  'therapeutic_group',
  'risk_tag',
] as const;

export const IMPORT_DRUG_CATALOG_COLUMNS = [
  'drug_name',
  'class_name',
  'ingredient',
  'common_brand',
  'notes',
] as const;

export const IMPORT_LAB_RULE_COLUMNS = [
  'rule_code',
  'rule_type',
  'jurisdiction',
  'drug_ingredient',
  'observation_key',
  'observation_display',
  'loinc_code',
  'comparator',
  'threshold_low',
  'threshold_high',
  'expected_unit',
  'max_age_days',
  'missing_lab_action',
  'clinical_severity',
  'recommended_action',
  'alert_summary',
  'alert_detail',
  'override_allowed',
  'override_reason_required',
  'evidence_source',
  'evidence_section',
  'status',
] as const;

export const SAFETY_LAB_COMPARATORS = ['LT', 'LTE', 'GT', 'GTE', 'EQ', 'BETWEEN'] as const;
export const SAFETY_MISSING_LAB_ACTIONS = ['REQUIRE_REVIEW', 'SKIP_RULE'] as const;

export const IMPORT_DDI_COLUMNS = [
  'drug_a',
  'drug_b',
  'severity',
  'description',
  'action_required',
] as const;

export const IMPORT_PREGNANCY_COLUMNS = [
  'drug_name',
  'pregnancy_category',
  'trimester',
  'severity',
  'recommendation',
  'note',
  'action_required',
] as const;

export const SAFETY_INTERACTION_SEVERITIES = ['MAJOR', 'MODERATE', 'MINOR'] as const;
export const SAFETY_CLINICAL_ACTIONS = ['HARD_STOP', 'PHARMACIST_REVIEW', 'MONITOR', 'INFO_ONLY', 'NONE'] as const;
export const SAFETY_PREGNANCY_CATEGORIES = ['CONTRAINDICATED', 'CAUTION', 'PREFERRED', 'UNKNOWN'] as const;
export const SAFETY_LACTATION_RISKS = ['HIGH_RISK', 'MODERATE_RISK', 'LOW_RISK', 'UNKNOWN'] as const;
export const SAFETY_RENAL_BAND_SEVERITIES = ['BLOCK', 'CAUTION', 'SAFE'] as const;

export const IMPORT_LACTATION_COLUMNS = [
  'drug_name',
  'lactation_risk',
  'severity',
  'recommendation',
  'note',
  'action_required',
] as const;

export const IMPORT_RENAL_COLUMNS = [
  'drug_name',
  'egfr_min',
  'egfr_max',
  'severity',
  'recommendation',
  'note',
  'action_required',
] as const;

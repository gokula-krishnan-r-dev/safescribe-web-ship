/**
 * Code-owned Safety Engine dataset registry.
 * Used by sidebar labels, routes, table config, and rule-type filters.
 */

export type DatasetKey =
  | 'drugs-catalog'
  | 'medication-ingredients'
  | 'drug-classes'
  | 'clinical-value-sets'
  | 'clinical-value-set-members'
  | 'allergy-direct-rules'
  | 'allergy-cross-reactivity-rules'
  | 'drug-interactions-rules'
  | 'drug-disease-rules'
  | 'renal-rules'
  | 'lab-threshold-rules'
  | 'pregnancy-rules'
  | 'lactation-rules'
  | 'renew-medication-indications'
  | 'renew-monitoring-rules'
  | 'renew-input-definitions'
  | 'renew-conditional-questions'
  | 'rule-evidence'
  | 'test-cases'
  | 'test-inputs'
  | 'reference-target-values'
  | 'reference-general-values'
  | 'reference-treatment-targets'
  | 'reference-pediatric'
  | 'reference-sources'
  | 'reference-releases';

export type DatasetGroup = 'REFERENCE' | 'RULE' | 'WORKFLOW' | 'EVIDENCE_QA' | 'REFERENCE_VALUES';

export type SafetyEngineSection =
  | 'overview'
  | 'repository'
  | 'terminology'
  | 'uploads'
  | 'audit';

export type TerminologyNavKey =
  | 'sync'
  | 'compare'
  | 'unresolved'
  | 'history';

export type UploadNavKey =
  | 'new'
  | 'batches'
  | 'validation'
  | 'review'
  | 'candidate'
  | 'tests'
  | 'releases';

export type AuditNavKey = 'log' | 'roles' | 'settings' | 'integration';

export interface DatasetDefinition {
  key: DatasetKey;
  label: string;
  description: string;
  group: DatasetGroup;
  /** SYNC badge — terminology-managed only */
  syncBadge?: boolean;
  /** Maps to medication-safety ruleType filter when source is 'rules' */
  ruleType?: string;
  source:
    | 'rules'
    | 'drug-catalog'
    | 'drug-classes'
    | 'value-sets'
    | 'evidence'
    | 'test-cases'
    | 'test-inputs'
    | 'renew-workflow'
    | 'reference-values'
    | 'placeholder';
  searchPlaceholder: string;
}

export const DATASET_REGISTRY: Record<DatasetKey, DatasetDefinition> = {
  'drugs-catalog': {
    key: 'drugs-catalog',
    label: 'Drug Catalogue',
    description: 'Terminology-synced medication products available to clinical selectors.',
    group: 'REFERENCE',
    syncBadge: true,
    source: 'drug-catalog',
    searchPlaceholder: 'Search drug name or DIN…',
  },
  'medication-ingredients': {
    key: 'medication-ingredients',
    label: 'Ingredients',
    description: 'Active ingredients used in allergy and interaction matching.',
    group: 'REFERENCE',
    syncBadge: true,
    source: 'drug-catalog',
    searchPlaceholder: 'Search ingredient…',
  },
  'drug-classes': {
    key: 'drug-classes',
    label: 'Drug Classes',
    description: 'Therapeutic class taxonomy for cross-reactivity and grouping.',
    group: 'REFERENCE',
    source: 'drug-classes',
    searchPlaceholder: 'Search drug class…',
  },
  'clinical-value-sets': {
    key: 'clinical-value-sets',
    label: 'Clinical Value Sets',
    description: 'Governed value sets referenced by clinical safety rules.',
    group: 'REFERENCE',
    source: 'value-sets',
    searchPlaceholder: 'Search value set code or name…',
  },
  'clinical-value-set-members': {
    key: 'clinical-value-set-members',
    label: 'Value Set Members',
    description: 'Member concepts belonging to clinical value sets.',
    group: 'REFERENCE',
    source: 'value-sets',
    searchPlaceholder: 'Search value set members…',
  },
  'allergy-direct-rules': {
    key: 'allergy-direct-rules',
    label: 'Allergy — Direct',
    description: 'Direct drug–allergy contraindication and caution rules.',
    group: 'RULE',
    ruleType: 'ALLERGY_DIRECT',
    source: 'rules',
    searchPlaceholder: 'Search medication, criterion or action…',
  },
  'allergy-cross-reactivity-rules': {
    key: 'allergy-cross-reactivity-rules',
    label: 'Allergy — Cross-Reactivity',
    description: 'Cross-reactivity relationships between allergy classes and drugs.',
    group: 'RULE',
    ruleType: 'CROSS_REACTIVITY',
    source: 'rules',
    searchPlaceholder: 'Search medication, criterion or action…',
  },
  'drug-interactions-rules': {
    key: 'drug-interactions-rules',
    label: 'Drug Interactions',
    description: 'Drug–drug interaction alerts and recommended actions.',
    group: 'RULE',
    ruleType: 'DRUG_INTERACTION',
    source: 'rules',
    searchPlaceholder: 'Search medication, criterion or action…',
  },
  'drug-disease-rules': {
    key: 'drug-disease-rules',
    label: 'Drug–Disease',
    description: 'Drug–disease contraindication and caution rules.',
    group: 'RULE',
    ruleType: 'DRUG_DISEASE',
    source: 'rules',
    searchPlaceholder: 'Search medication, criterion or action…',
  },
  'renal-rules': {
    key: 'renal-rules',
    label: 'Renal Rules',
    description: 'eGFR / CrCl–based dosing and contraindication bands.',
    group: 'RULE',
    ruleType: 'RENAL_EGFR_BAND',
    source: 'rules',
    searchPlaceholder: 'Search medication, criterion or action…',
  },
  'lab-threshold-rules': {
    key: 'lab-threshold-rules',
    label: 'Lab Thresholds',
    description: 'Lab observation thresholds that trigger clinical safety actions.',
    group: 'RULE',
    ruleType: 'LAB_THRESHOLD',
    source: 'rules',
    searchPlaceholder: 'Search medication, criterion or action…',
  },
  'pregnancy-rules': {
    key: 'pregnancy-rules',
    label: 'Pregnancy Rules',
    description: 'Pregnancy-specific medication safety rules by trimester and risk.',
    group: 'RULE',
    ruleType: 'PREGNANCY',
    source: 'rules',
    searchPlaceholder: 'Search medication, criterion or action…',
  },
  'lactation-rules': {
    key: 'lactation-rules',
    label: 'Lactation Rules',
    description: 'Lactation risk bands and recommended clinical actions.',
    group: 'RULE',
    ruleType: 'LACTATION',
    source: 'rules',
    searchPlaceholder: 'Search medication, criterion or action…',
  },
  'renew-medication-indications': {
    key: 'renew-medication-indications',
    label: 'Medication Indications',
    description: 'Renew Step 2 indication suggestions by normalized ingredient. Not clinical safety thresholds.',
    group: 'WORKFLOW',
    source: 'renew-workflow',
    searchPlaceholder: 'Search ingredient or indication…',
  },
  'renew-monitoring-rules': {
    key: 'renew-monitoring-rules',
    label: 'Monitoring Requirements',
    description: 'What vitals, labs, and context Step 3 should collect. Interpretation stays in shared safety rules.',
    group: 'WORKFLOW',
    source: 'renew-workflow',
    searchPlaceholder: 'Search rule, class, ingredient or input…',
  },
  'renew-input-definitions': {
    key: 'renew-input-definitions',
    label: 'Input Definitions',
    description: 'How Renew Step 3 renders each collected field. Display ranges are presentation-only.',
    group: 'WORKFLOW',
    source: 'renew-workflow',
    searchPlaceholder: 'Search input code or label…',
  },
  'renew-conditional-questions': {
    key: 'renew-conditional-questions',
    label: 'Conditional Questions',
    description: 'Approved Renew questions shown only when the medication or indication makes them relevant.',
    group: 'WORKFLOW',
    source: 'renew-workflow',
    searchPlaceholder: 'Search question or medication…',
  },
  'reference-target-values': {
    key: 'reference-target-values',
    label: 'Reference & Target Values',
    description:
      'Governed laboratory references, treatment targets, pediatric policies and sources used across SafeScribe.',
    group: 'REFERENCE_VALUES',
    source: 'reference-values',
    searchPlaceholder: 'Search input, source or display text…',
  },
  'reference-general-values': {
    key: 'reference-general-values',
    label: 'General Reference Values',
    description: 'Published laboratory and vital references. MCC is an adult fallback, not a universal normal range.',
    group: 'REFERENCE_VALUES',
    source: 'reference-values',
    searchPlaceholder: 'Search potassium, A1C, MCC…',
  },
  'reference-treatment-targets': {
    key: 'reference-treatment-targets',
    label: 'Treatment Targets',
    description: 'Condition-specific guideline targets such as A1C, blood pressure, lipids and urate.',
    group: 'REFERENCE_VALUES',
    source: 'reference-values',
    searchPlaceholder: 'Search target, context or guideline…',
  },
  'reference-pediatric': {
    key: 'reference-pediatric',
    label: 'Pediatric References',
    description: 'Pediatric resolution policy. Adult MCC fallback is never allowed.',
    group: 'REFERENCE_VALUES',
    source: 'reference-values',
    searchPlaceholder: 'Search pediatric input or CALIPER…',
  },
  'reference-sources': {
    key: 'reference-sources',
    label: 'Source Library',
    description: 'Guidelines, laboratory catalogues and reference tables with version and review dates.',
    group: 'REFERENCE_VALUES',
    source: 'reference-values',
    searchPlaceholder: 'Search Diabetes Canada, MCC, CALIPER…',
  },
  'reference-releases': {
    key: 'reference-releases',
    label: 'Releases / Version History',
    description: 'Immutable published snapshots of the Reference & Target Values repository.',
    group: 'REFERENCE_VALUES',
    source: 'reference-values',
    searchPlaceholder: 'Search release id…',
  },
  'rule-evidence': {
    key: 'rule-evidence',
    label: 'Rule Evidence',
    description: 'Evidence links supporting clinical safety rules.',
    group: 'EVIDENCE_QA',
    source: 'evidence',
    searchPlaceholder: 'Search evidence or rule code…',
  },
  'test-cases': {
    key: 'test-cases',
    label: 'Test Cases',
    description: 'Deterministic regression cases for candidate releases.',
    group: 'EVIDENCE_QA',
    source: 'test-cases',
    searchPlaceholder: 'Search test case…',
  },
  'test-inputs': {
    key: 'test-inputs',
    label: 'Test Inputs',
    description: 'Structured patient/medication inputs used by test cases.',
    group: 'EVIDENCE_QA',
    source: 'test-inputs',
    searchPlaceholder: 'Search test inputs…',
  },
};

export const REFERENCE_DATASETS: DatasetKey[] = [
  'drugs-catalog',
  'medication-ingredients',
  'drug-classes',
  'clinical-value-sets',
  'clinical-value-set-members',
];

export const RULE_DATASETS: DatasetKey[] = [
  'allergy-direct-rules',
  'allergy-cross-reactivity-rules',
  'drug-interactions-rules',
  'drug-disease-rules',
  'renal-rules',
  'lab-threshold-rules',
  'pregnancy-rules',
  'lactation-rules',
];

export const WORKFLOW_DATASETS: DatasetKey[] = [
  'renew-medication-indications',
  'renew-monitoring-rules',
  'renew-input-definitions',
  'renew-conditional-questions',
];

export const REFERENCE_VALUE_DATASETS: DatasetKey[] = [
  'reference-target-values',
  'reference-general-values',
  'reference-treatment-targets',
  'reference-pediatric',
  'reference-sources',
  'reference-releases',
];

export const EVIDENCE_DATASETS: DatasetKey[] = [
  'rule-evidence',
  'test-cases',
  'test-inputs',
];

export const DEFAULT_DATASET: DatasetKey = 'lab-threshold-rules';

export function isDatasetKey(value: string | null | undefined): value is DatasetKey {
  return Boolean(value && value in DATASET_REGISTRY);
}

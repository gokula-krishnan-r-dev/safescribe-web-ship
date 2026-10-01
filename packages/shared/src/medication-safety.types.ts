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

export type SafetyRuleType = (typeof SAFETY_RULE_TYPES)[keyof typeof SAFETY_RULE_TYPES];

export const SAFETY_RULE_STATUSES = {
  DRAFT: 'DRAFT',
  APPROVED: 'APPROVED',
  PUBLISHED: 'PUBLISHED',
  SUPERSEDED: 'SUPERSEDED',
  RETIRED: 'RETIRED',
} as const;

export type SafetyRuleStatus = (typeof SAFETY_RULE_STATUSES)[keyof typeof SAFETY_RULE_STATUSES];

export const SAFETY_SELECTOR_TYPES = {
  EXACT_INGREDIENT: 'EXACT_INGREDIENT',
  HAS_INGREDIENT: 'HAS_INGREDIENT',
  MEMBER_OF_CLASS: 'MEMBER_OF_CLASS',
  STRUCTURAL_RELATIONSHIP: 'STRUCTURAL_RELATIONSHIP',
  VALUE_SET: 'VALUE_SET',
  INGREDIENT_SELECTOR: 'INGREDIENT_SELECTOR',
  PRODUCT_SELECTOR: 'PRODUCT_SELECTOR',
} as const;

export type SafetySelectorType = (typeof SAFETY_SELECTOR_TYPES)[keyof typeof SAFETY_SELECTOR_TYPES];

export const SAFETY_CLINICAL_SEVERITIES = {
  INFO: 'INFO',
  LOW: 'LOW',
  MODERATE: 'MODERATE',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export type SafetyClinicalSeverity =
  (typeof SAFETY_CLINICAL_SEVERITIES)[keyof typeof SAFETY_CLINICAL_SEVERITIES];

export const SAFETY_EVAL_STATUSES = {
  COMPLETE_NO_FINDINGS: 'COMPLETE_NO_FINDINGS',
  COMPLETE_WITH_FINDINGS: 'COMPLETE_WITH_FINDINGS',
  VERIFICATION_INCOMPLETE: 'VERIFICATION_INCOMPLETE',
  INPUT_INCOMPLETE: 'INPUT_INCOMPLETE',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type SafetyEvalStatus = (typeof SAFETY_EVAL_STATUSES)[keyof typeof SAFETY_EVAL_STATUSES];

export const SAFETY_OVERRIDE_REASONS = [
  { code: 'ALLERGY_INACCURATE', label: 'Allergy record reviewed and determined inaccurate' },
  { code: 'INTOLERANCE_NOT_ALLERGY', label: 'Reaction is intolerance/adverse effect rather than allergy' },
  { code: 'SUBSEQUENT_TOLERANCE', label: 'Patient subsequently tolerated the medication' },
  { code: 'SPECIALIST_RECOMMENDATION', label: 'Use supported by documented specialist recommendation' },
  { code: 'BENEFIT_OUTWEIGHS_RISK', label: 'Clinical benefit outweighs risk with documented monitoring plan' },
  { code: 'LAB_RECENTLY_REPEATED', label: 'Lab value recently repeated and acceptable for prescribing' },
  { code: 'DOSE_ADJUSTED', label: 'Dose adjusted per renal/hepatic guidance with monitoring plan' },
  { code: 'DDI_REVIEWED', label: 'Interaction reviewed with documented monitoring plan' },
  { code: 'PREGNANCY_SPECIALIST', label: 'Use supported by obstetric/maternal-fetal specialist' },
  { code: 'LACTATION_SPECIALIST', label: 'Use supported by lactation/maternal health specialist' },
  { code: 'OTHER', label: 'Other clinical reason — comment required' },
] as const;

export interface SafetyPatientAllergy {
  substance: string;
  clinicalStatus?: 'active' | 'inactive' | 'refuted';
  verificationStatus?: 'confirmed' | 'unconfirmed' | 'refuted';
  reaction?: string;
}

export interface SafetySelectedMedication {
  productName: string;
  genericName?: string;
  route?: string;
  status?: string;
  endedAt?: string;
}

export interface SafetyPatientPregnancy {
  status?: string;
  trimester?: string;
  gestationalAgeWeeks?: number;
}

export interface SafetyPatientLab {
  name: string;
  value?: string;
  unit?: string;
  observedAt?: string;
}

export interface MedicationSafetyEvaluateRequest {
  consultationId?: string;
  jurisdiction?: string;
  patientContext: {
    age?: number;
    weightKg?: number;
    allergies: SafetyPatientAllergy[];
    conditions?: string[];
    pregnancy?: SafetyPatientPregnancy;
    breastfeeding?: string;
    currentMedications?: SafetySelectedMedication[];
    labs?: SafetyPatientLab[];
    labValuesText?: string;
    aiLabs?: Array<{ test: string; value: string; unit?: string }>;
  };
  selectedMedications: SafetySelectedMedication[];
}

export interface SafetyFinding {
  findingType: string;
  matchType?: string;
  summary: string;
  detail: string;
  clinicalSeverity: SafetyClinicalSeverity;
  recommendedAction: string;
  ruleVersionId?: string;
  ruleCode?: string;
  relationshipType?: string;
  /** Product name of the medication this finding applies to (never broadcast to other cards). */
  implicatedProductName?: string;
  /** Stable subject for UI grouping — same product instance as implicatedProductName. */
  subjectMedicationId?: string;
  matchedIngredientId?: string;
  /** Explicit source domain from the rule type (PREGNANCY, ALLERGY, …). */
  ruleDomain?: string;
  ruleVersion?: string;
  overrideAllowed: boolean;
  overrideReasonRequired: boolean;
}

/**
 * UI + testing provenance for a Safety Engine finding: which domain fired and
 * which Excel workbook authors that class of rule.
 */
export type SafetyFindingOrigin =
  | 'published_release'
  | 'baseline_engine'
  | 'direct_engine'
  | 'pathway';

export interface SafetyEngineSource {
  /** Stable domain key (allergy, renal_band, drug_interaction, …) */
  findingType: string;
  /** Pharmacist-facing domain label */
  engineType: string;
  /** Canonical 12-file workbook name for authoring/analysis */
  workbook: string;
  ruleCode?: string;
  matchType?: string;
  origin: SafetyFindingOrigin;
  severity?: string;
  /** Short reason snippet from the finding */
  message?: string;
}

const FINDING_SOURCE_CATALOG: Record<
  string,
  { engineType: string; workbook: string; originWhenUncoded?: SafetyFindingOrigin }
> = {
  allergy: {
    engineType: 'Allergy (direct)',
    workbook: 'allergy-cross-reactivity-rules.xlsx',
    originWhenUncoded: 'direct_engine',
  },
  cross_reactivity: {
    engineType: 'Cross-reactivity',
    workbook: 'allergy-cross-reactivity-rules.xlsx',
  },
  renal_band: {
    engineType: 'Renal eGFR / CrCl band',
    workbook: 'renal-rules.xlsx',
  },
  renal_lab: {
    engineType: 'Lab threshold',
    workbook: 'lab-threshold-rules.xlsx',
  },
  drug_interaction: {
    engineType: 'Drug–drug interaction',
    workbook: 'drug-interactions.xlsx',
  },
  drug_disease: {
    engineType: 'Drug–disease',
    workbook: 'drug-disease-rules.xlsx',
  },
  pregnancy: {
    engineType: 'Pregnancy',
    workbook: 'pregnancy-rules.xlsx',
  },
  lactation: {
    engineType: 'Lactation',
    workbook: 'lactation-rules.xlsx',
  },
  duplicate_therapy: {
    engineType: 'Duplicate therapy',
    workbook: 'Safety Alert (duplicate baseline)',
    originWhenUncoded: 'baseline_engine',
  },
  age_gate: {
    engineType: 'Pathway age eligibility',
    workbook: 'pathway (ageMin / ageMax)',
    originWhenUncoded: 'pathway',
  },
};

export function describeSafetyFindingSource(finding: {
  findingType: string;
  ruleCode?: string | null;
  matchType?: string | null;
  clinicalSeverity?: string | null;
  detail?: string | null;
  summary?: string | null;
}): SafetyEngineSource {
  const code = finding.ruleCode?.trim() || undefined;
  const isBaseline = Boolean(code && /^BASELINE[-_]/i.test(code));
  const catalog = FINDING_SOURCE_CATALOG[finding.findingType] ?? {
    engineType: finding.findingType.replace(/_/g, ' '),
    workbook: 'Safety Alert (other)',
  };

  let origin: SafetyFindingOrigin = 'published_release';
  if (isBaseline) origin = 'baseline_engine';
  else if (!code && catalog.originWhenUncoded) origin = catalog.originWhenUncoded;
  else if (finding.findingType === 'age_gate') origin = 'pathway';
  else if (
    finding.findingType === 'allergy' &&
    (finding.matchType === 'exact_ingredient' ||
      finding.matchType === 'combination_product_contains_exact_ingredient' ||
      finding.matchType === 'ingredient')
  ) {
    origin = code ? 'published_release' : 'direct_engine';
  }

  return {
    findingType: finding.findingType,
    engineType: catalog.engineType,
    workbook: isBaseline
      ? `${catalog.workbook} · baseline fallback`
      : catalog.workbook,
    ruleCode: code,
    matchType: finding.matchType?.trim() || undefined,
    origin,
    severity: finding.clinicalSeverity?.trim() || undefined,
    message: (finding.detail || finding.summary || '').trim() || undefined,
  };
}

export function originLabel(origin: SafetyFindingOrigin): string {
  switch (origin) {
    case 'baseline_engine':
      return 'Baseline engine';
    case 'direct_engine':
      return 'Direct match';
    case 'pathway':
      return 'Pathway';
    default:
      return 'Published release';
  }
}

export interface MedicationSafetyEvaluateResponse {
  evaluationId: string;
  status: SafetyEvalStatus;
  knowledgeRelease: string | null;
  engineVersion: string;
  terminologyReleaseId?: string | null;
  terminologyVersion?: string | null;
  findings: SafetyFinding[];
  suppressedFindings: SafetyFinding[];
  mappingWarnings: string[];
  evaluatedDomains: string[];
}

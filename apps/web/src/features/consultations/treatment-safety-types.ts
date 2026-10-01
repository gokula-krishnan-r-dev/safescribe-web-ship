export type SafetySeverity = 'CRITICAL' | 'HIGH' | 'MODERATE' | 'INFO';

export type SafetySourceKind = 'DRUG_LABEL' | 'PATIENT_CDS' | 'PATHWAY';

export type ClinicalSafetyCategory =
  | 'BLACK_BOX'
  | 'CONTRAINDICATION'
  | 'ALLERGY'
  | 'PREGNANCY'
  | 'CONDITION'
  | 'LAB'
  | 'INTERACTION'
  | 'RENAL'
  | 'HEPATIC'
  | 'ADVERSE_EFFECT'
  | 'MONITORING'
  | 'COUNSELLING'
  | 'ADMINISTRATION'
  | 'OTHER';

export interface ClinicalSafetyWarning {
  ruleId: string;
  severity: SafetySeverity;
  title: string;
  explanation: string;
  clinicianAction: string;
  source: 'OpenFDA' | 'DailyMed' | 'SafeScribe CDS' | 'Pathway Guideline';
  sourceKind: SafetySourceKind;
  clinicalCategory: ClinicalSafetyCategory;
  drugCode?: string | null;
  snomedOrCcddCode?: string | null;
  evidenceSource?: string | null;
  evidenceVersion?: string | null;
  lastUpdated?: string | null;
  fullText?: string | null;
}

export interface DrugInteractionCard {
  drug: string;
  severity: SafetySeverity;
  clinicalEffect: string;
  recommendedAction: string;
  source: string;
  ruleId: string;
}

export interface MonitoringRequirement {
  test: string;
  reason: string;
  frequency: string;
  clinicalRationale: string;
  ruleId: string;
}

export interface RecommendedTreatmentInfo {
  medicationName: string;
  genericName?: string | null;
  brandName?: string | null;
  therapeuticClass?: string | null;
  indications?: string | null;
  adultDose?: string | null;
  pediatricDose?: string | null;
  route?: string | null;
  frequency?: string | null;
  duration?: string | null;
}

export interface EvidenceSourceMeta {
  latestDailyMedVersion?: string | null;
  openFdaLabelVersion?: string | null;
  publicationDate?: string | null;
  lastReviewed?: string | null;
  evidenceLevel?: string | null;
  openFdaUrl?: string | null;
  dailyMedUrl?: string | null;
  setId?: string | null;
}

export interface TreatmentSafetyProfile {
  query: string;
  found: boolean;
  recommended: RecommendedTreatmentInfo;
  patientAlerts: ClinicalSafetyWarning[];
  labelWarnings: ClinicalSafetyWarning[];
  contraindications: Array<{ label: string; severity: SafetySeverity; ruleId: string }>;
  interactions: DrugInteractionCard[];
  monitoring: MonitoringRequirement[];
  counselling: string[];
  evidence: EvidenceSourceMeta;
  generatedAt: string;
  safetyEvaluation?: {
    evaluationId: string;
    status: string;
    knowledgeRelease: string | null;
    mappingWarnings: string[];
    findings: Array<{
      findingType: string;
      matchType?: string;
      summary: string;
      detail: string;
      clinicalSeverity: string;
      recommendedAction: string;
      ruleCode?: string;
      overrideAllowed: boolean;
      overrideReasonRequired: boolean;
    }>;
    suppressedFindings: Array<{
      summary: string;
      detail: string;
      matchType?: string;
    }>;
  };
}

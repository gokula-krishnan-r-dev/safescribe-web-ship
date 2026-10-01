import type {
  SafetyClinicalSeverity,
  SafetyEvalStatus,
  SafetyRuleType,
  MedicationSafetyEvaluateResponse,
} from '@safescript/shared';

export type SafetyRuleStatus = 'DRAFT' | 'APPROVED' | 'PUBLISHED' | 'SUPERSEDED' | 'RETIRED';

export interface SafetyLabRuleDetail {
  id: string;
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
}

export interface SafetyDdiRuleDetail {
  id: string;
  drugA: string;
  drugB: string;
  interactionSeverity: string;
  actionRequired: string;
}

export interface SafetyPregnancyRuleDetail {
  id: string;
  drugName: string;
  pregnancyCategory: string;
  trimester: string;
  clinicalNote?: string | null;
  actionRequired: string;
}

export interface SafetyLactationRuleDetail {
  id: string;
  drugName: string;
  lactationRisk: string;
  bandSeverity: string;
  clinicalNote?: string | null;
  actionRequired: string;
}

export interface SafetyRenalRuleDetail {
  id: string;
  drugName: string;
  egfrMin: number;
  egfrMax: number;
  bandSeverity: string;
  clinicalNote?: string | null;
  actionRequired: string;
}

export interface SafetyRuleVersion {
  id: string;
  versionNumber: number;
  status: SafetyRuleStatus;
  summary: string;
  detail: string;
  clinicalSeverity: SafetyClinicalSeverity;
  recommendedAction: string;
  overrideAllowed: boolean;
  overrideReasonRequired: boolean;
  matchType?: string | null;
  relationshipType?: string | null;
  changeSummary?: string | null;
  approvedAt?: string | null;
  publishedAt?: string | null;
  createdAt: string;
  participants?: SafetyRuleParticipant[];
  evidence?: SafetyRuleEvidence[];
  labDetail?: SafetyLabRuleDetail | null;
  ddiDetail?: SafetyDdiRuleDetail | null;
  pregnancyDetail?: SafetyPregnancyRuleDetail | null;
  lactationDetail?: SafetyLactationRuleDetail | null;
  renalDetail?: SafetyRenalRuleDetail | null;
}

export interface SafetyRuleParticipant {
  id: string;
  participantKey: string;
  selectorType: string;
  conceptText: string;
  conceptCode?: string | null;
}

export interface SafetyRuleEvidence {
  id: string;
  source: string;
  section?: string | null;
  accessDate?: string | null;
}

export interface SafetyRuleListItem {
  id: string;
  code: string;
  ruleType: SafetyRuleType;
  jurisdiction: string;
  latestVersion: SafetyRuleVersion | null;
  owner?: { id: string; firstName: string; lastName: string } | null;
  updatedAt: string;
}

export interface SafetyRuleDetail {
  id: string;
  code: string;
  ruleType: SafetyRuleType;
  jurisdiction: string;
  operationalState: string;
  versions: SafetyRuleVersion[];
  owner?: { id: string; firstName: string; lastName: string; email: string } | null;
}

export interface SafetyRulesListResponse {
  items: SafetyRuleListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SafetyReleaseResponse {
  active: {
    id: string;
    version: string;
    checksum: string;
    engineVersion: string;
    ruleCount: number;
    publishedAt: string;
    publishedBy: { id: string; firstName: string; lastName: string; email: string };
  } | null;
  cache: { ready: boolean; meta: { version: string; ruleCount: number } | null };
}

export interface ImportValidationError {
  sheet: string;
  row?: number;
  column?: string;
  message: string;
  fileName?: string;
}

export interface ImportPreviewRow {
  rowNumber: number;
  sheet: string;
  status: 'valid' | 'error' | 'warning';
  data: Record<string, string>;
  messages: string[];
}

export interface ImportPreviewResponse {
  valid: boolean;
  errors: ImportValidationError[];
  preview: ImportPreviewRow[];
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

export interface CreateSafetyRuleInput {
  code: string;
  ruleType: SafetyRuleType;
  jurisdiction?: string;
  summary: string;
  detail: string;
  clinicalSeverity: SafetyClinicalSeverity;
  recommendedAction: string;
  overrideAllowed?: boolean;
  overrideReasonRequired?: boolean;
  matchType?: string;
  relationshipType?: string;
  evidenceSource?: string;
  evidenceSection?: string;
  participants: Array<{
    participantKey: string;
    selectorType: string;
    conceptText: string;
    conceptCode?: string;
  }>;
  labDetail?: {
    drugIngredient: string;
    observationKey: string;
    observationDisplay?: string;
    loincCode?: string;
    comparator: string;
    thresholdLow?: number;
    thresholdHigh?: number;
    expectedUnit?: string;
    maxAgeDays?: number;
    missingLabAction?: string;
  };
}

export type { MedicationSafetyEvaluateResponse, SafetyEvalStatus };

export const PATHWAY_QA_LAYERS = {
  SAFETY_ENGINE: 'Safety Engine',
  TREATMENT: 'Treatment Validation',
  PATHWAY_FLOW: 'Pathway & Flow Validation',
} as const;

export type PathwayQaLayer =
  (typeof PATHWAY_QA_LAYERS)[keyof typeof PATHWAY_QA_LAYERS];

export const PATHWAY_QA_ISSUE_SOURCES = {
  EXCEL_DATA: 'EXCEL_DATA',
  PATHWAY_CONTENT: 'PATHWAY_CONTENT',
  CODE: 'CODE',
  SAFETY_REPOSITORY: 'SAFETY_REPOSITORY',
  ENVIRONMENT: 'ENVIRONMENT',
} as const;

export type PathwayQaIssueSource =
  (typeof PATHWAY_QA_ISSUE_SOURCES)[keyof typeof PATHWAY_QA_ISSUE_SOURCES];

export const PATHWAY_QA_VERDICTS = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  SKIPPED: 'SKIPPED',
} as const;

export type PathwayQaVerdict =
  (typeof PATHWAY_QA_VERDICTS)[keyof typeof PATHWAY_QA_VERDICTS];

export type PathwayQaDisposition =
  | 'BLOCK'
  | 'WARN_REVIEW'
  | 'MORE_INFORMATION_REQUIRED'
  | 'ALLOW_BY_THIS_RULE'
  | 'VALID'
  | 'INVALID'
  | 'REFERRAL'
  | 'ELIGIBLE'
  | 'NOT_ELIGIBLE'
  | 'ROUTINE_REFERRAL'
  | 'URGENT_REFERRAL'
  | 'MANUAL_SELECTION'
  | 'UNKNOWN';

export type PathwayQaVariantKey =
  | 'DX-DRUG'
  | 'DRUG-DRUG'
  | 'NEGATIVE'
  | 'VALID'
  | 'INVALID'
  | 'BOUNDARY'
  | 'HAPPY'
  | 'RED FLAG'
  | 'STATE';

export interface PathwayQaCoverageRow {
  pathwayNumber: string;
  condition: string;
  totalCases: number;
  safety: number;
  treatment: number;
  pathwayFlow: number;
  dxDrug: number;
  drugDrug: number;
  coverageStatus: string;
}

export interface PathwayQaPermutationRow {
  permutationId: string;
  domain: string;
  expectedPattern: string;
  applyTo: string;
}

export interface PathwayQaCase {
  caseId: string;
  pathwayNumber: string;
  condition: string;
  layer: PathwayQaLayer;
  priority: string;
  scenario: string;
  preconditions: string;
  variantsRaw: string;
  executionSteps: string;
  expectedRulesEngine: string;
  expectedTreatment: string;
  expectedFlow: string;
  negativeAssertions: string;
  auditAssertions: string;
  permutationExpansion: string;
  expectedDisposition: string;
  ruleSourceBasis: string;
  automationTags: string[];
  sourceRow: number;
}

export interface PathwayQaParsedWorkbook {
  title: string;
  testClock: string | null;
  kpis: Record<string, string>;
  cases: PathwayQaCase[];
  coverage: PathwayQaCoverageRow[];
  permutations: PathwayQaPermutationRow[];
  sheetNames: string[];
  warnings: string[];
}

export interface PathwayQaPatientFixture {
  pregnancy?: 'yes' | 'no' | 'unknown';
  trimester?: string;
  allergies: string[];
  candidates: string[];
  currentMedications: string[];
  conditions: string[];
  egfr?: string;
  potassium?: string;
  notes: string[];
}

export interface PathwayQaUniqueVariant {
  uniqueKey: string;
  caseId: string;
  condition: string;
  layer: PathwayQaLayer;
  priority: string;
  variantKey: PathwayQaVariantKey;
  fixtureText: string;
  patient: PathwayQaPatientFixture;
  expectedText: string;
  expectedDisposition: string;
  negativeAssertions: string;
  automationTags: string[];
  sourceRow: number;
  sourceCase: PathwayQaCase;
}

export interface PathwayQaMatchSuggestion {
  condition: string;
  score: number;
  caseCount: number;
}

export interface PathwayQaIssue {
  source: PathwayQaIssueSource;
  title: string;
  detail: string;
  howToFix: string[];
}

export interface PathwayQaFindingSnapshot {
  findingType: string;
  summary: string;
  detail: string;
  clinicalSeverity: string;
  recommendedAction: string;
  ruleCode?: string;
  implicatedProductName?: string;
}

export interface PathwayQaVariantResult {
  uniqueKey: string;
  caseId: string;
  layer: PathwayQaLayer;
  variantKey: PathwayQaVariantKey;
  priority: string;
  verdict: PathwayQaVerdict;
  expectedDisposition: string;
  actualDisposition: PathwayQaDisposition;
  title: string;
  fixtureText: string;
  expected: string;
  actualSummary: string;
  issues: PathwayQaIssue[];
  suggestions: string[];
  findings: PathwayQaFindingSnapshot[];
  checks: Array<{ id: string; ok: boolean; label: string; detail?: string }>;
  durationMs: number;
}

export interface PathwayQaRunSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  passRate: number;
  byLayer: Record<string, { total: number; passed: number; failed: number }>;
  bySource: Record<string, number>;
  criticalFailed: number;
}

export interface PathwayQaPathwaySnapshot {
  id: string;
  name: string;
  condition: string;
  status: string;
  version: number;
  province: string;
  pharmacistPrescribingEligible: boolean;
  ageMin: number | null;
  ageMax: number | null;
  requiresFollowUp: boolean;
  requiresLabResults: string;
  redFlags: Array<{ title: string; description?: string | null; severity?: string | null; action?: string | null }>;
  differentials: Array<{ condition: string; recommendedAction?: string | null }>;
  questions: Array<{ question: string; section?: string | null }>;
  rules: Array<{ action: string; severity: string; message: string; condition: string }>;
  treatments: Array<{
    medicationName: string;
    genericName?: string | null;
    brandName?: string | null;
    dose?: string | null;
    route?: string | null;
    frequency?: string | null;
    duration?: string | null;
    recommendationLevel: string;
    eligibility?: string | null;
    clinicalNotes?: string | null;
    followUpAdvice?: string | null;
    isActive: boolean;
    category: string;
  }>;
  counsellingCount: number;
  followupCount: number;
}

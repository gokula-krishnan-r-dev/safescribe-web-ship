export type PathwayQaIssueSource =
  | 'EXCEL_DATA'
  | 'PATHWAY_CONTENT'
  | 'CODE'
  | 'SAFETY_REPOSITORY'
  | 'ENVIRONMENT';

export type PathwayQaVerdict = 'PASS' | 'FAIL' | 'SKIPPED';

export interface PathwayQaPreview {
  title: string;
  testClock: string | null;
  kpis: Record<string, string>;
  sheetNames: string[];
  caseCount: number;
  uniqueVariantCount: number;
  conditionCount: number;
  permutationCount: number;
  coveragePassCount: number;
  conditions: string[];
  warnings: string[];
  layers: { safety: number; treatment: number; flow: number };
}

export interface PathwayQaWorkbook {
  id: string;
  fileName: string;
  sha256: string;
  byteSize: number;
  sheetNames: string[];
  caseCount: number;
  conditionCount: number;
  permutationCount: number;
  createdAt: string;
  uploadedBy?: string;
  runCount?: number;
  preview?: PathwayQaPreview;
}

export interface PathwayQaIssue {
  source: PathwayQaIssueSource;
  title: string;
  detail: string;
  howToFix: string[];
}

export interface PathwayQaCheck {
  id: string;
  ok: boolean;
  label: string;
  detail?: string;
}

export interface PathwayQaFinding {
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
  layer: string;
  variantKey: string;
  priority: string;
  verdict: PathwayQaVerdict;
  expectedDisposition: string;
  actualDisposition: string;
  title: string;
  fixtureText: string;
  expected: string;
  actualSummary: string;
  issues: PathwayQaIssue[];
  suggestions: string[];
  findings: PathwayQaFinding[];
  checks: PathwayQaCheck[];
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

export interface PathwayQaMatchSuggestion {
  condition: string;
  score: number;
  caseCount: number;
}

export interface PathwayQaRun {
  id: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  matchedCondition: string | null;
  matchScore: number | null;
  matchSuggestions: PathwayQaMatchSuggestion[] | null;
  summary: PathwayQaRunSummary | null;
  results?: PathwayQaVariantResult[] | null;
  errorMessage: string | null;
  durationMs: number | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
  workbook: { id: string; fileName: string; caseCount: number; conditionCount?: number };
  pathway: { id: string; name: string; condition: string; status: string; version: number };
  createdBy: string;
}

export interface PathwayQaRunList {
  data: PathwayQaRun[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export const ISSUE_SOURCE_LABEL: Record<PathwayQaIssueSource, string> = {
  EXCEL_DATA: 'Excel data',
  PATHWAY_CONTENT: 'Pathway content',
  CODE: 'Code / engine',
  SAFETY_REPOSITORY: 'Safety repository',
  ENVIRONMENT: 'Environment',
};

export const ISSUE_SOURCE_HINT: Record<PathwayQaIssueSource, string> = {
  EXCEL_DATA: 'The workbook fixture is incomplete, misnamed, or does not match this pathway.',
  PATHWAY_CONTENT: 'Questions, red flags, or treatments on the pathway need authoring changes.',
  CODE: 'The evaluator or consultation flow did not behave as the pack requires.',
  SAFETY_REPOSITORY: 'No published canonical rule matched this DX–DRUG or DRUG–DRUG fixture.',
  ENVIRONMENT: 'A knowledge release or service dependency is missing in this environment.',
};

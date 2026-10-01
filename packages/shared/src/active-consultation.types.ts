/** Statuses that belong in the Active Consultations work queue. */
export const OPEN_WORKSPACE_STATUSES = ['DRAFT', 'IN_PROGRESS'] as const;

export type OpenWorkspaceStatus = (typeof OPEN_WORKSPACE_STATUSES)[number];

export function isOpenWorkspaceStatus(
  status: string | null | undefined,
): status is OpenWorkspaceStatus {
  return status === 'DRAFT' || status === 'IN_PROGRESS';
}

/** Post-login Prescribe/Renew landing: start a new consult, or reuse an unused blank draft. */
export type EnsureWorkspaceResponse = {
  id: string;
  created: boolean;
  module: string;
};

/** Minimal Active Consultations work-queue projection (sidebar navigation only). */

export const ACTIVE_WORKFLOW_STAGES = [
  'intake',
  'assessment',
  'safety',
  'treatment',
  'documents',
] as const;

export type ActiveWorkflowStage = (typeof ACTIVE_WORKFLOW_STAGES)[number];

export type ActiveConsultationListItem = {
  id: string;
  startedAt: string;
  updatedAt: string;
  displayLabel: string;
  pathwayConfirmed: boolean;
  workflowStage: ActiveWorkflowStage;
  deletionDeadline: string;
  module?: string;
};

export type ActiveConsultationsResponse = {
  count: number;
  consultations: ActiveConsultationListItem[];
};

const STAGE_LABELS: Record<ActiveWorkflowStage, string> = {
  intake: 'Intake',
  assessment: 'Assessment in progress',
  safety: 'Safety review',
  treatment: 'Treatment in progress',
  documents: 'Documents ready',
};

export function mapWorkflowStageToLabel(stage: ActiveWorkflowStage): string {
  return STAGE_LABELS[stage];
}

/** Map DB consultation step → sidebar workflow stage. */
export function mapConsultationStepToWorkflowStage(
  currentStep: string | null | undefined,
): ActiveWorkflowStage {
  switch (currentStep) {
    case 'RENEW_MEDICATIONS':
    case 'PRESENTING_COMPLAINT':
    case 'PATHWAY_SELECTION':
      return 'intake';
    case 'RENEW_THERAPY_REVIEW':
    case 'RENEW_CLINICAL_ASSESSMENT':
      return 'assessment';
    case 'RENEW_DECISION':
    case 'RENEW_DOCUMENTATION':
    case 'RENEW_SUMMARY':
      return 'documents';
    case 'DEMOGRAPHICS':
    case 'CLINICAL_QUESTIONS':
    case 'ELIGIBILITY':
    case 'CLINICAL_IMPRESSION':
      return 'assessment';
    case 'RED_FLAGS':
    case 'PRESCRIBING_READINESS':
      return 'safety';
    case 'TREATMENT':
    case 'TREATMENT_RATIONALE':
    case 'COUNSELLING':
      return 'treatment';
    case 'DOCUMENTATION':
    case 'REVIEW':
      return 'documents';
    default:
      return 'intake';
  }
}

export function buildActiveConsultationDisplayLabel(opts: {
  pathwayName?: string | null;
  pathwayCondition?: string | null;
  pathwayConfirmed: boolean;
}): string {
  if (!opts.pathwayConfirmed) return 'General assessment';
  const condition = opts.pathwayCondition?.trim();
  if (condition) return condition;
  const name = opts.pathwayName?.trim();
  if (name) return name;
  return 'Pathway not confirmed';
}

import type { PathwayStatus, PathwayPipelineStage, ClinicalPathway } from './types';

const UNPUBLISHED_STATUSES: PathwayStatus[] = [
  'DRAFT',
  'AI_PROCESSING',
  'AI_GENERATED',
  'UNPUBLISHED',
];

export function isPathwayPublished(status: PathwayStatus): boolean {
  return status === 'PUBLISHED';
}

export function isPathwayUnpublished(status: PathwayStatus): boolean {
  return UNPUBLISHED_STATUSES.includes(status);
}

export function canPublishPathway(
  status: PathwayStatus,
  opts?: { clinicallyReviewedAt?: string | null; pipelineStage?: PathwayPipelineStage },
): boolean {
  if (status === 'PUBLISHED' || status === 'AI_PROCESSING' || status === 'ARCHIVED') {
    return false;
  }
  if (opts && !opts.clinicallyReviewedAt) return false;
  return true;
}

export function canUnpublishPathway(status: PathwayStatus): boolean {
  return status === 'PUBLISHED';
}

export function canEditPathway(status: PathwayStatus): boolean {
  return status !== 'PUBLISHED' && status !== 'AI_PROCESSING' && status !== 'ARCHIVED';
}

/** Tooltip / title when mutation controls are disabled. */
export const PATHWAY_EDIT_LOCKED_HINT =
  'Take this pathway offline before making changes.';


export function countUnpublishedPathways(byStatus?: Partial<Record<PathwayStatus, number>>): number {
  if (!byStatus) return 0;
  return UNPUBLISHED_STATUSES.reduce((sum, status) => sum + (byStatus[status] ?? 0), 0);
}

export const PIPELINE_STEPS: Array<{
  id: PathwayPipelineStage | 'UPLOAD' | 'PUBLISH';
  label: string;
  description: string;
}> = [
  { id: 'UPLOAD', label: 'Upload', description: 'Add clinical documents' },
  { id: 'CLASSIFYING', label: 'Classify', description: 'Document classification' },
  { id: 'DOCUMENT_REVIEW', label: 'Doc Review', description: 'Confirm Primary / Supporting / Reference' },
  { id: 'EXTRACTING_CONCEPTS', label: 'Concepts', description: 'Extract & normalize clinical concepts' },
  { id: 'GENERATING', label: 'Generate', description: 'Build pathway from concepts' },
  { id: 'CLINICAL_REVIEW', label: 'Clinical Review', description: 'Pharmacist approval' },
  { id: 'PUBLISH', label: 'Publish', description: 'Versioned live pathway' },
];

export function getPipelineStepIndex(stage: PathwayPipelineStage, hasDocuments: boolean): number {
  if (!hasDocuments && stage === 'IDLE') return 0;
  switch (stage) {
    case 'IDLE':
      return hasDocuments ? 1 : 0;
    case 'CLASSIFYING':
      return 1;
    case 'DOCUMENT_REVIEW':
      return 2;
    case 'EXTRACTING_CONCEPTS':
      return 3;
    // Concepts extracted — next action is Generate
    case 'CONCEPTS_READY':
      return 4;
    case 'GENERATING':
      return 4;
    case 'CLINICAL_REVIEW':
      return 5;
    case 'COMPLETE':
      return 6;
    default:
      return 0;
  }
}

export function isPipelineProcessing(stage: PathwayPipelineStage, status: PathwayStatus): boolean {
  return (
    status === 'AI_PROCESSING' ||
    stage === 'CLASSIFYING' ||
    stage === 'EXTRACTING_CONCEPTS' ||
    stage === 'GENERATING'
  );
}

export type PipelineNextAction =
  | 'UPLOAD'
  | 'WAIT'
  | 'CONFIRM_DOCS'
  | 'GENERATE_PATHWAY'
  | 'CLINICAL_APPROVE'
  | 'PUBLISH'
  | 'DONE'
  | null;

/** Resolve the single primary CTA for the current pipeline state. */
export function getPipelineNextAction(pathway: ClinicalPathway): {
  action: PipelineNextAction;
  title: string;
  description: string;
  buttonLabel: string;
} | null {
  const stage = pathway.pipelineStage ?? 'IDLE';
  const status = pathway.status;
  const conceptCount = pathway._count?.concepts ?? pathway.concepts?.length ?? 0;
  const questionCount = pathway._count?.questions ?? pathway.questions?.length ?? 0;
  const hasDocs = (pathway.documents?.length ?? 0) > 0;

  if (status === 'PUBLISHED') {
    return {
      action: 'DONE',
      title: 'Pathway is live',
      description: 'Pharmacists can use this pathway in consultations.',
      buttonLabel: '',
    };
  }

  if (status === 'ARCHIVED') return null;

  // Only show WAIT while genuinely processing — not when stuck with concepts already saved
  const genuinelyProcessing =
    status === 'AI_PROCESSING' ||
    stage === 'CLASSIFYING' ||
    stage === 'GENERATING' ||
    (stage === 'EXTRACTING_CONCEPTS' && conceptCount === 0);

  if (genuinelyProcessing) {
    const waitCopy: Record<string, string> = {
      CLASSIFYING: 'Classifying documents and comparing overlap…',
      EXTRACTING_CONCEPTS: 'Extracting and normalizing clinical concepts…',
      GENERATING: 'Building assessment questions, red flags, and treatments from your concepts…',
    };
    return {
      action: 'WAIT',
      title: 'Preparing documents',
      description: waitCopy[stage] ?? 'Processing — this page updates automatically.',
      buttonLabel: '',
    };
  }

  if (!hasDocs || stage === 'IDLE') {
    return {
      action: 'UPLOAD',
      title: 'Step 1 — Upload documents',
      description: 'Upload clinical guidelines, algorithms, or protocols. No manual classification needed.',
      buttonLabel: 'Upload documents',
    };
  }

  if (stage === 'DOCUMENT_REVIEW') {
    return {
      action: 'CONFIRM_DOCS',
      title: 'Step 4 — Confirm document roles',
      description:
        'Review recommendations, then confirm Primary / Supporting / Reference Only to continue.',
      buttonLabel: 'Review documents below',
    };
  }

  // Concepts ready, or concepts exist but pathway not generated yet (stuck / failed generate)
  if (stage === 'CONCEPTS_READY' || (conceptCount > 0 && questionCount === 0)) {
    return {
      action: 'GENERATE_PATHWAY',
      title: 'Step 7 — Generate clinical pathway',
      description:
        conceptCount > 0
          ? `${conceptCount} clinical concepts are ready. Generate assessment questions, red flags, treatments, and counselling from these concepts.`
          : 'Generate the pathway from your clinical concepts.',
      buttonLabel: 'Generate pathway',
    };
  }

  if (
    (stage === 'CLINICAL_REVIEW' || questionCount > 0) &&
    !pathway.clinicallyReviewedAt
  ) {
    return {
      action: 'CLINICAL_APPROVE',
      title: 'Step 8 — Clinical admin review',
      description:
        'Review assessment, red flags, and treatments. Approve when the pathway is clinically sound. Nothing goes live until you approve.',
      buttonLabel: 'Approve clinical review',
    };
  }

  if (pathway.clinicallyReviewedAt) {
    return {
      action: 'PUBLISH',
      title: 'Step 9 — Publish',
      description: 'Clinical review is complete. Publish Pathway Version to make it available to pharmacists.',
      buttonLabel: 'Make live',
    };
  }

  return null;
}

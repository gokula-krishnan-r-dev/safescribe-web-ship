import { SAFESCRIBE_MODULES } from '@safescript/shared';

export type BlankWorkspaceCandidate = {
  status: string;
  currentStep: string | null;
  stepIndex: number;
  chiefComplaint?: string | null;
  transcript?: string | null;
  selectedPathwayId?: string | null;
  consultationMode?: string | null;
  module?: string | null;
  renewMedicationCount?: number;
};

/**
 * A workspace is reusable only when the pharmacist has not started clinical work.
 * In-progress consults stay in Active Consultations and must not be resumed on login.
 */
export function isReusableBlankWorkspace(row: BlankWorkspaceCandidate): boolean {
  if (row.status !== 'DRAFT') return false;
  if (row.stepIndex > 0) return false;
  if (row.selectedPathwayId) return false;
  if (row.consultationMode) return false;
  if (row.chiefComplaint?.trim()) return false;
  if (row.transcript?.trim()) return false;

  const module =
    row.module === SAFESCRIBE_MODULES.ADAPT
      ? SAFESCRIBE_MODULES.ADAPT
      : row.module === SAFESCRIBE_MODULES.RENEW
        ? SAFESCRIBE_MODULES.RENEW
        : SAFESCRIBE_MODULES.PRESCRIBE;
  const intakeStep =
    module === SAFESCRIBE_MODULES.ADAPT || module === SAFESCRIBE_MODULES.RENEW
      ? 'RENEW_MEDICATIONS'
      : 'PRESENTING_COMPLAINT';
  if (row.currentStep !== intakeStep) return false;
  if (module === SAFESCRIBE_MODULES.RENEW && (row.renewMedicationCount ?? 0) > 0) {
    return false;
  }
  return true;
}

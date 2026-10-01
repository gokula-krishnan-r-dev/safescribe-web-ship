import {
  formatPathwayDocumentChrome,
  formatPathwayDocumentChromeFromEvidenceSnapshot,
  readClinicalAssessment,
} from '@safescript/shared';
import type { Consultation } from '../types';

export function formatPrescribeDocumentChrome(
  consultation: Consultation,
): string | null {
  if (consultation.consultationMode === 'CLINICAL_JUDGMENT' && !consultation.pathway) {
    return null;
  }
  const stored = readClinicalAssessment(consultation.aiAnalysis);
  const pathwayLabel =
    consultation.pathway?.condition?.trim() ||
    consultation.pathway?.name?.trim() ||
    null;
  const pathwayVersion =
    typeof consultation.pathway?.version === 'number'
      ? `v${consultation.pathway.version}`
      : null;
  return formatPathwayDocumentChromeFromEvidenceSnapshot(stored?.evidenceSnapshot, {
    pathwayLabel,
    pathwayVersion,
  });
}

export { formatPathwayDocumentChrome };

'use client';

import type { MedicationEntry, TreatmentRecommendation } from './types';
import type { DrugSearchResult } from './medication-utils';
import { AddTreatmentModal } from './add-treatment/add-treatment-modal';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (treatments: TreatmentRecommendation[]) => void;
  priority: number;
  patientMedications?: MedicationEntry[];
  consultationId?: string;
  selectedPathwayId?: string | null;
  existingMedicationNames?: string[];
  excludedMedicationIds?: string[];
  existingTreatments?: TreatmentRecommendation[];
  onFocusExistingTreatment?: (ref: {
    pathwayOptionId?: string;
    treatmentInstanceId?: string;
    displayName?: string;
  }) => void;
  initialMedication?: DrugSearchResult | null;
  initialSearchQuery?: string;
  title?: string;
  confirmLabel?: string;
  medicationOnly?: boolean;
  successToastMessage?: (name: string) => string;
}

/** Back-compat wrapper — the three-mode modal is the canonical Add treatment UI. */
export function AddTreatmentDialog({
  open,
  onOpenChange,
  onAdd,
  priority,
  consultationId,
  selectedPathwayId,
  existingMedicationNames,
  excludedMedicationIds,
  existingTreatments,
  onFocusExistingTreatment,
  initialMedication,
  initialSearchQuery,
  title,
  confirmLabel,
  medicationOnly,
  successToastMessage,
}: Props) {
  return (
    <AddTreatmentModal
      open={open}
      onOpenChange={onOpenChange}
      onAdd={onAdd}
      priority={priority}
      consultationId={consultationId}
      selectedPathwayId={selectedPathwayId}
      existingMedicationNames={existingMedicationNames}
      excludedMedicationIds={excludedMedicationIds}
      existingTreatments={existingTreatments}
      onFocusExistingTreatment={onFocusExistingTreatment}
      initialMedication={initialMedication}
      initialSearchQuery={initialSearchQuery}
      title={title}
      confirmLabel={confirmLabel}
      medicationOnly={medicationOnly}
      successToastMessage={successToastMessage}
    />
  );
}

import { emptyRegimenLine } from './constants';
import { formatSuggestedDispenseQuantity } from './quantity';
import type {
  CompoundDraft,
  DeviceDraft,
  MedicationDraft,
  TreatmentKind,
} from './types';

const shared = {
  refills: 0,
  patientDirections: '',
  directionsMode: 'AUTO' as const,
  pharmacyInstructions: '',
  clinicalRationale: '',
  monitoringFollowUp: '',
};

export function emptyMedicationDraft(): MedicationDraft {
  const regimenLines = [emptyRegimenLine()];
  const quantityUnit = '';
  return {
    kind: 'MEDICATION',
    ...shared,
    quantityUnit,
    quantityValue: formatSuggestedDispenseQuantity(regimenLines, quantityUnit) ?? '',
    medicationDisplay: '',
    genericDisplay: '',
    regimenLines,
    route: '',
    maximumDose: '',
    doNotAdapt: false,
    doNotSubstitute: false,
    trialDispenseAuthorized: false,
    compliancePackageRequired: false,
    confidential: false,
  };
}

export function emptyCompoundDraft(): CompoundDraft {
  return {
    kind: 'CUSTOM_COMPOUND',
    ...shared,
    quantityValue: '60',
    quantityUnit: 'g',
    compoundLabel: '',
    compoundIngredientsText: '',
    preparationDetails: '',
    regimenLines: [
      emptyRegimenLine({
        form: 'Application(s)',
        prn: true,
      }),
    ],
    route: 'Topical',
    doNotAdapt: false,
    doNotSubstitute: false,
    trialDispenseAuthorized: false,
    confidential: false,
  };
}

export function emptyDeviceDraft(): DeviceDraft {
  return {
    kind: 'DEVICE',
    ...shared,
    quantityValue: '1',
    quantityUnit: 'Device(s)',
    terminologyRef: null,
    manualEntry: false,
    deviceName: '',
    deviceType: '',
    brandModel: '',
    sizeSpecification: '',
    useWith: '',
    useSchedule: '',
    durationDisplay: 'Ongoing',
    replacementInterval: '',
  };
}

export function emptyDraftFor(kind: TreatmentKind) {
  if (kind === 'CUSTOM_COMPOUND') return emptyCompoundDraft();
  if (kind === 'DEVICE') return emptyDeviceDraft();
  return emptyMedicationDraft();
}

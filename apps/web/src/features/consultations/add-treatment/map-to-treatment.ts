import type { TreatmentRecommendation } from '../types';
import type { CompoundDraft, DeviceDraft, MedicationDraft, TreatmentDraft } from './types';
import { composePatientDirections } from './directions';
import { formatCourseDurationDisplay } from './quantity';

export function draftToRecommendation(
  draft: TreatmentDraft,
  priority: number,
): TreatmentRecommendation {
  if (draft.kind === 'MEDICATION') return medicationToRecommendation(draft, priority);
  if (draft.kind === 'CUSTOM_COMPOUND') return compoundToRecommendation(draft, priority);
  return deviceToRecommendation(draft, priority);
}

function medicationToRecommendation(
  draft: MedicationDraft,
  priority: number,
): TreatmentRecommendation {
  const line = draft.regimenLines[0];
  const dose =
    line.doseTo?.trim()
      ? `${line.doseFrom.trim()}–${line.doseTo.trim()}`
      : line.doseFrom.trim();
  return {
    priority,
    medicationName: draft.medicationDisplay,
    genericName: draft.genericDisplay || undefined,
    category: 'PRESCRIPTION',
    treatmentKind: 'MEDICATION',
    dose,
    doseAmount: line.doseFrom.trim() || undefined,
    doseUnit: line.form,
    route: draft.route,
    frequency: line.frequency,
    duration: formatCourseDurationDisplay(draft.regimenLines) || undefined,
    quantity: `${draft.quantityValue} ${draft.quantityUnit}`.trim(),
    quantityUnit: draft.quantityUnit,
    refills: draft.refills,
    prn: line.prn,
    maxDose: draft.maximumDose.trim() || undefined,
    instructions: draft.patientDirections.trim(),
    displayName: draft.medicationDisplay,
    patientDirections: draft.patientDirections.trim(),
    directionsMode: draft.directionsMode,
    clinicalNotes: draft.clinicalRationale.trim() || undefined,
    followUpAdvice: draft.monitoringFollowUp.trim() || undefined,
    pharmacyInstructions: draft.pharmacyInstructions.trim() || undefined,
    doNotAdapt: draft.doNotAdapt || undefined,
    doNotSubstitute: draft.doNotSubstitute || undefined,
    trialDispenseAuthorized: draft.trialDispenseAuthorized || undefined,
    compliancePackageRequired: draft.compliancePackageRequired || undefined,
    confidential: draft.confidential || undefined,
    regimenLines: draft.regimenLines,
    confidence: 100,
    drugId: draft.drugId,
    rxcui: draft.rxcui,
    ndc: draft.ndc,
    terminologyLabel: draft.medicationDisplay,
    strength: draft.strength,
    source: draft.medicationCode?.system === 'CCDD' ? 'ccdd' : draft.drugId ? 'ccdd' : 'manual',
    treatmentInstanceId:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `tx-${Date.now()}`,
  };
}

function compoundToRecommendation(
  draft: CompoundDraft,
  priority: number,
): TreatmentRecommendation {
  const line = draft.regimenLines[0];
  const dose =
    line.doseTo?.trim()
      ? `${line.doseFrom.trim()}–${line.doseTo.trim()}`
      : line.doseFrom.trim();
  return {
    priority,
    medicationName: draft.compoundLabel.trim(),
    category: 'PRESCRIPTION',
    treatmentKind: 'CUSTOM_COMPOUND',
    dose,
    doseAmount: line.doseFrom.trim() || undefined,
    doseUnit: line.form,
    route: draft.route,
    frequency: line.frequency,
    duration: formatCourseDurationDisplay(draft.regimenLines) || undefined,
    quantity: `${draft.quantityValue} ${draft.quantityUnit}`.trim(),
    quantityUnit: draft.quantityUnit,
    refills: draft.refills,
    prn: line.prn,
    instructions: draft.patientDirections.trim(),
    displayName: draft.compoundLabel.trim(),
    patientDirections: draft.patientDirections.trim(),
    directionsMode: draft.directionsMode,
    clinicalNotes: draft.clinicalRationale.trim() || undefined,
    followUpAdvice: draft.monitoringFollowUp.trim() || undefined,
    pharmacyInstructions: draft.pharmacyInstructions.trim() || undefined,
    compoundIngredients: draft.compoundIngredientsText.trim(),
    preparationDetails: draft.preparationDetails.trim() || undefined,
    compoundSafetyCoverage: 'UNAVAILABLE',
    doNotAdapt: draft.doNotAdapt || undefined,
    doNotSubstitute: draft.doNotSubstitute || undefined,
    trialDispenseAuthorized: draft.trialDispenseAuthorized || undefined,
    confidential: draft.confidential || undefined,
    regimenLines: draft.regimenLines,
    confidence: 100,
    source: 'manual',
  };
}

function deviceToRecommendation(
  draft: DeviceDraft,
  priority: number,
): TreatmentRecommendation {
  return {
    priority,
    medicationName: draft.deviceName.trim(),
    category: 'NON_DRUG',
    treatmentKind: 'DEVICE',
    quantity: `${draft.quantityValue} ${draft.quantityUnit}`.trim(),
    quantityUnit: draft.quantityUnit,
    refills: draft.refills,
    duration: draft.durationDisplay.trim() || undefined,
    instructions: draft.patientDirections.trim(),
    displayName: draft.deviceName.trim(),
    patientDirections: draft.patientDirections.trim(),
    directionsMode: draft.directionsMode,
    clinicalNotes: draft.clinicalRationale.trim() || undefined,
    followUpAdvice: draft.monitoringFollowUp.trim() || undefined,
    pharmacyInstructions: draft.pharmacyInstructions.trim() || undefined,
    deviceType: draft.deviceType.trim() || undefined,
    deviceBrandModel: draft.brandModel.trim() || undefined,
    sizeSpecification: draft.sizeSpecification.trim() || undefined,
    useWith: draft.useWith.trim() || undefined,
    useSchedule: draft.useSchedule.trim() || undefined,
    replacementInterval: draft.replacementInterval.trim() || undefined,
    manualDeviceEntry: draft.manualEntry,
    deviceTerminology: draft.terminologyRef ?? undefined,
    confidence: 100,
    source: 'manual',
    drugId: draft.terminologyRef?.code,
  };
}

export function generatedDirectionsFor(draft: TreatmentDraft): string {
  if (draft.kind === 'DEVICE') {
    return '';
  }
  return composePatientDirections(draft.regimenLines, draft.route);
}

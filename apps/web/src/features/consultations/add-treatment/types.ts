export type TreatmentKind = 'MEDICATION' | 'CUSTOM_COMPOUND' | 'DEVICE';
export type DurationUnit = 'DAY' | 'WEEK' | 'MONTH';
export type DirectionsMode = 'AUTO' | 'MANUAL';

export interface CodedValue {
  system?: string;
  code?: string;
  display: string;
  version?: string;
}

export interface RegimenLineDraft {
  clientId: string;
  sequence: number;
  doseFrom: string;
  doseTo: string | null;
  form: string;
  frequency: string;
  prn: boolean;
  durationValue: string | null;
  durationUnit: DurationUnit | null;
}

export interface SharedTreatmentFields {
  kind: TreatmentKind;
  quantityValue: string;
  quantityUnit: string;
  refills: number;
  patientDirections: string;
  directionsMode: DirectionsMode;
  pharmacyInstructions: string;
  clinicalRationale: string;
  monitoringFollowUp: string;
}

export interface MedicationDraft extends SharedTreatmentFields {
  kind: 'MEDICATION';
  medicationCode?: CodedValue;
  medicationDisplay: string;
  genericDisplay: string;
  sourceBadge?: string;
  drugId?: string;
  rxcui?: string;
  ndc?: string;
  dosageForm?: string;
  /** CCDD / NTP product strength, e.g. "500 mg" */
  strength?: string;
  drugClass?: string;
  regimenLines: RegimenLineDraft[];
  route: string;
  maximumDose: string;
  doNotAdapt: boolean;
  doNotSubstitute: boolean;
  trialDispenseAuthorized: boolean;
  compliancePackageRequired: boolean;
  confidential: boolean;
}

export interface CompoundDraft extends SharedTreatmentFields {
  kind: 'CUSTOM_COMPOUND';
  compoundLabel: string;
  compoundIngredientsText: string;
  preparationDetails: string;
  regimenLines: RegimenLineDraft[];
  route: string;
  doNotAdapt: boolean;
  doNotSubstitute: boolean;
  trialDispenseAuthorized: boolean;
  confidential: boolean;
}

export interface DeviceDraft extends SharedTreatmentFields {
  kind: 'DEVICE';
  terminologyRef: CodedValue | null;
  manualEntry: boolean;
  deviceName: string;
  deviceType: string;
  brandModel: string;
  sizeSpecification: string;
  useWith: string;
  useSchedule: string;
  durationDisplay: string;
  replacementInterval: string;
}

export type TreatmentDraft = MedicationDraft | CompoundDraft | DeviceDraft;

export interface DeviceCatalogueItem {
  code: string;
  display: string;
  deviceType: string;
  sizeSpecification?: string;
  sourceMetadata: {
    system: string;
    version: string;
  };
}

export type FieldErrors = Record<string, string>;

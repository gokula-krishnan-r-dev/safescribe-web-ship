export type AdministrationAction =
  | 'TAKE'
  | 'APPLY'
  | 'SPRAY'
  | 'INHALE'
  | 'INSTILL'
  | 'INJECT'
  | 'INSERT'
  | 'RINSE'
  | 'GARGLE'
  | 'REVIEW_REQUIRED';

export type TimingPresetGroup =
  | 'COMMON'
  | 'TIME_OF_DAY'
  | 'INTERVAL'
  | 'EVENT'
  | 'CALENDAR'
  | 'CUSTOM';

export interface TimingPreset {
  id: string;
  code: string;
  label: string;
  group: TimingPresetGroup;
  /** Legacy frequency catalogue value stored on regimen lines. */
  frequencyValue: string;
  perDay: number | null;
  custom?: boolean;
}

export interface TreatmentTimingConfiguration {
  defaultTimingPresetId: string;
  commonTimingPresetIds: string[];
  allowMoreSchedules: boolean;
  allowCustomSchedule: boolean;
}

export interface TimingMenuOption {
  id: string;
  label: string;
  frequencyValue: string;
}

export interface TimingMenu {
  suggested?: TimingMenuOption;
  common: TimingMenuOption[];
  showMoreSchedules: boolean;
}

export type DirectionsSource = 'PATHWAY' | 'GENERATED' | 'PHARMACIST_EDITED' | 'RENAL_ADJUSTED';

export type QuantityStatus =
  | 'AUTO_CALCULATED'
  | 'PATHWAY_SUGGESTED'
  | 'PHARMACIST_MODIFIED'
  | 'REVIEW_REQUIRED';

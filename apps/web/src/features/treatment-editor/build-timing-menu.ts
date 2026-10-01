import {
  DEFAULT_COMMON_TIMING_IDS,
  getTimingPreset,
  presetIdFromFrequency,
  resolveTimingPreset,
} from './timing-presets';
import type { TimingMenu, TreatmentTimingConfiguration } from './types';

function toMenuOption(id: string) {
  const preset = getTimingPreset(id);
  if (!preset) return null;
  return { id: preset.id, label: preset.label, frequencyValue: preset.frequencyValue };
}

export function buildTimingConfiguration(input: {
  pathwayFrequency?: string | null;
  commonTimingPresetIds?: string[];
}): TreatmentTimingConfiguration {
  const suggestedId =
    presetIdFromFrequency(input.pathwayFrequency) ??
    resolveTimingPreset(input.pathwayFrequency ?? '')?.id ??
    'ONCE_DAILY';

  const commonIds =
    input.commonTimingPresetIds?.length ?
      input.commonTimingPresetIds.slice(0, 5)
    : [...DEFAULT_COMMON_TIMING_IDS];

  return {
    defaultTimingPresetId: suggestedId,
    commonTimingPresetIds: commonIds.filter((id) => id !== suggestedId).slice(0, 5),
    allowMoreSchedules: true,
    allowCustomSchedule: true,
  };
}

export function buildTimingMenu(
  configuration: TreatmentTimingConfiguration,
): TimingMenu {
  const suggested = toMenuOption(configuration.defaultTimingPresetId) ?? undefined;
  const common = configuration.commonTimingPresetIds
    .map((id) => toMenuOption(id))
    .filter((option): option is NonNullable<typeof option> => Boolean(option))
    .filter((option) => option.id !== suggested?.id)
    .slice(0, 5);

  return {
    suggested,
    common,
    showMoreSchedules: configuration.allowMoreSchedules,
  };
}

export function isPharmacistModifiedTiming(
  currentFrequency: string,
  configuration: TreatmentTimingConfiguration,
): boolean {
  const currentId = presetIdFromFrequency(currentFrequency);
  if (!currentId) return Boolean(currentFrequency.trim());
  return currentId !== configuration.defaultTimingPresetId;
}

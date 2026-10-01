'use client';

import { useEffect, useState } from 'react';
import type { DurationUnit, RegimenLineDraft } from '@/features/consultations/add-treatment/types';
import {
  formatSuggestedDispenseQuantity,
  suggestedCourseDuration,
  type CourseDuration,
} from '@/features/consultations/add-treatment/quantity';

export function useCourseSupply(
  lines: RegimenLineDraft[],
  quantityValue: string,
  quantityUnit: string,
) {
  const sequential = lines.length > 1;
  const calculatedDuration = suggestedCourseDuration(lines);
  const calculatedQty = formatSuggestedDispenseQuantity(lines, quantityUnit);
  const [durationOverride, setDurationOverride] = useState<CourseDuration | null>(null);

  useEffect(() => {
    if (!sequential) setDurationOverride(null);
  }, [sequential]);

  const first = lines[0];
  const displayedDuration: { value: string; unit: DurationUnit } = sequential
    ? durationOverride ??
      calculatedDuration ?? {
        value: first?.durationValue ?? '',
        unit: first?.durationUnit ?? 'DAY',
      }
    : {
        value: first?.durationValue ?? '',
        unit: first?.durationUnit ?? 'DAY',
      };

  const qtyModified = Boolean(
    calculatedQty && quantityValue.trim() && quantityValue.trim() !== calculatedQty,
  );
  const durationModified = Boolean(
    sequential &&
      durationOverride &&
      calculatedDuration &&
      (durationOverride.value !== calculatedDuration.value ||
        durationOverride.unit !== calculatedDuration.unit),
  );

  return {
    sequential,
    calculatedDuration,
    calculatedQty,
    displayedDuration,
    setDurationOverride,
    calculatedFromSchedule: Boolean(calculatedDuration && calculatedQty),
    showReset: qtyModified || durationModified,
  };
}

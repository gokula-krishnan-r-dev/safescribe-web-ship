'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  emptyAdaptStepTwoOptionC,
  selectLatestLabValues,
  vitalsFieldsFromLabValues,
  type AdaptExtractedLabValue,
  type AdaptStepTwoOptionC,
} from '@safescript/shared';
import { LabsVitalsSection } from '@/features/consultations/steps/step3-patient-details';
import type { Demographics, ExtractedLabValue } from '@/features/consultations/types';

function toExtracted(values: AdaptExtractedLabValue[] | undefined): ExtractedLabValue[] {
  return (values ?? []).map((v) => ({
    test: v.test,
    value: v.value,
    unit: v.unit,
    referenceRange: v.referenceRange,
    observedDate: v.observedDate,
    confidence: v.confidence,
    needsReview: v.needsReview,
  }));
}

function toAdaptExtracted(values: ExtractedLabValue[]): AdaptExtractedLabValue[] {
  return values.map((v) => ({
    test: v.test,
    value: v.value,
    unit: v.unit,
    referenceRange: v.referenceRange,
    observedDate: v.observedDate,
    confidence: v.confidence,
    needsReview: v.needsReview,
  }));
}

function step2CToDemo(step2C: AdaptStepTwoOptionC): Demographics {
  return {
    labValues: step2C.labValues ?? '',
    extractedLabValues: toExtracted(step2C.extractedLabValues),
    height: step2C.height ?? '',
    weight: step2C.weight ?? '',
    bmi: step2C.bmi ?? '',
    pulse: step2C.pulse ?? '',
    bloodPressureSystolic: step2C.bloodPressureSystolic ?? '',
    bloodPressureDiastolic: step2C.bloodPressureDiastolic ?? '',
    measurementDate: step2C.measurementDate ?? '',
  };
}

function patchStep2C(
  prev: AdaptStepTwoOptionC,
  key: keyof Demographics,
  value: string,
): AdaptStepTwoOptionC {
  const next: AdaptStepTwoOptionC = { ...prev };
  switch (key) {
    case 'labValues':
      next.labValues = value;
      break;
    case 'height':
      next.height = value;
      break;
    case 'weight':
      next.weight = value;
      break;
    case 'bmi':
      next.bmi = value;
      break;
    case 'pulse':
      next.pulse = value;
      break;
    case 'bloodPressureSystolic':
      next.bloodPressureSystolic = value;
      break;
    case 'bloodPressureDiastolic':
      next.bloodPressureDiastolic = value;
      break;
    case 'measurementDate':
      next.measurementDate = value;
      break;
    default:
      break;
  }

  if (key === 'height' || key === 'weight') {
    const h = parseFloat((key === 'height' ? value : next.height) || '');
    const w = parseFloat((key === 'weight' ? value : next.weight) || '');
    if (Number.isFinite(h) && h > 0 && Number.isFinite(w) && w > 0) {
      const meters = h / 100;
      next.bmi = (w / (meters * meters)).toFixed(1);
    } else {
      next.bmi = '';
    }
  }

  return next;
}

export function hasAnyAdaptLabsOrVitals(step2C: AdaptStepTwoOptionC): boolean {
  return Boolean(
    step2C.labValues?.trim() ||
      (step2C.extractedLabValues?.length ?? 0) > 0 ||
      step2C.height?.trim() ||
      step2C.weight?.trim() ||
      step2C.pulse?.trim() ||
      step2C.bloodPressureSystolic?.trim() ||
      step2C.bloodPressureDiastolic?.trim(),
  );
}

/** Finalize labs for persistence when Patient info is confirmed (optional section). */
export function finalizeAdaptLabsOnConfirm(step2C: AdaptStepTwoOptionC): AdaptStepTwoOptionC {
  const hasAny = hasAnyAdaptLabsOrVitals(step2C);
  return {
    ...step2C,
    confirmed: true,
    skipped: !hasAny,
    confirmedAt: new Date().toISOString(),
  };
}

export function validateAdaptLabsVitals(step2C: AdaptStepTwoOptionC): string | null {
  const sys = step2C.bloodPressureSystolic?.trim();
  const dia = step2C.bloodPressureDiastolic?.trim();
  if ((sys && !dia) || (!sys && dia)) {
    return 'Enter both systolic and diastolic blood pressure, or leave both blank.';
  }
  if (sys && dia) {
    const s = Number(sys);
    const d = Number(dia);
    if (!Number.isNaN(s) && !Number.isNaN(d) && s <= d) {
      return 'Systolic should be higher than diastolic — please verify.';
    }
  }
  if (step2C.measurementDate) {
    const today = new Date().toISOString().slice(0, 10);
    if (step2C.measurementDate > today) {
      return 'Measurement date cannot be in the future.';
    }
  }
  return null;
}

export interface AdaptLabsVitalsInlineProps {
  consultationId: string;
  initialStep2C?: AdaptStepTwoOptionC;
  onSaveStep2C: (step2C: AdaptStepTwoOptionC) => Promise<void> | void;
  /** Called whenever labs change so parent can gate Save & continue. */
  onChange?: (step2C: AdaptStepTwoOptionC) => void;
}

/**
 * Prescribe-parity Labs & Vitals fields, embedded inside Adapt Patient info (2A).
 * Optional — no separate accordion / continue step.
 */
export function AdaptLabsVitalsInline({
  consultationId,
  initialStep2C,
  onSaveStep2C,
  onChange,
}: AdaptLabsVitalsInlineProps) {
  const [step2C, setStep2C] = useState<AdaptStepTwoOptionC>(
    () => initialStep2C ?? emptyAdaptStepTwoOptionC(),
  );
  const [extractedLabValues, setExtractedLabValues] = useState<ExtractedLabValue[]>(() =>
    toExtracted(initialStep2C?.extractedLabValues),
  );

  useEffect(() => {
    if (!initialStep2C) return;
    setStep2C(initialStep2C);
    setExtractedLabValues(toExtracted(initialStep2C.extractedLabValues));
  }, [initialStep2C]);

  const demo = useMemo(() => step2CToDemo(step2C), [step2C]);

  const persist = useCallback(
    (next: AdaptStepTwoOptionC) => {
      setStep2C(next);
      onChange?.(next);
      void onSaveStep2C(next);
    },
    [onChange, onSaveStep2C],
  );

  const handleFieldChange = useCallback(
    (key: keyof Demographics, value: string) => {
      const next = patchStep2C(step2C, key, value);
      persist({ ...next, skipped: false });
    },
    [persist, step2C],
  );

  const handleLabsApply = useCallback(
    (formattedText: string, values: ExtractedLabValue[]) => {
      const latest = selectLatestLabValues(values);
      const vitalPatch = vitalsFieldsFromLabValues(latest);
      setExtractedLabValues(latest);
      persist({
        ...step2C,
        labValues: formattedText,
        extractedLabValues: toAdaptExtracted(latest),
        height: vitalPatch.height ?? step2C.height,
        weight: vitalPatch.weight ?? step2C.weight,
        bmi: vitalPatch.bmi ?? step2C.bmi,
        pulse: vitalPatch.pulse ?? step2C.pulse,
        bloodPressureSystolic: vitalPatch.bloodPressureSystolic ?? step2C.bloodPressureSystolic,
        bloodPressureDiastolic: vitalPatch.bloodPressureDiastolic ?? step2C.bloodPressureDiastolic,
        skipped: false,
      });
    },
    [persist, step2C],
  );

  return (
    <div className="-mx-1 sm:mx-0">
      <LabsVitalsSection
        consultationId={consultationId}
        demo={demo}
        extractedLabValues={extractedLabValues}
        open
        completed={false}
        onEdit={() => undefined}
        onFieldChange={handleFieldChange}
        onLabsApply={handleLabsApply}
        onSkip={() => undefined}
        onSave={() => undefined}
        hasUnreviewedReport={false}
      />
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';
import type { DurationUnit, FieldErrors, RegimenLineDraft } from '@/features/consultations/add-treatment/types';
import { collectPrescriptionFieldAlerts } from '@/features/consultations/add-treatment/regimen-editor';
import { PatientDirectionsCard } from './patient-directions-card';
import { PrescriptionSupplyRow } from './prescription-supply-row';
import { RegimenCard } from './regimen-card';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { PrescriptionDetailsSection, RouteSelectField } from './selected-treatment-header';
import { useCourseSupply } from './use-course-supply';
import type { DirectionsSource, QuantityStatus } from './types';

export interface PrescriptionQuantityPatch {
  quantityValue?: string;
  quantityUnit?: string;
  refills?: number;
}

interface Props {
  lines: RegimenLineDraft[];
  onLinesChange: (lines: RegimenLineDraft[]) => void;
  productForm: string;
  route: string;
  medicationHaystack?: string;
  pathwayFrequency?: string | null;
  unitOptions?: string[];
  routeOptions?: string[];
  showRoute?: boolean;
  onRouteChange?: (route: string) => void;
  patientDirections: string;
  directionsSource: DirectionsSource;
  onDirectionsChange: (value: string) => void;
  onDirectionsEdit?: () => void;
  onDirectionsRegenerate?: () => void;
  showRegenerate?: boolean;
  directionsError?: string;
  errors?: FieldErrors;
  disabled?: boolean;
  idPrefix?: string;
  subtitle?: string;
  sourceBadge?: string;
  showDispense?: boolean;
  quantityValue?: string;
  quantityUnit?: string;
  refills?: number;
  quantityStatus?: QuantityStatus;
  quantityExplanation?: string;
  allowedQuantityUnits?: string[];
  limitsSummary?: string;
  onQuantityChange?: (patch: PrescriptionQuantityPatch) => void;
}

function applyDurationPatch(
  lines: RegimenLineDraft[],
  patch: { durationValue?: string | null; durationUnit?: DurationUnit | null },
): RegimenLineDraft[] {
  return lines.map((line, idx) =>
    idx === 0
      ? {
          ...line,
          durationValue:
            patch.durationValue !== undefined ? patch.durationValue : line.durationValue,
          durationUnit:
            patch.durationUnit !== undefined ? patch.durationUnit : line.durationUnit,
        }
      : line,
  );
}

export function PrescriptionDetailsFields({
  lines,
  onLinesChange,
  productForm,
  route,
  medicationHaystack,
  pathwayFrequency,
  unitOptions,
  routeOptions,
  showRoute,
  onRouteChange,
  patientDirections,
  directionsSource,
  onDirectionsChange,
  onDirectionsEdit,
  onDirectionsRegenerate,
  showRegenerate,
  directionsError,
  errors,
  disabled,
  idPrefix = 'rx',
  subtitle,
  sourceBadge,
  showDispense = true,
  quantityValue = '',
  quantityUnit = '',
  refills = 0,
  quantityStatus = 'REVIEW_REQUIRED',
  quantityExplanation,
  allowedQuantityUnits,
  limitsSummary,
  onQuantityChange,
}: Props) {
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const alerts = collectPrescriptionFieldAlerts(lines, errors);
  const supply = useCourseSupply(lines, quantityValue, quantityUnit);
  const supplyErrors: Record<string, string> = {};
  if (errors?.quantityValue) supplyErrors.quantityValue = errors.quantityValue;
  if (errors?.quantityUnit) supplyErrors.quantityUnit = errors.quantityUnit;
  if (errors?.refills) supplyErrors.refills = errors.refills;
  const durationValueError = errors?.['regimenLines.0.durationValue'] ?? errors?.durationValue;
  const durationUnitError = errors?.['regimenLines.0.durationUnit'] ?? errors?.durationUnit;
  if (!supply.sequential && durationValueError) supplyErrors.durationValue = durationValueError;
  if (!supply.sequential && durationUnitError) supplyErrors.durationUnit = durationUnitError;

  const resolvedExplanation =
    quantityExplanation ??
    (showDispense && supply.calculatedQty
      ? 'Calculated from dose, timing, and each dosing schedule duration.'
      : undefined);

  const resolvedStatus: QuantityStatus =
    supply.showReset ? 'PHARMACIST_MODIFIED' : quantityStatus;

  return (
    <PrescriptionDetailsSection
      headingId={`${idPrefix}-details-heading`}
      subtitle={subtitle}
      headerRight={
        <button
          type="button"
          onClick={() => setGuidanceOpen(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12.5px] font-semibold text-[#3d6b9a] hover:bg-[#eef4f8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F817C]/25"
        >
          <Info className="h-3.5 w-3.5" aria-hidden />
          View dosing guidance
        </button>
      }
    >
      {alerts.length ? (
        <p role="alert" className="text-[12.5px] font-medium text-destructive">
          {alerts[0]}
        </p>
      ) : null}

      <RegimenCard
        lines={lines}
        onChange={onLinesChange}
        productForm={productForm}
        route={route}
        medicationHaystack={medicationHaystack}
        pathwayFrequency={pathwayFrequency}
        unitOptions={unitOptions}
        errors={errors}
        disabled={disabled}
        idPrefix={idPrefix}
        sourceBadge={sourceBadge}
        limitsSummary={limitsSummary}
      />

      {showRoute && routeOptions && onRouteChange ? (
        <RouteSelectField
          id={`${idPrefix}-route`}
          value={route}
          options={routeOptions}
          onChange={onRouteChange}
        />
      ) : null}

      <PatientDirectionsCard
        id={`${idPrefix}-directions`}
        value={patientDirections}
        source={directionsSource}
        error={directionsError}
        disabled={disabled}
        showRegenerate={showRegenerate}
        onChange={onDirectionsChange}
        onEdit={onDirectionsEdit}
        onRegenerate={onDirectionsRegenerate}
      />

      <PrescriptionSupplyRow
        durationValue={supply.displayedDuration.value || null}
        durationUnit={supply.displayedDuration.unit}
        quantityValue={quantityValue}
        quantityUnit={quantityUnit}
        refills={refills}
        quantityStatus={resolvedStatus}
        quantityExplanation={resolvedExplanation}
        allowedQuantityUnits={allowedQuantityUnits}
        errors={supplyErrors}
        disabled={disabled}
        idPrefix={`${idPrefix}-supply`}
        showDispense={showDispense}
        calculatedFromSchedule={showDispense && supply.calculatedFromSchedule}
        showResetCalculated={supply.showReset}
        onResetCalculated={() => {
          supply.setDurationOverride(null);
          if (!supply.sequential && supply.calculatedDuration) {
            onLinesChange(
              applyDurationPatch(lines, {
                durationValue: supply.calculatedDuration.value,
                durationUnit: supply.calculatedDuration.unit,
              }),
            );
          }
          if (supply.calculatedQty) onQuantityChange?.({ quantityValue: supply.calculatedQty });
        }}
        onChange={(patch) => {
          if (patch.durationValue !== undefined || patch.durationUnit !== undefined) {
            if (supply.sequential) {
              supply.setDurationOverride({
                value:
                  patch.durationValue !== undefined
                    ? patch.durationValue ?? ''
                    : supply.displayedDuration.value,
                unit:
                  patch.durationUnit !== undefined
                    ? patch.durationUnit ?? 'DAY'
                    : supply.displayedDuration.unit,
              });
            } else {
              onLinesChange(applyDurationPatch(lines, patch));
            }
          }
          const qty: PrescriptionQuantityPatch = {};
          if (patch.quantityValue !== undefined) qty.quantityValue = patch.quantityValue;
          if (patch.quantityUnit !== undefined) qty.quantityUnit = patch.quantityUnit;
          if (patch.refills !== undefined) qty.refills = patch.refills;
          if (Object.keys(qty).length) onQuantityChange?.(qty);
        }}
      />

      <ConfirmDialog
        open={guidanceOpen}
        onOpenChange={setGuidanceOpen}
        title="Dosing guidance"
        description={
          limitsSummary ||
          'No additional dosing guidance is available for this product.'
        }
        confirmLabel="Close"
        onConfirm={() => setGuidanceOpen(false)}
      />
    </PrescriptionDetailsSection>
  );
}

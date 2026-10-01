'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/lib/notify';
import type { ClinicalTreatment } from '@/features/pathways/types';
import {
  composeAdminDirections,
  composeDuration,
  composeRegimenDoseDisplay,
  createEmptyRegimen,
} from '@/features/pathways/treatment-option-editor-constants';
import {
  administrationUnitsFor,
  reconcileRegimenUse,
  routesForProductForm,
} from '@/features/pathways/product-use-mapping';
import type { RegimenLineDraft } from '@/features/consultations/add-treatment/types';
import { composePatientDirections } from '@/features/consultations/add-treatment/directions';
import { resolveRouteValue } from '@/features/consultations/add-treatment/route-options';
import { SelectedTreatmentHeader } from './selected-treatment-header';
import { PrescriptionDetailsFields } from './prescription-details-fields';
import { TreatmentEditorFooter } from './safety-review-bar';
import { TreatmentEditorPanel } from './treatment-editor-shell';
import {
  linesFromTreatment,
  linesToRegimen,
  regimensFromTreatment,
  serializeRegimenLines,
} from './pathway-regimen-lines';

function autoDirections(lines: RegimenLineDraft[], route: string, fallbackRegimen: ReturnType<typeof createEmptyRegimen>) {
  return (
    composePatientDirections(lines, route) ||
    composeAdminDirections(fallbackRegimen)
  );
}

export function PathwayRegimenEditor({
  treatment,
  canEdit,
  saving,
  onSave,
  onCancel,
}: {
  treatment: ClinicalTreatment;
  canEdit: boolean;
  saving?: boolean;
  onSave: (payload: Partial<ClinicalTreatment>) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [regimens, setRegimens] = useState(() => regimensFromTreatment(treatment));
  const [lines, setLines] = useState(() =>
    linesFromTreatment(treatment, regimensFromTreatment(treatment)[0] ?? createEmptyRegimen()),
  );
  const [directions, setDirections] = useState(treatment.directions ?? '');
  const [directionsMode, setDirectionsMode] = useState<'AUTO' | 'MANUAL'>(
    treatment.directions?.trim() ? 'MANUAL' : 'AUTO',
  );
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const nextRegimens = regimensFromTreatment(treatment);
    setRegimens(nextRegimens);
    setLines(linesFromTreatment(treatment, nextRegimens[0] ?? createEmptyRegimen()));
    setDirections(treatment.directions ?? '');
    setDirectionsMode(treatment.directions?.trim() ? 'MANUAL' : 'AUTO');
    setDirty(false);
  }, [treatment.id, treatment.frequency, treatment.dose, treatment.directions]);

  const primary = regimens[0] ?? createEmptyRegimen();
  const unitOptions = administrationUnitsFor(primary.productForm, primary.route);
  const regimenComplete = Boolean(
    primary.dose.trim() &&
      primary.frequency.trim() &&
      lines.every((line) => {
        const doseOk =
          line.doseFrom.trim() &&
          line.frequency.trim() &&
          line.form.trim() &&
          (line.doseTo == null || Boolean(line.doseTo.trim()));
        if (lines.length <= 1) return doseOk;
        const n = Number(line.durationValue);
        return (
          doseOk &&
          Boolean(line.durationValue?.trim()) &&
          Number.isFinite(n) &&
          n > 0 &&
          Boolean(line.durationUnit)
        );
      }),
  );

  const patchLines = (nextLines: RegimenLineDraft[]) => {
    const nextRegimen = linesToRegimen(nextLines, primary);
    setLines(nextLines);
    setRegimens([nextRegimen, ...regimens.slice(1)]);
    setDirty(true);
    if (directionsMode === 'AUTO') {
      setDirections(autoDirections(nextLines, nextRegimen.route || primary.route, nextRegimen));
    }
  };

  const handleSave = async () => {
    const primaryRegimen = regimens[0];
    if (!primaryRegimen) return;
    const doseDisplay = composeRegimenDoseDisplay(primaryRegimen);
    const savedDirections =
      directionsMode === 'AUTO'
        ? autoDirections(lines, primaryRegimen.route, primaryRegimen)
        : directions;
    await onSave({
      dose: doseDisplay,
      route: primaryRegimen.route,
      frequency: primaryRegimen.frequency,
      duration: composeDuration(primaryRegimen.durationValue, primaryRegimen.durationUnit),
      directions: savedDirections,
      metadata: {
        ...(typeof treatment.metadata === 'object' && treatment.metadata ? treatment.metadata : {}),
        regimens: regimens.map((r) => ({
          id: r.id,
          label: r.label,
          dose: r.dose,
          administrationUnit: r.administrationUnit,
          productForm: r.productForm,
          frequency: r.frequency,
          route: r.route,
          durationValue: r.durationValue,
          durationUnit: r.durationUnit,
        })),
        regimenLines: serializeRegimenLines(lines),
      },
    });
    setDirty(false);
    toast.success('Treatment regimen saved.');
  };

  const recommendationBadge =
    treatment.recommendationLevel === 'FIRST_LINE' ? 'Recommended' : 'Alternative';

  return (
    <div className="border-t border-[#e6ecee] bg-[#f8fbfb] px-4 py-4 sm:px-5">
      <TreatmentEditorPanel
        header={
          <SelectedTreatmentHeader
            headingId={`pathway-treatment-editor-${treatment.id}`}
            primaryName={treatment.medicationName}
            secondaryName={
              [treatment.genericName, treatment.strength].filter(Boolean).join(' · ') || undefined
            }
            productForm={primary.productForm || undefined}
            route={primary.route ? resolveRouteValue(primary.route) || primary.route : undefined}
            recommendationBadge={recommendationBadge}
            pathwayReason="Pathway-preferred option"
            showSelectedBadge={false}
            detailsContent={treatment.clinicalIndication || treatment.clinicalNotes || undefined}
          />
        }
        footer={
          canEdit ? (
            <TreatmentEditorFooter
              allComplete={regimenComplete}
              dirty={dirty}
              valid={regimenComplete}
              saving={saving}
              saveLabel="Save regimen"
              continueHint={
                regimenComplete
                  ? dirty
                    ? 'Save your regimen changes.'
                    : 'Save to confirm this pathway regimen.'
                  : undefined
              }
              onCancel={onCancel}
              onSave={() => void handleSave()}
            />
          ) : undefined
        }
      >
        <fieldset disabled={!canEdit || saving} className="disabled:opacity-80">
          <PrescriptionDetailsFields
            lines={lines}
            onLinesChange={patchLines}
            productForm={primary.productForm}
            route={primary.route}
            medicationHaystack={treatment.medicationName}
            pathwayFrequency={treatment.frequency}
            unitOptions={unitOptions}
            routeOptions={routesForProductForm(primary.productForm)}
            showRoute={Boolean(
              primary.productForm && routesForProductForm(primary.productForm).length > 1,
            )}
            onRouteChange={(route) => {
              const next = reconcileRegimenUse({
                productForm: primary.productForm,
                route,
                administrationUnit: primary.administrationUnit,
              });
              const nextPrimary = {
                ...primary,
                route: next.route,
                administrationUnit: next.administrationUnit,
              };
              setRegimens([nextPrimary, ...regimens.slice(1)]);
              setDirty(true);
              if (directionsMode === 'AUTO') {
                setDirections(autoDirections(lines, nextPrimary.route, nextPrimary));
              }
            }}
            patientDirections={
              directionsMode === 'AUTO'
                ? autoDirections(lines, primary.route, primary)
                : directions
            }
            directionsSource={directionsMode === 'AUTO' ? 'GENERATED' : 'PHARMACIST_EDITED'}
            disabled={!canEdit || saving}
            idPrefix={`pathway-${treatment.id}`}
            subtitle="Configure the default regimen for this pathway treatment."
            showRegenerate={directionsMode === 'MANUAL'}
            onDirectionsChange={(value) => {
              setDirections(value);
              setDirectionsMode('MANUAL');
              setDirty(true);
            }}
            onDirectionsEdit={() => setDirectionsMode('MANUAL')}
            onDirectionsRegenerate={() => {
              setDirections(autoDirections(lines, primary.route, primary));
              setDirectionsMode('AUTO');
              setDirty(true);
            }}
            showDispense={false}
          />
        </fieldset>
      </TreatmentEditorPanel>
    </div>
  );
}

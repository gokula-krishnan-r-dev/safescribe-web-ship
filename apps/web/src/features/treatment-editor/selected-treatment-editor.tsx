'use client';

import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import type { FieldErrors } from '@/features/consultations/add-treatment/types';
import {
  formatDurationDisplay,
  formatSuggestedDispenseQuantity,
  withAutoDispenseQuantity,
  withAutoPrescriptionSupply,
} from '@/features/consultations/add-treatment/quantity';
import {
  applyInlineDraft,
  applyInlineDraftPatch,
  draftString,
  generateInlineDirections,
  hydrateInlineDraft,
  isInlineDraftDirty,
  regimenFingerprint,
  validateInlineDraft,
  type InlinePrescriptionDraft,
} from '@/features/consultations/inline-prescription';
import {
  medicationPrimaryName,
  medicationSecondaryName,
  resolvePharmacistProductUse,
  applyMedicationProductChange,
} from '@/features/consultations/pharmacist-product-use';
import { safetyReviewItemsForOption } from '@/features/consultations/safety-review-model';
import {
  optionKey,
  supportsInlinePrescriptionEditor,
  type TreatmentOptionView,
} from '@/features/consultations/treatment-options-model';
import type { TreatmentRecommendation } from '@/features/consultations/types';
import { ChangeProductDialog } from '@/features/consultations/change-product-dialog';
import type { DrugSearchResult } from '@/features/consultations/medication-utils';
import { AdjustedRegimenProductModal } from './adjusted-regimen-product-modal';
import {
  applyRenalAdjustmentToDraft,
  composeAdjustedRegimenTreatment,
  persistAdjustedRegimen,
} from './apply-renal-adjustment';
import { routeSelectOptions } from '@/features/consultations/add-treatment/route-options';
import { resolveAdministrationAction } from './administration-action';
import { PatientDirectionsCard } from './patient-directions-card';
import { PrescriptionSupplyRow } from './prescription-supply-row';
import { RegimenCard } from './regimen-card';
import {
  PrescriptionDetailsSection,
  ProductReviewBanner,
  RouteSelectField,
  SelectedTreatmentHeader,
} from './selected-treatment-header';
import { SafetyReviewSection, TreatmentEditorFooter } from './safety-review-bar';
import { TreatmentEditorPanel } from './treatment-editor-shell';
import { RenalSafetyCard } from './renal-safety-card';
import { useCourseSupply } from './use-course-supply';
import {
  buildRenalSafetyView,
  type RegimenSource,
} from './renal-safety-model';
import type { DirectionsSource, QuantityStatus } from './types';

export interface SelectedTreatmentEditorProps {
  option: TreatmentOptionView;
  consultationId?: string;
  disabled?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onSave: (
    updated: TreatmentRecommendation,
  ) => Promise<TreatmentRecommendation | void> | TreatmentRecommendation | void;
  onCancel: () => void;
  saving?: boolean;
  saveError?: string | null;
  checkingSafety?: boolean;
  safetyUnavailable?: boolean;
  onRetrySafety?: () => void;
  onRequestOverride?: () => void;
  patientPregnant?: boolean;
  patientHasAllergies?: boolean;
  headingId?: string;
  labsText?: string | null;
  extractedLabs?: Array<{ test?: string | null; value?: string | null; unit?: string | null }>;
  saveLabel?: string;
  continueHint?: string;
}

function directionsSource(
  mode: 'AUTO' | 'MANUAL',
  fromPathway: boolean,
  regimenSource: RegimenSource,
): DirectionsSource {
  if (regimenSource === 'RENAL_ADJUSTED') return 'RENAL_ADJUSTED';
  if (mode === 'MANUAL') return 'PHARMACIST_EDITED';
  return fromPathway ? 'PATHWAY' : 'GENERATED';
}

function quantityStatus(
  draft: InlinePrescriptionDraft,
  suggestedQty: string | null,
  dirty: boolean,
): QuantityStatus {
  const quantityValue = draftString(draft.quantityValue).trim();
  if (!quantityValue) return 'REVIEW_REQUIRED';
  if (suggestedQty && suggestedQty === quantityValue && !dirty) {
    return 'AUTO_CALCULATED';
  }
  if (suggestedQty && suggestedQty !== quantityValue) {
    return 'PHARMACIST_MODIFIED';
  }
  return 'PATHWAY_SUGGESTED';
}

function buildLimitsSummary(treatment: TreatmentRecommendation): string | undefined {
  const parts: string[] = [];
  const meta = treatment as TreatmentRecommendation & {
    minimumRepeatIntervalHours?: number;
    maximumDosePer24Hours?: number;
  };
  const repeat = meta.minimumRepeatIntervalHours;
  const max24 = meta.maximumDosePer24Hours;
  if (repeat != null && repeat > 0) {
    parts.push(`Repeat after ${repeat} hour${repeat === 1 ? '' : 's'}`);
  }
  if (max24 != null && max24 > 0) {
    const unit = treatment.doseUnit?.trim() || 'dose';
    parts.push(`Maximum ${max24} ${unit} in 24 hours`);
  }
  if (!parts.length && treatment.maxDose?.trim()) {
    parts.push(`Maximum dose: ${treatment.maxDose.trim()}`);
  }
  return parts.length ? parts.join(' • ') : undefined;
}

export function SelectedTreatmentEditor({
  option,
  disabled,
  onDirtyChange,
  onSave,
  onCancel,
  saving,
  saveError,
  checkingSafety,
  safetyUnavailable,
  onRetrySafety,
  onRequestOverride,
  patientPregnant = false,
  patientHasAllergies = true,
  headingId,
  labsText,
  extractedLabs,
  saveLabel,
  continueHint,
  consultationId,
}: SelectedTreatmentEditorProps) {
  const [saved, setSaved] = useState(() => hydrateInlineDraft(option.treatment));
  const [draft, setDraft] = useState(saved);
  const [touched, setTouched] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [regenOpen, setRegenOpen] = useState(false);
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const [safetyDetailsOpen, setSafetyDetailsOpen] = useState(true);
  const [productOpen, setProductOpen] = useState(false);
  const [adjustedOpen, setAdjustedOpen] = useState(false);
  const [adjustedApplying, setAdjustedApplying] = useState(false);
  const [adjustedApplyError, setAdjustedApplyError] = useState<string | null>(null);
  const [regimenSource, setRegimenSource] = useState<RegimenSource>(
    option.treatment.regimenSource ?? 'STANDARD',
  );
  const standardSnapshotRef = useRef<InlinePrescriptionDraft | null>(null);
  const autoLockRef = useRef(regimenFingerprint(saved));
  const lastAutoQtyRef = useRef<string | null>(null);
  const lastAutoUnitRef = useRef<string | null>(null);
  const resolvedHeadingId =
    headingId ?? `selected-treatment-editor-heading-${option.index}`;
  const prefix = `tx-${option.index}-`;
  const product = resolvePharmacistProductUse(option.treatment);
  const primary = medicationPrimaryName(option.treatment);
  const secondary = medicationSecondaryName(option.treatment);
  const canChangeProduct = supportsInlinePrescriptionEditor(option);

  useEffect(() => {
    const hydrated = hydrateInlineDraft(option.treatment);
    const suggested = formatSuggestedDispenseQuantity(hydrated.lines, hydrated.quantityUnit);
    lastAutoQtyRef.current =
      suggested && suggested === hydrated.quantityValue.trim() ? suggested : null;
    lastAutoUnitRef.current =
      hydrated.quantityUnit.trim() || hydrated.lines[0]?.form?.trim() || null;
    const next = withAutoPrescriptionSupply(hydrated, {
      lastAutoQty: lastAutoQtyRef,
      lastAutoUnit: lastAutoUnitRef,
    });
    const generated =
      next.directionsMode === 'AUTO' ? generateInlineDirections(next) : '';
    const baseline =
      generated && generated !== next.patientDirections
        ? { ...next, patientDirections: generated }
        : next;
    setSaved(baseline);
    setDraft(baseline);
    setRegimenSource(option.treatment.regimenSource ?? 'STANDARD');
    standardSnapshotRef.current = null;
    autoLockRef.current = regimenFingerprint(baseline);
    setTouched(false);
    setErrors({});
  }, [
    option.treatment.treatmentInstanceId,
    option.treatment.pathwayTreatmentId,
    option.treatment.productForm,
    option.treatment.brandName,
    option.treatment.drugId,
    option.index,
  ]);

  const suggestedQty = formatSuggestedDispenseQuantity(draft.lines, draft.quantityUnit);
  const supply = useCourseSupply(draft.lines, draft.quantityValue, draft.quantityUnit);
  const dirty = touched && (isInlineDraftDirty(draft, saved) || supply.showReset);
  const fieldErrors = touched ? validateInlineDraft(draft) : {};
  const prescriptionValid = Object.keys(validateInlineDraft(draft)).length === 0;
  const { action } = resolveAdministrationAction({
    productForm: draft.productForm,
    route: draft.route,
    medicationHaystack: [
      option.treatment.medicationName,
      option.treatment.genericName,
      option.treatment.brandName,
    ]
      .filter(Boolean)
      .join(' '),
  });
  const mappingReviewRecommended =
    !draftString(draft.productForm).trim() ||
    !draftString(draft.route).trim() ||
    action === 'REVIEW_REQUIRED';
  const routeOptions =
    draft.allowedRoutes.length > 0
      ? draft.allowedRoutes
      : routeSelectOptions(draft.route).map((option) => option.value);
  const qtyStatus = quantityStatus(draft, suggestedQty, dirty || supply.showReset);
  const fromPathway = Boolean(
    option.treatment.patientDirections?.trim() && !option.treatment.pharmacistModified,
  );
  const dirSource = directionsSource(draft.directionsMode, fromPathway, regimenSource);
  const limitsSummary = buildLimitsSummary(option.treatment);
  const pathwayReason = 'Pathway-preferred option';
  const reviewItems = safetyReviewItemsForOption(
    option,
    patientPregnant,
    patientHasAllergies,
  );
  const renalView = buildRenalSafetyView({
    renalAdjustmentRequired: option.treatment.renalAdjustmentRequired,
    renalAdjustmentReason: option.treatment.renalAdjustmentReason,
    renalDosingBasis: option.treatment.renalDosingBasis,
    renalDosingRules: option.treatment.renalDosingRules,
    renalWarningActive: option.treatment.renalWarning?.active,
    renalWarningMessage: option.treatment.renalWarning?.message,
    regimenSource,
    standardRegimenSummary:
      option.regimen.status === 'READY'
        ? option.regimen.presentation.expandedText
        : option.regimenSummary,
    productStrength: option.treatment.strength,
    productLabel: primary,
    labsText,
    extractedLabs,
    guidelineReference: option.treatment.guidelineReference,
  });
  const otherAlerts = reviewItems.filter((item) => item.safetyDomain !== 'renal');
  const renalAlertCount = (() => {
    if (!renalView.matched) return 0;
    switch (renalView.state) {
      case 'ADJUSTMENT_RECOMMENDED':
      case 'PRODUCT_REQUIRED':
      case 'RENAL_VALUE_REQUIRED':
      case 'NO_STRUCTURED_RULE':
        return 1;
      default:
        return 0;
    }
  })();
  const safetyAlertCount = renalAlertCount + otherAlerts.length;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (draft.directionsMode !== 'AUTO') return;
    const fingerprint = regimenFingerprint(draft);
    if (fingerprint === autoLockRef.current) return;
    const generated = generateInlineDirections(draft);
    autoLockRef.current = fingerprint;
    if (generated && generated !== draft.patientDirections) {
      setDraft((prev) => ({ ...prev, patientDirections: generated }));
    }
  }, [draft.directionsMode, draft.lines, draft.route, draft.patientDirections]);

  const lockedFingerprint = autoLockRef.current;
  const showRegenerate =
    draft.directionsMode === 'MANUAL' && regimenFingerprint(draft) !== lockedFingerprint;

  const patch = (
    next: Partial<InlinePrescriptionDraft>,
    opts?: { quantityManual?: boolean },
  ) => {
    setDraft((prev) => {
      const merged = applyInlineDraftPatch(prev, next);
      const affectsSupply =
        next.lines !== undefined ||
        next.quantityValue !== undefined ||
        next.quantityUnit !== undefined ||
        next.route !== undefined ||
        next.productForm !== undefined;
      if (opts?.quantityManual || !affectsSupply) {
        return merged;
      }
      if (next.quantityUnit !== undefined && next.lines === undefined) {
        return withAutoDispenseQuantity(merged, lastAutoQtyRef);
      }
      return withAutoPrescriptionSupply(merged, {
        lastAutoQty: lastAutoQtyRef,
        lastAutoUnit: lastAutoUnitRef,
      });
    });
    setTouched(true);
    if (regimenSource === 'RENAL_ADJUSTED') {
      setRegimenSource('PHARMACIST_MODIFIED');
    }
  };

  const handleSave = async () => {
    const nextErrors = validateInlineDraft(draft);
    setErrors(nextErrors);
    setTouched(true);
    if (Object.keys(nextErrors).length) return;
    const updated = applyInlineDraft(option.treatment, {
      ...draft,
      patientDirections:
        draft.directionsMode === 'AUTO'
          ? generateInlineDirections(draft)
          : draft.patientDirections,
    });
    if (supply.sequential) {
      const displayed = formatDurationDisplay(
        supply.displayedDuration.value,
        supply.displayedDuration.unit,
      );
      if (displayed) updated.duration = displayed;
    }
    updated.regimenSource = regimenSource;
    if (renalView.patient) {
      updated.renalBasisUsed = renalView.patient.basis;
      updated.renalValueUsed = renalView.patient.value;
    }
    try {
      const persisted = await onSave(updated);
      const hydrated = hydrateInlineDraft(persisted ?? updated);
      const suggested = formatSuggestedDispenseQuantity(hydrated.lines, hydrated.quantityUnit);
      lastAutoQtyRef.current =
        suggested && suggested === hydrated.quantityValue.trim() ? suggested : null;
      lastAutoUnitRef.current =
        hydrated.quantityUnit.trim() || hydrated.lines[0]?.form?.trim() || null;
      setSaved(hydrated);
      setDraft(hydrated);
      autoLockRef.current = regimenFingerprint(hydrated);
      setErrors({});
    } catch {
      // Parent surfaces saveError.
    }
  };

  const handleCancel = () => {
    setDraft(saved);
    setErrors({});
    setTouched(false);
    setRegimenSource(option.treatment.regimenSource ?? 'STANDARD');
    onCancel();
  };

  const handleProductSelect = (drug: DrugSearchResult) => {
    const next = applyMedicationProductChange(option.treatment, drug);
    void onSave(next);
    setProductOpen(false);
  };

  const applyRenalAdjustment = () => {
    const nextDraft = applyRenalAdjustmentToDraft(draft, renalView);
    if (!nextDraft) return;
    if (!standardSnapshotRef.current) standardSnapshotRef.current = draft;
    setDraft(
      withAutoPrescriptionSupply(nextDraft, {
        lastAutoQty: lastAutoQtyRef,
        lastAutoUnit: lastAutoUnitRef,
      }),
    );
    setRegimenSource('RENAL_ADJUSTED');
    setTouched(true);
  };

  const handleAdjustedApply = async (drug: DrugSearchResult) => {
    setAdjustedApplyError(null);
    const composed = composeAdjustedRegimenTreatment({
      treatment: option.treatment,
      drug,
      source: {
        renalAdjustmentRequired: option.treatment.renalAdjustmentRequired,
        renalAdjustmentReason: option.treatment.renalAdjustmentReason,
        renalDosingBasis: option.treatment.renalDosingBasis,
        renalDosingRules: option.treatment.renalDosingRules,
        renalWarningActive: option.treatment.renalWarning?.active,
        renalWarningMessage: option.treatment.renalWarning?.message,
        standardRegimenSummary:
          option.regimen.status === 'READY'
            ? option.regimen.presentation.expandedText
            : option.regimenSummary,
        labsText,
        extractedLabs,
      },
    });
    if (!composed.ok) {
      setAdjustedApplyError(composed.error);
      return;
    }
    if (!standardSnapshotRef.current) standardSnapshotRef.current = draft;
    const supplied = withAutoPrescriptionSupply(composed.draft, {
      lastAutoQty: lastAutoQtyRef,
      lastAutoUnit: lastAutoUnitRef,
    });
    const updated = persistAdjustedRegimen(composed.treatment, supplied, composed.view);
    setAdjustedApplying(true);
    try {
      const persisted = await onSave(updated);
      const hydrated = hydrateInlineDraft(persisted ?? updated);
      const suggested = formatSuggestedDispenseQuantity(hydrated.lines, hydrated.quantityUnit);
      lastAutoQtyRef.current =
        suggested && suggested === hydrated.quantityValue.trim() ? suggested : null;
      lastAutoUnitRef.current =
        hydrated.quantityUnit.trim() || hydrated.lines[0]?.form?.trim() || null;
      setSaved(hydrated);
      setDraft(hydrated);
      autoLockRef.current = regimenFingerprint(hydrated);
      setRegimenSource('RENAL_ADJUSTED');
      setTouched(false);
      setErrors({});
      setAdjustedOpen(false);
    } catch {
      setAdjustedApplyError('The product and regimen could not be applied. Try again.');
    } finally {
      setAdjustedApplying(false);
    }
  };

  const restoreStandardRegimen = () => {
    const snapshot = standardSnapshotRef.current ?? saved;
    setDraft(snapshot);
    setRegimenSource('STANDARD');
    setTouched(true);
    standardSnapshotRef.current = null;
  };

  const fieldsetDisabled = Boolean(disabled || saving || adjustedApplying);
  const detailsContent = [
    option.whyRecommended,
    option.eligibility,
    option.monitoringAndFollowUp,
  ]
    .filter(Boolean)
    .join('\n\n') || undefined;

  const quantityExplanation =
    suggestedQty
      ? 'Calculated from dose, timing, and each dosing schedule duration.'
      : undefined;

  const supplyErrors: FieldErrors = { ...fieldErrors };
  if (!supply.sequential) {
    const durationValueError =
      fieldErrors['regimenLines.0.durationValue'] ?? fieldErrors.durationValue;
    const durationUnitError =
      fieldErrors['regimenLines.0.durationUnit'] ?? fieldErrors.durationUnit;
    if (durationValueError) supplyErrors.durationValue = durationValueError;
    if (durationUnitError) supplyErrors.durationUnit = durationUnitError;
  }

  return (
    <TreatmentEditorPanel
      header={
        <SelectedTreatmentHeader
          headingId={resolvedHeadingId}
          primaryName={primary}
          secondaryName={secondary || undefined}
          productForm={draft.productForm || product.productForm}
          route={draft.route || product.route}
          recommendationBadge={
            option.badgeLabel === 'Preferred' ? 'Recommended' : option.badgeLabel
          }
          pathwayReason={pathwayReason}
          selected
          pharmacistModified={Boolean(option.treatment.pharmacistModified)}
          onChangeProduct={canChangeProduct ? () => setProductOpen(true) : undefined}
          detailsContent={detailsContent}
        />
      }
      safety={
        <SafetyReviewSection
          completed={!checkingSafety && !safetyUnavailable}
          rechecking={checkingSafety || (dirty && safetyAlertCount > 0)}
          unavailable={safetyUnavailable}
          alertCount={safetyAlertCount}
          detailsOpen={safetyDetailsOpen}
          onToggleDetails={() => setSafetyDetailsOpen((v) => !v)}
          onRequestOverride={onRequestOverride}
          renal={
            renalView.matched ? (
              <RenalSafetyCard
                view={renalView}
                onApply={applyRenalAdjustment}
                onRestore={restoreStandardRegimen}
                onChangeProduct={canChangeProduct ? () => setAdjustedOpen(true) : undefined}
                changeProductButtonId={`use-adjusted-regimen-${option.index}`}
                applying={adjustedApplying}
              />
            ) : null
          }
          otherAlerts={otherAlerts}
          checksContent={
            onRetrySafety ? (
              <button
                type="button"
                className="font-semibold text-[#3d6b9a] hover:underline"
                onClick={onRetrySafety}
              >
                Recheck safety
              </button>
            ) : (
              'Negative checks remain available on request and are not shown unless they match this patient.'
            )
          }
        />
      }
      footer={
        <TreatmentEditorFooter
          allComplete={prescriptionValid}
          dirty={dirty}
          valid={prescriptionValid}
          saving={saving}
          saveError={saveError}
          saveLabel={saveLabel}
          continueHint={continueHint}
          onCancel={handleCancel}
          onSave={() => void handleSave()}
        />
      }
    >
      <fieldset disabled={fieldsetDisabled} className="disabled:opacity-80">
        <PrescriptionDetailsSection
          headingId={`${prefix}details-heading`}
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
          <RegimenCard
            lines={draft.lines}
            onChange={(lines) => patch({ lines })}
            productForm={draft.productForm}
            route={draft.route}
            medicationHaystack={primary}
            pathwayFrequency={option.treatment.frequency}
            unitOptions={draft.allowedAdministrationUnits}
            limitsSummary={limitsSummary}
            errors={fieldErrors}
            disabled={fieldsetDisabled}
            idPrefix={prefix}
            sourceBadge={
              regimenSource === 'RENAL_ADJUSTED'
                ? 'Renal adjusted'
                : regimenSource === 'PHARMACIST_MODIFIED'
                  ? 'Pharmacist modified'
                  : undefined
            }
          />

          {mappingReviewRecommended ? (
            <ProductReviewBanner message="Product mapping could not be fully verified for this medication. You can still save when all prescription fields are complete. Use Change product if you need to correct the product record." />
          ) : null}

          {!draftString(draft.route).trim() || draft.allowedRoutes.length > 1 ? (
            <RouteSelectField
              id={`${prefix}route`}
              value={draft.route}
              options={routeOptions}
              onChange={(route) => patch({ route })}
            />
          ) : null}

          <PatientDirectionsCard
            id={`${prefix}directions`}
            value={draft.patientDirections}
            source={dirSource}
            error={fieldErrors.patientDirections}
            disabled={fieldsetDisabled}
            showRegenerate={showRegenerate}
            onChange={(patientDirections) => {
              patch({ patientDirections, directionsMode: 'MANUAL' });
              if (draft.directionsMode !== 'MANUAL') {
                autoLockRef.current = regimenFingerprint(draft);
              }
            }}
            onEdit={() => {
              autoLockRef.current = regimenFingerprint(draft);
              patch({ directionsMode: 'MANUAL' });
            }}
            onRegenerate={() => setRegenOpen(true)}
          />

          <PrescriptionSupplyRow
            durationValue={supply.displayedDuration.value || null}
            durationUnit={supply.displayedDuration.unit}
            quantityValue={draft.quantityValue}
            quantityUnit={draft.quantityUnit}
            refills={draft.refills}
            quantityStatus={supply.showReset ? 'PHARMACIST_MODIFIED' : qtyStatus}
            quantityExplanation={quantityExplanation}
            allowedQuantityUnits={draft.allowedQuantityUnits}
            errors={supplyErrors}
            disabled={fieldsetDisabled}
            idPrefix={prefix}
            calculatedFromSchedule={supply.calculatedFromSchedule}
            showResetCalculated={supply.showReset}
            onResetCalculated={() => {
              supply.setDurationOverride(null);
              if (supply.calculatedQty) {
                lastAutoQtyRef.current = supply.calculatedQty;
                patch({ quantityValue: supply.calculatedQty }, { quantityManual: true });
              } else {
                setTouched(true);
              }
            }}
            onChange={(next) => {
              if (next.durationValue !== undefined || next.durationUnit !== undefined) {
                if (supply.sequential) {
                  supply.setDurationOverride({
                    value:
                      next.durationValue !== undefined
                        ? next.durationValue ?? ''
                        : supply.displayedDuration.value,
                    unit:
                      next.durationUnit !== undefined
                        ? next.durationUnit ?? 'DAY'
                        : supply.displayedDuration.unit,
                  });
                  setTouched(true);
                  return;
                }
                const lines = draft.lines.map((line, idx) =>
                  idx === 0
                    ? {
                        ...line,
                        durationValue:
                          next.durationValue !== undefined
                            ? next.durationValue
                            : line.durationValue,
                        durationUnit:
                          next.durationUnit !== undefined
                            ? next.durationUnit
                            : line.durationUnit,
                      }
                    : line,
                );
                patch({ lines });
                return;
              }
              const supplyPatch: Partial<InlinePrescriptionDraft> = {};
              if (next.quantityValue !== undefined) supplyPatch.quantityValue = next.quantityValue;
              if (next.quantityUnit !== undefined) supplyPatch.quantityUnit = next.quantityUnit;
              if (next.refills !== undefined) supplyPatch.refills = next.refills;
              patch(supplyPatch, { quantityManual: next.quantityValue !== undefined });
            }}
          />
        </PrescriptionDetailsSection>
      </fieldset>

      <ChangeProductDialog
        open={productOpen}
        onOpenChange={setProductOpen}
        currentLabel={primary}
        onSelect={handleProductSelect}
      />

      <AdjustedRegimenProductModal
        open={adjustedOpen}
        onOpenChange={(next) => {
          if (adjustedApplying) return;
          setAdjustedOpen(next);
          if (!next) setAdjustedApplyError(null);
        }}
        consultationId={consultationId}
        treatmentKey={optionKey(option)}
        currentRegimenLabel={
          option.treatment.pharmacistModified || regimenSource === 'PHARMACIST_MODIFIED'
            ? 'Current prescribed regimen'
            : 'Current pathway regimen'
        }
        currentProductDisplay={[primary, option.treatment.strength, draft.productForm || product.productForm]
          .filter(Boolean)
          .join(' ')}
        currentRegimenPrimary={
          draft.patientDirections.trim() || option.regimenSummary
        }
        adjustedRegimenPrimary={
          renalView.recommendedRegimenSummary || renalView.apply?.directions || ''
        }
        adjustedSupporting={
          renalView.patient
            ? `Recommended for ${renalView.patient.basis} ${renalView.patient.displayValue} ${renalView.patient.unit}`
            : undefined
        }
        applying={adjustedApplying}
        applyError={adjustedApplyError}
        onApply={handleAdjustedApply}
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

      <ConfirmDialog
        open={regenOpen}
        onOpenChange={setRegenOpen}
        title="Replace patient directions?"
        description="This replaces the current wording with a new draft from the prescription."
        confirmLabel="Regenerate"
        onConfirm={() => {
          const generated = generateInlineDirections(draft);
          patch({ patientDirections: generated, directionsMode: 'AUTO' });
          autoLockRef.current = regimenFingerprint(draft);
          setRegenOpen(false);
        }}
      />
    </TreatmentEditorPanel>
  );
}

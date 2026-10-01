/**
 * Renew Step 3 pharmacist-facing interpretation.
 * Configuration lives here so React never hardcodes clinical copy.
 */

import {
  compareResultToReference,
  resolveMonitoringReference,
  type MonitoringReferenceResolution,
} from './clinical-reference-resolver';
import {
  formatMonitoringDate,
  formatMonitoringResult,
  isContextComplete,
  MONITORING_REVIEW_ACTION_OPTIONS,
  type MonitoringReviewAction,
  type RenewMonitoringItemReview,
  type RenewMonitoringRequirement,
  type RenewPatientContextRequirement,
  type RenewSafetyFindingSummary,
  type RenewMonitoringGate,
} from './renew-monitoring';
import {
  isUnitValidationBlocking,
  unitValidationBadge,
  validateMonitoringResultUnit,
  type ResultValidationStatus,
  type UnitCompatibilityResult,
} from './renew-monitoring-units';
import {
  evaluateRenalMedications,
  isRenalMonitoringCode,
  parseDialysisContext,
  renalCoverageSummary,
  type DialysisStatus,
  type RenalMedicationEvaluation,
} from './renew-renal-coverage';

export type MonitoringInterpretation =
  | 'ACTION_REQUIRED'
  | 'REVIEW_REQUIRED'
  | 'OUTSIDE_TARGET'
  | 'NO_CONCERN'
  | 'NOT_EVALUABLE'
  | 'PENDING';

export type MonitoringReferenceType =
  | 'TARGET'
  | 'REFERENCE_RANGE'
  | 'MEDICATION_SPECIFIC_RULES'
  | 'PERIODIC_MONITORING'
  | 'NONE';

export type MonitoringRowAction = 'review' | 'view' | 'add_result';

export type MonitoringRowTone = 'action' | 'review' | 'ok' | 'unavailable' | 'pending';

export interface MonitoringIndication {
  code: string | null;
  label: string;
}

export interface MonitoringReferenceDisplay {
  type: MonitoringReferenceType;
  label: string;
  subtitle: string | null;
  infoAvailable: boolean;
  resolution?: MonitoringReferenceResolution;
  popover: {
    title: string;
    appliesBecause: string[];
    configuredValue: string | null;
    usedFor: string;
    currentValue: string | null;
    sourceName: string;
    sourceCitation: string | null;
    sourceUrl: string | null;
    repositoryReleaseId: string;
    medicationRules: Array<{ medicationDisplay: string; interpretation: string }>;
  };
}

export interface MonitoringRowPresentation {
  interpretation: MonitoringInterpretation;
  badgeLabel: string;
  detail: string;
  tone: MonitoringRowTone;
  rowHighlight: 'action' | 'review' | null;
  actionKind: MonitoringRowAction;
  resultEmphasis: 'critical' | 'warning' | 'normal';
  resultHint: string | null;
  reviewed: boolean;
  needsReview: boolean;
  allowedActions: MonitoringReviewAction[];
  reference: MonitoringReferenceDisplay;
  review: RenewMonitoringItemReview | null;
  category: string | null;
  exceptionNote: string | null;
  dialysisStatus: DialysisStatus | null;
  renalEvaluations: RenalMedicationEvaluation[];
  /** Unit / analyte validation — separate from clinical interpretation. */
  validationStatus: ResultValidationStatus | null;
  expectedUnit: string | null;
  detectedUnit: string | null;
}

export interface MonitoringSummaryCounts {
  actionRequired: number;
  reviewRequired: number;
  unavailable: number;
  noActionNeeded: number;
  pending: number;
  reviewed: number;
  total: number;
}

export function presentMonitoringRow(
  row: RenewMonitoringRequirement,
  ctx: {
    findings?: RenewSafetyFindingSummary[];
    reviews?: RenewMonitoringItemReview[];
    itemReviews?: RenewMonitoringItemReview[];
    indications?: MonitoringIndication[];
    acknowledgedFindingKeys?: string[];
    patientContext?: RenewPatientContextRequirement[];
    dialysisStatus?: DialysisStatus | null;
  } = {},
): MonitoringRowPresentation {
  const findings = (ctx.findings ?? []).filter((finding) => finding.inputCode === row.inputCode);
  const review =
    (ctx.reviews ?? ctx.itemReviews ?? []).find((item) => item.inputCode === row.inputCode) ?? null;
  const dialysis = parseDialysisContext({
    dialysisStatus: ctx.dialysisStatus,
    patientContext: ctx.patientContext,
    findings: ctx.findings,
  });
  const renalEvaluations = isRenalMonitoringCode(row.inputCode)
    ? evaluateRenalMedications({
        medicationIds: row.medicationIds,
        medicationNames: row.medicationNames,
        dialysis,
        findings,
      })
    : [];
  const extras = {
    category: monitoringItemCategory(row),
    dialysisStatus: dialysis.onDialysis || dialysis.dialysisStatus === 'UNKNOWN' ? dialysis.dialysisStatus : null,
    renalEvaluations,
  };
  const reference = buildReference(row, ctx.indications ?? [], findings, dialysis.onDialysis);
  const value = row.result.value;
  const rawNumeric = value?.numericValue ?? null;
  const rawSecondary = value?.secondaryNumericValue ?? null;
  const unitGate = resolveUnitGate(row, reference, rawNumeric, rawSecondary);
  const numeric = unitGate.canonicalNumeric ?? rawNumeric;
  const secondary = unitGate.canonicalSecondary ?? rawSecondary;

  if (row.result.status === 'UNAVAILABLE') {
    return finish(row, {
      interpretation: 'NOT_EVALUABLE',
      badgeLabel: 'Result unavailable — documented',
      detail: '',
      tone: 'unavailable',
      rowHighlight: null,
      actionKind: 'add_result',
      resultEmphasis: 'normal',
      resultHint: null,
      reviewed: false,
      needsReview: false,
      allowedActions: [],
      reference,
      review: null,
      exceptionNote: null,
      validationStatus: 'NOT_EVALUABLE',
      expectedUnit: unitGate.expectedUnit,
      detectedUnit: unitGate.detectedUnit,
      ...extras,
    });
  }

  if (row.result.status === 'PENDING' || (!value && row.result.status !== 'CONCERNING')) {
    return finish(row, {
      interpretation: 'PENDING',
      badgeLabel: 'Pending',
      detail: 'Enter a result',
      tone: 'pending',
      rowHighlight: null,
      actionKind: 'add_result',
      resultEmphasis: 'normal',
      resultHint: null,
      reviewed: false,
      needsReview: false,
      allowedActions: [],
      reference,
      review: null,
      exceptionNote: null,
      validationStatus: null,
      expectedUnit: unitGate.expectedUnit,
      detectedUnit: null,
      ...extras,
    });
  }

  // Safety rule: never interpret / compare when unit identity is incompatible.
  if (isUnitValidationBlocking(unitGate.status) && unitGate.status !== 'NOT_EVALUABLE') {
    const badge = unitValidationBadge(unitGate.status);
    const detail =
      unitGate.detail ??
      (unitGate.expectedUnit ? `Expected unit: ${unitGate.expectedUnit}` : badge.detail);
    return reviewedStatus(row, review, reference, extras, unitGate, {
      interpretation: 'NOT_EVALUABLE',
      badgeLabel: badge.badgeLabel,
      detail,
      tone: 'review',
      rowHighlight: 'review',
      resultEmphasis: 'warning',
      resultHint: unitGate.expectedUnit ? `Expected unit: ${unitGate.expectedUnit}` : null,
      exceptionNote: null,
      allowedActions: ordinaryActions(),
      validationStatus: unitGate.status,
      expectedUnit: unitGate.expectedUnit,
      detectedUnit: unitGate.detectedUnit,
    });
  }

  const avoid = findings.filter((finding) => isActionSeverity(finding.clinicalSeverity));
  const engineReview = findings.filter((finding) => finding.clinicalSeverity === 'REVIEW_REQUIRED');

  if (avoid.length) {
    const meds = findingMedicationNames(avoid, row.medicationNames);
    return reviewedStatus(row, review, reference, extras, unitGate, {
      interpretation: 'ACTION_REQUIRED',
      badgeLabel: 'Action required',
      detail: meds[0] ?? avoid[0]?.summary ?? 'Safety rule triggered',
      tone: 'action',
      rowHighlight: 'action',
      resultEmphasis: 'critical',
      resultHint: null,
      exceptionNote: null,
      allowedActions: hardStopActions(),
    });
  }

  if (dialysis.onDialysis && isRenalMonitoringCode(row.inputCode)) {
    const coverage = renalCoverageSummary(renalEvaluations);
    if (coverage.needsReview) {
      return reviewedStatus(row, review, reference, extras, unitGate, {
        interpretation: 'REVIEW_REQUIRED',
        badgeLabel: 'Renal review required',
        detail: 'Patient is dialysis-dependent. Review medications for dialysis-specific dosing.',
        tone: 'review',
        rowHighlight: 'review',
        resultEmphasis: 'warning',
        resultHint: null,
        exceptionNote: 'Patient is dialysis-dependent. Review medications for dialysis-specific dosing.',
        allowedActions: ordinaryActions(),
      });
    }
    return finish(row, {
      interpretation: 'NO_CONCERN',
      badgeLabel: review
        ? 'Renal review completed'
        : coverage.anyCoveredPass
          ? 'Renal regimen reviewed'
          : 'Dialysis context documented',
      detail: review
        ? 'Dialysis dosing/context reviewed'
        : 'No medication-specific renal rule requiring action identified',
      tone: 'ok',
      rowHighlight: null,
      actionKind: 'view',
      resultEmphasis: 'normal',
      resultHint: null,
      reviewed: Boolean(review),
      needsReview: false,
      allowedActions: [],
      reference,
      review,
      exceptionNote: null,
      validationStatus: 'VALID',
      expectedUnit: unitGate.expectedUnit,
      detectedUnit: unitGate.detectedUnit,
      ...extras,
    });
  }

  const local =
    dialysis.onDialysis && isRenalMonitoringCode(row.inputCode)
      ? null
      : interpretAgainstReference(row, numeric, secondary, reference, unitGate);

  if (local && local.interpretation !== 'NO_CONCERN') {
    return reviewedStatus(row, review, reference, extras, unitGate, {
      ...local,
      allowedActions: ordinaryActions(),
    });
  }

  if (engineReview.length) {
    return reviewedStatus(row, review, reference, extras, unitGate, {
      interpretation: 'REVIEW_REQUIRED',
      badgeLabel: 'Review required',
      detail: engineReview[0]?.summary ?? 'Pharmacist review required',
      tone: 'review',
      rowHighlight: 'review',
      resultEmphasis: 'warning',
      resultHint: row.inputCode === 'BP' ? 'Systolic / Diastolic' : null,
      exceptionNote: null,
      allowedActions: ordinaryActions(),
    });
  }

  return finish(row, {
    interpretation: 'NO_CONCERN',
    badgeLabel: noConcernBadge(row),
    detail: isRenalMonitoringCode(row.inputCode) ? '' : 'No action needed',
    tone: 'ok',
    rowHighlight: null,
    actionKind: 'view',
    resultEmphasis: 'normal',
    resultHint: row.inputCode === 'BP' ? 'Systolic / Diastolic' : null,
    reviewed: false,
    needsReview: false,
    allowedActions: [],
    reference,
    review: null,
    exceptionNote: null,
    validationStatus: unitGate.status === 'VALID' ? 'VALID' : unitGate.status,
    expectedUnit: unitGate.expectedUnit,
    detectedUnit: unitGate.detectedUnit,
    ...extras,
  });
}

export function presentMonitoringRows(
  rows: RenewMonitoringRequirement[],
  ctx: Parameters<typeof presentMonitoringRow>[1] = {},
): Array<RenewMonitoringRequirement & { presentation: MonitoringRowPresentation }> {
  return rows.map((row) => ({ ...row, presentation: presentMonitoringRow(row, ctx) }));
}

export function isMonitoringRowComplete(
  _row: unknown,
  presentation: MonitoringRowPresentation,
): boolean {
  return presentation.interpretation !== 'PENDING' && !presentation.needsReview;
}

export function monitoringAccordionCounts(
  rows: Array<RenewMonitoringRequirement & { presentation: MonitoringRowPresentation }>,
  removedCount = 0,
): {
  reviewed: number;
  remaining: number;
  needsReview: number;
  unavailable: number;
  removed: number;
  total: number;
  label: string;
} {
  const summary = monitoringSummaryCounts(rows);
  const needsReview = rows.filter((row) => row.presentation.needsReview).length;
  const remaining = summary.pending;
  const parts: string[] = [];
  if (summary.reviewed === 0 && needsReview === 0 && remaining === 0 && removedCount === 0 && summary.unavailable === 0) {
    return {
      reviewed: 0,
      remaining: summary.total,
      needsReview: 0,
      unavailable: 0,
      removed: removedCount,
      total: summary.total + removedCount,
      label: `${summary.total} item${summary.total === 1 ? '' : 's'} to review`,
    };
  }
  parts.push(`${summary.reviewed} reviewed`);
  if (needsReview > 0) parts.push(`${needsReview} needs review`);
  else if (remaining > 0) parts.push(`${remaining} remaining`);
  if (summary.unavailable > 0) parts.push(`${summary.unavailable} unavailable`);
  if (removedCount > 0) parts.push(`${removedCount} removed`);
  return {
    reviewed: summary.reviewed,
    remaining,
    needsReview,
    unavailable: summary.unavailable,
    removed: removedCount,
    total: summary.total + removedCount,
    label: parts.join(' · '),
  };
}

export function monitoringCollapsedSummary(
  rows: Array<RenewMonitoringRequirement & { presentation: MonitoringRowPresentation }>,
  removedCount = 0,
): string {
  const counts = monitoringSummaryCounts(rows);
  const reviewed = `${rows.length} item${rows.length === 1 ? '' : 's'} reviewed`;
  const findings = counts.actionRequired + counts.reviewRequired;
  const parts = [reviewed];
  if (findings) parts.push(`${findings} finding${findings === 1 ? '' : 's'} documented`);
  else parts.push('No findings requiring action');
  if (counts.unavailable) parts.push(`${counts.unavailable} unavailable`);
  if (removedCount) parts.push(`${removedCount} removed`);
  return parts.join(' · ');
}

export function monitoringSummaryCounts(
  rows: Array<{ presentation: MonitoringRowPresentation }>,
): MonitoringSummaryCounts {
  const counts: MonitoringSummaryCounts = {
    actionRequired: 0,
    reviewRequired: 0,
    unavailable: 0,
    noActionNeeded: 0,
    pending: 0,
    reviewed: 0,
    total: 0,
  };
  for (const row of rows) {
    const { interpretation, needsReview, tone, validationStatus } = row.presentation;
    if (interpretation === 'ACTION_REQUIRED') counts.actionRequired += 1;
    else if (
      interpretation === 'REVIEW_REQUIRED' ||
      interpretation === 'OUTSIDE_TARGET' ||
      (interpretation === 'NOT_EVALUABLE' && needsReview && tone === 'review') ||
      (needsReview && validationStatus && isUnitValidationBlocking(validationStatus) && validationStatus !== 'NOT_EVALUABLE')
    ) {
      counts.reviewRequired += 1;
    } else if (interpretation === 'NOT_EVALUABLE') counts.unavailable += 1;
    else if (interpretation === 'PENDING') counts.pending += 1;
    else counts.noActionNeeded += 1;
    if (isMonitoringRowComplete(row, row.presentation)) counts.reviewed += 1;
    counts.total += 1;
  }
  return counts;
}

export function evaluatePresentedMonitoringGate(args: {
  monitoring: RenewMonitoringRequirement[];
  context: RenewPatientContextRequirement[];
  findings: RenewSafetyFindingSummary[];
  acknowledgedFindingKeys: string[];
  itemReviews?: RenewMonitoringItemReview[];
  indications?: MonitoringIndication[];
}): RenewMonitoringGate {
  const presented = presentMonitoringRows(args.monitoring, args);
  const pendingMonitoringCodes = presented
    .filter((row) => row.presentation.interpretation === 'PENDING')
    .map((row) => row.inputCode);
  const pendingContextCodes = [
    ...new Set(
      args.context.filter((row) => row.visible && !isContextAnswered(row)).map((row) => row.inputCode),
    ),
  ];
  const blockingReviewCodes = presented
    .filter((row) => row.presentation.needsReview)
    .map((row) => row.inputCode);

  return {
    ok: pendingMonitoringCodes.length === 0 && pendingContextCodes.length === 0 && blockingReviewCodes.length === 0,
    pendingMonitoringCodes,
    pendingContextCodes,
    unacknowledgedFindingCount: blockingReviewCodes.length,
    blockingReviewCodes,
  };
}

export function reviewActionLabel(action: MonitoringReviewAction | null | undefined): string {
  return MONITORING_REVIEW_ACTION_OPTIONS.find((row) => row.id === action)?.summaryLabel ?? 'Reviewed';
}

export function reviewFindingNarrative(
  row: Pick<RenewMonitoringRequirement, 'inputCode' | 'label'>,
  presentation: Pick<
    MonitoringRowPresentation,
    'interpretation' | 'detail' | 'reference' | 'validationStatus' | 'expectedUnit' | 'detectedUnit'
  >,
): string {
  if (
    presentation.validationStatus &&
    isUnitValidationBlocking(presentation.validationStatus) &&
    presentation.validationStatus !== 'NOT_EVALUABLE'
  ) {
    const expected = presentation.expectedUnit;
    const detected = presentation.detectedUnit;
    if (presentation.validationStatus === 'MISSING_UNIT') {
      return expected
        ? `${row.label} cannot be interpreted until a unit is provided (expected ${expected}).`
        : `${row.label} cannot be interpreted until a unit is provided.`;
    }
    if (detected && expected) {
      return `${row.label} result could not be interpreted because the available result/unit (${detected}) was incompatible with the configured ${expected} reference.`;
    }
    return `${row.label} result could not be interpreted because the available result/unit was incompatible with the configured reference.`;
  }
  const conditions = presentation.reference.popover.appliesBecause;
  if (row.inputCode === 'BP' && conditions.length) {
    const names = conditions.map((value, index) =>
      index === 0 ? value.charAt(0).toLowerCase() + value.slice(1) : value,
    );
    const joined = names.length === 2 ? `${names[0]} with ${names[1]}` : names.join(', ');
    return `BP is above the configured treatment target for ${joined}.`;
  }
  if (presentation.reference.type === 'REFERENCE_RANGE' && presentation.reference.popover.configuredValue) {
    return `${row.label} is outside the configured reference range of ${presentation.reference.popover.configuredValue}.`;
  }
  if (presentation.interpretation === 'ACTION_REQUIRED') {
    return presentation.detail
      ? `Configured safety rule triggered for ${presentation.detail}.`
      : 'Configured renal safety rule triggered.';
  }
  return presentation.detail;
}

export function validateMonitoringReview(args: {
  action: MonitoringReviewAction | '';
  note: string;
  otherText?: string;
  affectedMedicationIds?: string[];
  medicationCount: number;
  rationaleRequired?: boolean;
}): string | null {
  if (!args.action) return 'Select the action you will take.';
  if (args.action === 'OTHER' && !(args.otherText?.trim() || args.note.trim())) {
    return 'Specify the other action.';
  }
  if (args.action === 'DO_NOT_RENEW_MEDICATION' && args.medicationCount > 1 && !args.affectedMedicationIds?.length) {
    return 'Select which medication should not be renewed.';
  }
  if (args.rationaleRequired && !args.note.trim()) return 'Add a pharmacist note.';
  return null;
}

export function sourceDisplayLabel(
  sourceType: string | null | undefined,
  sourceLabel: string | null | undefined,
): string {
  if (sourceLabel?.trim()) return sourceLabel.trim();
  if (sourceType === 'PASTED_SCREENSHOT') return 'Pasted screenshot';
  if (sourceType === 'UPLOADED_DOCUMENT') return 'Uploaded document';
  if (sourceType === 'MANUAL') return 'Pharmacist entered';
  return 'Not identified';
}

export type MonitoringViewInterpretation =
  | 'WITHIN_RANGE'
  | 'WITHIN_TARGET'
  | 'NO_MEDICATION_SPECIFIC_CONCERN'
  | 'INFORMATIONAL';

export interface MonitoringViewField {
  key: string;
  label: string;
  value: string;
}

export interface MonitoringViewDetails {
  inputCode: string;
  title: string;
  interpretationLabel: string;
  interpretationType: MonitoringViewInterpretation;
  fields: MonitoringViewField[];
  clinicalSummary: string;
  canEdit: boolean;
}

export function viewInterpretationLabel(presentation: MonitoringRowPresentation): string {
  if (presentation.dialysisStatus && isRenalMonitoringCodeFromPresentation(presentation)) {
    return presentation.badgeLabel.replace(' — reviewed', '');
  }
  if (presentation.reference.type === 'MEDICATION_SPECIFIC_RULES') {
    return 'No unresolved renal dosing issue identified';
  }
  if (presentation.reference.type === 'TARGET') return 'Within target';
  if (presentation.reference.type === 'REFERENCE_RANGE') return 'Within normal limits';
  return presentation.badgeLabel.replace(' — reviewed', '') || 'Result reviewed';
}

export function viewPanelSummary(presentation: MonitoringRowPresentation): string {
  if (presentation.exceptionNote) return presentation.exceptionNote;
  if (presentation.dialysisStatus) {
    return 'Dialysis is clinical context. Medication-specific renal/dialysis rules were evaluated where published.';
  }
  if (presentation.reference.type === 'MEDICATION_SPECIFIC_RULES') {
    return 'No unresolved renal dosing issue was identified from published medication-specific rules.';
  }
  if (presentation.reference.type === 'TARGET') {
    return 'Current result is within the configured treatment target.';
  }
  return 'No action needed based on the current value.';
}

export function buildMonitoringViewDetails(
  row: RenewMonitoringRequirement,
  presentation: MonitoringRowPresentation,
): MonitoringViewDetails {
  const interpretationType: MonitoringViewInterpretation =
    presentation.reference.type === 'MEDICATION_SPECIFIC_RULES'
      ? 'NO_MEDICATION_SPECIFIC_CONCERN'
      : presentation.reference.type === 'TARGET'
        ? 'WITHIN_TARGET'
        : presentation.reference.type === 'REFERENCE_RANGE'
          ? 'WITHIN_RANGE'
          : 'INFORMATIONAL';

  const fields: MonitoringViewField[] = [
    { key: 'value', label: 'Current value', value: formatMonitoringResult(row.result, row.unit) },
    {
      key: 'date',
      label: 'Date collected',
      value: row.result.observedDate ? formatMonitoringDate(row.result.observedDate) : 'Not identified',
    },
    {
      key: 'reference',
      label: viewReferenceFieldLabel(presentation.reference.type),
      value: viewReferenceFieldValue(presentation),
    },
    {
      key: 'source',
      label: 'Source',
      value: sourceDisplayLabel(row.result.sourceType, row.result.sourceLabel),
    },
  ];
  if (row.medicationNames.length) {
    fields.push({ key: 'applies', label: 'Applies to', value: row.medicationNames.join(' · ') });
  }

  return {
    inputCode: row.inputCode,
    title: `${row.label} details`,
    interpretationLabel: viewInterpretationLabel(presentation),
    interpretationType,
    fields,
    clinicalSummary: viewPanelSummary(presentation),
    canEdit: row.result.status === 'AVAILABLE' || row.result.status === 'CONCERNING',
  };
}

function viewReferenceFieldLabel(type: MonitoringReferenceType): string {
  if (type === 'TARGET') return 'Treatment target';
  if (type === 'REFERENCE_RANGE') return 'Reference range';
  return 'Reference';
}

function viewReferenceFieldValue(presentation: MonitoringRowPresentation): string {
  const configured = presentation.reference.popover.configuredValue;
  if (presentation.reference.type === 'TARGET') {
    return configured ?? presentation.reference.label.replace(/^Target:\s*/, '');
  }
  if (presentation.reference.type === 'REFERENCE_RANGE') {
    return configured ?? presentation.reference.label.replace(/^Reference:\s*/, '');
  }
  return presentation.reference.label.replace(/^(Target|Reference):\s*/, '');
}

function finish(
  _row: RenewMonitoringRequirement,
  presentation: MonitoringRowPresentation,
): MonitoringRowPresentation {
  return presentation;
}

function reviewedStatus(
  row: RenewMonitoringRequirement,
  review: RenewMonitoringItemReview | null,
  reference: MonitoringReferenceDisplay,
  extras: Pick<MonitoringRowPresentation, 'category' | 'dialysisStatus' | 'renalEvaluations'>,
  unitGate: UnitCompatibilityResult,
  base: Omit<
    MonitoringRowPresentation,
    | 'reviewed'
    | 'needsReview'
    | 'actionKind'
    | 'reference'
    | 'review'
    | 'category'
    | 'exceptionNote'
    | 'dialysisStatus'
    | 'renalEvaluations'
    | 'validationStatus'
    | 'expectedUnit'
    | 'detectedUnit'
  > & {
    exceptionNote?: string | null;
    validationStatus?: ResultValidationStatus | null;
    expectedUnit?: string | null;
    detectedUnit?: string | null;
  },
): MonitoringRowPresentation {
  const reviewed = Boolean(review);
  return {
    ...base,
    ...extras,
    exceptionNote: reviewed ? null : base.exceptionNote ?? null,
    badgeLabel: reviewed ? `${base.badgeLabel} — reviewed` : base.badgeLabel,
    detail: reviewed ? reviewActionLabel(review!.action) : base.detail,
    rowHighlight: reviewed ? null : base.rowHighlight,
    actionKind: reviewed ? 'view' : 'review',
    reviewed,
    needsReview: !reviewed,
    reference,
    review,
    validationStatus: base.validationStatus ?? (unitGate.compatible ? 'VALID' : unitGate.status),
    expectedUnit: base.expectedUnit ?? unitGate.expectedUnit,
    detectedUnit: base.detectedUnit ?? unitGate.detectedUnit,
  };
}

function resolveUnitGate(
  row: RenewMonitoringRequirement,
  reference: MonitoringReferenceDisplay,
  numeric: number | null,
  secondary: number | null,
): UnitCompatibilityResult {
  return validateMonitoringResultUnit({
    inputCode: row.inputCode,
    resultUnit: row.result.value?.unit ?? null,
    expectedUnit: reference.resolution?.unit ?? row.unit,
    numericValue: numeric,
    secondaryNumericValue: secondary,
  });
}

function interpretAgainstReference(
  row: RenewMonitoringRequirement,
  numeric: number | null,
  secondary: number | null,
  reference: MonitoringReferenceDisplay,
  unitGate: UnitCompatibilityResult,
): Omit<
  MonitoringRowPresentation,
  | 'reviewed'
  | 'needsReview'
  | 'actionKind'
  | 'reference'
  | 'review'
  | 'allowedActions'
  | 'category'
  | 'exceptionNote'
  | 'dialysisStatus'
  | 'renalEvaluations'
  | 'validationStatus'
  | 'expectedUnit'
  | 'detectedUnit'
> | null {
  const resolved = reference.resolution;
  if (!resolved || numeric == null) return null;
  // Hard gate: never numeric-compare incompatible units.
  if (!unitGate.compatible) return null;
  if (
    resolved.unit &&
    unitGate.canonicalUnit &&
    !unitsRoughlyEqual(resolved.unit, unitGate.canonicalUnit)
  ) {
    return null;
  }
  const comparison = compareResultToReference(numeric, secondary, resolved);
  if (!comparison) return null;
  const bpHint = row.inputCode === 'BP' ? 'Systolic / Diastolic' : null;
  if (comparison === 'within') {
    return {
      interpretation: 'NO_CONCERN',
      badgeLabel: resolved.mode === 'TREATMENT_TARGET' ? 'Within target' : 'Within range',
      detail: 'No action needed',
      tone: 'ok',
      rowHighlight: null,
      resultEmphasis: 'normal',
      resultHint: bpHint,
    };
  }
  return {
    interpretation: 'OUTSIDE_TARGET',
    badgeLabel:
      comparison === 'above'
        ? resolved.mode === 'TREATMENT_TARGET'
          ? 'Above target'
          : 'Outside range'
        : resolved.mode === 'TREATMENT_TARGET'
          ? 'Below target'
          : 'Outside range',
    detail: 'Review required',
    tone: 'review',
    rowHighlight: 'review',
    resultEmphasis: 'warning',
    resultHint: bpHint,
  };
}

function unitsRoughlyEqual(a: string, b: string): boolean {
  const left = a.trim().replace(/\u00b5|\u03bc/g, 'µ').toLowerCase();
  const right = b.trim().replace(/\u00b5|\u03bc/g, 'µ').toLowerCase();
  return left === right || left.replace(/µ/g, 'u') === right.replace(/µ/g, 'u');
}

function buildReference(
  row: RenewMonitoringRequirement,
  indications: MonitoringIndication[],
  findings: RenewSafetyFindingSummary[],
  onDialysis = false,
): MonitoringReferenceDisplay {
  const currentValue =
    row.result.status === 'UNAVAILABLE' || row.result.status === 'PENDING'
      ? null
      : formatMonitoringResult(row.result, row.unit);
  const resolved = resolveMonitoringReference({
    inputCode: row.inputCode,
    indications,
    medicationNames: row.medicationNames,
    findings,
  });
  const type: MonitoringReferenceType =
    resolved.mode === 'TREATMENT_TARGET'
      ? 'TARGET'
      : resolved.mode === 'MEDICATION_SPECIFIC'
        ? 'MEDICATION_SPECIFIC_RULES'
        : resolved.mode === 'CONTEXT_SPECIFIC'
          ? 'PERIODIC_MONITORING'
          : resolved.mode === 'NO_STATIC_REFERENCE'
            ? 'NONE'
            : 'REFERENCE_RANGE';
  const rawLabel =
    onDialysis && isRenalMonitoringCode(row.inputCode)
      ? 'Dialysis-specific medication review'
      : resolved.mode === 'TREATMENT_TARGET'
        ? resolved.displayText.toLowerCase().startsWith('target')
          ? resolved.displayText.replace(/^Target:\s*/i, 'Target ')
          : `Target ${resolved.displayText}`
        : resolved.mode === 'MEDICATION_SPECIFIC'
          ? resolved.displayText
          : resolved.mode === 'NO_STATIC_REFERENCE'
            ? ''
            : `Reference ${resolved.displayText}`;
  const hidden =
    !rawLabel ||
    /no configured target|monitoring profile not configured|clinical monitoring/i.test(rawLabel);
  const label = hidden ? '' : rawLabel;
  const appliesBecause =
    resolved.mode === 'TREATMENT_TARGET' && resolved.subtitle
      ? resolved.subtitle.split(' + ')
      : [];

  return {
    type: hidden && type === 'NONE' ? 'NONE' : type,
    label,
    subtitle:
      resolved.mode === 'TREATMENT_TARGET'
        ? appliesBecause.join(' + ') || resolved.subtitle
        : onDialysis && isRenalMonitoringCode(row.inputCode)
          ? 'Medication-specific renal/dialysis safety assessment'
          : resolved.sourceName,
    infoAvailable: !hidden || resolved.mode === 'MEDICATION_SPECIFIC' || resolved.mode === 'TREATMENT_TARGET',
    resolution: resolved,
    popover: {
      title: resolved.mode === 'TREATMENT_TARGET' ? 'Why this target is shown' : 'Reference details',
      appliesBecause: row.inputCode === 'PSA' ? row.medicationNames : appliesBecause,
      configuredValue: resolved.displayText,
      usedFor: resolved.usedFor,
      currentValue,
      sourceName: resolved.sourceName,
      sourceCitation: resolved.sourceNotes,
      sourceUrl: resolved.sourceUrl,
      repositoryReleaseId: resolved.referenceReleaseId,
      medicationRules:
        row.inputCode === 'EGFR'
          ? row.medicationNames.map((name) => ({
              medicationDisplay: name,
              interpretation: renalRuleInterpretation(name, findings),
            }))
          : [],
    },
  };
}

export function bloodPressureTarget(indications: MonitoringIndication[]): {
  systolic: number;
  diastolic: number;
  appliesBecause: string[];
} | null {
  const resolved = resolveMonitoringReference({ inputCode: 'BP', indications });
  const fromSlash =
    typeof resolved.targetValue === 'string' && resolved.targetValue.includes('/')
      ? resolved.targetValue.split('/').map(Number)
      : null;
  if (fromSlash && fromSlash.length === 2 && fromSlash.every(Number.isFinite)) {
    return {
      systolic: fromSlash[0]!,
      diastolic: fromSlash[1]!,
      appliesBecause: resolved.subtitle ? resolved.subtitle.split(' + ') : [],
    };
  }
  if (resolved.operator && typeof resolved.targetValue === 'number') {
    return {
      systolic: resolved.targetValue,
      diastolic: 80,
      appliesBecause: resolved.subtitle ? resolved.subtitle.split(' + ') : [],
    };
  }
  return null;
}

function isActionSeverity(severity: string): boolean {
  return severity === 'AVOID' || severity === 'CRITICAL' || severity === 'HIGH';
}

function findingMedicationNames(
  findings: RenewSafetyFindingSummary[],
  medicationNames: string[],
): string[] {
  const blob = findings.map((finding) => `${finding.summary} ${finding.detail}`).join(' ').toLowerCase();
  return medicationNames.filter((name) => blob.includes(name.toLowerCase().split(' ')[0]!));
}

function renalRuleInterpretation(name: string, findings: RenewSafetyFindingSummary[]): string {
  const related = findings.filter((finding) =>
    `${finding.summary} ${finding.detail}`.toLowerCase().includes(name.toLowerCase().split(' ')[0]!),
  );
  if (related.some((finding) => isActionSeverity(finding.clinicalSeverity))) {
    return 'Action-required renal rule triggered';
  }
  if (related.some((finding) => finding.clinicalSeverity === 'REVIEW_REQUIRED')) {
    return 'Renal function safety rules evaluated — review required';
  }
  if (related.length) {
    return 'Published renal/dialysis rule matched';
  }
  return 'No published dialysis-specific renal rule available';
}

function noConcernBadge(row: RenewMonitoringRequirement): string {
  if (isRenalMonitoringCode(row.inputCode)) return 'No unresolved renal dosing issue identified';
  if (row.inputCode === 'BP') return 'Within target';
  return 'Within range';
}

function monitoringItemCategory(row: Pick<RenewMonitoringRequirement, 'inputCode' | 'inputType'>): string | null {
  const code = row.inputCode.trim().toUpperCase();
  if (code === 'BP' || code === 'HR' || code === 'HEART_RATE') return 'Cardiovascular';
  if (isRenalMonitoringCode(code) || code === 'POTASSIUM' || code === 'SODIUM' || code === 'MAGNESIUM') {
    return code === 'POTASSIUM' || code === 'SODIUM' || code === 'MAGNESIUM' ? 'Electrolytes' : 'Renal';
  }
  if (code === 'ALT' || code === 'AST' || code === 'ALP' || code === 'GGT' || code === 'BILIRUBIN') return 'Hepatic';
  if (code === 'A1C' || code === 'HBA1C' || code === 'GLUCOSE' || code === 'TSH') return 'Endocrine';
  if (code === 'PSA') return 'Urologic';
  if (row.inputType === 'VITAL') return 'Vitals';
  if (row.inputType === 'LAB') return 'Laboratory';
  return null;
}

function isRenalMonitoringCodeFromPresentation(
  presentation: Pick<MonitoringRowPresentation, 'dialysisStatus'>,
): boolean {
  return Boolean(presentation.dialysisStatus);
}

function ordinaryActions(): MonitoringReviewAction[] {
  return [
    'CONTINUE_AND_MONITOR',
    'SHORTER_RENEWAL',
    'FOLLOW_UP_WITH_PRESCRIBER',
    'DO_NOT_RENEW_MEDICATION',
    'OTHER',
  ];
}

function hardStopActions(): MonitoringReviewAction[] {
  return ['DO_NOT_RENEW_MEDICATION', 'CONTACT_PRESCRIBER', 'REFER', 'ADJUST_PLAN', 'OTHER'];
}

function isContextAnswered(row: RenewPatientContextRequirement): boolean {
  return isContextComplete(row);
}

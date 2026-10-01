/**
 * Governed Reference Values Master — resolver for Renew Accordion 2.
 * Numbers and source copy come from CLINICAL_REFERENCE_MASTER, never from UI constants.
 */

import { CLINICAL_REFERENCE_MASTER } from './clinical-reference-master.data';
import type { RenewMonitoringRequirement, RenewSafetyFindingSummary } from './renew-monitoring';

export type ReferenceIndication = { code: string | null; label: string };

export const CLINICAL_REFERENCE_RELEASE_ID = CLINICAL_REFERENCE_MASTER.releaseId;

const INPUT_ALIASES: Record<string, string> = {
  HR: 'HEART_RATE',
  CREATININE: 'SERUM_CREATININE',
  B12: 'VITAMIN_B12',
  VIT_B12: 'VITAMIN_B12',
  LIPID_PROFILE: 'LDL_C',
};

export type ReferenceResolutionMode =
  | 'LAB_RESULT_REFERENCE'
  | 'PROVINCIAL_LAB_REFERENCE'
  | 'PEDIATRIC_REFERENCE'
  | 'PUBLISHED_ADULT_REFERENCE'
  | 'TREATMENT_TARGET'
  | 'MEDICATION_SPECIFIC'
  | 'CONTEXT_SPECIFIC'
  | 'NO_STATIC_REFERENCE';

export interface MonitoringReferenceResolution {
  inputCode: string;
  canonicalCode: string;
  mode: ReferenceResolutionMode;
  displayText: string;
  subtitle: string | null;
  sourceCode: string | null;
  sourceName: string;
  sourceUrl: string | null;
  sourceNotes: string | null;
  referenceId: string | null;
  targetId: string | null;
  lowerBound: number | null;
  upperBound: number | null;
  operator: string | null;
  targetValue: number | string | null;
  unit: string | null;
  notes: string | null;
  usedFor: string;
  referenceReleaseId: string;
}

type MasterRef = (typeof CLINICAL_REFERENCE_MASTER.references)[number];
type MasterTarget = (typeof CLINICAL_REFERENCE_MASTER.targets)[number];
type MasterSource = (typeof CLINICAL_REFERENCE_MASTER.sources)[number];

export function canonicalMonitoringInputCode(inputCode: string): string {
  const upper = inputCode.trim().toUpperCase();
  return INPUT_ALIASES[upper] ?? upper;
}

export function lookupReferenceSource(sourceCode: string | null | undefined): MasterSource | null {
  if (!sourceCode) return null;
  return CLINICAL_REFERENCE_MASTER.sources.find((row) => row.sourceCode === sourceCode) ?? null;
}

function classification(code: string): MasterRef | null {
  const canonical = canonicalMonitoringInputCode(code);
  return (
    CLINICAL_REFERENCE_MASTER.references.find(
      (row) => row.inputCode === canonical && row.uiUse === 'CLASSIFICATION',
    ) ??
    CLINICAL_REFERENCE_MASTER.references.find((row) => row.inputCode === canonical) ??
    null
  );
}

function fallbackRows(code: string): MasterRef[] {
  const canonical = canonicalMonitoringInputCode(code);
  return CLINICAL_REFERENCE_MASTER.references.filter(
    (row) =>
      row.inputCode === canonical &&
      row.strategy === 'STATIC_REFERENCE' &&
      row.displayText,
  );
}

function pickFallback(code: string, sex?: string | null): MasterRef | null {
  const rows = fallbackRows(code);
  if (!rows.length) return null;
  const sexKey = (sex ?? '').toUpperCase();
  const matched = rows.find((row) => row.sex === sexKey);
  if (matched) return matched;
  return rows.find((row) => row.sex === 'ALL') ?? rows[0] ?? null;
}

function isHypertension(item: ReferenceIndication): boolean {
  const blob = `${item.code ?? ''} ${item.label}`.toLowerCase();
  return blob.includes('hypertens') || blob.includes('htn') || blob.includes('high blood pressure');
}

function isDiabetes(item: ReferenceIndication): boolean {
  const blob = `${item.code ?? ''} ${item.label}`.toLowerCase();
  return blob.includes('diabetes') || blob.includes('t2dm') || blob.includes('t1dm') || blob.includes('t1d');
}

function isGout(item: ReferenceIndication): boolean {
  const blob = `${item.code ?? ''} ${item.label}`.toLowerCase();
  return blob.includes('gout') || blob.includes('hyperuric');
}

function sourcePayload(sourceCode: string | null, fallbackName: string): Pick<
  MonitoringReferenceResolution,
  'sourceCode' | 'sourceName' | 'sourceUrl' | 'sourceNotes'
> {
  const source = lookupReferenceSource(sourceCode);
  return {
    sourceCode: sourceCode,
    sourceName: source?.sourceName ?? fallbackName,
    sourceUrl: source?.sourceUrl ?? null,
    sourceNotes: source?.notes ?? source?.useCase ?? null,
  };
}

function fromFallback(
  inputCode: string,
  row: MasterRef,
  mode: ReferenceResolutionMode = 'PUBLISHED_ADULT_REFERENCE',
): MonitoringReferenceResolution {
  return {
    inputCode,
    canonicalCode: canonicalMonitoringInputCode(inputCode),
    mode,
    displayText: row.displayText ?? 'Clinical monitoring',
    subtitle: row.kind === 'GENERAL_REFERENCE' ? row.label : null,
    ...sourcePayload(row.sourceCode, 'Published adult fallback'),
    referenceId: row.referenceId,
    targetId: null,
    lowerBound: row.lowerNumeric,
    upperBound: row.upperNumeric,
    operator: null,
    targetValue: null,
    unit: row.unit,
    notes: row.notes,
    usedFor:
      row.sourceCode === 'MCC_ADULT'
        ? 'Published adult fallback when a result-specific or provincial interval is not available'
        : 'General result interpretation',
    referenceReleaseId: CLINICAL_REFERENCE_MASTER.releaseId,
  };
}

function fromTarget(
  inputCode: string,
  target: MasterTarget,
  subtitle: string | null,
): MonitoringReferenceResolution {
  const compact =
    target.operator && target.targetValue != null
      ? `${target.operator}${String(target.targetValue)} ${target.unit ?? ''}`.trim()
      : target.displayText;
  return {
    inputCode,
    canonicalCode: canonicalMonitoringInputCode(inputCode),
    mode: 'TREATMENT_TARGET',
    displayText: compact || target.displayText,
    subtitle: subtitle ?? target.displayText,
    ...sourcePayload(target.sourceCode, 'Canadian guideline'),
    referenceId: null,
    targetId: target.targetId,
    lowerBound: null,
    upperBound: typeof target.targetValue === 'number' ? target.targetValue : null,
    operator: target.operator,
    targetValue: target.targetValue,
    unit: target.unit,
    notes: target.notes,
    usedFor: 'Treatment-target review',
    referenceReleaseId: CLINICAL_REFERENCE_MASTER.releaseId,
  };
}

function clinicalMonitoring(
  inputCode: string,
  displayText: string,
  extras: Partial<MonitoringReferenceResolution> = {},
): MonitoringReferenceResolution {
  return {
    inputCode,
    canonicalCode: canonicalMonitoringInputCode(inputCode),
    mode: extras.mode ?? 'NO_STATIC_REFERENCE',
    displayText,
    subtitle: extras.subtitle ?? null,
    sourceCode: extras.sourceCode ?? 'NONE',
    sourceName: extras.sourceName ?? 'Clinical monitoring',
    sourceUrl: extras.sourceUrl ?? null,
    sourceNotes: extras.sourceNotes ?? null,
    referenceId: extras.referenceId ?? null,
    targetId: extras.targetId ?? null,
    lowerBound: extras.lowerBound ?? null,
    upperBound: extras.upperBound ?? null,
    operator: extras.operator ?? null,
    targetValue: extras.targetValue ?? null,
    unit: extras.unit ?? null,
    notes: extras.notes ?? null,
    usedFor: extras.usedFor ?? 'Clinical monitoring',
    referenceReleaseId: CLINICAL_REFERENCE_MASTER.releaseId,
  };
}

export function resolveMonitoringReference(args: {
  inputCode: string;
  indications?: ReferenceIndication[];
  sex?: string | null;
  pediatric?: boolean;
  labReferenceDisplay?: string | null;
  labLower?: number | null;
  labUpper?: number | null;
  findings?: RenewSafetyFindingSummary[];
  medicationNames?: string[];
}): MonitoringReferenceResolution {
  const inputCode = args.inputCode;
  const canonical = canonicalMonitoringInputCode(inputCode);
  const classRow = classification(inputCode);
  const strategy = classRow?.strategy ?? 'LAB_SOURCE_OR_GENERAL';
  const indications = args.indications ?? [];
  const hypertension = indications.find(isHypertension);
  const diabetes = indications.find(isDiabetes);
  const gout = indications.find(isGout);

  if (strategy === 'NONE') {
    return clinicalMonitoring(inputCode, 'Clinical monitoring', {
      referenceId: classRow?.referenceId,
      notes: classRow?.notes,
    });
  }

  if (strategy === 'SAFETY_ENGINE') {
    const safety = lookupReferenceSource('SAFETY_ENGINE');
    const renal = canonical === 'EGFR' || canonical === 'CRCL';
    return clinicalMonitoring(inputCode, renal ? 'Medication-specific renal thresholds' : 'Medication-specific thresholds', {
      mode: 'MEDICATION_SPECIFIC',
      subtitle: args.medicationNames?.length
        ? `Evaluated for ${args.medicationNames.length} medication${args.medicationNames.length === 1 ? '' : 's'}`
        : null,
      sourceCode: 'SAFETY_ENGINE',
      sourceName: safety?.sourceName ?? 'SafeScribe Clinical Safety Repository',
      notes: classRow?.notes,
      usedFor: 'Medication-specific safety review',
      referenceId: classRow?.referenceId,
    });
  }

  if (canonical === 'BP' || strategy === 'GUIDELINE_TARGET') {
    if (canonical === 'BP') {
      const diabetesTarget = CLINICAL_REFERENCE_MASTER.targets.find(
        (row) => row.inputCode === 'BP' && row.clinicalContext === 'HYPERTENSION_WITH_DIABETES',
      );
      const generalTarget = CLINICAL_REFERENCE_MASTER.targets.find(
        (row) => row.inputCode === 'BP' && row.clinicalContext === 'HYPERTENSION_GENERAL_2025',
      );
      if (hypertension && diabetes && diabetesTarget) {
        return fromTarget(inputCode, diabetesTarget, [hypertension.label, diabetes.label].join(' + '));
      }
      if (diabetes && diabetesTarget) {
        return fromTarget(inputCode, diabetesTarget, diabetes.label);
      }
      if (generalTarget) {
        return fromTarget(
          inputCode,
          generalTarget,
          hypertension?.label ?? 'Antihypertensive therapy',
        );
      }
    }
    if (canonical === 'A1C') {
      const target = CLINICAL_REFERENCE_MASTER.targets.find(
        (row) => row.inputCode === 'A1C' && row.clinicalContext === 'MOST_ADULTS_T1D_T2D',
      );
      if (target) {
        return fromTarget(inputCode, target, diabetes ? diabetes.label : 'Most adults with diabetes');
      }
    }
  }

  if (strategy === 'GUIDELINE_TARGET_IF_GOUT' && gout) {
    const target = CLINICAL_REFERENCE_MASTER.targets.find(
      (row) => row.inputCode === canonical && row.clinicalContext === 'GOUT_NO_TOPHI_EROSION',
    );
    if (target) return fromTarget(inputCode, target, gout.label);
  }

  if (strategy === 'GUIDELINE_TARGET_IF_APPLICABLE') {
    const target = CLINICAL_REFERENCE_MASTER.targets.find((row) => row.inputCode === canonical);
    if (target && (hypertension || diabetes || indications.some((item) => /lipid|dyslipid|ascvd|statin/i.test(`${item.code} ${item.label}`)))) {
      return fromTarget(inputCode, target, target.displayText);
    }
  }

  if (args.labReferenceDisplay || args.labLower != null || args.labUpper != null) {
    const display =
      args.labReferenceDisplay ||
      (args.labLower != null && args.labUpper != null
        ? `${args.labLower}–${args.labUpper}`
        : args.labUpper != null
          ? `≤${args.labUpper}`
          : `≥${args.labLower}`);
    return clinicalMonitoring(inputCode, display, {
      mode: 'LAB_RESULT_REFERENCE',
      subtitle: 'Patient laboratory interval',
      ...sourcePayload('LAB_RESULT', 'Patient laboratory report'),
      lowerBound: args.labLower ?? null,
      upperBound: args.labUpper ?? null,
      usedFor: 'General result interpretation',
    });
  }

  if (args.pediatric) {
    const policy = CLINICAL_REFERENCE_MASTER.pediatric.find((row) => row.inputCode === canonical);
    return clinicalMonitoring(inputCode, 'Pediatric reference required', {
      mode: 'PEDIATRIC_REFERENCE',
      subtitle: policy?.implementationNote ?? 'Do not use adult fallback values',
      sourceCode: policy?.preferredSource ?? 'CALIPER_PED',
      sourceName: lookupReferenceSource(policy?.preferredSource)?.sourceName ?? 'Pediatric reference',
      sourceUrl: policy?.sourceUrl,
      notes: policy?.implementationNote,
      usedFor: 'Pediatric reference resolution',
    });
  }

  if (canonical === 'INR') {
    return clinicalMonitoring(inputCode, 'Medication-specific therapeutic target', {
      mode: 'MEDICATION_SPECIFIC',
      subtitle: 'Do not use the non-anticoagulated range as a treatment target',
      ...sourcePayload('SAFETY_ENGINE', 'SafeScribe Clinical Safety Repository'),
      usedFor: 'Therapeutic monitoring',
      referenceId: classRow?.referenceId,
      notes: classRow?.notes,
    });
  }

  const fallback = pickFallback(canonical, args.sex);
  if (fallback && strategy !== 'NONE') {
    return fromFallback(inputCode, fallback);
  }

  if (strategy === 'CONTEXTUAL') {
    return clinicalMonitoring(inputCode, 'Treatment monitoring', {
      mode: 'CONTEXT_SPECIFIC',
      notes: classRow?.notes,
      referenceId: classRow?.referenceId,
    });
  }

  return clinicalMonitoring(inputCode, 'Clinical monitoring', {
    notes: classRow?.notes,
    referenceId: classRow?.referenceId,
  });
}

export function compareResultToReference(
  numeric: number | null,
  secondary: number | null,
  reference: MonitoringReferenceResolution,
): 'within' | 'above' | 'below' | 'outside' | null {
  if (numeric == null) return null;
  if (reference.mode === 'TREATMENT_TARGET' && reference.operator && reference.targetValue != null) {
    const target = reference.targetValue;
    if (typeof target === 'string' && target.includes('/')) {
      const [sys, dia] = target.split('/').map(Number);
      if (!Number.isFinite(sys) || secondary == null) return null;
      if (numeric >= sys || secondary >= dia) return 'above';
      return 'within';
    }
    const bound = typeof target === 'number' ? target : Number(target);
    if (!Number.isFinite(bound)) return null;
    if (reference.operator === '<' || reference.operator === '<=') {
      const ok = reference.operator === '<' ? numeric < bound : numeric <= bound;
      return ok ? 'within' : 'above';
    }
    if (reference.operator === '>' || reference.operator === '>=') {
      const ok = reference.operator === '>' ? numeric > bound : numeric >= bound;
      return ok ? 'within' : 'below';
    }
  }
  if (reference.lowerBound != null && numeric < reference.lowerBound) return 'below';
  if (reference.upperBound != null && numeric > reference.upperBound) return 'above';
  if (reference.lowerBound != null || reference.upperBound != null) return 'within';
  return null;
}

export function referenceStatusLabel(
  comparison: ReturnType<typeof compareResultToReference>,
  reference: MonitoringReferenceResolution,
): { badge: string; tone: 'ok' | 'review' } | null {
  if (!comparison) return null;
  if (comparison === 'within') {
    if (reference.mode === 'TREATMENT_TARGET') return { badge: 'Within target', tone: 'ok' };
    return { badge: 'Within range', tone: 'ok' };
  }
  if (comparison === 'above') {
    return {
      badge: reference.mode === 'TREATMENT_TARGET' ? 'Above target' : 'Outside range',
      tone: 'review',
    };
  }
  if (comparison === 'below') {
    return {
      badge: reference.mode === 'TREATMENT_TARGET' ? 'Below target' : 'Outside range',
      tone: 'review',
    };
  }
  return { badge: 'Outside range', tone: 'review' };
}

export function monitoringCatalogFromReferenceMaster(): Array<{ inputCode: string; label: string }> {
  const seen = new Set<string>();
  const out: Array<{ inputCode: string; label: string }> = [];
  for (const row of CLINICAL_REFERENCE_MASTER.references) {
    if (row.uiUse !== 'CLASSIFICATION') continue;
    if (row.strategy === 'NONE') continue;
    if (seen.has(row.inputCode)) continue;
    seen.add(row.inputCode);
    out.push({ inputCode: row.inputCode, label: row.label });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

export function applyResolvedReferenceToRequirement(
  row: RenewMonitoringRequirement,
  indications: ReferenceIndication[],
  findings: RenewSafetyFindingSummary[] = [],
): MonitoringReferenceResolution {
  return resolveMonitoringReference({
    inputCode: row.inputCode,
    indications,
    findings,
    medicationNames: row.medicationNames,
  });
}

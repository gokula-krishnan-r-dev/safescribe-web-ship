import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type {
  ClinicalSafetyWarning,
  TreatmentSafetyProfile,
} from './drug-label.types';
import {
  isClinicalYes,
  isPatientPregnant,
  resolveTreatmentWarningReason,
  PREGNANCY_TREATMENT_CAUTION_MESSAGE,
  RENAL_TREATMENT_CAUTION_MESSAGE,
  HEPATIC_TREATMENT_CAUTION_MESSAGE,
  MONITORING_TREATMENT_CAUTION_MESSAGE,
  SAFETY_ALERT_LABEL,
} from '@safescript/shared';

export interface PathwayTreatmentSafetyInput {
  medicationName?: string | null;
  genericName?: string | null;
  dose?: string | null;
  route?: string | null;
  frequency?: string | null;
  duration?: string | null;
  warnings?: string[] | null;
  interactions?: string[] | null;
  pregnancyNotes?: string | null;
  pregnancyReason?: string | null;
  renalAdjustment?: string | null;
  renalAdjustmentReason?: string | null;
  hepaticAdjustment?: string | null;
  hepaticAdjustmentReason?: string | null;
  monitoring?: string | null;
  monitoringReason?: string | null;
  counsellingNotes?: string | null;
  drugClass?: string | null;
  ndc?: string | null;
  drugId?: string | null;
}

export interface PatientSafetyContext {
  pregnancyStatus?: string | null;
  allergiesText?: string | null;
  allergyNames?: string[];
  currentMedications?: string[];
  labValuesText?: string | null;
  conditionName?: string | null;
}

export interface AllergyMatchInput {
  patientAllergy: string;
  prescribedDrug: string;
  matchedDrugClass?: string;
  reason?: string;
  risk?: string;
}

export interface BuildTreatmentSafetyInput {
  medicationName: string;
  genericName?: string | null;
  pathway?: PathwayTreatmentSafetyInput | null;
  patient?: PatientSafetyContext | null;
  allergyMatches?: AllergyMatchInput[];
  /** When true, skip heuristic patient alerts — Safety Engine findings are authoritative. */
  safetyEngineOnly?: boolean;
}

function ruleId(parts: string[]): string {
  const raw = parts.join(':').toLowerCase();
  const hash = createHash('sha1').update(raw).digest('hex').slice(0, 10);
  return `cds.${parts[0]}.${hash}`;
}

/**
 * Pathway-scoped treatment safety profile builder.
 * Patient-specific cautions come from the Safety Engine (MedicationSafetyService).
 * This service no longer calls OpenFDA / DailyMed or any third-party label API.
 */
@Injectable()
export class TreatmentSafetyService {
  async buildProfile(input: BuildTreatmentSafetyInput): Promise<TreatmentSafetyProfile> {
    const medicationName = input.medicationName.trim();
    const drugCode = input.pathway?.ndc || input.pathway?.drugId || null;
    const pathwayWarnings = this.mapPathwayWarnings(input.pathway, drugCode);
    const patientAlerts = input.safetyEngineOnly
      ? []
      : this.buildPatientAlerts(input);

    return {
      query: medicationName,
      found: Boolean(input.pathway),
      recommended: {
        medicationName,
        genericName: input.genericName || input.pathway?.genericName || null,
        brandName: null,
        therapeuticClass: input.pathway?.drugClass || null,
        indications: null,
        adultDose: input.pathway?.dose || null,
        pediatricDose: null,
        route: input.pathway?.route || null,
        frequency: input.pathway?.frequency || null,
        duration: input.pathway?.duration || null,
      },
      patientAlerts,
      labelWarnings: pathwayWarnings,
      contraindications: [],
      interactions: (input.pathway?.interactions ?? [])
        .filter((i) => i?.trim())
        .map((i) => ({
          drug: medicationName,
          severity: 'MODERATE' as const,
          clinicalEffect: i.trim(),
          recommendedAction: "Review interaction against the patient's current medicines.",
          source: 'Pathway Guideline',
          ruleId: ruleId(['pathway-ddi', i]),
        })),
      monitoring: isClinicalYes(input.pathway?.monitoring)
        ? [
            {
              test: 'Pathway monitoring',
              reason:
                resolveTreatmentWarningReason(
                  'monitoring',
                  input.pathway?.monitoring,
                  input.pathway?.monitoringReason,
                ) || MONITORING_TREATMENT_CAUTION_MESSAGE,
              frequency: 'Per pathway',
              clinicalRationale: 'Pathway-defined monitoring requirement',
              ruleId: ruleId(['pathway-monitor', medicationName]),
            },
          ]
        : [],
      counselling: input.pathway?.counsellingNotes
        ? [input.pathway.counsellingNotes]
        : [],
      evidence: {
        latestDailyMedVersion: null,
        openFdaLabelVersion: null,
        publicationDate: null,
        lastReviewed: null,
        evidenceLevel: input.pathway ? 'Pathway guideline' : null,
        openFdaUrl: null,
        dailyMedUrl: null,
        setId: null,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private mapPathwayWarnings(
    pathway?: PathwayTreatmentSafetyInput | null,
    drugCode?: string | null,
  ): ClinicalSafetyWarning[] {
    if (!pathway) return [];
    const out: ClinicalSafetyWarning[] = [];

    for (const w of pathway.warnings ?? []) {
      if (!w?.trim()) continue;
      out.push({
        ruleId: ruleId(['pathway-warn', w]),
        severity: /black.?box|absolute|fatal|anaphyla/i.test(w) ? 'CRITICAL' : 'HIGH',
        title: 'Pathway Safety Warning',
        explanation: w.trim(),
        clinicianAction: 'Follow pathway guidance before prescribing.',
        source: 'Pathway Guideline',
        sourceKind: 'PATHWAY',
        clinicalCategory: 'OTHER',
        drugCode,
        evidenceSource: 'Clinical Pathway',
        fullText: w.trim(),
      });
    }

    if (isClinicalYes(pathway.pregnancyNotes)) {
      const explanation =
        resolveTreatmentWarningReason(
          'pregnancy',
          pathway.pregnancyNotes,
          pathway.pregnancyReason,
        ) || PREGNANCY_TREATMENT_CAUTION_MESSAGE;
      out.push({
        ruleId: ruleId(['pathway-preg', 'yes']),
        severity: 'HIGH',
        title: 'Pregnancy / lactation caution (Pathway)',
        explanation,
        clinicianAction: 'Confirm pregnancy status and apply pathway pregnancy guidance.',
        source: 'Pathway Guideline',
        sourceKind: 'PATHWAY',
        clinicalCategory: 'PREGNANCY',
        drugCode,
        evidenceSource: 'Clinical Pathway',
        fullText: explanation,
      });
    }

    if (isClinicalYes(pathway.renalAdjustment)) {
      const explanation =
        resolveTreatmentWarningReason(
          'renal',
          pathway.renalAdjustment,
          pathway.renalAdjustmentReason,
        ) || RENAL_TREATMENT_CAUTION_MESSAGE;
      out.push({
        ruleId: ruleId(['pathway-renal', 'yes']),
        severity: 'HIGH',
        title: 'Renal adjustment required (Pathway)',
        explanation,
        clinicianAction: 'Review renal labs and adjust dose per pathway.',
        source: 'Pathway Guideline',
        sourceKind: 'PATHWAY',
        clinicalCategory: 'RENAL',
        drugCode,
        evidenceSource: 'Clinical Pathway',
        fullText: explanation,
      });
    }

    if (isClinicalYes(pathway.hepaticAdjustment)) {
      const explanation =
        resolveTreatmentWarningReason(
          'hepatic',
          pathway.hepaticAdjustment,
          pathway.hepaticAdjustmentReason,
        ) || HEPATIC_TREATMENT_CAUTION_MESSAGE;
      out.push({
        ruleId: ruleId(['pathway-hepatic', 'yes']),
        severity: 'HIGH',
        title: 'Hepatic adjustment required (Pathway)',
        explanation,
        clinicianAction: 'Review liver function and adjust or avoid as indicated.',
        source: 'Pathway Guideline',
        sourceKind: 'PATHWAY',
        clinicalCategory: 'HEPATIC',
        drugCode,
        evidenceSource: 'Clinical Pathway',
        fullText: explanation,
      });
    }

    if (isClinicalYes(pathway.monitoring)) {
      const explanation =
        resolveTreatmentWarningReason(
          'monitoring',
          pathway.monitoring,
          pathway.monitoringReason,
        ) || MONITORING_TREATMENT_CAUTION_MESSAGE;
      out.push({
        ruleId: ruleId(['pathway-monitor', 'yes']),
        severity: 'MODERATE',
        title: 'Monitoring required (Pathway)',
        explanation,
        clinicianAction: 'Confirm follow-up and counselling points with the patient.',
        source: 'Pathway Guideline',
        sourceKind: 'PATHWAY',
        clinicalCategory: 'OTHER',
        drugCode,
        evidenceSource: 'Clinical Pathway',
        fullText: explanation,
      });
    }

    return out;
  }

  /** Fallback heuristics only when Safety Engine findings are not supplied. */
  private buildPatientAlerts(input: BuildTreatmentSafetyInput): ClinicalSafetyWarning[] {
    const alerts: ClinicalSafetyWarning[] = [];
    const patient = input.patient;
    const med = input.medicationName;
    const drugCode = input.pathway?.ndc || input.pathway?.drugId || null;

    for (const m of input.allergyMatches ?? []) {
      alerts.push({
        ruleId: ruleId(['allergy', m.patientAllergy, m.prescribedDrug]),
        severity: 'CRITICAL',
        title: `Allergy Risk — ${m.patientAllergy}`,
        explanation:
          m.reason ||
          `Patient allergy to ${m.patientAllergy} conflicts with ${m.prescribedDrug}` +
            (m.matchedDrugClass ? ` (${m.matchedDrugClass})` : ''),
        clinicianAction:
          'Do not prescribe this medicine. Choose an alternative outside the allergy class.',
        source: 'SafeScribe CDS',
        sourceKind: 'PATIENT_CDS',
        clinicalCategory: 'ALLERGY',
        drugCode,
        evidenceSource: SAFETY_ALERT_LABEL,
        fullText: m.reason ?? null,
      });
    }

    const isPregnant = isPatientPregnant({
      pregnancyStatus: patient?.pregnancyStatus,
    });
    const pregnancy = (patient?.pregnancyStatus || '').toLowerCase();
    const isBreastfeeding =
      pregnancy.includes('breast') || pregnancy.includes('lactat');

    if (isPregnant || isBreastfeeding) {
      const pathwayPreg = resolveTreatmentWarningReason(
        'pregnancy',
        input.pathway?.pregnancyNotes,
        input.pathway?.pregnancyReason,
      );
      alerts.push({
        ruleId: ruleId(['preg', patient?.pregnancyStatus || '', med]),
        severity: 'CRITICAL',
        title: isBreastfeeding
          ? 'Breastfeeding — review before prescribing'
          : 'Pregnancy — review before prescribing',
        explanation:
          pathwayPreg ||
          `Patient status: ${patient?.pregnancyStatus}. Confirm this medicine is appropriate.`,
        clinicianAction:
          'Verify indication, trimester/risk category, and counsel. Prefer safer alternatives when guideline advises.',
        source: 'SafeScribe CDS',
        sourceKind: 'PATIENT_CDS',
        clinicalCategory: 'PREGNANCY',
        drugCode,
        evidenceSource: `${SAFETY_ALERT_LABEL} / pathway`,
        fullText: pathwayPreg || null,
      });
    }

    return alerts;
  }
}

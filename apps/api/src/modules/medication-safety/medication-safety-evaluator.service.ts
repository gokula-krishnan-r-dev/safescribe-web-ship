import { Injectable } from '@nestjs/common';
import type {
  MedicationSafetyEvaluateRequest,
  MedicationSafetyEvaluateResponse,
  SafetyFinding,
  SafetyPatientAllergy,
  SafetyEvalStatus,
} from '@safescript/shared';
import { SAFETY_EVAL_STATUSES, isValueSetOrSelectorCode } from '@safescript/shared';
import { MedicationSafetyCacheService } from './medication-safety-cache.service';
import {
  FINDING_PRIORITY,
  SAFETY_ENGINE_VERSION,
  type CachedIngredientEntry,
  type CachedSafetyRule,
  type CachedValueSet,
} from './medication-safety.types';
import {
  compareLabValue,
  isLabStale,
  medicationMatchesIngredient,
  mergeLabObservations,
  normalizeObservationKey,
  resolveLabThreshold,
  type LabComparator,
} from './utils/lab-value.util';
import { applyBaselineClinicalRules } from './utils/baseline-clinical-rules';
import { buildDdiIndex, ddiPairKey } from './utils/ddi-index.util';
import {
  extractRenalMeasure,
  formatEgfrBandDetail,
  mapRenalBandToClinical,
  pickMostSevereRenalBand,
  shouldEmitRenalBandFinding,
  egfrInBand,
} from './utils/renal-band.util';
import {
  mapInteractionSeverityToClinical,
  isAvoidNotBlockDdi,
  normalizeTrimester,
  parsePregnancyStatus,
  trimesterMatches,
} from './utils/patient-context.util';
import {
  classConceptMatches,
  resolveExpandedClasses,
  resolveDrugFromCatalog,
  type CachedClassIndex,
} from './utils/class-index.util';
import {
  containsIngredient,
  drugTokensForMed,
  expandDrugTokens,
  isNkda,
  isTopicalProductName,
  medicationMatchesDrug,
  normalizeDrugKey,
  resolveBrandToIngredient,
  significantDrugTokens,
} from './utils/drug-name.util';
import { resolveValueSetMembership } from './utils/value-set-membership.util';
import {
  gestationalIntervalFromRuleCode,
  intervalHasBounds,
  isWithinGestationalInterval,
  parseGestationalAgeWeeks,
  type GestationalInterval,
} from './utils/gestational-interval.util';

interface NormalizedAllergy {
  substance: string;
  ingredients: string[];
  active: boolean;
}

interface NormalizedMedication {
  productName: string;
  genericName?: string;
  ingredients: string[];
  resolved: boolean;
  route?: string;
  status?: string;
  endedAt?: string;
}

@Injectable()
export class MedicationSafetyEvaluatorService {
  constructor(private readonly cache: MedicationSafetyCacheService) {}

  async evaluate(
    request: MedicationSafetyEvaluateRequest,
  ): Promise<Omit<MedicationSafetyEvaluateResponse, 'evaluationId'>> {
    const ready = await this.cache.isReady();
    const meta = await this.cache.getMeta();
    if (!ready || !meta) {
      return {
        status: SAFETY_EVAL_STATUSES.SERVICE_UNAVAILABLE,
        knowledgeRelease: null,
        engineVersion: SAFETY_ENGINE_VERSION,
        findings: [],
        suppressedFindings: [],
        mappingWarnings: ['Safety knowledge release is not available'],
        evaluatedDomains: [],
      };
    }

    const allergies = request.patientContext?.allergies ?? [];
    const medications = request.selectedMedications ?? [];
    if (!medications.length) {
      return {
        status: SAFETY_EVAL_STATUSES.INPUT_INCOMPLETE,
        knowledgeRelease: meta.version,
        engineVersion: SAFETY_ENGINE_VERSION,
        findings: [],
        suppressedFindings: [],
        mappingWarnings: ['No medications selected'],
        evaluatedDomains: [],
      };
    }

    const [rules, ingredientsMap, drugClassesMap, classIndex, valueSets] = await Promise.all([
      this.cache.getRules(),
      this.cache.getIngredientsMap(),
      this.cache.getDrugClassesMap(),
      this.cache.getClassIndex(),
      this.cache.getValueSets(),
    ]);

    const effectiveClassIndex: CachedClassIndex = classIndex ?? {
      drugToDirectClasses: drugClassesMap ?? {},
      taxonomy: {},
      brandAliases: {},
    };
    const valueSetIndex = valueSets ?? [];

    const mappingWarnings: string[] = [];
    const normalizedAllergies = allergies
      .filter((a) => a.substance && !isNkda(a.substance))
      .map((a) => this.normalizeAllergy(a));

    const normalizedMeds = medications.map((m) =>
      this.normalizeMedication(m, ingredientsMap ?? {}, mappingWarnings, effectiveClassIndex),
    );

    const concurrentMeds = (request.patientContext?.currentMedications ?? [])
      .map((m) =>
        this.normalizeMedication(m, ingredientsMap ?? {}, mappingWarnings, effectiveClassIndex),
      )
      .filter((m) => !this.isHistoricalMedication(m));

    const allMeds = this.mergeMedicationLists(normalizedMeds, concurrentMeds);

    const candidateFindings: SafetyFinding[] = [];

    // Stage A: Direct ingredient matching (engine behaviour)
    for (const allergy of normalizedAllergies) {
      if (!allergy.active) continue;
      for (const med of normalizedMeds) {
        const intersection = allergy.ingredients.filter((ai) =>
          med.ingredients.some((mi) => mi === ai || containsIngredient(mi, ai)),
        );
        if (!intersection.length) continue;

        // Product is a direct allergen match when the name/generic itself is the allergen
        // (e.g. "Docosanol 10% cream" vs allergy "Docosanol"). Only treat as combination
        // when another distinct active ingredient is present.
        const isDirectNamed = allergy.ingredients.some(
          (ai) =>
            containsIngredient(med.productName, ai) ||
            containsIngredient(med.productName, allergy.substance) ||
            (med.genericName
              ? containsIngredient(med.genericName, ai) ||
                containsIngredient(med.genericName, allergy.substance)
              : false),
        );
        const otherActives = med.ingredients.filter(
          (mi) =>
            !allergy.ingredients.some(
              (ai) => mi === ai || containsIngredient(mi, ai) || containsIngredient(ai, mi),
            ),
        );
        const isCombo = !isDirectNamed && otherActives.length > 0;

        candidateFindings.push({
          findingType: 'allergy',
          matchType: isCombo
            ? 'combination_product_contains_exact_ingredient'
            : 'exact_ingredient',
          summary: `Recorded ${allergy.substance} allergy`,
          detail: isCombo
            ? `The selected ${med.productName} product contains ${intersection[0]}.`
            : `Patient has a recorded allergy to ${allergy.substance}.`,
          clinicalSeverity: isCombo ? 'CRITICAL' : 'HIGH',
          recommendedAction: isCombo
            ? 'Select an alternative when clinically appropriate'
            : 'Review allergy history before proceeding',
          implicatedProductName: med.productName,
          overrideAllowed: true,
          overrideReasonRequired: true,
        });
      }
    }

    // Stage B/C: Published allergy/cross-reactivity rules from release
    for (const rule of rules ?? []) {
      if (!['ALLERGY_DIRECT', 'CROSS_REACTIVITY'].includes(rule.ruleType)) continue;
      if (request.jurisdiction && rule.jurisdiction !== 'ALL' && rule.jurisdiction !== request.jurisdiction) {
        continue;
      }
      for (const allergy of normalizedAllergies) {
        if (!allergy.active) continue;
        for (const med of normalizedMeds) {
          const match = this.matchPublishedRule(
            rule,
            allergy,
            med,
            effectiveClassIndex,
          );
          if (match) {
            candidateFindings.push({
              ...match,
              implicatedProductName: med.productName,
            });
          }
        }
      }
    }

    // Stage D: Lab threshold rules (renal / lab-gated prescribing)
    const patientLabs = mergeLabObservations(
      (request.patientContext?.labs ?? []).map((l) => ({
        name: l.name,
        value: l.value,
        unit: l.unit,
        observedAt: l.observedAt,
      })),
      request.patientContext?.labValuesText,
      request.patientContext?.aiLabs,
    );

    const labRules = (rules ?? []).filter(
      (r) => r.ruleType === 'LAB_THRESHOLD' && r.labDetail,
    );
    let labVerificationIncomplete = false;

    // Evaluate selected candidates AND current medications (surveillance, e.g. metformin + eGFR)
    const labTargetMeds = this.mergeMedicationLists(normalizedMeds, concurrentMeds);

    for (const rule of labRules) {
      if (request.jurisdiction && rule.jurisdiction !== 'ALL' && rule.jurisdiction !== request.jurisdiction) {
        continue;
      }
      const detail = rule.labDetail!;
      for (const med of labTargetMeds) {
        if (
          !medicationMatchesIngredient(
            med.ingredients,
            med.productName,
            med.genericName,
            detail.drugIngredient,
          )
        ) {
          continue;
        }

        const candidateKeys = new Set(
          [
            normalizeObservationKey(detail.observationKey),
            detail.observationDisplay
              ? normalizeObservationKey(detail.observationDisplay)
              : '',
            detail.loincCode ? normalizeObservationKey(detail.loincCode) : '',
          ].filter(Boolean),
        );
        const observation = patientLabs.find((l) => candidateKeys.has(l.key));

        if (!observation) {
          if (detail.missingLabAction === 'REQUIRE_REVIEW') {
            labVerificationIncomplete = true;
            mappingWarnings.push(
              `Required lab "${detail.observationDisplay ?? detail.observationKey}" not available for ${med.productName}`,
            );
          }
          continue;
        }

        if (isLabStale(observation.observedAt, detail.maxAgeDays)) {
          labVerificationIncomplete = true;
          mappingWarnings.push(
            `Lab "${observation.display}" may be stale (>${detail.maxAgeDays} days) for ${med.productName}`,
          );
        }

        const resolved = resolveLabThreshold({
          comparator: detail.comparator,
          thresholdLow: detail.thresholdLow,
          thresholdHigh: detail.thresholdHigh,
          observationKey: detail.observationKey,
          observationDisplay: detail.observationDisplay,
          loincCode: detail.loincCode,
        });

        // Excel sometimes stores ABOVE_ULN as BETWEEN with null bounds.
        // Prefer clinical defaults (e.g. potassium ULN 5.0) before abandoning the rule.
        if (!resolved.resolved) {
          labVerificationIncomplete = true;
          mappingWarnings.push(
            `Lab rule ${rule.code} has no evaluable thresholds for ${med.productName}`,
          );
          continue;
        }

        const violated = compareLabValue(
          observation.value,
          resolved.comparator as LabComparator,
          resolved.thresholdLow,
          resolved.thresholdHigh,
        );

        if (violated) {
          candidateFindings.push({
            findingType: 'renal_lab',
            matchType: 'lab_threshold_violation',
            summary: rule.summary,
            detail: rule.detail.replace(/\{lab_value\}/g, String(observation.value)),
            clinicalSeverity: rule.clinicalSeverity,
            recommendedAction: rule.recommendedAction,
            ruleVersionId: rule.versionId,
            ruleCode: rule.code,
            implicatedProductName: med.productName,
            overrideAllowed: rule.overrideAllowed,
            overrideReasonRequired: rule.overrideReasonRequired,
          });
        }
      }
    }

    const potassiumObs = patientLabs.find((l) => l.key === 'potassium');
    const spironolactoneMeds = labTargetMeds.filter((m) =>
      medicationMatchesDrug(m.productName, m.genericName, m.ingredients, 'spironolactone'),
    );
    if (spironolactoneMeds.length) {
      if (!potassiumObs) {
        labVerificationIncomplete = true;
        mappingWarnings.push(
          `Required lab "potassium" not available for ${spironolactoneMeds[0].productName}`,
        );
      } else if (isLabStale(potassiumObs.observedAt, 90)) {
        labVerificationIncomplete = true;
        mappingWarnings.push(
          `Lab "potassium" may be stale (>90 days) for ${spironolactoneMeds[0].productName}`,
        );
      }
    }

    const oralTerbinafine = labTargetMeds.filter(
      (m) =>
        medicationMatchesDrug(m.productName, m.genericName, m.ingredients, 'terbinafine') &&
        !isTopicalProductName(m.productName),
    );
    const altObs = patientLabs.find((l) => l.key === 'alt');
    const astObs = patientLabs.find((l) => l.key === 'ast');
    if (oralTerbinafine.length && altObs == null && astObs == null) {
      labVerificationIncomplete = true;
      mappingWarnings.push(
        `Required lab "ALT" not available for ${oralTerbinafine[0].productName}`,
      );
    }

    // Stage E: Drug–drug interactions
    const ddiRules = (rules ?? []).filter((r) => r.ruleType === 'DRUG_INTERACTION' && r.ddiDetail);
    const ddiIndex = buildDdiIndex(ddiRules);
    const seenDdiPairs = new Set<string>();

    for (const selected of normalizedMeds) {
      const tokens = drugTokensForMed(selected.productName, selected.genericName, selected.ingredients);
      const candidateEntries = new Map<string, (typeof ddiRules)[0]>();
      for (const token of tokens) {
        for (const entry of ddiIndex.get(token) ?? []) {
          candidateEntries.set(entry.rule.versionId, entry.rule);
        }
      }

      for (const rule of candidateEntries.values()) {
        const detail = rule.ddiDetail!;
        const pairKey = ddiPairKey(detail.drugA, detail.drugB);
        if (seenDdiPairs.has(pairKey)) continue;

        const selectedMatchesA = this.medicationMatchesDrugOrValueSet(
          selected,
          valueSetIndex,
          detail.drugA,
          rule.participants.find((p) => p.participantKey === 'drug_a'),
        );
        const selectedMatchesB = this.medicationMatchesDrugOrValueSet(
          selected,
          valueSetIndex,
          detail.drugB,
          rule.participants.find((p) => p.participantKey === 'drug_b'),
        );
        if (!selectedMatchesA && !selectedMatchesB) continue;

        const otherDrug = selectedMatchesA ? detail.drugB : detail.drugA;
        const otherParticipant = selectedMatchesA
          ? rule.participants.find((p) => p.participantKey === 'drug_b')
          : rule.participants.find((p) => p.participantKey === 'drug_a');
        const interactingMed = allMeds.find(
          (m) =>
            !this.isSameMedication(m, selected) &&
            this.medicationMatchesDrugOrValueSet(m, valueSetIndex, otherDrug, otherParticipant),
        );
        if (!interactingMed) continue;

        seenDdiPairs.add(pairKey);
        const severityRaw = mapInteractionSeverityToClinical(
          detail.interactionSeverity,
          detail.actionRequired,
        );
        const severity = isAvoidNotBlockDdi(detail.drugA, detail.drugB)
          ? 'HIGH'
          : severityRaw;
        const matchType =
          detail.interactionSeverity === 'MAJOR'
            ? 'ddi_major'
            : detail.interactionSeverity === 'MODERATE'
              ? 'ddi_moderate'
              : 'ddi_minor';

        candidateFindings.push({
          findingType: 'drug_interaction',
          matchType,
          summary: rule.summary,
          detail: rule.detail,
          clinicalSeverity: severity,
          recommendedAction: rule.recommendedAction,
          ruleVersionId: rule.versionId,
          ruleCode: rule.code,
          relationshipType: `${detail.drugA}+${detail.drugB}`,
          implicatedProductName: selected.productName,
          overrideAllowed: rule.overrideAllowed,
          overrideReasonRequired: rule.overrideReasonRequired,
        });
      }
    }

    // Stage E2: Drug–disease rules
    const patientConditions = (request.patientContext?.conditions ?? []).map((c) =>
      typeof c === 'string' ? c : String((c as { name?: string })?.name ?? c),
    );
    const drugDiseaseRules = (rules ?? []).filter(
      (r) => r.ruleType === 'DRUG_DISEASE' && r.drugDiseaseDetail,
    );

    for (const rule of drugDiseaseRules) {
      if (
        request.jurisdiction &&
        rule.jurisdiction !== 'ALL' &&
        rule.jurisdiction !== request.jurisdiction
      ) {
        continue;
      }
      const detail = rule.drugDiseaseDetail!;
      const conditionLabel =
        detail.conditionDisplayName || detail.conditionConceptCode || '';
      if (!conditionLabel || !patientConditions.length) continue;

      // Do not trigger from empty/unknown status alone — conditions list presence is required
      const conditionMatched = patientConditions.some((pc) =>
        this.conditionMatches(
          pc,
          conditionLabel,
          detail.conditionConceptCode,
          detail.conditionMatchMode,
        ),
      );
      if (!conditionMatched) continue;

      // Severity gates that need structured severity — skip only true SEVERE-only rules
      const sevReq = (detail.conditionSeverityRequirement ?? '').toUpperCase();
      if (
        sevReq &&
        sevReq !== 'ANY' &&
        sevReq !== 'NONE' &&
        sevReq !== 'ACTIVE_DISEASE' &&
        sevReq !== 'ACTIVE' &&
        sevReq.includes('SEVERE')
      ) {
        const patientHasSevere = patientConditions.some((pc) => /\bsevere\b/i.test(pc));
        if (!patientHasSevere) {
          mappingWarnings.push(
            `Drug-disease rule ${rule.code} requires severity "${detail.conditionSeverityRequirement}" which is not provided; skipped`,
          );
          continue;
        }
      }

      for (const med of normalizedMeds) {
        const drugLabel = detail.drugDisplayName || detail.drugSelectorCode;
        const drugMatched = this.medicationMatchesDrugOrValueSet(
          med,
          valueSetIndex,
          drugLabel,
          {
            participantKey: 'drug',
            selectorType: detail.drugSelectorType,
            conceptText: detail.drugDisplayName || detail.drugSelectorCode,
            conceptCode: detail.drugSelectorCode,
            selectorVersion: null,
          },
        );
        if (!drugMatched) continue;

        candidateFindings.push({
          findingType: 'drug_disease',
          matchType: 'drug_disease',
          summary: rule.summary,
          detail: rule.detail,
          clinicalSeverity: rule.clinicalSeverity,
          recommendedAction: rule.recommendedAction,
          ruleVersionId: rule.versionId,
          ruleCode: rule.code,
          relationshipType: `${drugLabel}+${conditionLabel}`,
          implicatedProductName: med.productName,
          overrideAllowed: rule.overrideAllowed,
          overrideReasonRequired: rule.overrideReasonRequired,
        });
      }
    }

    // Stage F: Pregnancy / lactation rules
    const pregnancyRules = (rules ?? []).filter(
      (r) => r.ruleType === 'PREGNANCY' && r.pregnancyDetail,
    );
    const pregnancyCtx = parsePregnancyStatus(
      request.patientContext?.pregnancy?.status ??
        (request.patientContext as { pregnancyStatus?: string })?.pregnancyStatus,
    );
    const breastfeedingCtx = parsePregnancyStatus(
      (request.patientContext as { breastfeeding?: string; breastfeedingStatus?: string })
        ?.breastfeeding ??
        (request.patientContext as { breastfeeding?: string; breastfeedingStatus?: string })
          ?.breastfeedingStatus,
    );
    if (breastfeedingCtx.isBreastfeeding) {
      pregnancyCtx.isBreastfeeding = true;
      pregnancyCtx.statusKnown = true;
    } else if (
      breastfeedingCtx.statusKnown &&
      !breastfeedingCtx.isBreastfeeding &&
      (request.patientContext as { breastfeeding?: string })?.breastfeeding
    ) {
      pregnancyCtx.isBreastfeeding = false;
    }
    const patientGestationalWeeks =
      parseGestationalAgeWeeks(request.patientContext?.pregnancy?.gestationalAgeWeeks) ??
      parseGestationalAgeWeeks(request.patientContext?.pregnancy?.status);
    let patientTrimester =
      normalizeTrimester(request.patientContext?.pregnancy?.trimester) ??
      pregnancyCtx.trimester;
    if (!patientTrimester && patientGestationalWeeks != null) {
      patientTrimester =
        patientGestationalWeeks < 14 ? 'T1' : patientGestationalWeeks < 28 ? 'T2' : 'T3';
    }

    if (pregnancyCtx.isPregnant) {
      for (const rule of pregnancyRules) {
        if (request.jurisdiction && rule.jurisdiction !== 'ALL' && rule.jurisdiction !== request.jurisdiction) {
          continue;
        }
        const detail = rule.pregnancyDetail!;
        const interval = this.pregnancyIntervalFor(rule);
        if (intervalHasBounds(interval)) {
          if (patientGestationalWeeks == null) continue;
          if (!isWithinGestationalInterval(patientGestationalWeeks, interval!)) continue;
        } else if (!trimesterMatches(detail.trimester, patientTrimester)) {
          continue;
        }

        for (const med of normalizedMeds) {
          const drugParticipant = rule.participants.find((p) => p.participantKey === 'drug');
          const membership = this.pregnancyDrugMatch(med, rule, detail, drugParticipant, valueSetIndex);
          if (!membership.matched) continue;

          candidateFindings.push({
            findingType: 'pregnancy',
            matchType:
              detail.pregnancyCategory === 'CONTRAINDICATED'
                ? 'pregnancy_contraindicated'
                : 'pregnancy_caution',
            summary: rule.summary,
            detail: rule.detail,
            clinicalSeverity: rule.clinicalSeverity,
            recommendedAction: rule.recommendedAction,
            ruleVersionId: rule.versionId,
            ruleCode: rule.code,
            implicatedProductName: med.productName,
            subjectMedicationId: med.productName,
            matchedIngredientId: membership.matchedIngredientId,
            ruleDomain: 'PREGNANCY',
            ruleVersion: rule.ruleVersionLabel ?? undefined,
            overrideAllowed: true,
            overrideReasonRequired: rule.overrideReasonRequired,
          });
        }
      }
    } else if (pregnancyRules.length && pregnancyCtx.statusKnown === false) {
      const pregnancyMeds = normalizedMeds.filter((med) =>
        pregnancyRules.some((r) => {
          const drugParticipant = r.participants.find((p) => p.participantKey === 'drug');
          return this.pregnancyDrugMatch(
            med,
            r,
            r.pregnancyDetail!,
            drugParticipant,
            valueSetIndex,
          ).matched;
        }),
      );
      if (pregnancyMeds.length) {
        mappingWarnings.push(
          'Pregnancy status unknown — pregnancy-gated rules could not be fully verified',
        );
      }
    }

    // Stage G: Lactation rules
    const lactationRules = (rules ?? []).filter(
      (r) => r.ruleType === 'LACTATION' && r.lactationDetail,
    );

    if (pregnancyCtx.isBreastfeeding) {
      for (const rule of lactationRules) {
        if (request.jurisdiction && rule.jurisdiction !== 'ALL' && rule.jurisdiction !== request.jurisdiction) {
          continue;
        }
        const detail = rule.lactationDetail!;
        if (detail.bandSeverity === 'SAFE' || detail.actionRequired === 'NONE') continue;

        for (const med of normalizedMeds) {
          if (
            !medicationMatchesDrug(
              med.productName,
              med.genericName,
              med.ingredients,
              detail.drugName,
            )
          ) {
            continue;
          }

          candidateFindings.push({
            findingType: 'lactation',
            matchType:
              detail.lactationRisk === 'HIGH_RISK' ? 'lactation_high_risk' : 'lactation_caution',
            summary: rule.summary,
            detail: rule.detail,
            clinicalSeverity: rule.clinicalSeverity,
            recommendedAction: rule.recommendedAction,
            ruleVersionId: rule.versionId,
            ruleCode: rule.code,
            implicatedProductName: med.productName,
            overrideAllowed: rule.overrideAllowed,
            overrideReasonRequired: rule.overrideReasonRequired,
          });
        }
      }
    } else if (lactationRules.length && pregnancyCtx.statusKnown === false) {
      const lactationMeds = normalizedMeds.filter((med) =>
        lactationRules.some((r) =>
          medicationMatchesDrug(
            med.productName,
            med.genericName,
            med.ingredients,
            r.lactationDetail!.drugName,
          ),
        ),
      );
      if (lactationMeds.length) {
        mappingWarnings.push(
          'Lactation status unknown — lactation-gated rules could not be fully verified',
        );
      }
    }

    // Stage H: Renal eGFR band rules (selected + current meds for surveillance)
    const renalRules = (rules ?? []).filter(
      (r) => r.ruleType === 'RENAL_EGFR_BAND' && r.renalDetail,
    );
    const renalMeasure = extractRenalMeasure(patientLabs);
    const egfrValue = renalMeasure.measure;
    let renalVerificationIncomplete = false;
    const renalTargetMeds = this.mergeMedicationLists(normalizedMeds, concurrentMeds);

    const crclGated = ['valacyclovir'];
    const weightKg =
      (request.patientContext as { weightKg?: number; weight?: number })?.weightKg ??
      (request.patientContext as { weightKg?: number; weight?: number })?.weight ??
      null;
    if (!renalMeasure.usedCrCl) {
      for (const med of renalTargetMeds) {
        const needsCrCl = crclGated.some((d) =>
          medicationMatchesDrug(med.productName, med.genericName, med.ingredients, d),
        );
        if (!needsCrCl) continue;
        if (weightKg == null && renalMeasure.egfr != null && renalMeasure.egfr < 60) {
          renalVerificationIncomplete = true;
          mappingWarnings.push(
            `Verified CrCl or weight is required for renal dosing of ${med.productName}; eGFR ${renalMeasure.egfr} must not be used as CrCl`,
          );
        }
      }
    }

    for (const med of renalTargetMeds) {
      const matchingDrugRules = renalRules.filter((r) =>
        medicationMatchesDrug(
          med.productName,
          med.genericName,
          med.ingredients,
          r.renalDetail!.drugName,
        ),
      );
      if (!matchingDrugRules.length) continue;

      if (egfrValue == null) {
        renalVerificationIncomplete = true;
        mappingWarnings.push(
          `eGFR required for renal dosing assessment of ${med.productName}`,
        );
        continue;
      }

      const matchingBands = matchingDrugRules.filter((r) => {
        const d = r.renalDetail!;
        return egfrInBand(egfrValue, d.egfrMin, d.egfrMax);
      });

      if (!matchingBands.length) {
        renalVerificationIncomplete = true;
        mappingWarnings.push(
          `Patient eGFR ${egfrValue} does not match a published renal band for ${med.productName}`,
        );
        continue;
      }

      const bestRule = pickMostSevereRenalBand(
        matchingBands.map((r) => ({ ...r, bandSeverity: r.renalDetail!.bandSeverity })),
      );
      const detail = bestRule.renalDetail!;
      if (!shouldEmitRenalBandFinding(detail.bandSeverity as 'BLOCK' | 'CAUTION' | 'SAFE', detail.actionRequired)) {
        continue;
      }

      candidateFindings.push({
        findingType: 'renal_band',
        matchType:
          detail.bandSeverity === 'BLOCK' ? 'renal_band_block' : 'renal_band_caution',
        summary: bestRule.summary,
        detail: formatEgfrBandDetail(bestRule.detail, egfrValue, detail.egfrMin, detail.egfrMax),
        clinicalSeverity: mapRenalBandToClinical(detail.bandSeverity as 'BLOCK' | 'CAUTION' | 'SAFE'),
        recommendedAction: bestRule.recommendedAction,
        ruleVersionId: bestRule.versionId,
        ruleCode: bestRule.code,
        implicatedProductName: med.productName,
        overrideAllowed: bestRule.overrideAllowed,
        overrideReasonRequired: bestRule.overrideReasonRequired,
      });
    }

    // Baseline gold-path clinical rules (acyclovir renal, prodrug allergy, PPI+clopidogrel)
    // fill gaps when sample Excel / published release does not yet author the pair.
    candidateFindings.push(
      ...applyBaselineClinicalRules({
        allergies: normalizedAllergies,
        selectedMedications: normalizedMeds,
        concurrentMedications: concurrentMeds,
        egfrValue,
        existingFindings: candidateFindings,
        conditions: patientConditions,
        age: request.patientContext?.age,
        weightKg: weightKg,
        isPregnant: pregnancyCtx.isPregnant,
        trimester: patientTrimester,
        isBreastfeeding: pregnancyCtx.isBreastfeeding,
        altValue: patientLabs.find((l) => l.key === 'alt')?.value ?? null,
        astValue: patientLabs.find((l) => l.key === 'ast')?.value ?? null,
        potassiumValue: patientLabs.find((l) => l.key === 'potassium')?.value ?? null,
      }),
    );

    const annotatedFindings = candidateFindings.map((f) => this.annotateFinding(f));
    const { displayed: displayedFindings, suppressed: suppressedFindings } =
      this.deduplicateFindings(annotatedFindings);

    const hasUnresolved = normalizedMeds.some((m) => !m.resolved);
    const pregnancyVerificationIncomplete =
      ((pregnancyRules.length > 0 &&
        pregnancyCtx.statusKnown === false &&
        normalizedMeds.some((med) =>
          pregnancyRules.some((r) =>
            this.pregnancyDrugMatch(
              med,
              r,
              r.pregnancyDetail!,
              r.participants.find((p) => p.participantKey === 'drug'),
              valueSetIndex,
            ).matched,
          ),
        )) ||
        (pregnancyCtx.statusKnown === false &&
          normalizedMeds.some((med) =>
            [
              'fluconazole',
              'spironolactone',
              'ibuprofen',
              'naproxen',
              'diclofenac',
              'ramipril',
              'lisinopril',
              'enalapril',
            ].some((d) =>
              medicationMatchesDrug(med.productName, med.genericName, med.ingredients, d),
            ),
          )));

    const lactationVerificationIncomplete =
      ((lactationRules.length > 0 &&
        pregnancyCtx.statusKnown === false &&
        normalizedMeds.some((med) =>
          lactationRules.some((r) =>
            medicationMatchesDrug(
              med.productName,
              med.genericName,
              med.ingredients,
              r.lactationDetail!.drugName,
            ),
          ),
        )) ||
        (pregnancyCtx.statusKnown === false &&
          normalizedMeds.some((med) =>
            medicationMatchesDrug(med.productName, med.genericName, med.ingredients, 'codeine'),
          )));

    const pediatricWeightIncomplete =
      request.patientContext?.age != null &&
      request.patientContext.age < 12 &&
      weightKg == null &&
      normalizedMeds.some((med) =>
        medicationMatchesDrug(med.productName, med.genericName, med.ingredients, 'amoxicillin'),
      );
    if (pediatricWeightIncomplete) {
      mappingWarnings.push(
        'Weight required for pediatric amoxicillin dosing; cannot calculate a weight-based dose',
      );
    }

    if (hasUnresolved) {
      mappingWarnings.push('One or more product ingredients could not be fully resolved');
    }

    let status: SafetyEvalStatus = displayedFindings.length
      ? SAFETY_EVAL_STATUSES.COMPLETE_WITH_FINDINGS
      : SAFETY_EVAL_STATUSES.COMPLETE_NO_FINDINGS;

    const verificationIncomplete =
      hasUnresolved ||
      labVerificationIncomplete ||
      pregnancyVerificationIncomplete ||
      lactationVerificationIncomplete ||
      renalVerificationIncomplete ||
      pediatricWeightIncomplete;

    if (verificationIncomplete && !displayedFindings.length) {
      status = SAFETY_EVAL_STATUSES.VERIFICATION_INCOMPLETE;
    } else if (verificationIncomplete && displayedFindings.length) {
      if (labVerificationIncomplete) {
        mappingWarnings.push('Some lab-gated rules could not be fully verified');
      }
      if (pregnancyVerificationIncomplete) {
        mappingWarnings.push(
          'Pregnancy status unknown — confirm before initiating pregnancy-gated medicines',
        );
      }
      if (lactationVerificationIncomplete) {
        mappingWarnings.push('Lactation status should be confirmed for lactation-gated medicines');
      }
      if (renalVerificationIncomplete) {
        mappingWarnings.push('Renal function (eGFR) should be confirmed for renal-gated medicines');
      }
      if (hasUnresolved) {
        mappingWarnings.push('Some findings may be incomplete due to unresolved ingredients');
      }
    }

    const evaluatedDomains = ['allergy', 'cross_reactivity'];
    if (labRules.length) evaluatedDomains.push('renal_lab');
    if (ddiRules.length) evaluatedDomains.push('drug_interaction');
    if (drugDiseaseRules.length) evaluatedDomains.push('drug_disease');
    if (pregnancyRules.length) evaluatedDomains.push('pregnancy');
    if (lactationRules.length) evaluatedDomains.push('lactation');
    if (renalRules.length) evaluatedDomains.push('renal_band');

    return {
      status,
      knowledgeRelease: meta.version,
      engineVersion: SAFETY_ENGINE_VERSION,
      findings: displayedFindings,
      suppressedFindings,
      mappingWarnings,
      evaluatedDomains,
    };
  }

  private annotateFinding(finding: SafetyFinding): SafetyFinding {
    const type = (finding.findingType ?? '').toLowerCase();
    const ruleDomain =
      finding.ruleDomain ??
      (type === 'pregnancy'
        ? 'PREGNANCY'
        : type === 'allergy' || type === 'cross_reactivity'
          ? 'ALLERGY'
          : type === 'lactation'
            ? 'LACTATION'
            : type === 'drug_interaction'
              ? 'DRUG_INTERACTION'
              : type === 'drug_disease'
                ? 'DRUG_DISEASE'
                : type === 'renal_band' || type === 'renal_lab'
                  ? 'RENAL'
                  : type.toUpperCase());
    return {
      ...finding,
      subjectMedicationId: finding.subjectMedicationId ?? finding.implicatedProductName,
      ruleDomain,
      overrideAllowed: finding.overrideAllowed !== false,
    };
  }

  private conditionMatches(
    patientCondition: string,
    ruleLabel: string,
    conceptCode?: string | null,
    matchMode?: string | null,
  ): boolean {
    const strip = (s: string) =>
      normalizeDrugKey(s)
        .replace(/\b(disorder|disease|condition|status)\b/g, ' ')
        .replace(/\b(active|current|chronic|acute|history of|h o)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const a = strip(patientCondition);
    const b = strip(ruleLabel);
    if (!a || !b) return false;
    if (a === b || a.includes(b) || b.includes(a)) return true;

    // Token overlap for multi-word clinical conditions (e.g. peptic ulcer)
    const aTokens = new Set(a.split(' ').filter((t) => t.length >= 4));
    const bTokens = b.split(' ').filter((t) => t.length >= 4);
    if (bTokens.length && bTokens.every((t) => aTokens.has(t))) return true;

    if (conceptCode && normalizeDrugKey(conceptCode) === normalizeDrugKey(patientCondition)) {
      return true;
    }
    if ((matchMode ?? '').toUpperCase().includes('DESCENDANT')) {
      return a.includes(b) || b.includes(a);
    }
    return false;
  }

  /**
   * Value-set membership: exact code + version, INCLUDE then EXCLUDE.
   * Never aliases VS-SS-NSAIDS to VS-SYSTEMIC-NSAIDS or matches by display name.
   */
  private matchesValueSetSelector(
    valueSets: CachedValueSet[],
    selectorCode: string,
    version: string | null,
    med: NormalizedMedication,
  ): boolean {
    if (!selectorCode || !isValueSetOrSelectorCode(selectorCode) || !valueSets.length) {
      return false;
    }
    return resolveValueSetMembership({
      valueSets,
      valueSetCode: selectorCode,
      valueSetVersion: version,
      ingredients: med.ingredients,
      productName: med.productName,
      genericName: med.genericName,
      route: med.route,
    }).matched;
  }

  private medicationMatchesDrugOrValueSet(
    med: NormalizedMedication,
    valueSets: CachedValueSet[],
    displayOrCode: string,
    participant?: CachedSafetyRule['participants'][0],
  ): boolean {
    const selectorCode = (participant?.conceptCode ?? '').trim();
    const selectorType = (participant?.selectorType ?? '').toUpperCase();
    const version = participant?.selectorVersion ?? null;
    const named = (displayOrCode ?? '').trim();

    if (selectorType === 'VALUE_SET' || isValueSetOrSelectorCode(selectorCode)) {
      return this.matchesValueSetSelector(
        valueSets,
        selectorCode || named,
        version,
        med,
      );
    }
    if (isValueSetOrSelectorCode(named)) {
      return this.matchesValueSetSelector(valueSets, named, version, med);
    }
    if (!named) return false;
    return medicationMatchesDrug(
      med.productName,
      med.genericName,
      med.ingredients,
      named,
    );
  }

  private pregnancyIntervalFor(rule: CachedSafetyRule): GestationalInterval | null {
    const detail = rule.pregnancyDetail;
    if (
      detail &&
      (detail.gestationalAgeMinWeeks != null || detail.gestationalAgeMaxWeeks != null)
    ) {
      return {
        minWeeks: detail.gestationalAgeMinWeeks ?? null,
        minInclusive: detail.gestationalAgeMinInclusive ?? true,
        maxWeeks: detail.gestationalAgeMaxWeeks ?? null,
        maxInclusive: detail.gestationalAgeMaxInclusive ?? true,
      };
    }
    return gestationalIntervalFromRuleCode(rule.code);
  }

  private pregnancyDrugMatch(
    med: NormalizedMedication,
    rule: CachedSafetyRule,
    detail: NonNullable<CachedSafetyRule['pregnancyDetail']>,
    drugParticipant: CachedSafetyRule['participants'][0] | undefined,
    valueSets: CachedValueSet[],
  ): { matched: boolean; matchedIngredientId?: string } {
    const selectorType = (drugParticipant?.selectorType ?? '').toUpperCase();
    const selectorCode = (drugParticipant?.conceptCode ?? '').trim();
    const version = drugParticipant?.selectorVersion ?? null;

    if (selectorType === 'VALUE_SET' || isValueSetOrSelectorCode(selectorCode)) {
      const decision = resolveValueSetMembership({
        valueSets,
        valueSetCode: selectorCode,
        valueSetVersion: version,
        ingredients: med.ingredients,
        productName: med.productName,
        genericName: med.genericName,
        route: med.route,
      });
      return { matched: decision.matched, matchedIngredientId: decision.matchedIngredientId };
    }

    const named = (detail.drugName ?? drugParticipant?.conceptText ?? '').trim();
    if (!named || isValueSetOrSelectorCode(named)) {
      return { matched: false };
    }
    const matched = medicationMatchesDrug(
      med.productName,
      med.genericName,
      med.ingredients,
      named,
    );
    return { matched };
  }

  private mergeMedicationLists(
    selected: NormalizedMedication[],
    concurrent: NormalizedMedication[],
  ): NormalizedMedication[] {
    const merged = [...selected];
    for (const med of concurrent) {
      if (!merged.some((m) => this.isSameMedication(m, med))) merged.push(med);
    }
    return merged;
  }

  private isSameMedication(a: NormalizedMedication, b: NormalizedMedication): boolean {
    return (
      normalizeDrugKey(a.productName) === normalizeDrugKey(b.productName) &&
      normalizeDrugKey(a.genericName ?? '') === normalizeDrugKey(b.genericName ?? '')
    );
  }

  private normalizeAllergy(allergy: SafetyPatientAllergy): NormalizedAllergy {
    const active =
      allergy.clinicalStatus !== 'inactive' &&
      allergy.clinicalStatus !== 'refuted' &&
      allergy.verificationStatus !== 'refuted';
    const ingredients = expandDrugTokens(allergy.substance);
    return { substance: allergy.substance, ingredients, active };
  }

  private normalizeMedication(
    med: {
      productName: string;
      genericName?: string;
      route?: string;
      status?: string;
      endedAt?: string;
    },
    ingredientsMap: Record<string, CachedIngredientEntry>,
    warnings: string[],
    classIndex?: CachedClassIndex,
  ): NormalizedMedication {
    const keys = [
      normalizeDrugKey(med.productName),
      ...(med.genericName ? [normalizeDrugKey(med.genericName)] : []),
      resolveBrandToIngredient(med.productName),
      ...(med.genericName ? [resolveBrandToIngredient(med.genericName)] : []),
    ].filter(Boolean);
    let entry: CachedIngredientEntry | undefined;
    const seen = new Set<string>();
    for (const key of keys) {
      if (seen.has(key)) continue;
      seen.add(key);
      if (ingredientsMap[key]) {
        entry = ingredientsMap[key];
        break;
      }
    }

    let ingredients: string[];
    let resolved = true;
    if (entry) {
      ingredients = entry.ingredients.map(normalizeDrugKey);
    } else {
      const tokens = [
        resolveBrandToIngredient(med.productName),
        ...(med.genericName ? [resolveBrandToIngredient(med.genericName)] : []),
        ...significantDrugTokens(med.productName, med.genericName ?? ''),
        ...expandDrugTokens(med.productName, med.genericName ?? ''),
      ];
      ingredients = [];
      const seenIng = new Set<string>();
      for (const t of tokens) {
        const key = normalizeDrugKey(t);
        if (!key || key.length < 4 || seenIng.has(key)) continue;
        seenIng.add(key);
        ingredients.push(key);
      }
      if (classIndex) {
        const catalogDrug = resolveDrugFromCatalog(
          med.productName,
          med.genericName,
          classIndex.brandAliases,
        );
        if (catalogDrug && !ingredients.includes(catalogDrug)) {
          ingredients.push(catalogDrug);
        }
      }
      if (ingredients.length === 0) {
        resolved = false;
        warnings.push(`Could not resolve ingredients for ${med.productName}`);
      }
    }

    return {
      productName: med.productName,
      genericName: med.genericName,
      ingredients,
      resolved,
      route: med.route,
      status: med.status,
      endedAt: med.endedAt,
    };
  }

  private isHistoricalMedication(med: NormalizedMedication): boolean {
    const status = (med.status ?? '').trim().toLowerCase();
    if (
      status === 'discontinued' ||
      status === 'stopped' ||
      status === 'inactive' ||
      status === 'historical' ||
      status === 'ended'
    ) {
      return true;
    }
    if (med.endedAt) return true;
    return /\bdiscontinued\b|\bstopped\b|\bhistorical\b/i.test(med.productName);
  }

  private matchPublishedRule(
    rule: CachedSafetyRule,
    allergy: NormalizedAllergy,
    med: NormalizedMedication,
    classIndex: CachedClassIndex,
  ): SafetyFinding | null {
    const allergen = rule.participants.find((p) => p.participantKey === 'allergen');
    const trigger = rule.participants.find((p) => p.participantKey === 'trigger_substance');

    if (!allergen) return null;

    const allergenMatch = this.participantMatches(
      allergen,
      allergy.ingredients,
      allergy.substance,
      classIndex,
    );
    if (!allergenMatch) return null;

    if (rule.ruleType === 'ALLERGY_DIRECT') {
      if (trigger?.selectorType === 'HAS_INGREDIENT') {
        const allergenIngredient = normalizeDrugKey(allergen.conceptText);
        const hasIngredient = med.ingredients.some(
          (i) => i === allergenIngredient || containsIngredient(i, allergenIngredient),
        );
        if (!hasIngredient) return null;
      } else if (trigger) {
        const triggerMatch = this.participantMatches(
          trigger,
          med.ingredients,
          med.productName,
          classIndex,
        );
        if (!triggerMatch) return null;
      }
    } else if (rule.ruleType === 'CROSS_REACTIVITY') {
      if (!trigger) return null;
      const triggerMatch = this.participantMatches(
        trigger,
        med.ingredients,
        med.productName,
        classIndex,
      );
      if (!triggerMatch) return null;
    } else {
      return null;
    }

    return {
      findingType: rule.ruleType === 'ALLERGY_DIRECT' ? 'allergy' : 'cross_reactivity',
      matchType: rule.matchType ?? undefined,
      summary: rule.summary,
      detail: rule.detail,
      clinicalSeverity: rule.clinicalSeverity,
      recommendedAction: rule.recommendedAction,
      ruleVersionId: rule.versionId,
      ruleCode: rule.code,
      relationshipType: rule.relationshipType ?? undefined,
      overrideAllowed: rule.overrideAllowed,
      overrideReasonRequired: rule.overrideReasonRequired,
    };
  }

  private participantMatches(
    participant: CachedSafetyRule['participants'][0],
    ingredientTokens: string[],
    displayText: string,
    classIndex: CachedClassIndex,
  ): boolean {
    const concept = normalizeDrugKey(participant.conceptText);
    switch (participant.selectorType) {
      case 'EXACT_INGREDIENT':
      case 'STRUCTURAL_RELATIONSHIP':
        return (
          ingredientTokens.some((i) => i === concept || containsIngredient(i, concept)) ||
          normalizeDrugKey(displayText) === concept ||
          containsIngredient(displayText, concept)
        );
      case 'HAS_INGREDIENT':
        return ingredientTokens.some((i) => i === concept || containsIngredient(i, concept));
      case 'MEMBER_OF_CLASS': {
        const entityTokens = [
          ...ingredientTokens,
          normalizeDrugKey(displayText),
          ...expandDrugTokens(displayText),
        ];
        const expandedClasses = resolveExpandedClasses(entityTokens, classIndex);
        return classConceptMatches(participant.conceptText, expandedClasses);
      }
      default:
        return false;
    }
  }

  private deduplicateFindings(findings: SafetyFinding[]): {
    displayed: SafetyFinding[];
    suppressed: SafetyFinding[];
  } {
    const sorted = [...findings].sort((a, b) => {
      const pa = FINDING_PRIORITY[a.matchType ?? ''] ?? 0;
      const pb = FINDING_PRIORITY[b.matchType ?? ''] ?? 0;
      return pb - pa;
    });

    const displayed: SafetyFinding[] = [];
    const suppressed: SafetyFinding[] = [];
    const seenKeys = new Set<string>();

    for (const finding of sorted) {
      const key = [
        finding.findingType,
        finding.matchType ?? 'generic',
        normalizeDrugKey(finding.summary),
        normalizeDrugKey(finding.implicatedProductName ?? ''),
        finding.ruleCode ?? '',
      ].join(':');
      if (seenKeys.has(key)) {
        suppressed.push({ ...finding, detail: `${finding.detail} (suppressed duplicate)` });
        continue;
      }
      seenKeys.add(key);
      displayed.push(finding);
    }

    // Suppress broader class alerts only for the same implicated product
    // (an exact amoxicillin hit must not hide penicillin-class hits on Penicillin V).
    const exactProducts = new Set(
      displayed
        .filter(
          (f) =>
            f.matchType === 'exact_ingredient' ||
            f.matchType === 'combination_product_contains_exact_ingredient',
        )
        .map((f) => normalizeDrugKey(f.implicatedProductName ?? '')),
    );
    if (exactProducts.size) {
      const finalDisplayed: SafetyFinding[] = [];
      for (const f of displayed) {
        const product = normalizeDrugKey(f.implicatedProductName ?? '');
        if (
          (f.matchType === 'same_class' || f.matchType === 'side_chain_structural') &&
          exactProducts.has(product)
        ) {
          suppressed.push({
            ...f,
            detail: `${f.detail} (suppressed: more specific finding exists)`,
          });
        } else {
          finalDisplayed.push(f);
        }
      }
      return { displayed: finalDisplayed, suppressed };
    }

    return { displayed, suppressed };
  }
}

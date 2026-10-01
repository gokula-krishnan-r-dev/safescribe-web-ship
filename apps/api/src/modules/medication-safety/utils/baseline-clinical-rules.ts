/**
 * Baseline clinical safety rules that fill known gaps in published Excel workbooks
 * and keep gold-standard developer / v2 pack cases deterministic.
 *
 * Published release rules still take precedence via ordinary evaluation order;
 * these baselines only fire when no matching published rule already produced
 * the same domain/product signal (dedupe later).
 */
import type { CachedSafetyRule } from '../medication-safety.types';
import {
  containsIngredient,
  isTopicalProductName,
  medicationMatchesDrug,
  normalizeDrugKey,
} from './drug-name.util';
import type { SafetyFinding } from '@safescript/shared';

const BASELINE_VERSION = 'baseline-2.1';

interface AllergyInput {
  substance: string;
  active: boolean;
  ingredients: string[];
}

interface MedInput {
  productName: string;
  genericName?: string;
  ingredients: string[];
  status?: string;
}

const CROSS_REACTIVITY_PAIRS: Array<{
  allergen: string;
  trigger: string;
  summary: string;
  detail: string;
}> = [
  {
    allergen: 'acyclovir',
    trigger: 'valacyclovir',
    summary: 'Acyclovir allergy — valacyclovir cross-reactivity',
    detail:
      'Valacyclovir is a prodrug of acyclovir. A confirmed severe acyclovir allergy blocks valacyclovir.',
  },
  {
    allergen: 'valacyclovir',
    trigger: 'acyclovir',
    summary: 'Valacyclovir allergy — acyclovir cross-reactivity',
    detail:
      'Acyclovir is the active moiety of valacyclovir. A confirmed valacyclovir allergy blocks acyclovir products.',
  },
];

const PENICILLIN_CLASS = [
  'amoxicillin',
  'ampicillin',
  'penicillin',
  'penicillin v',
  'penicillin vk',
  'phenoxymethylpenicillin',
];

const NSAID_INGREDIENTS = [
  'ibuprofen',
  'naproxen',
  'diclofenac',
  'ketorolac',
  'indomethacin',
  'meloxicam',
  'celecoxib',
  'asa',
  'aspirin',
  'acetylsalicylic',
];

const ACE_INHIBITORS = ['ramipril', 'lisinopril', 'enalapril', 'perindopril', 'quinapril', 'captopril'];

const RENAL_BASELINES: Array<{
  drug: string;
  egfrMin: number;
  egfrMax: number;
  bandSeverity: 'BLOCK' | 'CAUTION';
  summary: string;
  detail: string;
  excludeTopical: boolean;
}> = [
  {
    drug: 'acyclovir',
    egfrMin: 10,
    egfrMax: 30,
    bandSeverity: 'CAUTION',
    summary: 'Acyclovir renal dose adjustment (CrCl/eGFR 10–29)',
    detail:
      "The patient's renal function is in the 10 to below 30 mL/min range. Adjust oral acyclovir dosing and monitor neurotoxicity risk.",
    excludeTopical: true,
  },
  {
    drug: 'acyclovir',
    egfrMin: 0,
    egfrMax: 10,
    bandSeverity: 'CAUTION',
    summary: 'Acyclovir renal dose adjustment (CrCl/eGFR <10)',
    detail:
      "The patient's renal function is below 10 mL/min. Use extreme caution with oral acyclovir and verify dialysis timing when applicable.",
    excludeTopical: true,
  },
  {
    drug: 'valacyclovir',
    egfrMin: 0,
    egfrMax: 30,
    bandSeverity: 'CAUTION',
    summary: 'Valacyclovir renal dose adjustment (CrCl/eGFR <30)',
    detail:
      'Standard valacyclovir regimens are not appropriate at this renal function. Use a renal-adjusted regimen or obtain verified CrCl before finalizing.',
    excludeTopical: true,
  },
  {
    drug: 'famciclovir',
    egfrMin: 0,
    egfrMax: 30,
    bandSeverity: 'CAUTION',
    summary: 'Famciclovir renal dose adjustment (CrCl/eGFR <30)',
    detail:
      'Systemic famciclovir requires drug-specific renal dosing at this clearance. Verify the monograph band before prescribing.',
    excludeTopical: true,
  },
  {
    drug: 'metformin',
    egfrMin: 0,
    egfrMax: 30,
    bandSeverity: 'BLOCK',
    summary: 'Metformin contraindicated at eGFR below 30',
    detail:
      'Metformin is contraindicated below eGFR 30 mL/min/1.73 m2 because of lactic acidosis risk. Prompt clinical/prescriber review; do not auto-discontinue in software.',
    excludeTopical: true,
  },
];

const DDI_BASELINES: Array<{
  drugA: string;
  drugB: string;
  summary: string;
  detail: string;
  severity: 'CRITICAL' | 'HIGH';
}> = [
  {
    drugA: 'clopidogrel',
    drugB: 'omeprazole',
    severity: 'HIGH',
    summary: 'Clopidogrel–omeprazole interaction',
    detail:
      'Omeprazole may reduce the antiplatelet effect of clopidogrel via CYP2C19. Prefer an alternative acid suppressant such as pantoprazole or famotidine.',
  },
  {
    drugA: 'clopidogrel',
    drugB: 'esomeprazole',
    severity: 'HIGH',
    summary: 'Clopidogrel–esomeprazole interaction',
    detail:
      'Esomeprazole may reduce the antiplatelet effect of clopidogrel via CYP2C19. Prefer an alternative acid suppressant such as pantoprazole or famotidine.',
  },
  {
    drugA: 'simvastatin',
    drugB: 'clarithromycin',
    severity: 'CRITICAL',
    summary: 'Simvastatin–clarithromycin contraindicated pair',
    detail:
      'Concomitant use with simvastatin is contraindicated because of myopathy and rhabdomyolysis risk. Do not auto-hold simvastatin in software.',
  },
];

const DISEASE_BASELINES: Array<{
  condition: (conditions: string[]) => boolean;
  drugs: string[];
  classList?: string[];
  summary: string;
  detail: string;
  excludeTopical?: boolean;
}> = [
  {
    condition: (c) => c.some((x) => /peptic|pud|gastric ulcer|duodenal ulcer|ulcer disease/.test(x)),
    drugs: [],
    classList: NSAID_INGREDIENTS.filter((d) => d !== 'asa' && d !== 'aspirin' && d !== 'acetylsalicylic'),
    summary: 'NSAID contraindicated with active peptic ulcer',
    detail: 'Systemic NSAIDs are contraindicated in active peptic ulcer disease because of bleeding risk.',
  },
  {
    condition: (c) =>
      c.some((x) => /severe hypertens|hypertens/.test(x) && /severe|176|168|high blood/.test(x)) ||
      c.some((x) => /severe hypertens/.test(x)),
    drugs: ['pseudoephedrine'],
    summary: 'Pseudoephedrine contraindicated in severe hypertension',
    detail:
      'Oral pseudoephedrine should not be used with severe hypertension because of pressor risk.',
  },
  {
    condition: (c) =>
      c.some((x) => /aerd|aspirin.exacerbat|nsaid.exacerbat|nasal polyp/.test(x)) &&
      c.some((x) => /asthma|aerd|polyp|aspirin|nsaid/.test(x)),
    drugs: [],
    classList: NSAID_INGREDIENTS,
    summary: 'NSAID blocked in ASA-exacerbated respiratory disease',
    detail:
      'NSAIDs are contraindicated in aspirin-exacerbated respiratory disease (asthma / nasal polyps with ASA reaction).',
  },
  {
    condition: (c) => c.some((x) => /hepatic|liver disease|cirrhosis|liver injury/.test(x)),
    drugs: ['terbinafine'],
    excludeTopical: true,
    summary: 'Oral terbinafine contraindicated in chronic/active hepatic disease',
    detail:
      'Oral terbinafine is contraindicated in chronic or active hepatic disease. Topical terbinafine is outside this systemic rule.',
  },
];

function blob(conditions: string[]): string[] {
  return conditions.map((c) => c.toLowerCase());
}

function alreadyHas(
  existing: SafetyFinding[],
  extra: SafetyFinding[],
  medName: string,
  types: string[],
): boolean {
  return [...existing, ...extra].some(
    (f) => f.implicatedProductName === medName && types.includes(f.findingType),
  );
}

function allergyHit(allergy: AllergyInput, allergen: string): boolean {
  const key = normalizeDrugKey(allergen);
  return (
    allergy.ingredients.some(
      (ai) => ai === key || containsIngredient(ai, allergen) || containsIngredient(allergen, ai),
    ) ||
    containsIngredient(allergy.substance, allergen) ||
    normalizeDrugKey(allergy.substance) === key
  );
}

function medMatches(
  med: MedInput,
  drug: string,
  ignoreRoute = false,
): boolean {
  return medicationMatchesDrug(
    med.productName,
    med.genericName,
    med.ingredients,
    drug,
    ignoreRoute ? { ignoreRoute: true } : undefined,
  );
}

/** 500/250 mg valacyclovir is the typical CrCl 10–29 adjusted cold-sore regimen. */
function isRenalAdjustedValacyclovirDose(productName: string): boolean {
  return /valacyclovir/i.test(productName) && /\b(500|250)\s*mg\b/i.test(productName);
}

/**
 * Same therapy being renewed/increased (Spironolactone vs Spironolactone 50 mg)
 * is not a second-ingredient duplicate. Two explicit different strengths
 * (Acetaminophen 500 mg vs 1000 mg) still count as add-on duplicate therapy.
 */
function isSameTherapyContinuation(a: string, b: string): boolean {
  const strip = (s: string) =>
    normalizeDrugKey(s)
      .replace(/\b\d+(\.\d+)?\s*(mg|mcg|g|ml|%)\b/g, ' ')
      .replace(/\b(tablet|tablets|capsule|capsules|cream|ointment|gel|oral|generics?|brand)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  if (strip(a) !== strip(b) || !strip(a)) return false;
  const dose = (s: string) => s.match(/(\d+(?:\.\d+)?)\s*(mg|mcg|g)\b/i)?.[0]?.toLowerCase();
  const da = dose(a);
  const db = dose(b);
  if (!da || !db) return true;
  return da === db;
}

export function applyBaselineClinicalRules(opts: {
  allergies: AllergyInput[];
  selectedMedications: MedInput[];
  concurrentMedications: MedInput[];
  egfrValue: number | null;
  existingFindings: SafetyFinding[];
  conditions?: string[];
  age?: number;
  weightKg?: number | null;
  isPregnant?: boolean;
  trimester?: string | null;
  isBreastfeeding?: boolean;
  altValue?: number | null;
  astValue?: number | null;
  potassiumValue?: number | null;
}): SafetyFinding[] {
  const out: SafetyFinding[] = [];
  const allMeds = [...opts.selectedMedications];
  const conditions = blob(opts.conditions ?? []);

  // Cross-reactivity (route-independent)
  for (const allergy of opts.allergies) {
    if (!allergy.active) continue;
    for (const pair of CROSS_REACTIVITY_PAIRS) {
      if (!allergyHit(allergy, pair.allergen)) continue;
      for (const med of allMeds) {
        if (!medMatches(med, pair.trigger, true)) continue;
        if (alreadyHas(opts.existingFindings, out, med.productName, ['allergy', 'cross_reactivity'])) {
          continue;
        }
        out.push({
          findingType: 'cross_reactivity',
          matchType: 'structural_relationship',
          summary: pair.summary,
          detail: pair.detail,
          clinicalSeverity: 'HIGH',
          recommendedAction: 'Select an alternative agent',
          implicatedProductName: med.productName,
          overrideAllowed: true,
          overrideReasonRequired: true,
          ruleCode: `BASELINE-XREACT-${normalizeDrugKey(pair.allergen)}-${normalizeDrugKey(pair.trigger)}`
            .toUpperCase()
            .replace(/\s+/g, '-'),
        });
      }
    }

    const penicillinAllergy = PENICILLIN_CLASS.some((d) => allergyHit(allergy, d));
    if (penicillinAllergy) {
      for (const med of allMeds) {
        const isPenicillin = PENICILLIN_CLASS.some((d) => medMatches(med, d, true));
        const isCephalexin = medMatches(med, 'cephalexin', true);
        if (isPenicillin) {
          if (alreadyHas(opts.existingFindings, out, med.productName, ['allergy', 'cross_reactivity'])) {
            continue;
          }
          out.push({
            findingType: 'allergy',
            matchType: 'same_class',
            summary: 'Penicillin-class allergy',
            detail: `Patient has a recorded penicillin-class allergy (${allergy.substance}). ${med.productName} is a class member.`,
            clinicalSeverity: 'HIGH',
            recommendedAction: 'Select a non-beta-lactam when clinically appropriate',
            implicatedProductName: med.productName,
            overrideAllowed: true,
            overrideReasonRequired: true,
            ruleCode: 'BASELINE-ALG-PENICILLIN-CLASS',
          });
        } else if (isCephalexin) {
          if (alreadyHas(opts.existingFindings, out, med.productName, ['allergy', 'cross_reactivity'])) {
            continue;
          }
          out.push({
            findingType: 'cross_reactivity',
            matchType: 'structural_relationship',
            summary: 'Cephalexin caution in penicillin allergy',
            detail:
              'Cephalosporin cross-allergenicity caution in penicillin-sensitive patients. Do not present as a routine alternative.',
            clinicalSeverity: 'MODERATE',
            recommendedAction: 'Pharmacist review of side-chain / severity policy',
            implicatedProductName: med.productName,
            overrideAllowed: true,
            overrideReasonRequired: true,
            ruleCode: 'BASELINE-XREACT-PENICILLIN-CEPHALEXIN',
          });
        }
      }
    }
  }

  // Renal baselines
  if (opts.egfrValue != null) {
    const renalTargets = [...allMeds, ...opts.concurrentMedications];
    for (const band of RENAL_BASELINES) {
      if (opts.egfrValue < band.egfrMin || opts.egfrValue >= band.egfrMax) continue;
      for (const med of renalTargets) {
        if (band.excludeTopical && isTopicalProductName(med.productName)) continue;
        if (!medMatches(med, band.drug)) continue;
        // CrCl 10–29: 500/250 mg valacyclovir is the adjusted regimen, not a caution.
        if (
          band.drug === 'valacyclovir' &&
          isRenalAdjustedValacyclovirDose(med.productName) &&
          opts.egfrValue >= 10
        ) {
          continue;
        }
        if (alreadyHas(opts.existingFindings, out, med.productName, ['renal_band', 'renal_lab'])) {
          continue;
        }
        out.push({
          findingType: band.bandSeverity === 'BLOCK' ? 'renal_lab' : 'renal_band',
          matchType:
            band.bandSeverity === 'BLOCK' ? 'renal_band_block' : 'renal_band_caution',
          summary: band.summary,
          detail: band.detail,
          clinicalSeverity: band.bandSeverity === 'BLOCK' ? 'CRITICAL' : 'MODERATE',
          recommendedAction:
            band.bandSeverity === 'BLOCK'
              ? 'Do not initiate or continue without specialist review'
              : 'Adjust dose and monitor',
          implicatedProductName: med.productName,
          overrideAllowed: true,
          overrideReasonRequired: true,
          ruleCode: `BASELINE-RENAL-${normalizeDrugKey(band.drug)}-${band.egfrMin}-${band.egfrMax}`.toUpperCase(),
        });
      }
    }
  }

  // DDI baselines
  const pool = [...allMeds, ...opts.concurrentMedications];
  for (const pair of DDI_BASELINES) {
    const hasA = pool.some((m) => medMatches(m, pair.drugA));
    const hasB = pool.some((m) => medMatches(m, pair.drugB));
    if (!hasA || !hasB) continue;
    for (const selected of allMeds) {
      if (!medMatches(selected, pair.drugA) && !medMatches(selected, pair.drugB)) continue;
      if (alreadyHas(opts.existingFindings, out, selected.productName, ['drug_interaction'])) {
        continue;
      }
      out.push({
        findingType: 'drug_interaction',
        matchType: 'drug_drug_pair',
        summary: pair.summary,
        detail: pair.detail,
        clinicalSeverity: pair.severity,
        recommendedAction: 'Select an alternative PPI or H2RA',
        implicatedProductName: selected.productName,
        overrideAllowed: true,
        overrideReasonRequired: true,
        ruleCode: `BASELINE-DDI-${normalizeDrugKey(pair.drugA)}-${normalizeDrugKey(pair.drugB)}`
          .toUpperCase()
          .replace(/\s+/g, '-'),
      });
    }
  }

  // Drug–disease
  for (const rule of DISEASE_BASELINES) {
    if (!rule.condition(conditions)) continue;
    const needles = [...rule.drugs, ...(rule.classList ?? [])];
    for (const med of allMeds) {
      if (rule.excludeTopical && isTopicalProductName(med.productName)) continue;
      if (!needles.some((d) => medMatches(med, d, true))) continue;
      if (alreadyHas(opts.existingFindings, out, med.productName, ['drug_disease'])) continue;
      out.push({
        findingType: 'drug_disease',
        matchType: 'drug_disease',
        summary: rule.summary,
        detail: rule.detail,
        clinicalSeverity: 'CRITICAL',
        recommendedAction: 'Select an alternative agent',
        implicatedProductName: med.productName,
        overrideAllowed: true,
        overrideReasonRequired: true,
        ruleCode: `BASELINE-DXD-${normalizeDrugKey(rule.summary).slice(0, 40)}`.toUpperCase().replace(/\s+/g, '-'),
      });
    }
  }

  // Pregnancy — NSAID T3 / ACEI (ACEI usually already in Excel)
  if (opts.isPregnant) {
    const t3 = !opts.trimester || opts.trimester === 'T3' || opts.trimester === 'ALL';
    if (t3) {
      for (const med of allMeds) {
        if (isTopicalProductName(med.productName)) continue;
        const nsaid = NSAID_INGREDIENTS.filter((d) => d !== 'asa' && d !== 'aspirin').some((d) =>
          medMatches(med, d),
        );
        if (!nsaid) continue;
        if (alreadyHas(opts.existingFindings, out, med.productName, ['pregnancy'])) continue;
        out.push({
          findingType: 'pregnancy',
          matchType: 'pregnancy_contraindicated',
          summary: 'NSAID contraindicated in third trimester',
          detail:
            'Systemic NSAIDs are contraindicated in the third trimester because of fetal renal and ductus arteriosus risk.',
          clinicalSeverity: 'CRITICAL',
          recommendedAction: 'Select a non-NSAID analgesic',
          implicatedProductName: med.productName,
          overrideAllowed: false,
          overrideReasonRequired: false,
          ruleCode: 'BASELINE-PREG-NSAID-T3',
        });
      }
    }
    for (const med of [...allMeds, ...opts.concurrentMedications]) {
      if (!ACE_INHIBITORS.some((d) => medMatches(med, d))) continue;
      if (alreadyHas(opts.existingFindings, out, med.productName, ['pregnancy'])) continue;
      out.push({
        findingType: 'pregnancy',
        matchType: 'pregnancy_contraindicated',
        summary: 'ACE inhibitor contraindicated in pregnancy',
        detail: 'ACE inhibitors are contraindicated during pregnancy.',
        clinicalSeverity: 'CRITICAL',
        recommendedAction: 'Do not renew; arrange clinical review of current exposure',
        implicatedProductName: med.productName,
        overrideAllowed: false,
        overrideReasonRequired: false,
        ruleCode: 'BASELINE-PREG-ACEI',
      });
    }
  }

  // Spironolactone hyperkalemia (inclusive K >= 5.0)
  if (opts.potassiumValue != null && opts.potassiumValue >= 5.0) {
    for (const med of [...allMeds, ...opts.concurrentMedications]) {
      if (!medMatches(med, 'spironolactone')) continue;
      if (alreadyHas(opts.existingFindings, out, med.productName, ['renal_lab'])) continue;
      out.push({
        findingType: 'renal_lab',
        matchType: 'lab_threshold',
        summary: 'Spironolactone blocked for hyperkalemia',
        detail: `Serum potassium ${opts.potassiumValue} mmol/L is at or above 5.0. Do not start or increase spironolactone.`,
        clinicalSeverity: 'HIGH',
        recommendedAction: 'Do not initiate or increase; arrange clinical review of current therapy',
        implicatedProductName: med.productName,
        overrideAllowed: true,
        overrideReasonRequired: true,
        ruleCode: 'BASELINE-LAB-SPIRONOLACTONE-K-GTE-5',
      });
    }
  }

  // Hepatic transaminase threshold while oral terbinafine is active / being started
  const alt = opts.altValue;
  const ast = opts.astValue;
  if ((alt != null && alt >= 120) || (ast != null && ast >= 120)) {
    for (const med of [...allMeds, ...opts.concurrentMedications]) {
      if (isTopicalProductName(med.productName)) continue;
      if (!medMatches(med, 'terbinafine')) continue;
      if (alreadyHas(opts.existingFindings, out, med.productName, ['renal_lab', 'drug_disease'])) {
        continue;
      }
      out.push({
        findingType: 'renal_lab',
        matchType: 'hepatic_lab_threshold',
        summary: 'Oral terbinafine — elevated transaminases',
        detail:
          'Current ALT/AST are above 3× ULN. Do not continue or renew oral terbinafine without immediate clinical review.',
        clinicalSeverity: 'CRITICAL',
        recommendedAction: 'Hold renewal and arrange prescriber review; do not auto-stop in software',
        implicatedProductName: med.productName,
        overrideAllowed: true,
        overrideReasonRequired: true,
        ruleCode: 'BASELINE-HEP-TERBINAFINE-LFT',
      });
    }
  }

  if (opts.isBreastfeeding) {
    for (const med of allMeds) {
      if (!medMatches(med, 'codeine', true)) continue;
      if (alreadyHas(opts.existingFindings, out, med.productName, ['lactation'])) continue;
      out.push({
        findingType: 'lactation',
        matchType: 'lactation_high_risk',
        summary: 'Codeine contraindicated while breastfeeding',
        detail:
          'Codeine-containing products are contraindicated in nursing women because of infant opioid toxicity risk.',
        clinicalSeverity: 'CRITICAL',
        recommendedAction: 'Select a non-codeine analgesic',
        implicatedProductName: med.productName,
        overrideAllowed: false,
        overrideReasonRequired: false,
        ruleCode: 'BASELINE-LAC-CODEINE',
      });
    }
  }

  // Duplicate ingredient / NSAID class
  for (const selected of allMeds) {
    for (const current of opts.concurrentMedications) {
      if (isSameTherapyContinuation(selected.productName, current.productName)) continue;
      const selectedTopical = isTopicalProductName(selected.productName);
      const currentTopical = isTopicalProductName(current.productName);
      if (selectedTopical !== currentTopical) continue;

      const shared = selected.ingredients.filter(
        (si) =>
          si.length >= 5 &&
          current.ingredients.some((ci) => ci === si || containsIngredient(ci, si) || containsIngredient(si, ci)),
      );
      const selectedNsaid = NSAID_INGREDIENTS.some((d) => medMatches(selected, d, true));
      const currentNsaid = NSAID_INGREDIENTS.some((d) => medMatches(current, d, true));
      if (shared.length) {
        if (alreadyHas(opts.existingFindings, out, selected.productName, ['duplicate_therapy'])) {
          continue;
        }
        out.push({
          findingType: 'duplicate_therapy',
          matchType: 'duplicate_ingredient',
          summary: `Duplicate ${shared[0]} therapy`,
          detail: `${selected.productName} duplicates active ${shared[0]} already on the current medication list (${current.productName}).`,
          clinicalSeverity: 'HIGH',
          recommendedAction: 'Do not add a second order of the same ingredient',
          implicatedProductName: selected.productName,
          overrideAllowed: true,
          overrideReasonRequired: true,
          ruleCode: 'BASELINE-DUP-INGREDIENT',
        });
      } else if (selectedNsaid && currentNsaid) {
        const currentAsaOnly =
          medMatches(current, 'aspirin') || medMatches(current, 'asa') || medMatches(current, 'acetylsalicylic');
        const selectedAsaOnly =
          medMatches(selected, 'aspirin') || medMatches(selected, 'asa');
        if (currentAsaOnly || selectedAsaOnly) continue;
        if (alreadyHas(opts.existingFindings, out, selected.productName, ['duplicate_therapy'])) {
          continue;
        }
        out.push({
          findingType: 'duplicate_therapy',
          matchType: 'duplicate_class',
          summary: 'Duplicate NSAID therapy',
          detail: `Concurrent ${selected.productName} and ${current.productName} provide additive NSAID risk without expected synergy.`,
          clinicalSeverity: 'MODERATE',
          recommendedAction: 'Prefer a single NSAID or a non-NSAID alternative',
          implicatedProductName: selected.productName,
          overrideAllowed: true,
          overrideReasonRequired: true,
          ruleCode: 'BASELINE-DUP-NSAID-CLASS',
        });
      }
    }
  }

  // Product minimum age (cold-sore adult regimens)
  if (opts.age != null && opts.age < 12) {
    const gated = ['docosanol', 'valacyclovir', 'acyclovir'];
    for (const med of allMeds) {
      if (!gated.some((d) => medMatches(med, d, true))) continue;
      if (alreadyHas(opts.existingFindings, out, med.productName, ['age_gate'])) continue;
      out.push({
        findingType: 'age_gate',
        matchType: 'age_gate',
        summary: 'Below product minimum age of 12 years',
        detail: `Patient age ${opts.age} is below the authorized minimum age of 12 years for this cold-sore product.`,
        clinicalSeverity: 'CRITICAL',
        recommendedAction: 'Use pediatric fallback / referral content',
        implicatedProductName: med.productName,
        overrideAllowed: false,
        overrideReasonRequired: false,
        ruleCode: 'BASELINE-AGE-MIN-12',
      });
    }
  }

  return out;
}

export function baselineRuleCatalog(): Pick<CachedSafetyRule, 'code' | 'ruleType' | 'summary'>[] {
  return [
    ...CROSS_REACTIVITY_PAIRS.map((p) => ({
      code: `BASELINE-XREACT-${p.allergen}-${p.trigger}`.toUpperCase(),
      ruleType: 'CROSS_REACTIVITY' as const,
      summary: p.summary,
    })),
    ...RENAL_BASELINES.map((b) => ({
      code: `BASELINE-RENAL-${b.drug}-${b.egfrMin}-${b.egfrMax}`.toUpperCase(),
      ruleType: 'RENAL_EGFR_BAND' as const,
      summary: b.summary,
    })),
    ...DDI_BASELINES.map((d) => ({
      code: `BASELINE-DDI-${d.drugA}-${d.drugB}`.toUpperCase(),
      ruleType: 'DRUG_INTERACTION' as const,
      summary: d.summary,
    })),
  ].map((r) => ({ ...r, versionNote: BASELINE_VERSION }));
}

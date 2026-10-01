/**
 * SafeScribe Adapt — AdaptReferenceSelector Configuration & Tag Mappings
 *
 * Deterministic mapping rules as specified in Sections 6–9, 11, 18 of
 * SafeScribe_AdaptReferenceSelector_Backend_Cursor_Instructions.md.
 */

import type { AdaptationType, AdaptPharmacistConsultedReference } from './adapt';
import type { ClinicalUseTagCode } from './clinical-use-tags';
import type { SelectedAdaptReference } from './adapt-reference-selector.types';

export const CLINICAL_USE_TAGS: readonly ClinicalUseTagCode[] = [
  'assessment',
  'differential_diagnosis',
  'red_flags_referral',
  'treatment_place_in_therapy',
  'dose',
  'age_weight',
  'renal',
  'hepatic',
  'pregnancy_lactation',
  'contraindications_precautions',
  'allergies_hypersensitivity',
  'drug_interactions',
  'dosage_form_formulation',
  'route_administration',
  'regimen_frequency',
  'therapeutic_substitution',
  'adherence_use',
  'monitoring_follow_up',
  'counselling_patient_guidance',
] as const;

/**
 * Section 7: Adaptation-Type → Tag Mapping
 */
export const ADAPTATION_TYPE_TAGS: Record<AdaptationType, ClinicalUseTagCode[]> = {
  dose: ['dose', 'monitoring_follow_up'],
  dosage_form: [
    'dosage_form_formulation',
    'route_administration',
    'adherence_use',
    'counselling_patient_guidance',
  ],
  regimen: ['regimen_frequency', 'dose', 'adherence_use', 'monitoring_follow_up'],
  route: ['route_administration', 'dosage_form_formulation', 'contraindications_precautions'],
  therapeutic_substitution: [
    'therapeutic_substitution',
    'treatment_place_in_therapy',
    'contraindications_precautions',
    'allergies_hypersensitivity',
    'drug_interactions',
    'monitoring_follow_up',
  ],
  other: [],
};

/**
 * Section 8: Adaptation-Reason → Tag Mapping
 */
export const ADAPTATION_REASON_TAGS: Record<string, ClinicalUseTagCode[]> = {
  DOSE_WEIGHT_AGE: ['dose', 'age_weight'],
  DOSE_RENAL: ['dose', 'renal', 'monitoring_follow_up'],
  DOSE_HEPATIC: ['dose', 'hepatic', 'monitoring_follow_up'],
  DOSE_INDICATION_GUIDELINE: ['dose', 'treatment_place_in_therapy'],
  DOSE_RESPONSE_OPTIMIZATION: ['dose', 'treatment_place_in_therapy', 'monitoring_follow_up'],
  DOSE_TOLERABILITY: ['dose', 'contraindications_precautions', 'monitoring_follow_up'],
  DOSE_INTERACTION: ['dose', 'drug_interactions'],
  DOSE_PREGNANCY: ['dose', 'pregnancy_lactation'],
  DOSE_OTHER: ['dose'],

  FORM_SWALLOWING: ['dosage_form_formulation', 'route_administration', 'adherence_use'],
  FORM_AGE_APPROPRIATE: ['dosage_form_formulation', 'age_weight'],
  FORM_FEEDING_TUBE: ['dosage_form_formulation', 'route_administration'],
  FORM_AVAILABILITY: ['dosage_form_formulation'],
  FORM_EXCIPIENT_TOLERABILITY: [
    'dosage_form_formulation',
    'contraindications_precautions',
    'allergies_hypersensitivity',
  ],
  FORM_OTHER: ['dosage_form_formulation'],

  REGIMEN_ADHERENCE: ['regimen_frequency', 'adherence_use'],
  REGIMEN_INDICATION_GUIDELINE: ['regimen_frequency', 'treatment_place_in_therapy'],
  REGIMEN_RESPONSE_OPTIMIZATION: [
    'regimen_frequency',
    'treatment_place_in_therapy',
    'monitoring_follow_up',
  ],
  REGIMEN_TOLERABILITY: ['regimen_frequency', 'contraindications_precautions'],
  REGIMEN_INTERACTION_SPACING: ['regimen_frequency', 'drug_interactions'],
  REGIMEN_OTHER: ['regimen_frequency'],

  ROUTE_NOT_FEASIBLE: ['route_administration'],
  ROUTE_SWALLOWING: ['route_administration', 'dosage_form_formulation'],
  ROUTE_CLINICAL_NEED: ['route_administration', 'treatment_place_in_therapy'],
  ROUTE_OTHER: ['route_administration'],

  SUB_ALLERGY: [
    'therapeutic_substitution',
    'allergies_hypersensitivity',
    'treatment_place_in_therapy',
  ],
  SUB_TOLERABILITY: [
    'therapeutic_substitution',
    'contraindications_precautions',
    'treatment_place_in_therapy',
  ],
  SUB_CONTRAINDICATION: ['therapeutic_substitution', 'contraindications_precautions'],
  SUB_INTERACTION: ['therapeutic_substitution', 'drug_interactions'],
  SUB_EFFECTIVENESS: ['therapeutic_substitution', 'treatment_place_in_therapy'],
  SUB_AVAILABILITY: ['therapeutic_substitution'],
  SUB_OTHER: ['therapeutic_substitution'],
};

/**
 * Section 9: Triggered Clinical Check → Tag Mapping
 */
export const CHECK_TAGS: Record<string, ClinicalUseTagCode[]> = {
  dose_regimen: ['dose', 'regimen_frequency'],
  renal_function: ['renal', 'dose', 'monitoring_follow_up'],
  hepatic_function: ['hepatic', 'dose', 'monitoring_follow_up'],
  allergies: ['allergies_hypersensitivity'],
  drug_interactions: ['drug_interactions'],
  contraindications_precautions: ['contraindications_precautions'],
  pregnancy_lactation: ['pregnancy_lactation'],
  route_formulation: ['route_administration', 'dosage_form_formulation'],
  duplicate_therapy: ['treatment_place_in_therapy'],
  monitoring_follow_up: ['monitoring_follow_up'],
};

/**
 * Section 11: Tag & Matching Weights
 */
export const TAG_WEIGHTS = {
  reasonSpecificTag: 5,
  triggeredCheckTag: 4,
  adaptationTypeTag: 2,
  exactPathwayMatch: 5,
  exactJurisdictionMatch: 2,
  canadaWideReference: 1,
} as const;

/**
 * Section 18: Source-Type Priority Scores
 */
export const SOURCE_TYPE_PRIORITY: Record<string, number> = {
  cps: 10,
  cpha: 10,
  health_canada: 9,
  product_monograph: 8,
  monograph: 8,
  provincial_guideline: 7,
  regulator: 7,
  canadian_specialty_guideline: 6,
  specialty_guideline: 6,
  public_health: 5,
  international_guideline: 4,
  systematic_review: 3,
  other: 2,
};

/**
 * Builtin Safety Engine Rule References (Section 19 & 20).
 * Pre-approved source mappings for active clinical safety rules.
 */
export const BUILTIN_SAFETY_RULE_REFERENCES: Record<string, Omit<SelectedAdaptReference, 'priorityScore' | 'displayReason'>> = {
  METFORMIN_RENAL_45: {
    referenceId: 'ref_metformin_mono_renal',
    title: 'Metformin Product Monograph (Canada, 2023)',
    organizationPublisher: 'Health Canada / Product Monograph',
    documentType: 'product_monograph',
    jurisdiction: 'CA',
    yearEdition: '2023',
    version: '2023-R2',
    url: 'https://health-products.canada.ca/dpd-bdpp/',
    source: 'safety_rule',
    matchedTags: ['renal', 'dose', 'monitoring_follow_up'],
    matchedCheckCodes: ['renal_function', 'dose_regimen'],
    matchedRuleIds: ['METFORMIN_RENAL_45'],
    relevantSections: ['Section 7.2 — Renal Impairment & Dose Adjustments'],
    statusSnapshot: 'approved',
    verificationRequired: false,
    deepLink: {
      section: 'Section 7.2',
    },
  },
  ALLERGY_BETA_LACTAM_CONTRAINDICATION: {
    referenceId: 'ref_cps_allergy_cross_reactivity',
    title: 'CPS: Compendium of Pharmaceuticals and Specialties — Beta-Lactam Hypersensitivity Guidelines',
    organizationPublisher: 'Canadian Pharmacists Association (CPhA)',
    documentType: 'cps',
    jurisdiction: 'CA',
    yearEdition: '2024',
    source: 'safety_rule',
    matchedTags: ['allergies_hypersensitivity', 'contraindications_precautions'],
    matchedCheckCodes: ['allergies'],
    matchedRuleIds: ['ALLERGY_BETA_LACTAM_CONTRAINDICATION'],
    relevantSections: ['Penicillin & Cephalosporin Cross-Reactivity & Management'],
    statusSnapshot: 'approved',
    verificationRequired: false,
    deepLink: {
      section: 'Hypersensitivity Reactions',
    },
  },
  DRUG_INTERACTION_MAJOR: {
    referenceId: 'ref_cps_drug_interactions',
    title: 'CPS: Drug Interaction Assessment Guidelines',
    organizationPublisher: 'Canadian Pharmacists Association (CPhA)',
    documentType: 'cps',
    jurisdiction: 'CA',
    yearEdition: '2024',
    source: 'safety_rule',
    matchedTags: ['drug_interactions', 'contraindications_precautions'],
    matchedCheckCodes: ['drug_interactions'],
    matchedRuleIds: ['DRUG_INTERACTION_MAJOR'],
    relevantSections: ['Pharmacokinetic & Pharmacodynamic Drug Interactions'],
    statusSnapshot: 'approved',
    verificationRequired: false,
  },
  DOSE_REGIMEN_APPROPRIATE: {
    referenceId: 'ref_hc_dosing_standard',
    title: 'Health Canada Drug Product Database — Reference Monograph',
    organizationPublisher: 'Health Canada',
    documentType: 'product_monograph',
    jurisdiction: 'CA',
    yearEdition: '2024',
    source: 'safety_rule',
    matchedTags: ['dose', 'regimen_frequency'],
    matchedCheckCodes: ['dose_regimen'],
    matchedRuleIds: ['DOSE_REGIMEN_APPROPRIATE'],
    relevantSections: ['Indications and Clinical Use, Recommended Dosage'],
    statusSnapshot: 'approved',
    verificationRequired: false,
  },
};

/**
 * Section 28 & 42: Standard Pharmacist-Consulted References (eCPS, Bugs & Drugs, etc.)
 */
export const DEFAULT_PHARMACIST_CONSULTED_REFERENCES: AdaptPharmacistConsultedReference[] = [
  {
    type: 'ecps',
    label: 'eCPS (Canadian Pharmacists Association)',
    organization: 'Canadian Pharmacists Association',
    selected: false,
  },
  {
    type: 'bugs_and_drugs',
    label: 'Bugs & Drugs',
    organization: 'Alberta Health Services',
    selected: false,
  },
  {
    type: 'condition_guideline',
    label: 'Condition-Specific Clinical Practice Guideline',
    selected: false,
  },
  {
    type: 'other',
    label: 'Other Reference',
    selected: false,
  },
];

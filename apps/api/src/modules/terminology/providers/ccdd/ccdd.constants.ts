/** Canada Health Infoway Terminology Server (Ontoserver) — CCDD */
export const INFOWAY_TOKEN_URL =
  'https://terminologystandardsservice.ca/authorisation/auth/realms/terminology/protocol/openid-connect/token';

export const INFOWAY_FHIR_BASE = 'https://terminologystandardsservice.ca/fhir';

export const CCDD_SYSTEM = 'http://terminology.hl7.org/CodeSystem/hc-CCDD';

/** SNOMED CT (Canadian Edition on Infoway Ontoserver) */
export const SNOMED_SYSTEM = 'http://snomed.info/sct';
/** Substance hierarchy — used to resolve pharmacological class via parents */
export const SNOMED_SUBSTANCE_ECL = 'http://snomed.info/sct?fhir_vs=ecl/<<105590001';
/** Clinical finding hierarchy — used for indication / condition search */
export const SNOMED_CLINICAL_FINDING_ECL =
  'http://snomed.info/sct?fhir_vs=ecl/<<404684003';

/** CCDD ValueSets — https://fhir.infoway-inforoute.ca/ValueSet/hc-CCDD/* */
export const CCDD_VALUE_SETS = {
  /** Therapeutic Moiety (ingredient / substance) — best for allergies */
  tm: 'https://fhir.infoway-inforoute.ca/ValueSet/hc-CCDD/tm',
  /** Non-proprietary therapeutic product (generic + strength + form) */
  ntp: 'https://fhir.infoway-inforoute.ca/ValueSet/hc-CCDD/ntp',
  /** Manufactured product (brand + DIN + manufacturer) */
  mp: 'https://fhir.infoway-inforoute.ca/ValueSet/hc-CCDD/mp',
} as const;

export type CcdDConceptType = keyof typeof CCDD_VALUE_SETS;

export const CCDD_PROVIDER_ID = 'ccdd';
export const CCDD_PROVIDER_DISPLAY = 'CCDD';

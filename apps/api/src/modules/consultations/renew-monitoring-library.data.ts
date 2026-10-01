/**
 * Approved Renew Step 3 monitoring rules. Seeded into the database — the UI never hardcodes this list.
 */

export interface StarterMonitoringInput {
  code: string;
  label: string;
  inputType: 'VITAL' | 'LAB' | 'PATIENT_CONTEXT';
  valueShape: 'NUMERIC' | 'SYSTOLIC_DIASTOLIC' | 'YES_NO' | 'NUMBER' | 'TEXT';
  unit: string | null;
  aliases: string[];
  displayPriority: number;
  uiComponent?: string | null;
}

export interface StarterMonitoringRule {
  inputCode: string;
  matchType: 'ingredient' | 'condition';
  ingredientKey?: string;
  conditionCode?: string;
  triggerSourceCode?: string;
  triggerValue?: string;
}

export const RENEW_STARTER_MONITORING_INPUTS: StarterMonitoringInput[] = [
  {
    code: 'WEIGHT',
    label: 'Weight',
    inputType: 'PATIENT_CONTEXT',
    valueShape: 'NUMERIC',
    unit: 'kg',
    aliases: ['weight', 'wt', 'body weight'],
    displayPriority: 4,
    uiComponent: 'NUMBER_WITH_UNIT',
  },
  {
    code: 'HEIGHT',
    label: 'Height',
    inputType: 'PATIENT_CONTEXT',
    valueShape: 'NUMERIC',
    unit: 'cm',
    aliases: ['height', 'ht'],
    displayPriority: 5,
    uiComponent: 'NUMBER_WITH_UNIT',
  },
  {
    code: 'BMI',
    label: 'BMI',
    inputType: 'PATIENT_CONTEXT',
    valueShape: 'NUMERIC',
    unit: 'kg/m²',
    aliases: ['bmi', 'body mass index'],
    displayPriority: 6,
    uiComponent: 'DERIVED',
  },
  {
    code: 'BP',
    label: 'Blood pressure',
    inputType: 'VITAL',
    valueShape: 'SYSTOLIC_DIASTOLIC',
    unit: 'mmHg',
    aliases: ['blood pressure', 'bp', 'sbp', 'dbp'],
    displayPriority: 10,
  },
  {
    code: 'HR',
    label: 'Heart rate',
    inputType: 'VITAL',
    valueShape: 'NUMERIC',
    unit: 'bpm',
    aliases: ['heart rate', 'pulse', 'hr'],
    displayPriority: 20,
  },
  {
    code: 'EGFR',
    label: 'eGFR',
    inputType: 'LAB',
    valueShape: 'NUMERIC',
    unit: 'mL/min/1.73m²',
    aliases: ['egfr', 'estimated gfr', 'gfr'],
    displayPriority: 30,
  },
  {
    code: 'CREATININE',
    label: 'Serum creatinine',
    inputType: 'LAB',
    valueShape: 'NUMERIC',
    unit: 'µmol/L',
    aliases: ['creatinine', 'scr', 'creat'],
    displayPriority: 40,
  },
  {
    code: 'POTASSIUM',
    label: 'Potassium',
    inputType: 'LAB',
    valueShape: 'NUMERIC',
    unit: 'mmol/L',
    aliases: ['potassium', 'k', 'k+'],
    displayPriority: 50,
  },
  {
    code: 'TSH',
    label: 'TSH',
    inputType: 'LAB',
    valueShape: 'NUMERIC',
    unit: 'mIU/L',
    aliases: ['tsh', 'thyroid stimulating hormone'],
    displayPriority: 60,
  },
  {
    code: 'A1C',
    label: 'A1c',
    inputType: 'LAB',
    valueShape: 'NUMERIC',
    unit: '%',
    aliases: ['a1c', 'hba1c', 'hemoglobin a1c'],
    displayPriority: 70,
  },
  {
    code: 'INR',
    label: 'INR',
    inputType: 'LAB',
    valueShape: 'NUMERIC',
    unit: null,
    aliases: ['inr', 'international normalized ratio'],
    displayPriority: 80,
  },
  {
    code: 'PSA',
    label: 'PSA',
    inputType: 'LAB',
    valueShape: 'NUMERIC',
    unit: 'ng/mL',
    aliases: ['psa', 'prostate specific antigen'],
    displayPriority: 90,
  },
  {
    code: 'PREGNANCY_ONGOING',
    label: 'Pregnancy ongoing?',
    inputType: 'PATIENT_CONTEXT',
    valueShape: 'YES_NO',
    unit: null,
    aliases: ['pregnant', 'pregnancy'],
    displayPriority: 200,
  },
  {
    code: 'GESTATIONAL_AGE',
    label: 'Gestational age',
    inputType: 'PATIENT_CONTEXT',
    valueShape: 'NUMBER',
    unit: 'weeks',
    aliases: ['gestational age', 'ga'],
    displayPriority: 210,
  },
  {
    code: 'VOMITING_FLUIDS',
    label: 'Any significant vomiting or unable to maintain fluids?',
    inputType: 'PATIENT_CONTEXT',
    valueShape: 'YES_NO',
    unit: null,
    aliases: [],
    displayPriority: 220,
  },
];

const BP_INGREDIENTS = [
  'amlodipine', 'norvasc', 'ramipril', 'altace', 'perindopril', 'coversyl', 'lisinopril',
  'enalapril', 'losartan', 'cozaar', 'valsartan', 'diovan', 'candesartan', 'irbesartan',
  'telmisartan', 'hydrochlorothiazide', 'hctz', 'chlorthalidone', 'indapamide', 'nifedipine',
  'bisoprolol', 'metoprolol', 'atenolol', 'olmesartan',
];

const ACEI_ARB = [
  'ramipril', 'altace', 'perindopril', 'coversyl', 'lisinopril', 'enalapril', 'quinapril',
  'losartan', 'cozaar', 'valsartan', 'diovan', 'candesartan', 'irbesartan', 'telmisartan',
  'olmesartan', 'sacubitril', 'entresto',
];

const EGFR_INGREDIENTS = [
  ...ACEI_ARB,
  'metformin', 'glucophage', 'empagliflozin', 'jardiance', 'dapagliflozin', 'forxiga',
  'canagliflozin', 'invokana', 'spironolactone', 'aldactone', 'finerenone',
];

const A1C_INGREDIENTS = [
  'metformin', 'glucophage', 'sitagliptin', 'januvia', 'linagliptin', 'empagliflozin',
  'dapagliflozin', 'canagliflozin', 'gliclazide', 'semaglutide', 'ozempic', 'liraglutide',
  'insulin', 'glargine', 'aspart',
];

const NVP_INGREDIENTS = ['diclectin', 'doxylamine', 'pyridoxine', 'diclegis'];

const GLP1_INGREDIENTS = [
  'semaglutide',
  'ozempic',
  'wegovy',
  'rybelsus',
  'liraglutide',
  'victoza',
  'saxenda',
  'dulaglutide',
  'trulicity',
  'tirzepatide',
  'mounjaro',
  'zepbound',
  'lixisenatide',
];

function ingredientRules(inputCode: string, keys: string[]): StarterMonitoringRule[] {
  return keys.map((ingredientKey) => ({
    inputCode,
    matchType: 'ingredient' as const,
    ingredientKey,
  }));
}

export const RENEW_STARTER_MONITORING_RULES: StarterMonitoringRule[] = [
  ...ingredientRules('BP', BP_INGREDIENTS),
  ...ingredientRules('EGFR', EGFR_INGREDIENTS),
  ...ingredientRules('POTASSIUM', ACEI_ARB),
  ...ingredientRules('TSH', ['levothyroxine', 'synthroid', 'eltroxin', 'euthyrox', 'liothyronine']),
  ...ingredientRules('A1C', A1C_INGREDIENTS),
  ...ingredientRules('INR', ['warfarin', 'coumadin']),
  ...ingredientRules('PSA', ['finasteride', 'proscar', 'dutasteride', 'avodart']),
  ...ingredientRules('HR', ['bisoprolol', 'metoprolol', 'atenolol', 'carvedilol', 'ivabradine', 'digoxin']),
  ...ingredientRules('PREGNANCY_ONGOING', NVP_INGREDIENTS),
  ...ingredientRules('VOMITING_FLUIDS', NVP_INGREDIENTS),
  ...ingredientRules('WEIGHT', GLP1_INGREDIENTS),
  ...ingredientRules('HEIGHT', GLP1_INGREDIENTS),
  ...ingredientRules('BMI', GLP1_INGREDIENTS),
  {
    inputCode: 'GESTATIONAL_AGE',
    matchType: 'ingredient',
    ingredientKey: 'diclectin',
    triggerSourceCode: 'PREGNANCY_ONGOING',
    triggerValue: 'yes',
  },
  {
    inputCode: 'GESTATIONAL_AGE',
    matchType: 'ingredient',
    ingredientKey: 'doxylamine',
    triggerSourceCode: 'PREGNANCY_ONGOING',
    triggerValue: 'yes',
  },
];

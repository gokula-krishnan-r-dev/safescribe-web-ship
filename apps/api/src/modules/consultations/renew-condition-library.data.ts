/**
 * Approved Renew condition library starter set.
 * Seeded into the database — never imported by the web UI as a hardcoded list.
 */

export type StarterMappingStrength = 'primary' | 'common' | 'possible' | 'rare';

export interface StarterCondition {
  code: string;
  displayName: string;
  category: string;
  description: string | null;
  defaultEffectivenessQuestion: string;
  commonForRenewal: boolean;
  displayPriority: number;
  aliases: string[];
  /** Canonical SNOMED CT concept id for governed Approved Indications bridging. */
  snomedConceptId: string | null;
}

export interface StarterIndicationMap {
  ingredientKey: string;
  conditionCode: string;
  mappingStrength: StarterMappingStrength;
  autoGroupAllowed: boolean;
  alwaysRequireConfirmation: boolean;
  rankingWeight: number;
}

const WEIGHT: Record<StarterMappingStrength, number> = {
  primary: 100,
  common: 70,
  possible: 40,
  rare: 15,
};

const CONDITION_DESCRIPTIONS: Record<string, string> = {
  HYPERTENSION: 'High blood pressure',
  DYSLIPIDEMIA: 'Cholesterol management and cardiovascular prevention',
  T2DM: 'Type 2 diabetes mellitus',
  T1DM: 'Type 1 diabetes mellitus',
  HYPOTHYROIDISM: 'Underactive thyroid',
  HYPERTHYROIDISM: 'Overactive thyroid',
  GERD: 'Gastroesophageal reflux disease',
  GI_PROTECTION: 'Peptic ulcer disease and gastrointestinal protection',
  AF: 'Atrial fibrillation',
  VTE: 'Treatment or prevention of venous thromboembolism',
  CAD: 'Coronary artery disease',
  POST_MI: 'Secondary prevention after myocardial infarction',
  HF: 'Heart failure',
  CKD: 'Chronic kidney disease',
  ASTHMA: 'Asthma',
  COPD: 'Chronic obstructive pulmonary disease',
  DEPRESSION: 'Depressive disorder',
  ANXIETY: 'Anxiety disorder',
  NEUROPATHIC_PAIN: 'Nerve-related pain',
  CHRONIC_PAIN: 'Persistent pain',
  SEIZURE: 'Seizure disorder / epilepsy',
  MIGRAINE: 'Migraine prevention',
  GOUT: 'Gout prevention',
  OSTEOPOROSIS: 'Osteoporosis',
  BPH: 'Benign prostatic hyperplasia',
  OAB: 'Overactive bladder',
  CONSTIPATION: 'Constipation',
  ACUTE_OTITIS_MEDIA: 'Acute otitis media',
  PHARYNGITIS: 'Pharyngitis / tonsillitis',
  ACUTE_SINUSITIS: 'Acute bacterial sinusitis',
  UTI: 'Urinary tract infection',
  ACUTE_BRONCHITIS: 'Acute bronchitis',
  COMMUNITY_PNEUMONIA: 'Community-acquired pneumonia',
  SKIN_SOFT_TISSUE: 'Skin and soft tissue infection',
  DENTAL_INFECTION: 'Dental / odontogenic infection',
  BACTERIAL_INFECTION: 'Bacterial infection (unspecified)',
};

/** Well-known SNOMED CT disorder/finding concept ids for starter conditions. */
const CONDITION_SNOMED: Record<string, string> = {
  HYPERTENSION: '38341003',
  DYSLIPIDEMIA: '370992007',
  T2DM: '44054006',
  T1DM: '46635009',
  HYPOTHYROIDISM: '40930008',
  HYPERTHYROIDISM: '34486009',
  GERD: '235595009',
  GI_PROTECTION: '13200003',
  AF: '49436004',
  VTE: '128053003',
  CAD: '53741008',
  POST_MI: '399211009',
  HF: '84114007',
  CKD: '709044004',
  ASTHMA: '195967001',
  COPD: '13645005',
  DEPRESSION: '35489007',
  ANXIETY: '197480006',
  NEUROPATHIC_PAIN: '386033004',
  CHRONIC_PAIN: '82423001',
  SEIZURE: '84757009',
  MIGRAINE: '37796009',
  GOUT: '90560007',
  OSTEOPOROSIS: '64859006',
  BPH: '266569009',
  OAB: '78615007',
  CONSTIPATION: '14760008',
  ACUTE_OTITIS_MEDIA: '3110003',
  PHARYNGITIS: '405737000',
  ACUTE_SINUSITIS: '15805002',
  UTI: '68566005',
  ACUTE_BRONCHITIS: '10509002',
  COMMUNITY_PNEUMONIA: '385093006',
  SKIN_SOFT_TISSUE: '128045001',
  DENTAL_INFECTION: '109728009',
  BACTERIAL_INFECTION: '87628006',
};

function cond(
  code: string,
  displayName: string,
  category: string,
  question: string,
  priority: number,
  aliases: string[],
  commonForRenewal = true,
): StarterCondition {
  return {
    code,
    displayName,
    category,
    description: CONDITION_DESCRIPTIONS[code] ?? null,
    defaultEffectivenessQuestion: question,
    commonForRenewal,
    displayPriority: priority,
    aliases,
    snomedConceptId: CONDITION_SNOMED[code] ?? null,
  };
}

function maps(
  conditionCode: string,
  ingredients: string[],
  strength: StarterMappingStrength,
  opts: { auto?: boolean; confirm?: boolean } = {},
): StarterIndicationMap[] {
  const autoGroupAllowed = Boolean(opts.auto);
  const alwaysRequireConfirmation = Boolean(opts.confirm);
  return ingredients.map((ingredientKey) => ({
    ingredientKey,
    conditionCode,
    mappingStrength: strength,
    autoGroupAllowed,
    alwaysRequireConfirmation,
    rankingWeight: WEIGHT[strength],
  }));
}

export const RENEW_STARTER_CONDITIONS: StarterCondition[] = [
  cond('HYPERTENSION', 'Hypertension', 'cardiovascular', 'BP generally controlled / stable?', 10, [
    'HTN',
    'high blood pressure',
    'high bp',
    'elevated blood pressure',
  ]),
  cond(
    'DYSLIPIDEMIA',
    'Dyslipidemia / CV prevention',
    'cardiovascular',
    'Lipids / cardiovascular prevention stable?',
    20,
    ['high cholesterol', 'hyperlipidemia', 'statin therapy', 'cv prevention', 'cholesterol'],
  ),
  cond('T2DM', 'Type 2 diabetes', 'endocrine', 'Diabetes control generally stable?', 30, [
    'T2DM',
    'type II diabetes',
    'niddm',
    'diabetes mellitus type 2',
    'diabetes',
  ]),
  cond('T1DM', 'Type 1 diabetes', 'endocrine', 'Diabetes control generally stable?', 40, [
    'T1DM',
    'type I diabetes',
    'iddm',
  ]),
  cond('HYPOTHYROIDISM', 'Hypothyroidism', 'endocrine', 'Condition / symptoms stable?', 50, [
    'underactive thyroid',
    'low thyroid',
    'hashimoto',
  ]),
  cond('HYPERTHYROIDISM', 'Hyperthyroidism', 'endocrine', 'Condition / symptoms stable?', 55, [
    'overactive thyroid',
    'graves',
  ]),
  cond('GERD', 'GERD', 'gastrointestinal', 'Symptoms adequately controlled?', 60, [
    'acid reflux',
    'heartburn',
    'reflux',
    'gord',
    'gastroesophageal reflux',
  ]),
  cond(
    'GI_PROTECTION',
    'Peptic ulcer / GI protection',
    'gastrointestinal',
    'GI symptoms adequately controlled?',
    65,
    ['ulcer', 'gi protection', 'nsaid protection', 'pud'],
  ),
  cond('AF', 'Atrial fibrillation', 'cardiovascular', 'Condition / rate or rhythm stable?', 70, [
    'afib',
    'a fib',
    'atrial fib',
    'AF',
  ]),
  cond(
    'VTE',
    'Venous thromboembolism treatment / prevention',
    'cardiovascular',
    'Condition stable / no new clotting concerns?',
    80,
    ['DVT', 'PE', 'blood clot', 'anticoagulation', 'vte prophylaxis'],
  ),
  cond('CAD', 'Coronary artery disease', 'cardiovascular', 'Cardiac symptoms generally stable?', 90, [
    'ischemic heart disease',
    'IHD',
    'angina',
    'coronary disease',
  ]),
  cond(
    'POST_MI',
    'Post-MI secondary prevention',
    'cardiovascular',
    'Cardiac symptoms generally stable?',
    100,
    ['post mi', 'post-mi', 'after heart attack', 'nsteacs', 'acs'],
  ),
  cond('HF', 'Heart failure', 'cardiovascular', 'Symptoms generally stable?', 110, [
    'CHF',
    'congestive heart failure',
    'HFrEF',
    'HFpEF',
  ]),
  cond('CKD', 'Chronic kidney disease', 'renal', 'Condition generally stable?', 120, [
    'CKD',
    'renal impairment',
    'kidney disease',
    'CRF',
  ]),
  cond('ASTHMA', 'Asthma', 'respiratory', 'Symptoms adequately controlled?', 130, ['reactive airway']),
  cond('COPD', 'COPD', 'respiratory', 'Symptoms adequately controlled?', 140, [
    'emphysema',
    'chronic bronchitis',
  ]),
  cond('DEPRESSION', 'Depression', 'mental_health', 'Symptoms adequately controlled?', 150, [
    'MDD',
    'major depression',
    'depressive disorder',
  ]),
  cond('ANXIETY', 'Anxiety disorder', 'mental_health', 'Symptoms adequately controlled?', 160, [
    'GAD',
    'anxiety',
    'panic',
  ]),
  cond('NEUROPATHIC_PAIN', 'Neuropathic pain', 'pain', 'Pain adequately controlled?', 170, [
    'nerve pain',
    'neuropathy',
    'diabetic neuropathy',
    'neuralgia',
  ]),
  cond('CHRONIC_PAIN', 'Chronic pain', 'pain', 'Pain adequately controlled?', 180, [
    'pain',
    'osteoarthritis pain',
    'musculoskeletal pain',
  ]),
  cond('SEIZURE', 'Seizure disorder', 'neurology', 'Seizures generally controlled?', 190, [
    'epilepsy',
    'seizures',
    'anticonvulsant',
  ]),
  cond('MIGRAINE', 'Migraine prevention', 'neurology', 'Headaches adequately controlled?', 200, [
    'migraine',
    'headache prophylaxis',
  ]),
  cond('GOUT', 'Gout prevention', 'rheumatology', 'Gout generally controlled?', 210, [
    'gout',
    'hyperuricemia',
  ]),
  cond('OSTEOPOROSIS', 'Osteoporosis', 'musculoskeletal', 'Condition generally stable?', 220, [
    'bone density',
    'osteopenia',
  ]),
  cond('BPH', 'Benign prostatic hyperplasia', 'urology', 'Urinary symptoms adequately controlled?', 230, [
    'BPH',
    'enlarged prostate',
    'prostate',
  ]),
  cond('OAB', 'Overactive bladder', 'urology', 'Urinary symptoms adequately controlled?', 240, [
    'OAB',
    'incontinence',
    'urgency',
  ]),
  cond('CONSTIPATION', 'Constipation', 'gastrointestinal', 'Symptoms adequately controlled?', 250, [
    'chronic constipation',
    'bowel regularity',
  ]),
  cond(
    'ACUTE_OTITIS_MEDIA',
    'Acute otitis media',
    'infectious',
    'Infection resolving / symptoms improved?',
    260,
    ['otitis media', 'ear infection', 'middle ear infection', 'AOM'],
    false,
  ),
  cond(
    'PHARYNGITIS',
    'Pharyngitis / tonsillitis',
    'infectious',
    'Infection resolving / symptoms improved?',
    270,
    ['pharyngitis', 'tonsillitis', 'strep throat', 'sore throat infection'],
    false,
  ),
  cond(
    'ACUTE_SINUSITIS',
    'Acute bacterial sinusitis',
    'infectious',
    'Infection resolving / symptoms improved?',
    280,
    ['sinusitis', 'sinus infection', 'rhinosinusitis'],
    false,
  ),
  cond(
    'UTI',
    'Urinary tract infection',
    'infectious',
    'Infection resolving / symptoms improved?',
    290,
    ['UTI', 'cystitis', 'bladder infection', 'urinary infection'],
    false,
  ),
  cond(
    'ACUTE_BRONCHITIS',
    'Acute bronchitis',
    'infectious',
    'Infection resolving / symptoms improved?',
    300,
    ['bronchitis', 'chest infection', 'acute cough infection'],
    false,
  ),
  cond(
    'COMMUNITY_PNEUMONIA',
    'Community-acquired pneumonia',
    'infectious',
    'Infection resolving / symptoms improved?',
    310,
    ['pneumonia', 'CAP', 'lung infection'],
    false,
  ),
  cond(
    'SKIN_SOFT_TISSUE',
    'Skin and soft tissue infection',
    'infectious',
    'Infection resolving / symptoms improved?',
    320,
    ['cellulitis', 'skin infection', 'soft tissue infection', 'abscess'],
    false,
  ),
  cond(
    'DENTAL_INFECTION',
    'Dental / odontogenic infection',
    'infectious',
    'Infection resolving / symptoms improved?',
    330,
    ['dental infection', 'tooth infection', 'odontogenic', 'dental abscess'],
    false,
  ),
  cond(
    'BACTERIAL_INFECTION',
    'Bacterial infection (unspecified)',
    'infectious',
    'Infection resolving / symptoms improved?',
    340,
    ['bacterial infection', 'infection', 'antibiotic therapy'],
    false,
  ),
  cond('OTHER_CUSTOM', 'Other / custom', 'other', 'Therapy effective / condition stable?', 900, [
    'other',
    'off label',
    'unlisted',
  ]),
];

export const RENEW_STARTER_INDICATION_MAPS: StarterIndicationMap[] = [
  ...maps(
    'HYPERTENSION',
    [
      'amlodipine',
      'norvasc',
      'ramipril',
      'altace',
      'perindopril',
      'coversyl',
      'lisinopril',
      'enalapril',
      'quinapril',
      'fosinopril',
      'captopril',
      'losartan',
      'cozaar',
      'valsartan',
      'diovan',
      'candesartan',
      'atacand',
      'irbesartan',
      'avapro',
      'telmisartan',
      'micardis',
      'olmesartan',
      'hydrochlorothiazide',
      'hctz',
      'chlorthalidone',
      'indapamide',
      'lozide',
      'nifedipine',
      'adalat',
      'felodipine',
      'clonidine',
      'hydralazine',
    ],
    'primary',
    { auto: true },
  ),
  ...maps('HYPERTENSION', ['bisoprolol', 'metoprolol', 'atenolol', 'nebivolol', 'labetalol'], 'common', {
    confirm: true,
  }),
  ...maps('HYPERTENSION', ['spironolactone', 'furosemide', 'lasix', 'terazosin', 'doxazosin'], 'possible', {
    confirm: true,
  }),

  ...maps(
    'DYSLIPIDEMIA',
    [
      'rosuvastatin',
      'crestor',
      'atorvastatin',
      'lipitor',
      'simvastatin',
      'zocor',
      'pravastatin',
      'fluvastatin',
      'lovastatin',
      'ezetimibe',
      'ezetrol',
      'fenofibrate',
      'gemfibrozil',
    ],
    'primary',
    { auto: true },
  ),

  ...maps(
    'T2DM',
    [
      'metformin',
      'glucophage',
      'glumetza',
      'sitagliptin',
      'januvia',
      'linagliptin',
      'trajenta',
      'saxagliptin',
      'onglyza',
      'empagliflozin',
      'jardiance',
      'dapagliflozin',
      'forxiga',
      'canagliflozin',
      'invokana',
      'gliclazide',
      'diamicron',
      'glimepiride',
      'glyburide',
      'pioglitazone',
      'semaglutide',
      'ozempic',
      'rybelsus',
      'liraglutide',
      'victoza',
      'dulaglutide',
      'trulicity',
    ],
    'primary',
    { auto: true },
  ),
  ...maps(
    'T2DM',
    ['insulin', 'glargine', 'lantus', 'basaglar', 'toujeo', 'aspart', 'novorapid', 'lispro', 'humalog', 'detemir', 'levemir'],
    'common',
    { confirm: true },
  ),
  ...maps(
    'T1DM',
    ['insulin', 'glargine', 'lantus', 'basaglar', 'toujeo', 'aspart', 'novorapid', 'lispro', 'humalog', 'detemir', 'levemir'],
    'common',
    { confirm: true },
  ),

  ...maps('HYPOTHYROIDISM', ['levothyroxine', 'synthroid', 'eltroxin', 'euthyrox', 'liothyronine'], 'primary', {
    auto: true,
  }),
  ...maps('HYPERTHYROIDISM', ['methimazole', 'tapazole', 'propylthiouracil', 'ptu'], 'primary', { auto: true }),

  ...maps(
    'GERD',
    [
      'pantoprazole',
      'pantaloc',
      'tecta',
      'omeprazole',
      'losec',
      'esomeprazole',
      'nexium',
      'rabeprazole',
      'pariet',
      'lansoprazole',
      'prevacid',
      'dexlansoprazole',
      'dexilant',
      'famotidine',
      'pepcid',
    ],
    'common',
    { confirm: true },
  ),
  ...maps(
    'GI_PROTECTION',
    [
      'pantoprazole',
      'pantaloc',
      'tecta',
      'omeprazole',
      'esomeprazole',
      'rabeprazole',
      'lansoprazole',
      'dexlansoprazole',
    ],
    'possible',
    { confirm: true },
  ),

  ...maps(
    'AF',
    ['apixaban', 'eliquis', 'rivaroxaban', 'xarelto', 'dabigatran', 'pradaxa', 'edoxaban', 'lixiana', 'warfarin', 'coumadin'],
    'common',
    { confirm: true },
  ),
  ...maps('AF', ['amiodarone', 'flecainide', 'sotalol', 'digoxin', 'lanoxin'], 'common', { confirm: true }),
  ...maps(
    'VTE',
    ['apixaban', 'eliquis', 'rivaroxaban', 'xarelto', 'dabigatran', 'pradaxa', 'edoxaban', 'warfarin'],
    'common',
    { confirm: true },
  ),
  ...maps(
    'POST_MI',
    ['apixaban', 'eliquis', 'rivaroxaban', 'xarelto', 'clopidogrel', 'plavix', 'ticagrelor', 'brilinta', 'prasugrel'],
    'possible',
    { confirm: true },
  ),
  ...maps(
    'CAD',
    ['clopidogrel', 'plavix', 'ticagrelor', 'brilinta', 'isosorbide', 'nitroglycerin', 'ranolazine'],
    'common',
    { confirm: true },
  ),
  ...maps('CAD', ['bisoprolol', 'metoprolol', 'atenolol', 'carvedilol'], 'possible', { confirm: true }),

  ...maps(
    'HF',
    ['sacubitril', 'entresto', 'eplerenone', 'inspra', 'ivabradine', 'lancora', 'spironolactone', 'aldactone', 'furosemide', 'lasix', 'bumetanide'],
    'primary',
    { auto: true },
  ),
  ...maps('HF', ['bisoprolol', 'metoprolol', 'carvedilol', 'ramipril', 'candesartan', 'valsartan', 'dapagliflozin', 'empagliflozin'], 'possible', {
    confirm: true,
  }),

  ...maps('CKD', ['dapagliflozin', 'empagliflozin', 'finerenone', 'kerendia'], 'possible', { confirm: true }),

  ...maps(
    'ASTHMA',
    ['salbutamol', 'ventolin', 'fluticasone', 'flovent', 'budesonide', 'pulmicort', 'montelukast', 'singulair', 'salmeterol', 'formoterol', 'vilanterol', 'beclomethasone'],
    'primary',
    { auto: true },
  ),
  ...maps(
    'COPD',
    ['tiotropium', 'spiriva', 'umeclidinium', 'incruse', 'glycopyrronium', 'seebri', 'aclidinium', 'tudorza', 'ipratropium', 'atrovent'],
    'primary',
    { auto: true },
  ),
  ...maps('COPD', ['salbutamol', 'ventolin', 'fluticasone', 'budesonide', 'formoterol', 'vilanterol', 'salmeterol'], 'possible', {
    confirm: true,
  }),

  ...maps(
    'DEPRESSION',
    [
      'sertraline',
      'zoloft',
      'escitalopram',
      'cipralex',
      'citalopram',
      'celexa',
      'fluoxetine',
      'prozac',
      'paroxetine',
      'paxil',
      'venlafaxine',
      'effexor',
      'bupropion',
      'wellbutrin',
      'mirtazapine',
      'remeron',
      'vortioxetine',
      'trintellix',
    ],
    'primary',
    { auto: true },
  ),
  ...maps('DEPRESSION', ['duloxetine', 'cymbalta', 'amitriptyline'], 'common', { confirm: true }),
  ...maps(
    'ANXIETY',
    ['sertraline', 'escitalopram', 'citalopram', 'paroxetine', 'venlafaxine', 'buspirone', 'lorazepam', 'ativan', 'clonazepam', 'rivotril', 'alprazolam'],
    'common',
    { confirm: true },
  ),

  ...maps('NEUROPATHIC_PAIN', ['gabapentin', 'neurontin', 'pregabalin', 'lyrica'], 'common', { confirm: true }),
  ...maps('NEUROPATHIC_PAIN', ['duloxetine', 'cymbalta', 'amitriptyline', 'nortriptyline'], 'common', { confirm: true }),
  ...maps('SEIZURE', ['gabapentin', 'neurontin', 'pregabalin', 'lyrica'], 'possible', { confirm: true }),
  ...maps(
    'SEIZURE',
    ['levetiracetam', 'keppra', 'lamotrigine', 'lamictal', 'valproate', 'divalproex', 'epival', 'carbamazepine', 'tegretol', 'phenytoin', 'dilantin'],
    'primary',
    { auto: true },
  ),
  ...maps('SEIZURE', ['topiramate', 'topamax', 'clonazepam'], 'common', { confirm: true }),

  ...maps(
    'CHRONIC_PAIN',
    ['hydromorphone', 'dilaudid', 'morphine', 'oxycodone', 'oxyneo', 'tramadol', 'naproxen', 'celecoxib', 'celebrex', 'diclofenac', 'meloxicam'],
    'common',
    { confirm: true },
  ),

  ...maps('MIGRAINE', ['topiramate', 'topamax', 'propranolol', 'amitriptyline', 'nortriptyline', 'pizotifen'], 'common', {
    confirm: true,
  }),
  ...maps('HYPERTENSION', ['propranolol'], 'possible', { confirm: true }),

  ...maps('GOUT', ['allopurinol', 'zyloprim', 'febuxostat', 'uloric', 'colchicine'], 'primary', { auto: true }),
  ...maps('OSTEOPOROSIS', ['alendronate', 'fosamax', 'risedronate', 'actonel', 'zoledronic', 'aclasta', 'denosumab', 'prolia', 'raloxifene'], 'primary', {
    auto: true,
  }),
  ...maps('BPH', ['tamsulosin', 'flomax', 'finasteride', 'proscar', 'dutasteride', 'avodart', 'silodosin', 'rapaflo', 'alfuzosin'], 'primary', {
    auto: true,
  }),
  ...maps('OAB', ['oxybutynin', 'ditropan', 'solifenacin', 'vesicare', 'mirabegron', 'myrbetriq', 'tolterodine', 'detrol', 'fesoterodine'], 'primary', {
    auto: true,
  }),
  ...maps('CONSTIPATION', ['polyethylene', 'restoralax', 'peg', 'senna', 'senokot', 'bisacodyl', 'dulcolax', 'lactulose', 'linaclotide', 'constella'], 'primary', {
    auto: true,
  }),

  // Acute antibiotics — Adapt + Renew indication coverage (always confirm; multiple plausible uses)
  ...maps(
    'ACUTE_OTITIS_MEDIA',
    ['amoxicillin', 'amox', 'amoxil', 'novamoxin', 'clavulin', 'amoxicillin-clavulanate', 'amoxi-clav'],
    'common',
    { confirm: true },
  ),
  ...maps(
    'PHARYNGITIS',
    ['amoxicillin', 'amox', 'amoxil', 'novamoxin', 'penicillin', 'pen-vk', 'phenoxymethylpenicillin'],
    'common',
    { confirm: true },
  ),
  ...maps(
    'ACUTE_SINUSITIS',
    ['amoxicillin', 'amox', 'amoxil', 'novamoxin', 'clavulin', 'amoxicillin-clavulanate', 'amoxi-clav'],
    'common',
    { confirm: true },
  ),
  ...maps(
    'UTI',
    [
      'amoxicillin',
      'amox',
      'amoxil',
      'novamoxin',
      'nitrofurantoin',
      'macrobid',
      'macrodantin',
      'trimethoprim',
      'sulfamethoxazole',
      'septra',
      'bactrim',
      'ciprofloxacin',
      'cipro',
    ],
    'common',
    { confirm: true },
  ),
  ...maps(
    'ACUTE_BRONCHITIS',
    ['amoxicillin', 'amox', 'amoxil', 'novamoxin', 'azithromycin', 'zithromax', 'clarithromycin', 'biaxin'],
    'possible',
    { confirm: true },
  ),
  ...maps(
    'COMMUNITY_PNEUMONIA',
    [
      'amoxicillin',
      'amox',
      'amoxil',
      'novamoxin',
      'clavulin',
      'amoxicillin-clavulanate',
      'azithromycin',
      'zithromax',
      'clarithromycin',
      'biaxin',
      'levofloxacin',
      'moxifloxacin',
    ],
    'common',
    { confirm: true },
  ),
  ...maps(
    'SKIN_SOFT_TISSUE',
    [
      'amoxicillin',
      'amox',
      'amoxil',
      'novamoxin',
      'clavulin',
      'amoxicillin-clavulanate',
      'cephalexin',
      'keflex',
      'cloxacillin',
      'clindamycin',
    ],
    'common',
    { confirm: true },
  ),
  ...maps(
    'DENTAL_INFECTION',
    ['amoxicillin', 'amox', 'amoxil', 'novamoxin', 'clavulin', 'amoxicillin-clavulanate', 'clindamycin', 'metronidazole', 'flagyl'],
    'common',
    { confirm: true },
  ),
  ...maps(
    'BACTERIAL_INFECTION',
    ['amoxicillin', 'amox', 'amoxil', 'novamoxin', 'clavulin', 'amoxicillin-clavulanate', 'amoxi-clav'],
    'possible',
    { confirm: true },
  ),
];

export function normalizeConditionAlias(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[-_/]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s.+]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

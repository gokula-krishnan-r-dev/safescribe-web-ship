/**
 * Bootstrap class membership for Renew workflow targeting.
 * Runtime prefers published clinical value sets / drug-class taxonomy.
 * These aliases fill gaps until those sets include the spreadsheet CLASS ids.
 * They do not encode safety thresholds.
 */

export const RENEW_CLASS_INGREDIENT_ALIASES: Record<string, string[]> = {
  ACE_INHIBITOR: [
    'ramipril',
    'perindopril',
    'lisinopril',
    'enalapril',
    'quinapril',
    'captopril',
    'trandolapril',
    'fosinopril',
    'benazepril',
    'cilazapril',
    'altace',
    'coversyl',
    'vasotec',
    'prinivil',
    'zestril',
  ],
  ARB: [
    'losartan',
    'valsartan',
    'candesartan',
    'irbesartan',
    'telmisartan',
    'olmesartan',
    'candesartan',
    'cozaar',
    'diovan',
  ],
  STATIN: ['atorvastatin', 'rosuvastatin', 'simvastatin', 'pravastatin', 'fluvastatin', 'lovastatin'],
  SGLT2_INHIBITOR: ['empagliflozin', 'dapagliflozin', 'canagliflozin', 'ertugliflozin', 'jardiance', 'forxiga', 'invokana'],
  GLP1_RECEPTOR_AGONIST: [
    'semaglutide',
    'liraglutide',
    'dulaglutide',
    'tirzepatide',
    'ozempic',
    'wegovy',
    'trulicity',
    'victoza',
    'mounjaro',
  ],
  SULFONYLUREA: ['gliclazide', 'glimepiride', 'glyburide', 'glibenclamide', 'glipizide'],
  BETA_BLOCKER: ['bisoprolol', 'metoprolol', 'atenolol', 'carvedilol', 'propranolol', 'nebivolol', 'labetalol'],
  DIURETIC: [
    'furosemide',
    'hydrochlorothiazide',
    'hctz',
    'chlorthalidone',
    'indapamide',
    'spironolactone',
    'eplerenone',
    'bumetanide',
    'metolazone',
  ],
  ORAL_ANTIPLATELET: ['clopidogrel', 'prasugrel', 'ticagrelor', 'aspirin', 'asa'],
  BISPHOSPHONATE: ['alendronate', 'risedronate', 'zoledronic', 'ibandronate'],
  ALPHA1_BLOCKER: ['tamsulosin', 'alfuzosin', 'silodosin', 'doxazosin', 'terazosin'],
  CHOLINESTERASE_INHIBITOR: ['donepezil', 'rivastigmine', 'galantamine'],
  ANTIPSYCHOTIC: [
    'quetiapine',
    'olanzapine',
    'risperidone',
    'aripiprazole',
    'clozapine',
    'haloperidol',
    'lurasidone',
    'ziprasidone',
  ],
  DOPAMINE_AGONIST: ['pramipexole', 'ropinirole', 'rotigotine', 'bromocriptine'],
  NSAID: ['ibuprofen', 'naproxen', 'diclofenac', 'celecoxib', 'indomethacin', 'ketorolac', 'meloxicam'],
  BENZODIAZEPINE: ['lorazepam', 'diazepam', 'clonazepam', 'oxazepam', 'alprazolam', 'temazepam'],
  Z_DRUG: ['zopiclone', 'zolpidem', 'zaleplon', 'eszopiclone'],
  ESTROGEN_CONTAINING_THERAPY: ['estradiol', 'estrogen', 'ethinylestradiol', 'conjugated estrogen', 'premarin'],
  PPI: ['omeprazole', 'pantoprazole', 'esomeprazole', 'lansoprazole', 'rabeprazole', 'dexlansoprazole'],
  DOAC: ['apixaban', 'rivaroxaban', 'dabigatran', 'edoxaban', 'eliquis', 'xarelto', 'pradaxa'],
};

export function classAliasMembers(classId: string): string[] {
  return RENEW_CLASS_INGREDIENT_ALIASES[classId.trim().toUpperCase()] ?? [];
}

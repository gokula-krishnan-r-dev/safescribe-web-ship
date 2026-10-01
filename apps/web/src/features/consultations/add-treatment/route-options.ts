/**
 * Administration routes from the clinical SIG picker (alphabetical).
 * Wording matches the production screenshot, including source-system spellings.
 */
export const ROUTE_OPTIONS = [
  'Apply Externally',
  'Buccal',
  'Dental',
  'Endotrachial Tube',
  'Epidural',
  'Gastrostomy Tube',
  'GU Irrigant',
  'Hemodialysis',
  'Immerse',
  'Implantation',
  'Inhalation',
  'Injection',
  'Intra-arterial',
  'Intra-articularl',
  'Intra-cavernosal',
  'Intraauterine',
  'Intrabursal',
  'Intracardiac',
  'Intracervical',
  'Intradermal',
  'Intrahepatic Artery',
  'Intramuscular',
  'Intranasal',
  'Intraocular',
  'Intraperitoneal',
  'Intrapleural',
  'Intrasynovial',
  'Intrathecal',
  'Intrauterine',
  'Intravenous',
  'Intravesical',
  'Irrigation',
  'Mouth/Throat',
  'Mucous Membrane',
  'Nasal',
  'Nasal Prongs',
  'Nasogastric',
  'Nasotracheal Tube',
  'Ophthalmic',
  'Oral',
  'Other/Miscellaneous',
  'Otic',
  'Perfusion',
  'Rebreather Mask',
  'Rectal',
  'Soaked Dressing',
  'Subcutaneous',
  'Sublingual',
  'Topical',
  'Tracheostomy',
  'Transdermal',
  'Translingual',
  'Unidentified',
  'Urethral',
  'Vaginal',
  'Ventimask',
  'Wound',
] as const;

export type RouteOption = (typeof ROUTE_OPTIONS)[number];

interface RouteSelectOption {
  value: string;
  label: string;
  keywords?: string;
}

const SEARCH_KEYWORDS: Record<string, string> = {
  'Apply Externally': 'external topical skin apply',
  Buccal: 'cheek gum buccal sl',
  Dental: 'tooth teeth oral dental',
  'Endotrachial Tube': 'endotracheal ett et tube airway',
  Epidural: 'epidural spine anaesthetic',
  'Gastrostomy Tube': 'g-tube gtube peg feeding tube',
  'GU Irrigant': 'genitourinary irrigant bladder irrigation',
  Hemodialysis: 'dialysis hd',
  Inhalation: 'inhaled inhale inhaler neb nebulizer po inhalation',
  Injection: 'inject injectable shot parenteral',
  'Intra-arterial': 'arterial ia',
  'Intra-articularl': 'intra-articular articular joint ia',
  'Intra-cavernosal': 'intracavernosal cavernosa',
  Intraauterine: 'intrauterine iud uterus',
  Intrabursal: 'bursa bursal',
  Intracardiac: 'cardiac heart ic',
  Intracervical: 'cervix cervical',
  Intradermal: 'id skin intradermal',
  'Intrahepatic Artery': 'hepatic liver artery',
  Intramuscular: 'im intramuscular muscle',
  Intranasal: 'nose nasal in',
  Intraocular: 'eye intraocular',
  Intraperitoneal: 'ip peritoneal abdomen',
  Intrapleural: 'pleural chest lung',
  Intrasynovial: 'synovial joint',
  Intrathecal: 'it spinal csf thecal',
  Intrauterine: 'uterus iud intrauterine',
  Intravenous: 'iv intravenous vein',
  Intravesical: 'bladder vesical',
  Irrigation: 'irrigate wash',
  'Mouth/Throat': 'mouth throat oropharyngeal po',
  'Mucous Membrane': 'mucosa mucous',
  Nasal: 'nose nasal in',
  'Nasal Prongs': 'np cannula oxygen prongs',
  Nasogastric: 'ng ngt feeding tube',
  'Nasotracheal Tube': 'nasotrachial nt tube airway',
  Ophthalmic: 'eye opth drops ophthalmic',
  Oral: 'po by mouth oral swallow',
  'Other/Miscellaneous': 'other misc miscellaneous custom',
  Otic: 'ear aural otic',
  Perfusion: 'perfusion pump',
  'Rebreather Mask': 'oxygen mask nrb rebreather',
  Rectal: 'pr per rectum suppository rectal',
  'Soaked Dressing': 'dressing wound soak',
  Subcutaneous: 'sc sq subq subcutaneous',
  Sublingual: 'sl under tongue sublingual',
  Topical: 'skin cream ointment gel topical',
  Tracheostomy: 'trach tracheostomy stoma',
  Transdermal: 'patch td transdermal',
  Translingual: 'tongue translingual',
  Unidentified: 'unknown unidentified',
  Urethral: 'urethra urethral',
  Vaginal: 'pv per vagina vaginal',
  Ventimask: 'venti venturi oxygen mask',
  Wound: 'wound dressing topical',
};

function toSelectOption(value: string): RouteSelectOption {
  return {
    value,
    label: value,
    keywords: SEARCH_KEYWORDS[value],
  };
}

export const ROUTE_SELECT_OPTIONS: RouteSelectOption[] = ROUTE_OPTIONS.map(toSelectOption);

function normalizeRouteKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/[./]/g, ' ')
    .replace(/\s+/g, ' ');
}

const ROUTE_INDEX: Map<string, string> = (() => {
  const index = new Map<string, string>();
  const set = (key: string, canonical: string) => {
    const normalized = normalizeRouteKey(key);
    if (normalized && !index.has(normalized)) index.set(normalized, canonical);
  };

  for (const value of ROUTE_OPTIONS) {
    set(value, value);
  }

  const aliases: Array<[string, string]> = [
    ['inhaled', 'Inhalation'],
    ['inhale', 'Inhalation'],
    ['po', 'Oral'],
    ['by mouth', 'Oral'],
    ['im', 'Intramuscular'],
    ['iv', 'Intravenous'],
    ['sc', 'Subcutaneous'],
    ['sq', 'Subcutaneous'],
    ['subq', 'Subcutaneous'],
    ['sl', 'Sublingual'],
    ['pr', 'Rectal'],
    ['pv', 'Vaginal'],
    ['id', 'Intradermal'],
    ['ng', 'Nasogastric'],
    ['td', 'Transdermal'],
    ['in', 'Intranasal'],
    ['nasotrachial tube', 'Nasotracheal Tube'],
    ['nasotrachial', 'Nasotracheal Tube'],
    ['endotracheal tube', 'Endotrachial Tube'],
    ['endotracheal', 'Endotrachial Tube'],
    ['intra-articular', 'Intra-articularl'],
    ['intra articular', 'Intra-articularl'],
    ['intracavernosal', 'Intra-cavernosal'],
    ['intracavernosa', 'Intra-cavernosal'],
    ['other', 'Other/Miscellaneous'],
    ['miscellaneous', 'Other/Miscellaneous'],
  ];
  for (const [alias, canonical] of aliases) {
    set(alias, canonical);
  }
  return index;
})();

export function findRouteOption(raw?: string | null): string | undefined {
  const value = (raw ?? '').trim();
  if (!value) return undefined;
  return ROUTE_INDEX.get(normalizeRouteKey(value));
}

/** Canonical catalog value, keeping unknown custom text intact. */
export function resolveRouteValue(raw?: string | null): string {
  const value = (raw ?? '').trim();
  if (!value) return '';
  return findRouteOption(value) ?? value;
}

export function routeSelectOptions(current?: string): RouteSelectOption[] {
  const extra = current?.trim();
  if (!extra) return ROUTE_SELECT_OPTIONS;
  const resolved = findRouteOption(extra);
  if (resolved && ROUTE_SELECT_OPTIONS.some((option) => option.value === resolved)) {
    return ROUTE_SELECT_OPTIONS;
  }
  if (ROUTE_SELECT_OPTIONS.some((option) => option.value === extra)) return ROUTE_SELECT_OPTIONS;
  return [toSelectOption(extra), ...ROUTE_SELECT_OPTIONS];
}

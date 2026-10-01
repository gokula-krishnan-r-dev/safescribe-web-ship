/**
 * Pathway Matching / Routing metadata.
 *
 * Used by Clinical Admin (Overview) and the pharmacist consultation router.
 * AI suggests pathways only — it does not diagnose or decide eligibility.
 */

export const PATHWAY_ROUTING_LIMITS = {
  aliasMax: 20,
  presentingComplaintMax: 30,
  contextTermMax: 20,
  tagMaxLength: 80,
  descriptionMaxLength: 1000,
} as const;

export type PathwayMatchLevel = 'high' | 'moderate' | 'low';

export interface PathwayRoutingMetadata {
  aliases: string[];
  presentingComplaints: string[];
  contextTerms: string[];
  description: string;
}

export interface PathwayRoutingSuggestion extends PathwayRoutingMetadata {
  /** Tags newly suggested by AI (not yet saved) — UI highlight only. */
  suggestedKeys?: string[];
}

export interface PathwayRoutingCandidateInput {
  id: string;
  name: string;
  condition: string | null;
  category?: string | null;
  description?: string | null;
  aiSummary?: string | null;
  province?: string | null;
  provinceAvailability?: string | null;
  routingAliases?: string[] | null;
  routingPresentingComplaints?: string[] | null;
  routingContextTerms?: string[] | null;
  routingDescription?: string | null;
}

export interface LocalPathwayMatch {
  pathwayId: string;
  score: number;
  matchLevel: PathwayMatchLevel;
  matchedTerms: string[];
  reason: string;
}

/** Product thresholds — pathway relevance only, not diagnostic probability. */
export const PATHWAY_MATCH_THRESHOLDS = {
  high: 0.75,
  moderate: 0.5,
} as const;

const EMPTY_ROUTING: PathwayRoutingMetadata = {
  aliases: [],
  presentingComplaints: [],
  contextTerms: [],
  description: '',
};

export function emptyPathwayRouting(): PathwayRoutingMetadata {
  return { ...EMPTY_ROUTING, aliases: [], presentingComplaints: [], contextTerms: [] };
}

/** Trim, drop empties, case-insensitive dedupe; preserve first-seen display casing. */
export function normalizeRoutingTags(
  tags: unknown,
  maxItems: number,
  maxLength: number = PATHWAY_ROUTING_LIMITS.tagMaxLength,
): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    if (typeof raw !== 'string' && typeof raw !== 'number') continue;
    const trimmed = String(raw).trim().replace(/\s+/g, ' ');
    if (!trimmed) continue;
    const clipped = trimmed.slice(0, maxLength);
    const key = clipped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clipped);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function normalizeRoutingDescription(
  value: unknown,
  maxLength = PATHWAY_ROUTING_LIMITS.descriptionMaxLength,
): string {
  if (value == null) return '';
  const text = String(value).trim().replace(/\s+/g, ' ');
  return text.slice(0, maxLength);
}

export function normalizePathwayRouting(
  input: Partial<PathwayRoutingMetadata> | null | undefined,
): PathwayRoutingMetadata {
  return {
    aliases: normalizeRoutingTags(input?.aliases, PATHWAY_ROUTING_LIMITS.aliasMax),
    presentingComplaints: normalizeRoutingTags(
      input?.presentingComplaints,
      PATHWAY_ROUTING_LIMITS.presentingComplaintMax,
    ),
    contextTerms: normalizeRoutingTags(
      input?.contextTerms,
      PATHWAY_ROUTING_LIMITS.contextTermMax,
    ),
    description: normalizeRoutingDescription(input?.description),
  };
}

/**
 * Merge AI suggestions into existing approved terms.
 * Never deletes existing values; only appends non-duplicates.
 */
export function mergeRoutingSuggestions(
  existing: Partial<PathwayRoutingMetadata> | null | undefined,
  suggested: Partial<PathwayRoutingMetadata> | null | undefined,
): PathwayRoutingSuggestion {
  const base = normalizePathwayRouting(existing);
  const next = normalizePathwayRouting({
    aliases: [...base.aliases, ...(suggested?.aliases ?? [])],
    presentingComplaints: [
      ...base.presentingComplaints,
      ...(suggested?.presentingComplaints ?? []),
    ],
    contextTerms: [...base.contextTerms, ...(suggested?.contextTerms ?? [])],
    description: suggested?.description?.trim()
      ? normalizeRoutingDescription(suggested.description)
      : base.description,
  });

  const existingKeys = new Set(
    [
      ...base.aliases,
      ...base.presentingComplaints,
      ...base.contextTerms,
    ].map((t) => t.toLowerCase()),
  );

  const suggestedKeys = [
    ...next.aliases,
    ...next.presentingComplaints,
    ...next.contextTerms,
  ]
    .filter((t) => !existingKeys.has(t.toLowerCase()))
    .map((t) => t.toLowerCase());

  // If description changed from empty → suggested, mark it
  if (!base.description && next.description) {
    suggestedKeys.push('__description__');
  }

  return { ...next, suggestedKeys };
}

/** Compact text representation for AI / local retrieval. */
export function buildPathwayRoutingRepresentation(p: PathwayRoutingCandidateInput): string {
  const aliases = (p.routingAliases ?? []).filter(Boolean);
  const complaints = (p.routingPresentingComplaints ?? []).filter(Boolean);
  const context = (p.routingContextTerms ?? []).filter(Boolean);
  const routingDesc = (p.routingDescription ?? '').trim();
  const clinical = (p.aiSummary ?? p.description ?? '').trim();

  const parts = [
    [p.condition, p.name].filter(Boolean).join(' / ') || p.name,
    aliases.length ? `Aliases: ${aliases.join(', ')}.` : '',
    complaints.length ? `Common presentations: ${complaints.join(', ')}.` : '',
    context.length ? `Context: ${context.join(', ')}.` : '',
    routingDesc ? `Description: ${routingDesc}` : '',
    clinical && clinical !== routingDesc ? `Clinical summary: ${clinical.slice(0, 400)}` : '',
  ].filter(Boolean);

  return parts.join('\n');
}

export function parseProvinceCodes(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return [
    ...new Set(
      raw
        .split(/[,|;/\s]+/)
        .map((c) => c.trim().toUpperCase())
        .filter((c) => /^[A-Z]{2}$/.test(c) || c === 'ALL'),
    ),
  ];
}

/** Map full Canadian province/territory names (and common aliases) to ISO-ish codes. */
const PROVINCE_NAME_TO_CODE: Record<string, string> = {
  AB: 'AB',
  ALBERTA: 'AB',
  BC: 'BC',
  'BRITISH COLUMBIA': 'BC',
  MB: 'MB',
  MANITOBA: 'MB',
  NB: 'NB',
  'NEW BRUNSWICK': 'NB',
  NL: 'NL',
  'NEWFOUNDLAND AND LABRADOR': 'NL',
  NEWFOUNDLAND: 'NL',
  LABRADOR: 'NL',
  NS: 'NS',
  'NOVA SCOTIA': 'NS',
  NT: 'NT',
  'NORTHWEST TERRITORIES': 'NT',
  NU: 'NU',
  NUNAVUT: 'NU',
  ON: 'ON',
  ONTARIO: 'ON',
  PE: 'PE',
  'PRINCE EDWARD ISLAND': 'PE',
  PEI: 'PE',
  QC: 'QC',
  QUEBEC: 'QC',
  QUÉBEC: 'QC',
  SK: 'SK',
  SASKATCHEWAN: 'SK',
  YT: 'YT',
  YUKON: 'YT',
  'YUKON TERRITORY': 'YT',
};

/**
 * Normalize a province value from demographics, address, or pathway metadata
 * to a 2-letter code. Accepts "AB", "Alberta", "alberta", etc.
 */
export function normalizeProvinceCode(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const cleaned = value
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  if (/^[A-Z]{2}$/.test(cleaned)) return cleaned;
  return PROVINCE_NAME_TO_CODE[cleaned] ?? null;
}

/** Province applicability is a hard filter, not a ranking signal. */
export function isPathwayEnabledForProvince(
  pathway: Pick<PathwayRoutingCandidateInput, 'province' | 'provinceAvailability'>,
  consultationProvince: string | null | undefined,
): boolean {
  if (!consultationProvince?.trim()) return true; // fail-open when province unknown
  const code = normalizeProvinceCode(consultationProvince);
  if (!code) return true; // unrecognized label — fail-open rather than hide all pathways
  const codes = parseProvinceCodes(pathway.provinceAvailability || pathway.province);
  if (!codes.length) return true;
  if (codes.includes('ALL')) return true;
  return codes.includes(code);
}

export function matchLevelFromScore(score: number): PathwayMatchLevel {
  if (score >= PATHWAY_MATCH_THRESHOLDS.high) return 'high';
  if (score >= PATHWAY_MATCH_THRESHOLDS.moderate) return 'moderate';
  return 'low';
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
}

/**
 * Fast local ranking using approved routing metadata.
 * Prefer phrase matches in presenting complaints / aliases over loose name tokens.
 */
export function rankPathwaysByRoutingMetadata(
  pathways: PathwayRoutingCandidateInput[],
  clinicalText: string,
  options?: { maxResults?: number; minScore?: number },
): LocalPathwayMatch[] {
  const haystack = clinicalText.toLowerCase().trim();
  if (!haystack) return [];

  const hayTokens = new Set(tokenize(haystack));
  const maxResults = options?.maxResults ?? 3;
  const minScore = options?.minScore ?? 0.35;
  const scored: LocalPathwayMatch[] = [];

  for (const p of pathways) {
    let points = 0;
    const matched: string[] = [];

    const phraseHits = (terms: string[], weight: number) => {
      for (const term of terms) {
        const t = term.trim().toLowerCase();
        if (!t) continue;
        if (haystack.includes(t)) {
          points += weight;
          matched.push(term);
          continue;
        }
        // Multi-word: require all significant tokens present
        const parts = tokenize(t);
        if (parts.length > 1 && parts.every((tok) => hayTokens.has(tok) || haystack.includes(tok))) {
          points += weight * 0.85;
          matched.push(term);
        }
      }
    };

    phraseHits(p.routingPresentingComplaints ?? [], 4);
    phraseHits(p.routingAliases ?? [], 3);
    phraseHits(p.routingContextTerms ?? [], 2);

    // Name / condition / routing description soft boost
    const softPhrases = [
      p.name,
      p.condition ?? '',
      p.routingDescription ?? '',
      p.category ?? '',
    ].filter(Boolean) as string[];
    for (const phrase of softPhrases) {
      const tokens = tokenize(phrase).slice(0, 8);
      const hits = tokens.filter((tok) => hayTokens.has(tok) || haystack.includes(tok));
      if (hits.length === 0) continue;
      const ratio = hits.length / Math.max(tokens.length, 1);
      points += 2 * ratio;
      if (ratio >= 0.4) matched.push(phrase.slice(0, 60));
    }

    if (matched.length === 0 || points < 3) continue;

    // Absolute scale: ~8 pts ≈ high (two presenting-complaint phrase hits)
    const score = Math.min(1, points / 8);
    if (score < minScore) continue;

    const uniqueMatched = [...new Set(matched.map((m) => m.trim()).filter(Boolean))].slice(0, 5);
    const top = uniqueMatched[0];
    scored.push({
      pathwayId: p.id,
      score,
      matchLevel: matchLevelFromScore(score),
      matchedTerms: uniqueMatched,
      reason: top
        ? `Presentation language includes “${top}”, which is consistent with this pathway.`
        : 'Consultation information is consistent with presentations covered by this pathway.',
    });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.pathwayId.localeCompare(b.pathwayId))
    .slice(0, maxResults);
}

/** Map IANA pharmacy timezone → likely Canadian province (fallback only). */
export function provinceFromTimezone(timezone: string | null | undefined): string | null {
  if (!timezone) return null;
  const map: Record<string, string> = {
    'America/Edmonton': 'AB',
    'America/Calgary': 'AB',
    'America/Vancouver': 'BC',
    'America/Whitehorse': 'YT',
    'America/Yellowknife': 'NT',
    'America/Iqaluit': 'NU',
    'America/Winnipeg': 'MB',
    'America/Regina': 'SK',
    'America/Toronto': 'ON',
    'America/Montreal': 'QC',
    'America/Halifax': 'NS',
    'America/Moncton': 'NB',
    'America/St_Johns': 'NL',
    'America/Glace_Bay': 'NS',
  };
  return map[timezone] ?? null;
}

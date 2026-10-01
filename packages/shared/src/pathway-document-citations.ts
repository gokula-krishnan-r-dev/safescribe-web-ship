export type PathwayDocumentCitation = {
  citationTitle: string;
  publicationYear?: number | null;
  edition?: string | null;
};

export function documentationCitationLine(
  ref: Pick<PathwayDocumentCitation, 'citationTitle' | 'publicationYear' | 'edition'>,
): string {
  const title = ref.citationTitle.trim();
  if (!title) return '';
  const year =
    typeof ref.publicationYear === 'number' && Number.isFinite(ref.publicationYear)
      ? String(ref.publicationYear)
      : ref.edition?.trim() || '';
  return year ? `${title} (${year})` : title;
}

function uniqueCitationLines(
  refs: Array<PathwayDocumentCitation | null | undefined>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ref of refs) {
    if (!ref) continue;
    const line = documentationCitationLine(ref);
    const key = line.toLowerCase();
    if (!line || seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

function joinCitationList(labels: string[]): string {
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asCitation(value: unknown): PathwayDocumentCitation | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const citationTitle = asString(item.citationTitle);
  if (!citationTitle) return null;
  return {
    citationTitle,
    publicationYear: typeof item.publicationYear === 'number' ? item.publicationYear : null,
    edition: asString(item.edition),
  };
}

/** Compact clinical-record chrome: pathway primary/secondary name+year only. */
export function formatPathwayDocumentChrome(input: {
  primary?: PathwayDocumentCitation | null;
  secondary?: PathwayDocumentCitation | null;
  pathwayLabel?: string | null;
  pathwayVersion?: string | null;
  lastReviewed?: string | null;
}): string | null {
  const citations = uniqueCitationLines([input.primary, input.secondary]);
  if (!citations.length) return null;
  const heading =
    citations.length === 1 ? 'Clinical resource consulted' : 'Clinical resources consulted';
  return `${heading}: ${joinCitationList(citations)}.`;
}

/** Drop legacy governance lines so older notes match the current chrome. */
export function stripClinicalPathwayChromeLine(text: string): string {
  return String(text ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .split(/\n+/)
    .map((line) =>
      line
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(
      (line) =>
        Boolean(line) &&
        !/^Clinical pathway:\s*/i.test(line) &&
        !/^Pathway last reviewed:\s*/i.test(line),
    )
    .join('\n\n')
    .trim();
}

export function formatPathwayDocumentChromeFromEvidenceSnapshot(
  snapshot: unknown,
  fallback?: {
    pathwayLabel?: string | null;
    pathwayVersion?: string | null;
    primary?: PathwayDocumentCitation | null;
    secondary?: PathwayDocumentCitation | null;
    lastReviewed?: string | null;
  },
): string | null {
  const item =
    snapshot && typeof snapshot === 'object' ? (snapshot as Record<string, unknown>) : null;
  const clinical =
    item?.clinicalReview && typeof item.clinicalReview === 'object'
      ? (item.clinicalReview as Record<string, unknown>)
      : {};
  return formatPathwayDocumentChrome({
    primary: asCitation(item?.primaryReference) ?? fallback?.primary ?? null,
    secondary: asCitation(item?.secondaryReference) ?? fallback?.secondary ?? null,
    pathwayLabel: asString(item?.displayName) || fallback?.pathwayLabel || null,
    pathwayVersion: asString(item?.pathwayVersion) || fallback?.pathwayVersion || null,
    lastReviewed: asString(clinical.lastReviewed) || fallback?.lastReviewed || null,
  });
}

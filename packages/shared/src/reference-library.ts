export const REFERENCE_LIBRARY_PAGE_SIZES = [25, 50, 100] as const;
export const REFERENCE_LIBRARY_DEFAULT_PAGE_SIZE = 25;

export function sanitizeLibrarySearch(value?: string | null, max = 120): string {
  if (!value) return '';
  return value
    .replace(/[%_*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function collapseWs(value?: string | null): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function evidenceReferenceStableKey(input: {
  citationTitle: string;
  organization?: string | null;
  publicationYear?: number | null;
}): string {
  return [
    collapseWs(input.citationTitle),
    collapseWs(input.organization),
    input.publicationYear != null && Number.isFinite(input.publicationYear)
      ? String(input.publicationYear)
      : '',
  ].join('|');
}

export function reviewerLibraryStableKey(input: {
  name: string;
  credentials?: string | null;
  organization?: string | null;
}): string {
  return [
    collapseWs(input.name),
    collapseWs(input.credentials),
    collapseWs(input.organization),
  ].join('|');
}

export function evidenceReferenceSearchText(input: {
  citationTitle?: string | null;
  organization?: string | null;
  edition?: string | null;
  publicationYear?: number | null;
  documentType?: string | null;
  jurisdiction?: string | null;
  doi?: string | null;
  url?: string | null;
}): string {
  return collapseWs(
    [
      input.citationTitle,
      input.organization,
      input.edition,
      input.publicationYear != null ? String(input.publicationYear) : '',
      input.documentType,
      input.jurisdiction,
      input.doi,
      input.url,
    ]
      .filter(Boolean)
      .join(' '),
  );
}

export function reviewerLibrarySearchText(input: {
  name?: string | null;
  credentials?: string | null;
  organization?: string | null;
  role?: string | null;
  reviewerType?: string | null;
}): string {
  return collapseWs(
    [input.name, input.credentials, input.organization, input.role, input.reviewerType]
      .filter(Boolean)
      .join(' '),
  );
}

import type { PathwayDocumentationReference } from './assessment-types';

export function documentationReferenceLine(
  ref: Pick<PathwayDocumentationReference, 'citationTitle' | 'publicationYear' | 'edition'>,
): string {
  const year =
    typeof ref.publicationYear === 'number' && Number.isFinite(ref.publicationYear)
      ? String(ref.publicationYear)
      : ref.edition?.trim() || '';
  return year ? `${ref.citationTitle} (${year})` : ref.citationTitle;
}

import {
  DOCUMENT_TYPE_LABELS,
  GOVERNANCE_STATUS_LABELS,
  REFERENCE_STATUS_LABELS,
  SECTION_FULL_LABELS,
  SECTION_LABELS,
  parsePathwayGovernance,
  usageBadgesFromMappings,
  type EvidenceDocumentType,
  type EvidenceReferenceStatus,
  type EvidenceSection,
  type GovernanceReviewStatus,
} from '@safescript/shared';
import type {
  ClinicalPathway,
  PathwayEvidenceMapping,
  PathwayGovernance,
} from '../types';

export function resolveGovernance(pathway: ClinicalPathway): PathwayGovernance {
  return parsePathwayGovernance(
    pathway.governance,
    pathway.primaryDocumentationReferenceId,
    pathway.secondaryDocumentationReferenceId,
  );
}

export function formatShortDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function documentTypeLabel(value?: string | null): string {
  if (!value) return '—';
  return DOCUMENT_TYPE_LABELS[value as EvidenceDocumentType] ?? value;
}

export function referenceStatusLabel(value?: string | null): string {
  if (!value) return REFERENCE_STATUS_LABELS.needs_review;
  return REFERENCE_STATUS_LABELS[value as EvidenceReferenceStatus] ?? value;
}

export function governanceStatusLabel(value?: string | null): string {
  if (!value) return GOVERNANCE_STATUS_LABELS.not_started;
  return GOVERNANCE_STATUS_LABELS[value as GovernanceReviewStatus] ?? value;
}

export function sectionLabel(section: string, full = false): string {
  if (full) {
    return SECTION_FULL_LABELS[section as EvidenceSection] ?? section;
  }
  return SECTION_LABELS[section as EvidenceSection] ?? section;
}

export function yearEditionLabel(ref: {
  edition?: string | null;
  publicationYear?: number | null;
}): string {
  if (ref.edition?.trim()) return ref.edition.trim();
  if (typeof ref.publicationYear === 'number') return String(ref.publicationYear);
  return '—';
}

export function mappingsForReference(
  pathway: ClinicalPathway,
  referenceId: string,
): PathwayEvidenceMapping[] {
  return (pathway.evidenceMappings ?? []).filter((m) => m.referenceId === referenceId);
}

export function usedInBadges(
  pathway: ClinicalPathway,
  referenceId: string,
): string[] {
  return usageBadgesFromMappings(mappingsForReference(pathway, referenceId));
}

export function targetLabel(
  pathway: ClinicalPathway,
  mapping: PathwayEvidenceMapping,
): string {
  const targetId = mapping.targetId?.trim();
  if (!targetId || mapping.mappingType === 'section') {
    return 'Section-wide';
  }
  if (mapping.mappingType === 'question') {
    const q = pathway.questions?.find((row) => row.id === targetId);
    return q?.question ?? targetId;
  }
  if (mapping.mappingType === 'differential') {
    const d = pathway.differentials?.find((row) => row.id === targetId);
    return d?.condition ?? targetId;
  }
  if (mapping.mappingType === 'red_flag') {
    const f = pathway.redFlags?.find((row) => row.id === targetId);
    return f?.title ?? targetId;
  }
  if (mapping.mappingType === 'treatment') {
    const t = pathway.treatments?.find((row) => row.id === targetId);
    return t?.medicationName ?? targetId;
  }
  if (mapping.mappingType === 'guidance') {
    const g = pathway.counsellings?.find((row) => row.id === targetId);
    return g?.point ?? targetId;
  }
  return targetId;
}

export function parseYearEdition(raw: string): {
  edition?: string;
  publicationYear?: number;
} {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  const yearOnly = trimmed.match(/^(19|20)\d{2}$/);
  if (yearOnly) return { publicationYear: Number(trimmed), edition: trimmed };
  const yearInText = trimmed.match(/\b((19|20)\d{2})\b/);
  return {
    edition: trimmed,
    publicationYear: yearInText ? Number(yearInText[1]) : undefined,
  };
}

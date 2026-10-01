'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  FolderOpen,
  FileText,
  BadgeCheck,
  AlertCircle,
  Clock,
  ExternalLink,
  Shield,
  BookOpen,
  Calendar,
  Layers,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { DocumentUploadPanel } from '../document-upload-panel';
import { DocumentRoleReviewPanel } from '../document-role-review-panel';
import { pathwayKeys } from '../hooks';
import type { ClinicalDocument, ClinicalPathway, DocumentRole } from '../types';
import { cn } from '@/lib/utils';
import { getPublicApiUrl } from '@/lib/api-url';
import { PathwayReadOnlyBanner } from '../pathway-edit-lock';

const ROLE_LABELS: Record<DocumentRole, string> = {
  PRIMARY: 'Primary guide',
  SUPPORTING: 'Supporting',
  REFERENCE_ONLY: 'Reference only',
};

const STATUS_STYLES: Record<string, string> = {
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PROCESSING: 'bg-blue-50 text-blue-700 border-blue-200',
  PENDING: 'bg-amber-50 text-amber-800 border-amber-200',
  FAILED: 'bg-red-50 text-red-700 border-red-200',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return value;
  }
}

function fileKind(doc: ClinicalDocument): string {
  const name = doc.fileName.toLowerCase();
  if (name.endsWith('.pdf') || doc.mimeType?.includes('pdf')) return 'PDF';
  if (name.endsWith('.docx') || doc.mimeType?.includes('wordprocessingml')) return 'DOCX';
  if (name.endsWith('.doc') || doc.mimeType?.includes('msword')) return 'DOC';
  if (name.endsWith('.txt') || doc.mimeType?.includes('text')) return 'TXT';
  return doc.mimeType?.split('/').pop()?.toUpperCase() || 'FILE';
}

function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === '' || value === '—') return null;
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 font-medium text-foreground">{value}</span>
    </div>
  );
}

function DocumentDetailCard({
  doc,
  selected,
  onSelect,
}: {
  doc: ClinicalDocument;
  selected: boolean;
  onSelect: () => void;
}) {
  const role = doc.role || doc.aiSuggestedRole;
  const status = doc.processingStatus?.toUpperCase() || 'PENDING';

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-xl border p-4 text-left transition-all',
        selected
          ? 'border-primary bg-primary/5 shadow-sm'
          : 'border-border bg-card hover:border-primary/40',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold">{doc.fileName}</p>
            <span
              className={cn(
                'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                STATUS_STYLES[status] ?? STATUS_STYLES.PENDING,
              )}
            >
              {status.toLowerCase()}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {fileKind(doc)} · {formatSize(doc.fileSize)}
            {doc.pageCount ? ` · ${doc.pageCount} pages` : ''}
            {role ? ` · ${ROLE_LABELS[role] ?? role}` : ''}
          </p>
          {doc.documentType && (
            <p className="text-[11px] text-muted-foreground">
              Type: {doc.documentType.replace(/_/g, ' ').toLowerCase()}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

function DocumentPreviewPanel({ doc }: { doc: ClinicalDocument }) {
  const role = doc.role || doc.aiSuggestedRole;
  const openHref = doc.fileUrl?.startsWith('http')
    ? doc.fileUrl
    : doc.fileUrl
      ? `${getPublicApiUrl()}${doc.fileUrl}`
      : null;

  return (
    <Card className="overflow-hidden shadow-none">
      <div className="flex items-start justify-between gap-3 border-b border-border/60 bg-muted/20 px-5 py-3.5">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{doc.fileName}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Full document details & classification preview
          </p>
        </div>
        {openHref && (
          <a
            href={openHref}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0 gap-1.5')}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open file
          </a>
        )}
      </div>

      <div className="space-y-5 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border/70 bg-muted/10 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Layers className="h-3.5 w-3.5" /> File
            </div>
            <div className="space-y-1.5">
              <MetaRow label="Kind" value={fileKind(doc)} />
              <MetaRow label="Size" value={formatSize(doc.fileSize)} />
              <MetaRow label="Pages" value={doc.pageCount ?? '—'} />
              <MetaRow label="MIME" value={doc.mimeType} />
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-muted/10 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> Processing
            </div>
            <div className="space-y-1.5">
              <MetaRow label="Status" value={doc.processingStatus} />
              <MetaRow label="Uploaded" value={formatDate(doc.uploadedAt)} />
              <MetaRow label="Processed" value={formatDate(doc.processedAt)} />
              {doc.processingError && (
                <div className="mt-2 flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-800">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {doc.processingError}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-muted/10 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Shield className="h-3.5 w-3.5" /> Role & classification
          </div>
          <div className="space-y-1.5">
            <MetaRow
              label="Confirmed role"
              value={
                doc.role ? (
                  <span className="inline-flex items-center gap-1">
                    {ROLE_LABELS[doc.role]}
                    {doc.roleConfirmed && <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />}
                  </span>
                ) : (
                  'Not confirmed'
                )
              }
            />
            <MetaRow
              label="Suggested"
              value={doc.aiSuggestedRole ? ROLE_LABELS[doc.aiSuggestedRole] : '—'}
            />
            <MetaRow
              label="Document type"
              value={doc.documentType?.replace(/_/g, ' ') ?? '—'}
            />
            <MetaRow
              label="Confidence"
              value={
                doc.classificationConfidence != null
                  ? `${Math.round(doc.classificationConfidence)}%`
                  : '—'
              }
            />
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-muted/10 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <BookOpen className="h-3.5 w-3.5" /> Provenance
          </div>
          <div className="space-y-1.5">
            <MetaRow label="Authority" value={doc.authority ?? '—'} />
            <MetaRow
              label="Year"
              value={
                doc.publicationYear != null ? (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-muted-foreground" />
                    {doc.publicationYear}
                  </span>
                ) : (
                  '—'
                )
              }
            />
            <MetaRow label="Evidence" value={doc.evidenceLevel ?? '—'} />
            <MetaRow label="Family" value={doc.documentFamily ?? '—'} />
            <MetaRow
              label="Purpose"
              value={doc.purpose?.length ? doc.purpose.join(', ') : '—'}
            />
          </div>
        </div>

        {(doc.classificationMeta?.condition || doc.classificationMeta?.rationale) && (
          <div className="rounded-lg border border-border/70 bg-muted/10 p-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Rationale</p>
            {doc.classificationMeta.condition && (
              <p className="mb-1 text-xs">
                <span className="text-muted-foreground">Condition detected: </span>
                <span className="font-medium">{doc.classificationMeta.condition}</span>
              </p>
            )}
            {doc.classificationMeta.rationale && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {doc.classificationMeta.rationale}
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

/** Documents module — clinical pathway PDFs, CPS, guidelines, local protocols */
export function PathwayDocumentsTab({
  pathway,
  canEdit,
}: {
  pathway: ClinicalPathway;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const docs = pathway.documents ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(docs[0]?.id ?? null);

  const selected = useMemo(
    () => docs.find((d) => d.id === selectedId) ?? docs[0] ?? null,
    [docs, selectedId],
  );

  const overlaps = pathway.documentOverlaps ?? [];

  return (
    <div className="space-y-5">
      <PathwayReadOnlyBanner canEdit={canEdit} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Documents</h2>
          <p className="text-sm text-muted-foreground">
            Clinical guides, CPS excerpts, and protocols used to build this pathway.
            {docs.length > 0 && (
              <span className="ml-1">
                {docs.length} file{docs.length === 1 ? '' : 's'} uploaded.
              </span>
            )}
          </p>
        </div>
      </div>

      {canEdit && (
        <DocumentUploadPanel
          pathwayId={pathway.id}
          documents={pathway.documents}
          onRefresh={() => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathway.id) })}
        />
      )}

      {!canEdit && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
          This pathway is live. Take it offline to upload or replace documents.
        </div>
      )}

      {pathway.pipelineStage === 'DOCUMENT_REVIEW' && canEdit && (
        <DocumentRoleReviewPanel pathway={pathway} />
      )}

      {docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-14">
          <FolderOpen className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No documents yet</p>
          <p className="mt-1 max-w-md text-center text-xs text-muted-foreground/70">
            Upload a clinical guide above to extract questions, rules, treatments, and counselling.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_1fr]">
          <div className="space-y-2">
            <p className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Library
            </p>
            {docs.map((doc) => (
              <DocumentDetailCard
                key={doc.id}
                doc={doc}
                selected={selected?.id === doc.id}
                onSelect={() => setSelectedId(doc.id)}
              />
            ))}
          </div>

          <div className="min-w-0 space-y-4">
            {selected && <DocumentPreviewPanel doc={selected} />}

            {overlaps.length > 0 && (
              <Card className="shadow-none">
                <div className="border-b border-border/60 bg-muted/20 px-5 py-3">
                  <h3 className="text-sm font-semibold">Overlap analysis</h3>
                  <p className="text-xs text-muted-foreground">
                    How uploaded guides relate to each other
                  </p>
                </div>
                <div className="divide-y divide-border/50">
                  {overlaps.map((o) => (
                    <div key={o.id} className="px-5 py-3 text-sm">
                      <p className="font-medium">
                        {(o.sourceDocument?.fileName ?? 'Source')} ↔{' '}
                        {(o.targetDocument?.fileName ?? 'Target')}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {o.overlapPercent}% overlap · recommended{' '}
                        {ROLE_LABELS[o.recommendedRole] ?? o.recommendedRole}
                      </p>
                      {o.rationale && (
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {o.rationale}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

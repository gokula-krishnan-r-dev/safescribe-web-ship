'use client';

import { useMemo, useState } from 'react';
import { BookMarked, Plus, Search } from 'lucide-react';
import { toast } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  DOCUMENT_TYPE_LABELS,
  EVIDENCE_DOCUMENT_TYPES,
  EVIDENCE_REFERENCE_STATUSES,
  REFERENCE_STATUS_LABELS,
} from '@safescript/shared';
import { ReferenceFormDialog } from '@/features/pathways/references-governance/reference-form-dialog';
import { ReferenceStatusBadge } from '@/features/pathways/references-governance/status-badges';
import {
  documentTypeLabel,
  yearEditionLabel,
} from '@/features/pathways/references-governance/utils';
import type { PathwayEvidenceReference } from '@/features/pathways/types';
import {
  useReferenceLibraryList,
  useRetireReferenceLibrary,
  useSaveReferenceLibrary,
} from './hooks';
import type { ReferenceLibraryItem } from './types';

function asPathwayRef(item: ReferenceLibraryItem): PathwayEvidenceReference {
  return {
    id: item.id,
    citationTitle: item.citationTitle,
    organization: item.organization,
    edition: item.edition,
    publicationYear: item.publicationYear,
    url: item.url,
    doi: item.doi,
    documentType: item.documentType,
    jurisdiction: item.jurisdiction,
    referenceType: item.referenceType,
    status: item.status,
    verifiedBy: item.verifiedBy,
    verificationDate: item.verificationDate,
    importSource: item.importSource,
    clinicalUseTags: item.clinicalUseTags,
    suggestedSections: item.suggestedSections,
    documentationCandidate: item.documentationCandidate,
    verificationRequired: item.verificationRequired,
    notes: item.notes,
    pathwayIds: item.pathwayIds,
  };
}

export function ReferenceLibraryPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ReferenceLibraryItem | null>(null);

  const list = useReferenceLibraryList({
    search,
    documentType: typeFilter,
    status: statusFilter,
    page,
    pageSize: 25,
  });
  const save = useSaveReferenceLibrary();
  const retire = useRetireReferenceLibrary();

  const rows = list.data?.data ?? [];
  const meta = list.data?.meta;
  const editingRef = useMemo(() => (editing ? asPathwayRef(editing) : null), [editing]);

  const handleSave = async (payload: {
    citationTitle: string;
    organization: string;
    documentType: string;
    edition?: string;
    publicationYear?: number;
    jurisdiction: string;
    url?: string;
    doi?: string;
    status: string;
    clinicalUseTags: string[];
    suggestedSections: string[];
    documentationCandidate: boolean;
    verificationRequired: boolean;
    notes?: string | null;
    pathwayIds?: string[];
  }) => {
    try {
      await save.mutateAsync({ id: editing?.id, data: payload });
      toast.success(editing ? 'Master reference updated.' : 'Master reference added.');
      setFormOpen(false);
      setEditing(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not save master reference.');
    }
  };

  const handleRetire = async (item: ReferenceLibraryItem) => {
    try {
      await retire.mutateAsync({ id: item.id, restore: item.isRetired });
      toast.success(item.isRetired ? 'Master reference restored.' : 'Master reference retired.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not update master reference.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <BookMarked className="h-5 w-5 text-primary" />
            Reference Library
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Master citations for all pathways. Link these from References & Governance on a pathway.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Add reference
        </Button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by title, organization, or DOI…"
            className="pl-9"
          />
        </div>
        <Select
          className="w-full lg:w-[180px]"
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(1);
          }}
          options={[
            { value: '', label: 'All types' },
            ...EVIDENCE_DOCUMENT_TYPES.map((v) => ({ value: v, label: DOCUMENT_TYPE_LABELS[v] })),
          ]}
        />
        <Select
          className="w-full lg:w-[180px]"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          options={[
            { value: 'active', label: 'Active' },
            ...EVIDENCE_REFERENCE_STATUSES.map((v) => ({
              value: v,
              label: REFERENCE_STATUS_LABELS[v],
            })),
            { value: 'retired', label: 'Retired' },
          ]}
        />
      </div>

      <Card className="overflow-hidden border-border/80 shadow-sm">
        {list.isLoading ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">Loading references…</p>
        ) : rows.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-medium">No master references yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add a citation here, then link it onto any pathway.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-border/80 bg-muted/30 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Source</th>
                  <th className="px-3 py-2.5 font-semibold">Type</th>
                  <th className="px-3 py-2.5 font-semibold">Year</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 font-semibold">Pathways</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id} className="border-b border-border/60 hover:bg-muted/30">
                    <td className="px-3 py-3">
                      <p className="font-medium leading-snug">{item.citationTitle}</p>
                      <p className="text-xs text-muted-foreground">{item.organization}</p>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {documentTypeLabel(item.documentType)}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{yearEditionLabel(item)}</td>
                    <td className="px-3 py-3">
                      {item.isRetired ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                          Retired
                        </span>
                      ) : (
                        <ReferenceStatusBadge status={item.status} />
                      )}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{item.pathwayUsageCount}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          disabled={item.isRetired}
                          onClick={() => {
                            setEditing(item);
                            setFormOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          onClick={() => void handleRetire(item)}
                        >
                          {item.isRetired ? 'Restore' : 'Retire'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {meta && meta.totalPages > 1 ? (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {meta.page} of {meta.totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}

      <ReferenceFormDialog
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        editing={editingRef}
        saving={save.isPending}
        onSave={handleSave}
        mode="master"
      />
    </div>
  );
}

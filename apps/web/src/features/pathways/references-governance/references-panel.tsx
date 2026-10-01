'use client';

import { useMemo, useState } from 'react';
import {
  Check,
  ExternalLink,
  MoreHorizontal,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { toast } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { citationDisplay } from '@safescript/shared';
import {
  DOCUMENT_TYPE_LABELS,
  EVIDENCE_DOCUMENT_TYPES,
  EVIDENCE_REFERENCE_STATUSES,
  REFERENCE_STATUS_LABELS,
  SECTION_FULL_LABELS,
  type EvidenceSection,
} from '@safescript/shared';
import type { ClinicalPathway, PathwayEvidenceReference } from '../types';
import { editLockProps } from '../pathway-edit-lock';
import {
  useArchiveEvidenceReference,
  useCreateEvidenceReference,
  useDeleteEvidenceReference,
  useDuplicateEvidenceReference,
  useLinkEvidenceFromLibrary,
  useReplaceEvidenceMappings,
  useUpdateEvidenceReference,
  useUpdatePathwayGovernance,
} from '../hooks';
import { ReferenceFormDialog } from './reference-form-dialog';
import { LinkReferenceLibraryDialog } from './link-reference-library-dialog';
import { PrimaryDocPickerDialog } from './primary-doc-picker-dialog';
import { LinkMappingDialog } from './link-mapping-dialog';
import { ReferenceStatusBadge } from './status-badges';
import {
  documentTypeLabel,
  formatShortDate,
  mappingsForReference,
  resolveGovernance,
  sectionLabel,
  targetLabel,
  usedInBadges,
  yearEditionLabel,
} from './utils';
import { cn } from '@/lib/utils';

export function ReferencesPanel({
  pathway,
  canEdit,
}: {
  pathway: ClinicalPathway;
  canEdit: boolean;
}) {
  const lock = editLockProps(canEdit);
  const library = pathway.libraryReferences ?? [];
  const governance = resolveGovernance(pathway);
  const primaryId =
    pathway.primaryDocumentationReferenceId ??
    governance.primaryDocumentationReferenceId ??
    null;
  const secondaryId =
    pathway.secondaryDocumentationReferenceId ??
    governance.secondaryDocumentationReferenceId ??
    null;
  const primaryRef = library.find((r) => r.id === primaryId) ?? null;
  const secondaryRef = library.find((r) => r.id === secondaryId) ?? null;

  const createRef = useCreateEvidenceReference(pathway.id);
  const updateRef = useUpdateEvidenceReference(pathway.id);
  const deleteRef = useDeleteEvidenceReference(pathway.id);
  const duplicateRef = useDuplicateEvidenceReference(pathway.id);
  const archiveRef = useArchiveEvidenceReference(pathway.id);
  const replaceMappings = useReplaceEvidenceMappings(pathway.id);
  const updateGovernance = useUpdatePathwayGovernance(pathway.id);
  const linkFromLibrary = useLinkEvidenceFromLibrary(pathway.id);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PathwayEvidenceReference | null>(null);
  const [primaryOpen, setPrimaryOpen] = useState(false);
  const [secondaryOpen, setSecondaryOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [pendingLinkedRef, setPendingLinkedRef] = useState<PathwayEvidenceReference | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PathwayEvidenceReference | null>(null);

  const selected = library.find((r) => r.id === selectedId) ?? null;
  /** Prefer pathway library row once refreshed; fall back to the just-linked/created row. */
  const mappingTarget =
    (pendingLinkedRef && mappingOpen
      ? library.find((r) => r.id === pendingLinkedRef.id) ?? pendingLinkedRef
      : null) ?? selected;
  const selectedMappings = selected ? mappingsForReference(pathway, selected.id) : [];
  const mappingExisting = mappingTarget ? mappingsForReference(pathway, mappingTarget.id) : [];

  const openPathwayContentLinks = (ref: PathwayEvidenceReference) => {
    setSelectedId(ref.id);
    setPendingLinkedRef(ref);
    setMappingOpen(true);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return library.filter((ref) => {
      if (typeFilter && ref.documentType !== typeFilter) return false;
      if (statusFilter && (ref.status ?? 'needs_review') !== statusFilter) return false;
      if (!q) return true;
      return `${ref.citationTitle} ${ref.organization ?? ''} ${ref.doi ?? ''} ${ref.jurisdiction ?? ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [library, search, typeFilter, statusFilter]);

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (ref: PathwayEvidenceReference) => {
    setEditing(ref);
    setFormOpen(true);
  };

  const handleSaveRef = async (payload: {
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
  }) => {
    try {
      if (editing) {
        await updateRef.mutateAsync({ referenceId: editing.id, data: payload });
        toast.success('Reference updated.');
        setFormOpen(false);
        setEditing(null);
      } else {
        const created = await createRef.mutateAsync(payload);
        toast.success('Reference added. Choose where it applies in this pathway.');
        setFormOpen(false);
        setEditing(null);
        if (!payload.suggestedSections.length) {
          openPathwayContentLinks(created);
        }
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not save reference.');
    }
  };

  const handlePrimarySave = async (id: string | null) => {
    try {
      await updateGovernance.mutateAsync({ primaryDocumentationReferenceId: id });
      toast.success(id ? 'Primary documentation reference updated.' : 'Primary documentation reference cleared.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not update primary reference.');
    }
  };

  const handleSecondarySave = async (id: string | null) => {
    try {
      await updateGovernance.mutateAsync({ secondaryDocumentationReferenceId: id });
      toast.success(
        id ? 'Secondary documentation reference updated.' : 'Secondary documentation reference cleared.',
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not update secondary reference.');
    }
  };

  const handleDocRole = async (id: string, role: 'primary' | 'secondary') => {
    const current = role === 'primary' ? primaryId : secondaryId;
    try {
      await updateGovernance.mutateAsync(
        role === 'primary'
          ? { primaryDocumentationReferenceId: current === id ? null : id }
          : { secondaryDocumentationReferenceId: current === id ? null : id },
      );
      toast.success(
        current === id
          ? `${role === 'primary' ? 'Primary' : 'Secondary'} documentation reference cleared.`
          : `${role === 'primary' ? 'Primary' : 'Secondary'} documentation reference set.`,
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not update documentation reference.');
    }
  };

  const handleLinkFromLibrary = async (libraryItemId: string) => {
    try {
      const linked = await linkFromLibrary.mutateAsync(libraryItemId);
      toast.success('Reference linked. Choose where it applies in this pathway.');
      setLibraryOpen(false);
      openPathwayContentLinks(linked);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not link master reference.');
    }
  };

  const closeMappingDialog = () => {
    setMappingOpen(false);
    setPendingLinkedRef(null);
  };

  const handleDuplicate = async (ref: PathwayEvidenceReference) => {
    try {
      await duplicateRef.mutateAsync(ref.id);
      toast.success('Reference duplicated.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not duplicate reference.');
    }
  };

  const handleArchive = async (ref: PathwayEvidenceReference) => {
    try {
      await archiveRef.mutateAsync(ref.id);
      toast.success('Reference archived.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not archive reference.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteRef.mutateAsync(deleteTarget.id);
      toast.success('Reference deleted.');
      if (selectedId === deleteTarget.id) setSelectedId(null);
      setDeleteTarget(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not delete reference.');
    }
  };

  const handleSaveMappings = async (
    mappings: Array<{
      section: string;
      mappingType: string;
      targetId?: string | null;
      suggested?: boolean;
    }>,
  ) => {
    if (!mappingTarget) return;
    try {
      await replaceMappings.mutateAsync({ referenceId: mappingTarget.id, mappings });
      toast.success('Evidence links saved.');
      setPendingLinkedRef(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not save links.');
    }
  };

  const mappingsBySection = useMemo(() => {
    const map = new Map<string, typeof selectedMappings>();
    for (const m of selectedMappings) {
      const list = map.get(m.section) ?? [];
      list.push(m);
      map.set(m.section, list);
    }
    return map;
  }, [selectedMappings]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
      <Card className="border-border/80 p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Primary documentation reference</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Used in consultation documentation by default and may be overridden at treatment level.
            </p>
            {primaryRef ? (
              <div className="mt-2">
                <p className="text-sm font-medium">{citationDisplay(primaryRef)}</p>
                <p className="text-xs text-muted-foreground">{primaryRef.organization}</p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No primary documentation reference set.</p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPrimaryOpen(true)}
            {...lock}
          >
            Change
          </Button>
        </div>
      </Card>
      <Card className="border-border/80 p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Secondary documentation reference</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Used in consultation documentation when a treatment does not override and no primary is set.
            </p>
            {secondaryRef ? (
              <div className="mt-2">
                <p className="text-sm font-medium">{citationDisplay(secondaryRef)}</p>
                <p className="text-xs text-muted-foreground">{secondaryRef.organization}</p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No secondary documentation reference set.</p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSecondaryOpen(true)}
            {...lock}
          >
            Change
          </Button>
        </div>
      </Card>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search references by title, keyword, or organization…"
            className="pl-9"
          />
        </div>
        <Select
          className="w-full lg:w-[180px]"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          options={[
            { value: '', label: 'All types' },
            ...EVIDENCE_DOCUMENT_TYPES.map((v) => ({
              value: v,
              label: DOCUMENT_TYPE_LABELS[v],
            })),
          ]}
        />
        <Select
          className="w-full lg:w-[180px]"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: '', label: 'All statuses' },
            ...EVIDENCE_REFERENCE_STATUSES.map((v) => ({
              value: v,
              label: REFERENCE_STATUS_LABELS[v],
            })),
          ]}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          data-rg-link-library
          onClick={() => setLibraryOpen(true)}
          {...lock}
        >
          Link from library
        </Button>
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          data-rg-add-reference
          onClick={openAdd}
          {...lock}
        >
          <Plus className="h-4 w-4" />
          Add reference
        </Button>
      </div>

      <div className={cn('grid gap-4', selected ? 'lg:grid-cols-[1fr_360px]' : '')}>
        <Card className="overflow-hidden border-border/80 shadow-sm">
          {filtered.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <p className="text-sm font-medium">No references yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Link a citation from the master Reference Library, add one here, or import from ChatGPT.
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setLibraryOpen(true)} {...lock}>
                  Link from library
                </Button>
                <Button type="button" size="sm" className="gap-1.5" onClick={openAdd} {...lock}>
                  <Plus className="h-4 w-4" />
                  Add reference
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-border/80 bg-muted/30 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">#</th>
                    <th className="px-3 py-2.5 font-semibold">Source</th>
                    <th className="px-3 py-2.5 font-semibold">Type</th>
                    <th className="px-3 py-2.5 font-semibold">Year</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                    <th className="px-3 py-2.5 font-semibold">Used in</th>
                    <th className="px-3 py-2.5 font-semibold">Documentation</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((ref, index) => {
                    const badges = usedInBadges(pathway, ref.id);
                    const visible = badges.slice(0, 3);
                    const extra = badges.length - visible.length;
                    return (
                      <tr
                        key={ref.id}
                        className={cn(
                          'border-b border-border/60 transition-colors hover:bg-muted/30',
                          selectedId === ref.id && 'bg-primary/5',
                        )}
                      >
                        <td className="px-3 py-3 text-muted-foreground">{index + 1}</td>
                        <td className="px-3 py-3">
                          <p className="font-medium leading-snug">{ref.citationTitle}</p>
                          <p className="text-xs text-muted-foreground">{ref.organization}</p>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {documentTypeLabel(ref.documentType)}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">{yearEditionLabel(ref)}</td>
                        <td className="px-3 py-3">
                          <ReferenceStatusBadge status={ref.status} />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            {visible.length === 0 ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : (
                              <>
                                {visible.map((b) => (
                                  <span
                                    key={b}
                                    className="rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground"
                                  >
                                    {b}
                                  </span>
                                ))}
                                {extra > 0 ? (
                                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">
                                    +{extra}
                                  </span>
                                ) : null}
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            <Button
                              type="button"
                              variant={primaryId === ref.id ? 'default' : 'outline'}
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              disabled={!canEdit || ref.status !== 'verified'}
                              title={
                                ref.status !== 'verified'
                                  ? 'Verify this reference before setting it as primary'
                                  : undefined
                              }
                              onClick={() => void handleDocRole(ref.id, 'primary')}
                            >
                              Primary
                            </Button>
                            <Button
                              type="button"
                              variant={secondaryId === ref.id ? 'default' : 'outline'}
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              disabled={!canEdit || ref.status !== 'verified'}
                              title={
                                ref.status !== 'verified'
                                  ? 'Verify this reference before setting it as secondary'
                                  : undefined
                              }
                              onClick={() => void handleDocRole(ref.id, 'secondary')}
                            >
                              Secondary
                            </Button>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs"
                              onClick={() => setSelectedId(ref.id)}
                            >
                              View
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" {...lock}>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEdit(ref)}>Edit</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDuplicate(ref)}>
                                  Duplicate
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleArchive(ref)}>
                                  Archive
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => setDeleteTarget(ref)}
                                >
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {selected ? (
          <aside className="h-fit overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex items-start justify-between gap-2 border-b border-border/70 px-4 py-3.5">
              <div>
                <h3 className="text-sm font-semibold">Reference details</h3>
                <p className="text-[12px] text-muted-foreground">Library citation metadata</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                aria-label="Close details"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 px-4 py-4">
              <DetailRow label="Title" value={selected.citationTitle} />
              <DetailRow label="Organization" value={selected.organization} />
              <DetailRow label="Document type" value={documentTypeLabel(selected.documentType)} />
              <DetailRow label="Year / edition" value={yearEditionLabel(selected)} />
              <DetailRow label="Jurisdiction" value={selected.jurisdiction} />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  URL
                </p>
                {selected.url ? (
                  <a
                    href={selected.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    Open link
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <p className="mt-0.5 text-sm text-muted-foreground">—</p>
                )}
              </div>
              <DetailRow label="DOI" value={selected.doi} />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Status
                </p>
                <div className="mt-1">
                  <ReferenceStatusBadge status={selected.status} />
                </div>
              </div>
              <DetailRow label="Verified by" value={selected.verifiedBy} />
              <DetailRow
                label="Verification date"
                value={formatShortDate(selected.verificationDate)}
              />

              <div className="flex flex-wrap gap-2 border-t border-border/70 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => openEdit(selected)}
                  {...lock}
                >
                  Edit
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" {...lock}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleDuplicate(selected)}>
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleArchive(selected)}>
                      Archive
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => setDeleteTarget(selected)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <section className="space-y-2 border-t border-border/70 pt-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold">Used in this pathway</h4>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    onClick={() => setMappingOpen(true)}
                    {...lock}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Link to pathway content
                  </Button>
                </div>
                {selectedMappings.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                    Not linked to pathway content yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {Array.from(mappingsBySection.entries()).map(([section, rows]) => (
                      <div key={section}>
                        <p className="mb-1 text-xs font-semibold text-foreground">
                          {SECTION_FULL_LABELS[section as EvidenceSection] ??
                            sectionLabel(section, true)}
                        </p>
                        <ul className="space-y-1">
                          {rows.map((m) => (
                            <li
                              key={m.id}
                              className="flex items-start gap-1.5 text-[12.5px] text-muted-foreground"
                            >
                              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                              <span>
                                {targetLabel(pathway, m)}
                                {m.suggested ? (
                                  <span className="ml-1 text-[10px] font-semibold uppercase text-amber-700">
                                    Suggested
                                  </span>
                                ) : null}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </aside>
        ) : null}
      </div>

      <ReferenceFormDialog
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        editing={editing}
        saving={createRef.isPending || updateRef.isPending}
        onSave={handleSaveRef}
        mode="pathway"
        currentPathway={{ id: pathway.id, name: pathway.name }}
      />
      <LinkReferenceLibraryDialog
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        pathwayId={pathway.id}
        saving={linkFromLibrary.isPending}
        onLink={handleLinkFromLibrary}
      />
      <PrimaryDocPickerDialog
        open={primaryOpen}
        onClose={() => setPrimaryOpen(false)}
        library={library}
        role="primary"
        selectedId={primaryId}
        excludeId={secondaryId}
        saving={updateGovernance.isPending}
        onSave={handlePrimarySave}
      />
      <PrimaryDocPickerDialog
        open={secondaryOpen}
        onClose={() => setSecondaryOpen(false)}
        library={library}
        role="secondary"
        selectedId={secondaryId}
        excludeId={primaryId}
        saving={updateGovernance.isPending}
        onSave={handleSecondarySave}
      />
      {mappingTarget ? (
        <LinkMappingDialog
          open={mappingOpen}
          onClose={closeMappingDialog}
          pathway={pathway}
          existing={mappingExisting}
          saving={replaceMappings.isPending}
          referenceLabel={citationDisplay(mappingTarget)}
          onSave={handleSaveMappings}
        />
      ) : null}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this reference?"
        description="This removes the citation from the pathway library and unlinks it from content. Prefer Archive if it has been used in published versions."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        loading={deleteRef.isPending}
      />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm text-foreground">{value?.trim() ? value : '—'}</p>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Info, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  canSelectLibraryResult,
  formatLibraryResultTitle,
  TREATMENT_LIBRARY_PATHWAY_UI,
  TREATMENT_LIBRARY_POPULATION_LABELS,
  TREATMENT_LIBRARY_UI,
  type PathwayOwnedTreatmentFields,
  type TreatmentLibraryMatchStatus,
  type TreatmentLibraryPopulation,
} from '@safescript/shared';
import { api } from '@/lib/api-client';
import { toastError } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { PHARMACOLOGICAL_TREATMENT_CATEGORIES } from '@/features/pathways/pathway-constants';
import type { TreatmentCategory } from '@/features/pathways/types';
import { usePathwayLibrarySearch } from './hooks';
import { approvedLibraryToPrefill } from './library-form-adapter';
import type { ClinicalTreatment } from '@/features/pathways/types';
import type {
  PathwayLibrarySearchResult,
  TreatmentLibraryDetailResponse,
} from './types';

const PROVINCE_LABELS: Record<string, string> = {
  AB: 'Alberta',
  BC: 'British Columbia',
  MB: 'Manitoba',
  NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador',
  NS: 'Nova Scotia',
  NT: 'Northwest Territories',
  NU: 'Nunavut',
  ON: 'Ontario',
  PE: 'Prince Edward Island',
  QC: 'Quebec',
  SK: 'Saskatchewan',
  YT: 'Yukon',
};

export type LibraryPrefill = ClinicalTreatment & {
  librarySource: {
    treatmentLibraryItemId: string;
    treatmentLibraryVersionId: string;
    sourceVersionNumber: number;
    sourcePayloadHash: string;
    sourceSnapshot: Record<string, unknown>;
    displayName: string;
    regimenLabel: string;
    productFormDisplay: string;
    routeDisplay: string;
    matchStatus: TreatmentLibraryMatchStatus;
  };
};

function categoryPhrase(category?: TreatmentCategory | null) {
  const meta = PHARMACOLOGICAL_TREATMENT_CATEGORIES.find((c) => c.value === category);
  return meta ? `${meta.shortLabel} treatment` : 'Treatment';
}

function selectableResult(item: PathwayLibrarySearchResult) {
  return canSelectLibraryResult({
    usageState: item.currentPathwayUsage?.state,
    category: item.category ?? item.treatmentType,
    matchStatus: item.matchStatus,
  });
}

export function librarySourceFromTreatment(
  treatment: ClinicalTreatment,
): LibraryPrefill['librarySource'] | null {
  if (treatment.libraryLinkStatus !== 'LINKED' || !treatment.treatmentLibraryItemId) {
    return null;
  }
  const item = treatment.treatmentLibraryItem;
  return {
    treatmentLibraryItemId: treatment.treatmentLibraryItemId,
    treatmentLibraryVersionId: treatment.treatmentLibraryVersionId ?? '',
    sourceVersionNumber: treatment.sourceVersionNumber ?? 1,
    sourcePayloadHash: treatment.sourcePayloadHash ?? '',
    sourceSnapshot: (treatment.sourceSnapshot ?? {}) as Record<string, unknown>,
    displayName: item?.displayName || treatment.medicationName,
    regimenLabel: item?.regimenLabel || '',
    productFormDisplay: item?.productFormDisplay || '',
    routeDisplay: item?.routeDisplay || treatment.route || '',
    matchStatus: (item?.matchStatus as TreatmentLibraryMatchStatus) || 'UNMATCHED',
  };
}

export function pathwayOwnedFromTreatment(
  treatment: Pick<
    ClinicalTreatment,
    | 'recommendationLevel'
    | 'displayOrder'
    | 'provinceAvailability'
    | 'clinicalNotes'
    | 'eligibility'
    | 'counsellingNotes'
    | 'followUpAdvice'
    | 'clinicalIndication'
  >,
): PathwayOwnedTreatmentFields {
  return {
    recommendationLevel: treatment.recommendationLevel,
    displayOrder: treatment.displayOrder,
    provinceAvailability: treatment.provinceAvailability,
    clinicalNotes: treatment.clinicalNotes,
    eligibility: treatment.eligibility,
    counsellingNotes: treatment.counsellingNotes,
    followUpAdvice: treatment.followUpAdvice,
    clinicalIndication: treatment.clinicalIndication,
  };
}

export function TreatmentLibraryPickerDialog({
  open,
  onOpenChange,
  onSelect,
  onCreateManually,
  onViewExisting,
  pathwayId,
  pathwayName,
  jurisdiction,
  category,
  categoryLocked = false,
  canEdit = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (prefill: LibraryPrefill) => void;
  onCreateManually?: () => void;
  onViewExisting?: (pathwayTreatmentId: string) => void;
  pathwayId?: string;
  pathwayName?: string;
  jurisdiction?: string;
  category?: TreatmentCategory | null;
  categoryLocked?: boolean;
  canEdit?: boolean;
}) {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [population, setPopulation] = useState('');
  const [formRoute, setFormRoute] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [similarConfirm, setSimilarConfirm] = useState<PathwayLibrarySearchResult | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!open) {
      setSearchInput('');
      setDebouncedQ('');
      setPopulation('');
      setFormRoute('');
      setSelectedId(null);
      setReviewing(false);
      setSimilarConfirm(null);
    }
  }, [open]);

  const [form, route] = formRoute.split('|');
  const search = usePathwayLibrarySearch(
    {
      q: debouncedQ.length >= 2 ? debouncedQ : undefined,
      pathwayId,
      treatmentType: categoryLocked && category ? category : undefined,
      population: population || undefined,
      form: form || undefined,
      route: route || undefined,
      page: 1,
    },
    open,
  );

  const items = search.data?.items ?? [];
  const selected = items.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedId && !items.some((item) => item.id === selectedId)) {
      setSelectedId(null);
    }
  }, [items, selectedId]);

  const contextLine = useMemo(() => {
    const province = PROVINCE_LABELS[jurisdiction ?? ''] || jurisdiction || 'All provinces';
    return [pathwayName || 'Pathway', province, categoryPhrase(category ?? undefined)]
      .filter(Boolean)
      .join(' · ');
  }, [pathwayName, jurisdiction, category]);

  const hasQuery = Boolean(debouncedQ || population || formRoute);
  const liveCount = search.data?.total ?? items.length;

  const chooseRow = (item: PathwayLibrarySearchResult) => {
    if (!canEdit || !selectableResult(item)) return;
    setSelectedId(item.id);
  };

  const moveSelection = (direction: 1 | -1) => {
    const selectable = items.filter(selectableResult);
    if (!selectable.length) return;
    const current = selectable.findIndex((item) => item.id === selectedId);
    const nextIndex =
      current < 0
        ? direction === 1
          ? 0
          : selectable.length - 1
        : Math.min(selectable.length - 1, Math.max(0, current + direction));
    setSelectedId(selectable[nextIndex].id);
  };

  const loadReview = async (item: PathwayLibrarySearchResult) => {
    setReviewing(true);
    try {
      const detail = await api.get<TreatmentLibraryDetailResponse>(
        `/treatment-library/${item.id}/review-payload`,
      );
      const prefill = approvedLibraryToPrefill(detail);
      onSelect({
        ...prefill,
        category: (category as TreatmentCategory) || prefill.category,
        librarySource: {
          ...prefill.librarySource,
          displayName: item.displayName,
          regimenLabel: item.regimenLabel || item.regimenSummary || '',
          productFormDisplay: item.productFormDisplay,
          routeDisplay: item.routeDisplay,
          matchStatus: item.matchStatus,
        },
      });
      onOpenChange(false);
    } catch (error) {
      toastError(error, 'This library treatment is no longer available to review.');
      void search.refetch();
      setSelectedId(null);
    } finally {
      setReviewing(false);
    }
  };

  const reviewSelected = () => {
    if (!selected || !canEdit) return;
    if (selected.currentPathwayUsage?.state === 'similar_treatment') {
      setSimilarConfirm(selected);
      return;
    }
    void loadReview(selected);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none border border-[#D5E2E6] p-0 shadow-2xl sm:h-auto sm:max-h-[min(720px,calc(100vh-48px))] sm:w-[min(920px,calc(100vw-48px))] sm:rounded-2xl"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            searchRef.current?.focus();
          }}
        >
          <div className="shrink-0 border-b border-[#E4ECEF] px-6 pb-4 pt-5">
            <DialogTitle className="text-[22px] font-bold tracking-tight text-[#111827]">
              {TREATMENT_LIBRARY_PATHWAY_UI.modalTitle}
            </DialogTitle>
            <DialogDescription className="mt-1.5 text-[14px] text-[#66727D]">
              {TREATMENT_LIBRARY_PATHWAY_UI.modalSubtitle}
            </DialogDescription>
            <div className="mt-3 rounded-lg bg-[#EFF9F8] px-3 py-2 text-[13px] font-semibold text-[#0F6F6B]">
              {contextLine}
            </div>
            {!canEdit ? (
              <p className="mt-2 text-[13px] text-[#B45309]">
                Pathway edit permission is required to add a treatment from the library.
              </p>
            ) : null}
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A9AA3]" />
              <Input
                ref={searchRef}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={TREATMENT_LIBRARY_UI.searchPlaceholder}
                aria-label="Search Treatment Library"
                className="h-11 rounded-lg border-[#D5DEE1] bg-white pl-9 text-[14px] shadow-none"
              />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Select
                value={population}
                onChange={(e) => setPopulation(e.target.value)}
                aria-label="Population"
                options={[
                  { value: '', label: 'Population: All' },
                  ...Object.entries(TREATMENT_LIBRARY_POPULATION_LABELS).map(([value, label]) => ({
                    value,
                    label: `Population: ${label}`,
                  })),
                ]}
                className="h-10 border-[#D5DEE1] bg-white text-[13px] shadow-none"
              />
              <Select
                value={formRoute}
                onChange={(e) => setFormRoute(e.target.value)}
                aria-label="Form and route"
                options={[
                  { value: '', label: 'Form / route: All' },
                  ...(search.data?.filters.formRoutes ?? []).map((row) => ({
                    value: `${row.form}|${row.route}`,
                    label: `Form / route: ${row.label}`,
                  })),
                ]}
                className="h-10 border-[#D5DEE1] bg-white text-[13px] shadow-none"
              />
              <Select
                value="APPROVED"
                disabled
                aria-label="Status"
                options={[{ value: 'APPROVED', label: 'Status: Approved' }]}
                className="h-10 border-[#D5DEE1] bg-[#F7FAFB] text-[13px] shadow-none"
              />
            </div>
            <p className="sr-only" aria-live="polite">
              {search.isFetching ? 'Updating results' : `${liveCount} treatments`}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {search.isError ? (
              <div className="rounded-xl border border-[#E9A4A8] bg-[#FFF5F5] px-4 py-8 text-center">
                <p className="font-semibold text-[#B4232A]">{TREATMENT_LIBRARY_PATHWAY_UI.loadError}</p>
                <Button className="mt-3" variant="outline" onClick={() => void search.refetch()}>
                  Try again
                </Button>
              </div>
            ) : search.isLoading && !search.data ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-[84px] animate-pulse rounded-xl border border-[#E4ECEF] bg-[#F7FAFB]" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="px-2 py-10 text-center">
                <p className="text-[15px] font-semibold text-[#111827]">
                  {hasQuery
                    ? TREATMENT_LIBRARY_PATHWAY_UI.emptySearch
                    : TREATMENT_LIBRARY_PATHWAY_UI.emptyCategory}
                </p>
                <div className="mt-4 flex justify-center gap-2">
                  {hasQuery ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSearchInput('');
                        setDebouncedQ('');
                        setPopulation('');
                        setFormRoute('');
                      }}
                    >
                      Clear search
                    </Button>
                  ) : null}
                  {onCreateManually ? (
                    <Button
                      className="bg-[#0F6F6B] hover:bg-[#0c5c59]"
                      onClick={() => {
                        onOpenChange(false);
                        onCreateManually();
                      }}
                    >
                      {TREATMENT_LIBRARY_PATHWAY_UI.createManually}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <ul
                className="space-y-2"
                role="listbox"
                aria-label="Approved library treatments"
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    moveSelection(1);
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    moveSelection(-1);
                  }
                }}
              >
                {items.map((item) => {
                  const active = selectedId === item.id;
                  const usage = item.currentPathwayUsage;
                  const selectable = selectableResult(item);
                  const title = formatLibraryResultTitle(item.displayName, item.strength || item.strengthText);
                  const populationLabel =
                    TREATMENT_LIBRARY_POPULATION_LABELS[item.population as TreatmentLibraryPopulation] ??
                    item.population;
                  const summary = [populationLabel, item.regimenLabel || item.regimenSummary]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <li key={item.id}>
                      <div
                        role="option"
                        aria-selected={active}
                        aria-disabled={!selectable}
                        aria-label={`${title}${summary ? `, ${summary}` : ''}`}
                        tabIndex={0}
                        onClick={() => chooseRow(item)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            chooseRow(item);
                          }
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            moveSelection(1);
                          }
                          if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            moveSelection(-1);
                          }
                        }}
                        className={cn(
                          'flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors',
                          active
                            ? 'border-[#0F6F6B] bg-[#F3FBFA]'
                            : 'border-[#E4ECEF] bg-white hover:bg-[#F8FBFC]',
                          !selectable && 'cursor-default opacity-80',
                        )}
                      >
                        <span
                          className={cn(
                            'mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                            active ? 'border-[#0F6F6B]' : 'border-[#C5D0D4]',
                          )}
                          aria-hidden
                        >
                          {active ? <span className="h-2 w-2 rounded-full bg-[#0F6F6B]" /> : null}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] font-bold text-[#111827]">{title}</p>
                          {summary ? (
                            <p className="mt-0.5 text-[13px] text-[#66727D]">{summary}</p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {item.productFormDisplay ? (
                              <span className="rounded-md bg-[#EEF1F4] px-2 py-0.5 text-[11px] font-semibold text-[#52606D]">
                                {item.productFormDisplay}
                              </span>
                            ) : null}
                            {item.routeDisplay ? (
                              <span className="rounded-md bg-[#EEF1F4] px-2 py-0.5 text-[11px] font-semibold text-[#52606D]">
                                {item.routeDisplay}
                              </span>
                            ) : null}
                            <span className="rounded-md bg-[#EFF9F8] px-2 py-0.5 text-[11px] font-semibold text-[#0F6F6B]">
                              Approved v{item.approvedVersionNumber ?? item.versionNumber ?? 1}
                            </span>
                            <span
                              className={cn(
                                'rounded-md px-2 py-0.5 text-[11px] font-semibold',
                                item.matchStatus === 'MATCHED'
                                  ? 'bg-[#E7F6EE] text-[#127A4B]'
                                  : 'bg-[#FFF4E5] text-[#B45309]',
                              )}
                            >
                              {item.matchStatus === 'MATCHED'
                                ? 'CCDD/DPD matched'
                                : TREATMENT_LIBRARY_PATHWAY_UI.matchIncomplete}
                            </span>
                            {usage?.state === 'exact_version' ? (
                              <span className="rounded-md bg-[#EEF1F4] px-2 py-0.5 text-[11px] font-semibold text-[#52606D]">
                                {TREATMENT_LIBRARY_PATHWAY_UI.alreadyInPathway}
                              </span>
                            ) : null}
                            {usage?.state === 'older_version' ? (
                              <span className="rounded-md bg-[#FFF4E5] px-2 py-0.5 text-[11px] font-semibold text-[#B45309]">
                                {TREATMENT_LIBRARY_PATHWAY_UI.versionUpdate}
                              </span>
                            ) : null}
                            {usage?.state === 'similar_treatment' ? (
                              <span className="rounded-md bg-[#FFF4E5] px-2 py-0.5 text-[11px] font-semibold text-[#B45309]">
                                {TREATMENT_LIBRARY_PATHWAY_UI.similarExists}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2 pl-2">
                          <p className="text-[12px] text-[#66727D]">
                            {item.pathwayUsageCount > 0
                              ? `Used in ${item.pathwayUsageCount} pathway${item.pathwayUsageCount === 1 ? '' : 's'}`
                              : 'Not used yet'}
                          </p>
                          {usage?.state === 'exact_version' || usage?.state === 'older_version' ? (
                            <button
                              type="button"
                              className="min-h-11 px-2 text-[13px] font-semibold text-[#0F6F6B] hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                onViewExisting?.(usage.pathwayTreatmentId);
                                onOpenChange(false);
                              }}
                            >
                              {usage.state === 'older_version' ? 'Review update' : 'View treatment'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="min-h-11 px-2 text-[13px] font-semibold text-[#0F6F6B] hover:underline disabled:text-[#8A9AA3]"
                              disabled={!selectable}
                              onClick={(e) => {
                                e.stopPropagation();
                                chooseRow(item);
                              }}
                            >
                              Select
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex shrink-0 flex-col gap-3 border-t border-[#E4ECEF] bg-[#FAFCFC] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-[13px] text-[#66727D]">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#0F6F6B]" />
              {TREATMENT_LIBRARY_PATHWAY_UI.footerNote}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                className="h-11 bg-[#0F6F6B] px-4 text-white hover:bg-[#0c5c59] disabled:opacity-50"
                disabled={!selected || !selectableResult(selected) || reviewing || !canEdit}
                onClick={reviewSelected}
              >
                {reviewing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  TREATMENT_LIBRARY_PATHWAY_UI.reviewAction
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(similarConfirm)}
        onOpenChange={(next) => {
          if (!next) setSimilarConfirm(null);
        }}
        title={TREATMENT_LIBRARY_PATHWAY_UI.similarExists}
        description="A treatment with the same medication identity is already on this pathway. Continue only if a distinct regimen is clinically intentional."
        confirmLabel="Continue to review"
        cancelLabel="Cancel"
        variant="default"
        onConfirm={() => {
          const item = similarConfirm;
          setSimilarConfirm(null);
          if (item) void loadReview(item);
        }}
      />
    </>
  );
}

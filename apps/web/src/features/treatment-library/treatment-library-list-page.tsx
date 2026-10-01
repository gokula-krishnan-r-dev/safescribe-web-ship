'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Info,
  Loader2,
  Plus,
  Search,
} from 'lucide-react';
import { toast } from '@/lib/notify';
import {
  TREATMENT_LIBRARY_DEFAULT_PAGE_SIZE,
  TREATMENT_LIBRARY_MATCH_LABELS,
  TREATMENT_LIBRARY_PAGE_SIZES,
  TREATMENT_LIBRARY_POPULATION_LABELS,
  TREATMENT_LIBRARY_UI,
  type TreatmentLibraryListTab,
  type TreatmentLibraryMatchStatus,
  type TreatmentLibraryPopulation,
} from '@safescript/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api-client';
import { toastError } from '@/lib/errors';
import { treatmentLibraryKeys, useTreatmentLibraryList, useTreatmentLibraryUsage } from './hooks';
import type { TreatmentLibraryListItem } from './types';

const TABS: Array<{ id: TreatmentLibraryListTab; label: string }> = [
  { id: 'all', label: 'All treatments' },
  { id: 'approved', label: 'Approved' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'needs_review', label: 'Needs review' },
];

function formatUpdated(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusBadge(item: TreatmentLibraryListItem) {
  if (item.status === 'APPROVED') {
    return {
      label: item.approvedVersionNumber
        ? `Approved v${item.approvedVersionNumber}`
        : 'Approved',
      className: 'bg-[#E7F6EE] text-[#127A4B]',
    };
  }
  if (item.status === 'IN_REVIEW') {
    return { label: 'In review', className: 'bg-[#E8F0FA] text-[#1E3A5F]' };
  }
  if (item.status === 'CHANGES_REQUESTED') {
    return { label: 'Needs review', className: 'bg-[#FFF4E5] text-[#B45309]' };
  }
  if (item.status === 'RETIRED') {
    return { label: 'Retired', className: 'bg-[#F3F4F6] text-[#4B5563]' };
  }
  return { label: 'Draft', className: 'bg-[#EEF1F4] text-[#4B5563]' };
}

export function TreatmentLibraryListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const tab = (searchParams.get('status') as TreatmentLibraryListTab) || 'all';
  const page = Math.max(1, Number(searchParams.get('page') || '1'));
  const population = (searchParams.get('population') || '') as TreatmentLibraryPopulation | '';
  const form = searchParams.get('form') || '';
  const route = searchParams.get('route') || '';
  const matchStatus = (searchParams.get('matchStatus') || '') as TreatmentLibraryMatchStatus | '';
  const searchFromUrl = searchParams.get('search') || '';
  const pageSizeRaw = Number(searchParams.get('pageSize') || TREATMENT_LIBRARY_DEFAULT_PAGE_SIZE);
  const pageSize = (TREATMENT_LIBRARY_PAGE_SIZES as readonly number[]).includes(pageSizeRaw)
    ? pageSizeRaw
    : TREATMENT_LIBRARY_DEFAULT_PAGE_SIZE;

  const [searchInput, setSearchInput] = useState(searchFromUrl);
  const [usageItem, setUsageItem] = useState<TreatmentLibraryListItem | null>(null);
  const [rejectTarget, setRejectTarget] = useState<TreatmentLibraryListItem | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null);

  useEffect(() => {
    setSearchInput(searchFromUrl);
  }, [searchFromUrl]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (searchInput.trim() === searchFromUrl) return;
      patchQuery({ search: searchInput.trim() || undefined, page: 1 });
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const query = useMemo(
    () => ({
      status: tab,
      search: searchFromUrl || undefined,
      population: population || undefined,
      form: form || undefined,
      route: route || undefined,
      matchStatus: matchStatus || undefined,
      page,
      pageSize,
      sort: 'updatedAt' as const,
      order: 'desc' as const,
    }),
    [tab, searchFromUrl, population, form, route, matchStatus, page, pageSize],
  );

  const { data, isLoading, isFetching, isError, refetch } = useTreatmentLibraryList(query);
  const usage = useTreatmentLibraryUsage(usageItem?.id ?? null);

  const patchQuery = (patch: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(patch).forEach(([k, v]) => {
      if (v === undefined || v === '') next.delete(k);
      else next.set(k, String(v));
    });
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  const counts = data?.counts ?? { all: 0, approved: 0, drafts: 0, needsReview: 0 };
  const tabCount = (id: TreatmentLibraryListTab) =>
    id === 'all' ? counts.all : id === 'approved' ? counts.approved : id === 'drafts' ? counts.drafts : counts.needsReview;

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const start = total === 0 ? 0 : (page - 1) * (data?.pageSize ?? pageSize) + 1;
  const end = Math.min(page * (data?.pageSize ?? pageSize), total);
  const hasFilters = Boolean(searchFromUrl || population || form || route || matchStatus || tab !== 'all');
  const formRouteValue = form || route ? `${form}|${route}` : '';
  const pageNumbers = (() => {
    const max = 5;
    if (totalPages <= max) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const first = Math.max(1, Math.min(page - 2, totalPages - max + 1));
    return Array.from({ length: max }, (_, i) => first + i);
  })();

  const openItem = (id: string) => router.push(`/super-admin/treatment-library/${id}`);

  const invalidateLists = () => {
    void qc.invalidateQueries({ queryKey: treatmentLibraryKeys.lists() });
  };

  const approveItem = async (item: TreatmentLibraryListItem) => {
    if (!item.pendingReviewVersionId) {
      openItem(item.id);
      return;
    }
    setReviewBusyId(item.id);
    try {
      await api.post(
        `/treatment-library/${item.id}/versions/${item.pendingReviewVersionId}/approve`,
        {},
      );
      toast.success(`${item.displayName} approved — available in pathway Add from Library.`);
      invalidateLists();
    } catch (error) {
      toastError(error, 'Could not approve this treatment.');
    } finally {
      setReviewBusyId(null);
    }
  };

  const rejectItem = async () => {
    if (!rejectTarget?.pendingReviewVersionId) return;
    setReviewBusyId(rejectTarget.id);
    try {
      await api.post(
        `/treatment-library/${rejectTarget.id}/versions/${rejectTarget.pendingReviewVersionId}/request-changes`,
        { reviewNotes: rejectNotes.trim() || undefined },
      );
      toast.success(`${rejectTarget.displayName} returned for changes.`);
      setRejectTarget(null);
      setRejectNotes('');
      invalidateLists();
    } catch (error) {
      toastError(error, 'Could not reject this treatment.');
    } finally {
      setReviewBusyId(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-[#111827] sm:text-[32px]">
            {TREATMENT_LIBRARY_UI.title}
          </h1>
          <p className="mt-1.5 text-[15px] text-[#5B6B73]">{TREATMENT_LIBRARY_UI.subtitle}</p>
        </div>
        <Button
          onClick={() => router.push('/super-admin/treatment-library/new')}
          className="h-11 gap-2 rounded-lg bg-[#0F6F6B] px-4 text-[15px] font-semibold text-white shadow-sm hover:bg-[#0c5c59]"
        >
          <Plus className="h-4 w-4" />
          {TREATMENT_LIBRARY_UI.newTreatment}
        </Button>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-[#C9E6E3] bg-[#F3FBFA] px-4 py-3.5 text-[14px] leading-relaxed text-[#0F6F6B]">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>{TREATMENT_LIBRARY_UI.banner}</p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-[#E4ECEF]" role="tablist" aria-label="Treatment status">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => patchQuery({ status: t.id === 'all' ? undefined : t.id, page: 1 })}
              className={cn(
                'relative shrink-0 px-3 pb-3 pt-1 text-[15px] font-semibold transition-colors',
                active ? 'text-[#0F6F6B]' : 'text-[#66727D] hover:text-[#111827]',
              )}
            >
              {t.label}{' '}
              <span className={cn('font-semibold', active ? 'text-[#0F6F6B]' : 'text-[#8A9AA3]')}>
                ({tabCount(t.id)})
              </span>
              {active ? (
                <span className="absolute inset-x-2 -bottom-px h-[3px] rounded-full bg-[#0F6F6B]" />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A9AA3]" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={TREATMENT_LIBRARY_UI.searchPlaceholder}
            aria-label="Search treatment library"
            className="h-11 rounded-lg border-[#D5DEE1] bg-white pl-9 text-[14px] shadow-none"
          />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 xl:w-[560px]">
          <Select
            value={population}
            onChange={(e) => patchQuery({ population: e.target.value || undefined, page: 1 })}
            options={[
              { value: '', label: 'All populations' },
              ...Object.entries(TREATMENT_LIBRARY_POPULATION_LABELS).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
            className="h-11 border-[#D5DEE1] bg-white shadow-none"
          />
          <Select
            value={formRouteValue}
            onChange={(e) => {
              const [nextForm = '', nextRoute = ''] = (e.target.value || '').split('|');
              patchQuery({
                form: nextForm || undefined,
                route: nextRoute || undefined,
                page: 1,
              });
            }}
            placeholder="All forms and routes"
            options={[
              { value: '', label: 'All forms and routes' },
              ...(data?.facets.formRoutes ?? []).map((row) => ({
                value: `${row.form}|${row.route}`,
                label: row.label,
              })),
            ]}
            className="h-11 border-[#D5DEE1] bg-white shadow-none"
          />
          <Select
            value={matchStatus}
            onChange={(e) => patchQuery({ matchStatus: e.target.value || undefined, page: 1 })}
            options={[
              { value: '', label: 'All medication matches' },
              { value: 'MATCHED', label: 'Matched' },
              { value: 'INCOMPLETE', label: 'Incomplete' },
              { value: 'UNMATCHED', label: 'Unmatched' },
            ]}
            className="h-11 border-[#D5DEE1] bg-white shadow-none"
          />
        </div>
      </div>

      {isError ? (
        <div className="rounded-xl border border-[#E9A4A8] bg-[#FFF5F5] px-5 py-8 text-center">
          <p className="font-semibold text-[#B4232A]">Treatment Library could not be loaded.</p>
          <Button className="mt-3" variant="outline" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : isLoading && !data ? (
        <div className="overflow-hidden rounded-xl border border-[#E4ECEF] bg-white">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse border-b border-[#F0F4F5] bg-[#F7FAFB]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-[#E4ECEF] bg-white px-6 py-16 text-center">
          <p className="text-[16px] font-semibold text-[#111827]">
            {hasFilters ? TREATMENT_LIBRARY_UI.noResultsTitle : TREATMENT_LIBRARY_UI.emptyTitle}
          </p>
          <p className="mt-1 text-sm text-[#66727D]">
            {hasFilters ? TREATMENT_LIBRARY_UI.noResultsBody : TREATMENT_LIBRARY_UI.emptyBody}
          </p>
          {hasFilters ? (
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => router.replace(pathname)}
            >
              Clear filters
            </Button>
          ) : (
            <Button
              className="mt-4 bg-[#0F6F6B] hover:bg-[#0c5c59]"
              onClick={() => router.push('/super-admin/treatment-library/new')}
            >
              <Plus className="mr-2 h-4 w-4" />
              New treatment
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#E4ECEF] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left" aria-label="Treatment library">
              <thead>
                <tr className="border-b border-[#E4ECEF] bg-[#FAFCFC] text-[13px] font-semibold text-[#66727D]">
                  <th className="px-5 py-3.5">Treatment</th>
                  <th className="px-4 py-3.5">Regimen</th>
                  <th className="px-4 py-3.5">Form / route</th>
                  <th className="px-4 py-3.5">Medication match</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Used in pathways</th>
                  <th className="px-4 py-3.5">Updated</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className={cn(isFetching && 'opacity-70')}>
                {items.map((item) => {
                  const badge = statusBadge(item);
                  const formRoute = [item.productFormDisplay, item.routeDisplay]
                    .filter(Boolean)
                    .join(' · ');
                  const subtitle = [item.genericName || item.brandName, item.strength]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <tr
                      key={item.id}
                      className="cursor-pointer border-b border-[#F0F4F5] last:border-0 hover:bg-[#F8FBFC]"
                      onClick={() => openItem(item.id)}
                    >
                      <td className="px-5 py-4">
                        <p className="text-[14px] font-bold uppercase tracking-[0.01em] text-[#111827]">
                          {item.displayName}
                        </p>
                        {subtitle ? (
                          <p className="mt-0.5 text-[13px] text-[#66727D]">{subtitle}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 text-[14px] text-[#25303B]">
                        {item.regimenLabel || '—'}
                      </td>
                      <td className="px-4 py-4 text-[14px] text-[#25303B]">{formRoute || '—'}</td>
                      <td className="px-4 py-4">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 text-[13px] font-semibold',
                            item.matchStatus === 'MATCHED'
                              ? 'text-[#12805C]'
                              : item.matchStatus === 'INCOMPLETE'
                                ? 'text-[#B45309]'
                                : 'text-[#66727D]',
                          )}
                        >
                          {item.matchStatus === 'MATCHED' ? (
                            <Check className="h-4 w-4" strokeWidth={2.5} />
                          ) : null}
                          {TREATMENT_LIBRARY_MATCH_LABELS[item.matchStatus]}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2.5 py-1 text-[12px] font-semibold',
                            badge.className,
                          )}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        {item.pathwayUsageCount > 0 ? (
                          <button
                            type="button"
                            className="text-[14px] font-semibold text-[#0F6F6B] underline-offset-2 hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setUsageItem(item);
                            }}
                          >
                            {item.pathwayUsageCount} pathway
                            {item.pathwayUsageCount === 1 ? '' : 's'}
                          </button>
                        ) : (
                          <span className="text-[14px] text-[#8A9AA3]">Not used</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-[14px] text-[#52606D]">
                        <time dateTime={item.updatedAt} title={new Date(item.updatedAt).toLocaleString()}>
                          {formatUpdated(item.updatedAt)}
                        </time>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {item.status === 'IN_REVIEW' ? (
                            <>
                              <Button
                                type="button"
                                disabled={reviewBusyId === item.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void approveItem(item);
                                }}
                                className="h-9 bg-[#0F6F6B] px-3 text-[13px] font-semibold text-white hover:bg-[#0c5c59]"
                              >
                                {reviewBusyId === item.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  'Approve'
                                )}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                disabled={reviewBusyId === item.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRejectTarget(item);
                                }}
                                className="h-9 border-[#B45309]/40 px-3 text-[13px] font-semibold text-[#B45309] hover:bg-[#FFF8EB]"
                              >
                                Reject
                              </Button>
                            </>
                          ) : null}
                          <Button
                            type="button"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              openItem(item.id);
                            }}
                            className="h-9 border-[#0F6F6B] px-3 text-[13px] font-semibold text-[#0F6F6B] hover:bg-[#EFF9F8]"
                          >
                            View / Edit
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-[#E4ECEF] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[13px] text-[#66727D]">
                Showing {start}–{end} of {total} treatments
                {isFetching ? (
                  <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin text-[#0F6F6B]" />
                ) : null}
              </p>
              <Select
                value={String(pageSize)}
                onChange={(e) => patchQuery({ pageSize: Number(e.target.value), page: 1 })}
                aria-label="Rows per page"
                options={TREATMENT_LIBRARY_PAGE_SIZES.map((n) => ({
                  value: String(n),
                  label: `${n} / page`,
                }))}
                className="h-9 w-[118px] border-[#D5DEE1] bg-white text-[13px] shadow-none"
              />
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => patchQuery({ page: page - 1 })}
                className="h-9"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              {pageNumbers.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => patchQuery({ page: n })}
                  className={cn(
                    'inline-flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-[13px] font-semibold',
                    n === page ? 'bg-[#0F6F6B] text-white' : 'text-[#52606D] hover:bg-[#F3F6F7]',
                  )}
                >
                  {n}
                </button>
              ))}
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => patchQuery({ page: page + 1 })}
                className="h-9"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={Boolean(usageItem)}
        onOpenChange={(open) => {
          if (!open) setUsageItem(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogTitle>
            {usageItem ? `${usageItem.displayName} — pathway usage` : 'Pathway usage'}
          </DialogTitle>
          <DialogDescription>
            Pathways that currently snapshot this library treatment.
          </DialogDescription>
          {usage.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading usage…</p>
          ) : usage.data?.items.length ? (
            <ul className="space-y-2">
              {usage.data.items.map((row) => (
                <li
                  key={row.pathwayTreatmentId}
                  className="rounded-lg border border-[#E4ECEF] px-3 py-2.5"
                >
                  <p className="text-[14px] font-semibold text-[#111827]">{row.pathwayName}</p>
                  <p className="mt-0.5 text-[13px] text-[#66727D]">
                    {row.province} · source v{row.sourceVersionNumber ?? '—'} · {row.pathwayStatus}
                    {row.hasUpdateAvailable ? ' · update available' : ''}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              This treatment is not linked to any pathways yet.
            </p>
          )}
          {usageItem ? (
            <div className="flex justify-end">
              <Button
                variant="outline"
                className="border-[#0F6F6B] text-[#0F6F6B]"
                onClick={() => {
                  const id = usageItem.id;
                  setUsageItem(null);
                  openItem(id);
                }}
              >
                Open treatment
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(rejectTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setRejectNotes('');
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogTitle>Reject treatment</DialogTitle>
          <DialogDescription>
            {rejectTarget
              ? `Return ${rejectTarget.displayName} for changes. The author can edit and resubmit.`
              : 'Return this treatment for changes.'}
          </DialogDescription>
          <textarea
            className="min-h-[120px] w-full rounded-lg border border-[#C5D0D4] p-3 text-sm"
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            placeholder="Optional review notes"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setRejectTarget(null);
                setRejectNotes('');
              }}
            >
              Cancel
            </Button>
            <Button
              className="bg-[#B45309] hover:bg-[#92400E]"
              disabled={Boolean(reviewBusyId)}
              onClick={() => void rejectItem()}
            >
              {reviewBusyId ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reject'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

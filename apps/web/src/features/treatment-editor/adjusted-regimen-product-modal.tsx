'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { CompatibleProductCandidate } from '@safescript/shared';
import type { DrugSearchResult } from '@/features/consultations/medication-utils';
import { sanitizeDrugSearchResult } from '@/features/consultations/medication-utils';
import {
  adjustedProductErrorCode,
  adjustedProductErrorMessage,
  useAdjustedProductCandidates,
  type AdjustedProductSelectionContext,
} from './use-adjusted-product-candidates';

const SEARCH_DEBOUNCE_MS = 300;

export interface AdjustedRegimenProductModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  consultationId?: string;
  treatmentKey: string;
  currentRegimenLabel?: 'Current pathway regimen' | 'Current prescribed regimen';
  currentProductDisplay: string;
  currentRegimenPrimary: string;
  adjustedRegimenPrimary: string;
  adjustedSupporting?: string;
  applying?: boolean;
  applyError?: string | null;
  onApply: (drug: DrugSearchResult) => void | Promise<void>;
}

export function AdjustedRegimenProductModal({
  open,
  onOpenChange,
  consultationId,
  treatmentKey,
  currentRegimenLabel = 'Current pathway regimen',
  currentProductDisplay,
  currentRegimenPrimary,
  adjustedRegimenPrimary,
  adjustedSupporting,
  applying = false,
  applyError,
  onApply,
}: AdjustedRegimenProductModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const listId = useId();
  const liveId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const search = useAdjustedProductCandidates();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [context, setContext] = useState<AdjustedProductSelectionContext | null>(null);
  const seededRef = useRef(false);
  const requestIdRef = useRef(0);

  const load = (nextQuery: string | null, recommendationId?: string | null) => {
    if (!consultationId || !treatmentKey) return;
    const requestId = ++requestIdRef.current;
    search.mutate(
      {
        consultationId,
        treatmentKey,
        query: nextQuery,
        recommendationId,
      },
      {
        onSuccess: (data) => {
          if (requestId !== requestIdRef.current) return;
          setContext(data);
          if (!seededRef.current) {
            seededRef.current = true;
            setQuery(data.generatedSearchText);
          }
          setSelectedId((current) => {
            if (current && data.candidates.some((c) => c.productId === current)) {
              return current;
            }
            return data.preferredCandidateId;
          });
        },
      },
    );
  };

  useEffect(() => {
    if (!open) {
      seededRef.current = false;
      setQuery('');
      setDebouncedQuery(null);
      setSelectedId(undefined);
      setContext(null);
      search.reset();
      return;
    }
    load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open is the launch trigger
  }, [open, consultationId, treatmentKey]);

  useEffect(() => {
    if (!open || !seededRef.current) return;
    const handle = window.setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [open, query]);

  useEffect(() => {
    if (!open || debouncedQuery == null) return;
    if (debouncedQuery.trim() === (context?.generatedSearchText ?? '').trim()) return;
    if (debouncedQuery.trim().length < 2) return;
    load(debouncedQuery, context?.recommendationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  useEffect(() => {
    if (!open) return;
    const preferred = context?.preferredCandidateId && selectedId === context.preferredCandidateId;
    const timer = window.setTimeout(() => {
      if (preferred) {
        document.getElementById(`${listId}-${selectedId}`)?.focus();
      } else {
        searchRef.current?.focus();
      }
    }, 40);
    return () => window.clearTimeout(timer);
  }, [open, context?.preferredCandidateId, listId, selectedId]);

  const selected = context?.candidates.find((c) => c.productId === selectedId);
  const loading = search.isPending && !context;
  const searching = search.isPending && Boolean(context);
  const missingConsultation = open && !consultationId;
  const errorMessage = missingConsultation
    ? 'Compatible products could not be loaded. Check your connection and try again.'
    : search.isError
      ? adjustedProductErrorMessage(search.error)
      : applyError;
  const stale = adjustedProductErrorCode(search.error) === 'RECOMMENDATION_STALE';
  const announcement = useMemo(() => {
    if (applying) return 'Applying product and adjusted regimen.';
    if (searching) return 'Searching for compatible products.';
    if (loading) return 'Searching for compatible products.';
    if (context) {
      const count = context.candidates.length;
      const selectedName = selected?.displayName;
      if (!count) return 'No exact compatible product was found.';
      if (selectedName) {
        return `${count} compatible product${count === 1 ? '' : 's'} found. ${selectedName} selected.`;
      }
      return `${count} compatible products found.`;
    }
    return '';
  }, [applying, context, loading, searching, selected?.displayName]);

  const canConfirm = Boolean(selected) && !search.isPending && !applying && !stale;
  const blocked = applying;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (blocked) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        hideCloseButton
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="flex max-h-[min(820px,calc(100vh-48px))] w-[calc(100vw-32px)] max-w-[680px] flex-col gap-0 overflow-hidden rounded-[18px] p-0"
        onEscapeKeyDown={(event) => {
          if (blocked) event.preventDefault();
        }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#e6ecee] px-6 py-5">
          <div className="min-w-0 pr-8">
            <DialogTitle id={titleId} className="text-[20px] font-bold leading-tight text-[#1e3a5f]">
              Choose product for adjusted regimen
            </DialogTitle>
            <DialogDescription id={descriptionId} className="mt-1.5 text-[13.5px] leading-snug text-[#667085]">
              A different product strength is required to use the recommended renal regimen.
            </DialogDescription>
          </div>
          <button
            type="button"
            disabled={blocked}
            onClick={() => onOpenChange(false)}
            aria-label="Close product selection"
            className="absolute right-4 top-4 rounded-md p-1.5 text-[#667085] hover:bg-[#f4f7f8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F817C]/40 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <p id={liveId} className="sr-only" aria-live="polite">
            {announcement}
          </p>

          <ComparisonCard
            step={1}
            heading={context?.currentRegimenLabel ?? currentRegimenLabel}
            title={context?.currentProductDisplay ?? currentProductDisplay}
            body={context?.currentRegimenDisplay.primary ?? currentRegimenPrimary}
            chip="Current"
          />

          <div className="flex justify-center" aria-hidden>
            <ChevronDown className="h-5 w-5 text-[#98a2b3]" />
          </div>

          <ComparisonCard
            step={2}
            heading="Adjusted regimen for this patient"
            title={context?.adjustedRegimenDisplay.primary ?? adjustedRegimenPrimary}
            body={context?.adjustedRegimenDisplay.supporting ?? adjustedSupporting}
            chip="Recommended"
            emphasis
          />

          <section>
            <div className="mb-2 flex items-center gap-2">
              <StepBadge n={3} />
              <h3 className="text-[14px] font-semibold text-[#1e3a5f]">Select a compatible product</h3>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98a2b3]" />
              <Input
                ref={searchRef}
                value={query}
                disabled={blocked}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by generic name, brand, strength, or dosage form"
                className="h-11 rounded-xl pl-9 pr-10 text-[14px]"
                aria-controls={listId}
                aria-autocomplete="list"
              />
              {query ? (
                <button
                  type="button"
                  disabled={blocked}
                  aria-label="Clear search"
                  onClick={() => setQuery(context?.generatedSearchText ?? '')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#667085] hover:bg-[#f4f7f8]"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <div className="mt-3 space-y-2" role="radiogroup" aria-labelledby={listId} id={listId}>
              {loading || searching ? (
                <>
                  <Skeleton className="h-[72px] w-full rounded-xl" />
                  <Skeleton className="h-[72px] w-full rounded-xl" />
                </>
              ) : null}
              {!search.isPending && context?.candidates.length
                ? context.candidates.map((candidate) => (
                    <CandidateRow
                      key={candidate.productId}
                      candidate={candidate}
                      selected={selectedId === candidate.productId}
                      disabled={blocked}
                      inputId={`${listId}-${candidate.productId}`}
                      onSelect={() => setSelectedId(candidate.productId)}
                    />
                  ))
                : null}
              {!search.isPending && context && context.candidates.length === 0 ? (
                <p className="rounded-xl border border-[#ead9b0] bg-[#fffaf0] px-3.5 py-3 text-[13.5px] leading-relaxed text-[#7a5b12]">
                  No exact compatible product was found. Search by generic name, brand, strength, or
                  dosage form.
                </p>
              ) : null}
            </div>
            <p className="mt-2 text-[12.5px] text-[#667085]">
              Only products compatible with the adjusted regimen are shown.
            </p>
          </section>

          {errorMessage ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#f0c7c2] bg-[#fdecee] px-3.5 py-3">
              <p className="text-[13px] text-[#b42318]">{errorMessage}</p>
              {search.isError && !stale ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => load(seededRef.current ? query : null, context?.recommendationId)}
                >
                  Retry search
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[#e6ecee] bg-white px-6 py-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={blocked}
            onClick={() => onOpenChange(false)}
            className="h-11 rounded-xl px-4"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canConfirm}
            onClick={() => {
              if (!selected) return;
              void onApply(catalogueToDrug(selected));
            }}
            className="h-11 rounded-xl bg-[#0F817C] px-4 text-white hover:bg-[#0c6d69]"
          >
            {applying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Applying…
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Use product and regimen
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ComparisonCard({
  step,
  heading,
  title,
  body,
  chip,
  emphasis,
}: {
  step: number;
  heading: string;
  title: string;
  body?: string;
  chip: string;
  emphasis?: boolean;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <StepBadge n={step} emphasis={emphasis} />
        <h3 className="text-[14px] font-semibold text-[#1e3a5f]">{heading}</h3>
      </div>
      <div
        className={cn(
          'flex items-start justify-between gap-3 rounded-xl border px-3.5 py-3',
          emphasis
            ? 'border-[#b7e0d4] bg-[#eef8f4]'
            : 'border-[#e6ecee] bg-[#f8fbfb]',
        )}
      >
        <div className="min-w-0">
          <p
            className={cn(
              'text-[14.5px] font-semibold leading-snug',
              emphasis ? 'text-[#0F817C]' : 'text-[#1e3a5f]',
            )}
          >
            {title}
          </p>
          {body ? <p className="mt-0.5 text-[13px] leading-snug text-[#667085]">{body}</p> : null}
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
            emphasis
              ? 'bg-[#d8f3ea] text-[#0F817C]'
              : 'bg-[#eef2f4] text-[#52606d]',
          )}
        >
          {chip}
        </span>
      </div>
    </section>
  );
}

function CandidateRow({
  candidate,
  selected,
  disabled,
  inputId,
  onSelect,
}: {
  candidate: CompatibleProductCandidate;
  selected: boolean;
  disabled?: boolean;
  inputId: string;
  onSelect: () => void;
}) {
  const kind =
    candidate.brandName &&
    candidate.brandName.toLowerCase() !== candidate.genericName.toLowerCase()
      ? 'Brand'
      : 'Generic';
  return (
    <label
      htmlFor={inputId}
      className={cn(
        'flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3',
        selected ? 'border-[#0F817C] bg-[#f3fbf9] ring-1 ring-[#0F817C]/30' : 'border-[#e6ecee] bg-white',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      <input
        id={inputId}
        type="radio"
        name="adjusted-regimen-product"
        checked={selected}
        disabled={disabled}
        onChange={onSelect}
        className="mt-1 h-4 w-4 accent-[#0F817C]"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-[#1e3a5f]">{candidate.displayName}</p>
        <p className="mt-0.5 text-[12.5px] text-[#667085]">
          {[kind, candidate.formDisplay, candidate.routeDisplay].filter(Boolean).join(' · ')}
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-[#e8f6f4] px-2 py-0.5 text-[11px] font-semibold text-[#0F817C]">
        Compatible
      </span>
    </label>
  );
}

function StepBadge({ n, emphasis }: { n: number; emphasis?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 w-5 items-center justify-center rounded-[5px] text-[11px] font-bold',
        emphasis ? 'bg-[#0F817C] text-white' : 'bg-[#e8eef0] text-[#52606d]',
      )}
    >
      {n}
    </span>
  );
}

function catalogueToDrug(candidate: CompatibleProductCandidate): DrugSearchResult {
  const raw = candidate.catalogue;
  return sanitizeDrugSearchResult({
    id: String(raw.id ?? candidate.productId),
    brandName: String(raw.brandName ?? candidate.brandName ?? candidate.displayName),
    genericName: String(raw.genericName ?? candidate.genericName),
    strength: raw.strength ? String(raw.strength) : candidate.strengthDisplay,
    dosageForm: raw.dosageForm ? String(raw.dosageForm) : candidate.formDisplay,
    manufacturer: raw.manufacturer ? String(raw.manufacturer) : candidate.manufacturer,
    drugClass: raw.drugClass ? String(raw.drugClass) : undefined,
    label: String(raw.label ?? candidate.label),
    source:
      raw.source === 'rxnorm' || raw.source === 'openfda' || raw.source === 'ccdd'
        ? raw.source
        : 'ccdd',
    rxcui: raw.rxcui ? String(raw.rxcui) : undefined,
    ndc: raw.ndc ? String(raw.ndc) : undefined,
    codeDisplay: raw.codeDisplay ? String(raw.codeDisplay) : candidate.din,
  });
}

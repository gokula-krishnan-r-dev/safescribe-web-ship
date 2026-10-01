'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import {
  ArrowRight,
  Check,
  CloudUpload,
  ClipboardPaste,
  FileText,
  Loader2,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { medicationShortName, type RenewMedication } from '@safescript/shared';
import { toast } from '@/lib/notify';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  enumerateDrugBrandGroups,
  formatDrugStrengthOption,
} from '@/features/consultations/drug-search-groups';
import { useDrugSearchInput } from '@/features/consultations/use-drug-search-input';
import type { DrugSearchResult } from '@/features/consultations/medication-utils';
import { cn } from '@/lib/utils';
import {
  IMAGE_ACCEPT,
  MAX_BYTES,
  MAX_SCREENSHOTS,
  POPULAR_RENEW_SEARCHES,
  UPLOAD_ACCEPT,
  captureGridClass,
  digitsOnly,
  filesFromClipboard,
  formatFileBytes,
  isImageFile,
  isRenewSearchResultAdded,
  isUploadFile,
  pasteEventShouldIgnore,
  renewSearchAddedLookup,
  type CaptureAction,
  type CaptureMode,
} from './medication-capture-utils';

export type { CaptureAction, CaptureMode };

const ACTIONS: Array<{
  id: CaptureAction;
  title: string;
  helper: string;
  icon: typeof Search;
}> = [
  {
    id: 'search',
    title: 'Search medication',
    helper: 'Search DPD products and enter current directions.',
    icon: Search,
  },
  {
    id: 'screenshot',
    title: 'Paste screenshot',
    helper: 'Paste one or more screenshots, then extract information.',
    icon: ClipboardPaste,
  },
  {
    id: 'upload',
    title: 'Upload document',
    helper: 'Upload compliance sheet, medication profile, or renewal request.',
    icon: CloudUpload,
  },
];

type StagedFile = {
  id: string;
  file: File;
  url?: string;
};

function newId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `cap_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function compactAddedLabel(med: RenewMedication) {
  const name = medicationShortName(med);
  const strength = med.normalized.strength?.trim();
  if (strength && !name.toLowerCase().includes(strength.toLowerCase())) {
    return `${name} ${strength}`;
  }
  return name;
}

function AddedMedicationsRail({
  items,
  highlightId,
}: {
  items: RenewMedication[];
  highlightId?: string | null;
}) {
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!highlightId) return;
    const row = listRef.current?.querySelector(`[data-added-id="${CSS.escape(highlightId)}"]`);
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [highlightId]);

  if (!items.length) return null;

  return (
    <aside
      className="flex w-full shrink-0 flex-col overflow-hidden rounded-xl border border-[#d3dee1] bg-white md:w-[200px]"
      aria-label="Added medications"
    >
      <div className="flex items-center justify-between border-b border-[#edf3f4] px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7b8b94]">Added</p>
        <span className="tabular-nums text-[11px] font-medium text-[#7b8b94]" aria-live="polite">
          {items.length}
        </span>
      </div>
      <ol ref={listRef} className="max-h-[236px] overflow-y-auto py-1">
        {items.map((med, index) => (
          <li
            key={med.id}
            data-added-id={med.id}
            className={cn(
              'flex items-start gap-2 px-3 py-1.5 text-[13px] leading-snug text-[#163447] transition-colors duration-500',
              highlightId === med.id && 'bg-primary/[0.10]',
            )}
          >
            <span className="w-5 shrink-0 pt-px text-[11px] font-semibold tabular-nums text-[#7b8b94]">
              {index + 1}.
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{compactAddedLabel(med)}</span>
              {med.normalized.din ? (
                <span className="block truncate text-[11px] text-[#7b8b94]">DIN {med.normalized.din}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function SearchInlineContent({
  disabled,
  addedItems,
  highlightId,
  onSelect,
}: {
  disabled?: boolean;
  addedItems: RenewMedication[];
  highlightId?: string | null;
  onSelect: (drug: DrugSearchResult) => void;
}) {
  const addedLookup = useMemo(() => renewSearchAddedLookup(addedItems), [addedItems]);
  const {
    showDropdown,
    isFetching,
    containerRef,
    inputRef,
    inputProps,
    results,
    groups,
    debouncedQuery,
    activeIndex,
    setActiveIndex,
    select,
    listId,
    setQuery,
    setOpen,
    query,
  } = useDrugSearchInput({
    onSelect,
    autoFocus: true,
    clearOnSelect: true,
    preserveQueryOnSelect: false,
    refocusOnSelect: true,
    allowFreeText: false,
  });

  useEffect(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [inputRef]);

  const groupedRows = useMemo(() => enumerateDrugBrandGroups(groups), [groups]);
  const showPopular = !query.trim();
  const showAddedRail = addedItems.length > 0;

  return (
    <div ref={containerRef} id="renew-search-inline" className="mt-3">
      <div className={cn('flex flex-col gap-3', showAddedRail && 'md:flex-row md:items-start')}>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a9aa3]" />
            <Input
              {...inputProps}
              ref={inputRef}
              disabled={disabled}
              placeholder="Search by brand, generic, or DIN..."
              className="h-11 rounded-xl border-[#d3dee1] bg-white pl-10 pr-10 text-sm shadow-none placeholder:text-[#8a9aa3] focus-visible:ring-primary/25"
            />
            {inputProps.value ? (
              <button
                type="button"
                aria-label="Clear search"
                disabled={disabled}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[#8a9aa3] hover:bg-[#f4f8f8] hover:text-[#163447]"
                onClick={() => {
                  setQuery('');
                  setOpen(false);
                  inputRef.current?.focus();
                }}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
            {isFetching ? (
              <Loader2 className="pointer-events-none absolute right-9 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#8a9aa3]" />
            ) : null}
          </div>

          {showPopular ? (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#7b8b94]">
                Popular searches
              </p>
              <div className="flex flex-wrap gap-2">
                {POPULAR_RENEW_SEARCHES.map((name) => (
                  <button
                    key={name}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setQuery(name);
                      setOpen(true);
                      requestAnimationFrame(() => inputRef.current?.focus());
                    }}
                    className="inline-flex h-8 items-center rounded-full border border-[#d3dee1] bg-white px-3 text-[13px] font-medium text-[#163447] transition-colors hover:border-primary/40 hover:bg-primary/[0.04] hover:text-primary"
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {showDropdown ? (
            <div
              id={listId}
              role="listbox"
              className="overflow-hidden rounded-xl border border-[#d3dee1] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)]"
            >
              {isFetching && !results.length ? (
                <div className="flex items-center gap-2 px-3.5 py-3 text-sm text-[#5b6b75]">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Searching…
                </div>
              ) : null}

              {!isFetching && !results.length ? (
                <p className="px-3.5 py-3 text-sm text-[#5b6b75]">
                  No matches for &ldquo;{debouncedQuery}&rdquo;.
                </p>
              ) : null}

              <div className="max-h-[min(360px,46vh)] overflow-y-auto overscroll-contain">
                {groupedRows.map((row) => {
                  if (row.kind === 'group') {
                    return (
                      <div
                        key={`group-${row.group.key}`}
                        className="sticky top-0 z-[1] border-b border-[#edf3f4] bg-[#f4f8f8] px-3.5 py-2"
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#163447]">
                          {row.group.brandName}
                        </p>
                        {row.group.genericName ? (
                          <p className="text-[12px] text-[#7b8b94]">{row.group.genericName}</p>
                        ) : null}
                      </div>
                    );
                  }

                  const { item, index } = row;
                  const strength = formatDrugStrengthOption(item);
                  const din = digitsOnly(item.codeDisplay) || digitsOnly(item.ndc);
                  const alreadyAdded = isRenewSearchResultAdded(item, addedLookup);
                  const displayName = `${row.group.brandName} ${strength.title}`;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={index === activeIndex}
                      aria-label={
                        alreadyAdded
                          ? `${displayName} already added. Add another.`
                          : `Add ${displayName}`
                      }
                      disabled={disabled}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => select(item)}
                      className={cn(
                        'flex w-full items-center gap-3 border-b border-[#edf3f4] px-3.5 py-2.5 text-left last:border-b-0 transition-colors',
                        index === activeIndex ? 'bg-primary/[0.06]' : 'hover:bg-[#f7fbfb]',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-[#163447]">{strength.title}</span>
                        {din ? (
                          <span className="mt-0.5 block text-[12px] text-[#7b8b94]">DIN {din}</span>
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
                          alreadyAdded
                            ? 'bg-[#0b9560] text-white'
                            : 'bg-primary/10 text-primary hover:bg-primary hover:text-white',
                        )}
                        aria-hidden
                      >
                        {alreadyAdded ? (
                          <Check className="h-4 w-4" strokeWidth={2.5} />
                        ) : (
                          <Plus className="h-4 w-4" strokeWidth={2.5} />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {showAddedRail ? <AddedMedicationsRail items={addedItems} highlightId={highlightId} /> : null}
      </div>
    </div>
  );
}

function PasteInlineContent({
  disabled,
  processing,
  shots,
  onAdd,
  onRemove,
  onAnalyze,
}: {
  disabled?: boolean;
  processing?: boolean;
  shots: StagedFile[];
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  onAnalyze: () => void;
}) {
  const inputId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const remaining = MAX_SCREENSHOTS - shots.length;

  useEffect(() => {
    if (disabled || processing) return;

    const onPaste = (event: ClipboardEvent) => {
      if (pasteEventShouldIgnore(event.target)) return;
      const images = filesFromClipboard(event);
      if (!images.length) return;
      event.preventDefault();
      onAdd(images);
    };

    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [disabled, processing, onAdd]);

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    if (disabled || processing) return;
    onAdd(Array.from(event.dataTransfer.files ?? []));
  };

  return (
    <div ref={rootRef} id="renew-paste-inline" className="mt-3 space-y-3" tabIndex={-1}>
      <div
        className={cn(
          'rounded-xl border-2 border-dashed px-4 py-6 transition-colors',
          dragOver ? 'border-primary bg-primary/[0.04]' : 'border-[#c9d7db] bg-white/70',
          processing && 'pointer-events-none opacity-70',
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled && remaining > 0) setDragOver(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false);
        }}
        onDrop={handleDrop}
      >
        {!shots.length ? (
          <button
            type="button"
            disabled={disabled || processing || remaining <= 0}
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 py-1 text-center"
          >
            <ClipboardPaste className="h-9 w-9 text-primary/80" strokeWidth={1.5} />
            <span className="text-sm font-semibold text-[#163447]">Paste screenshot here</span>
            <span className="text-[12px] text-[#7b8b94]">
              Press ⌘V / Ctrl+V, or click to add images
            </span>
            <span className="text-[11px] text-[#9aa8b0]">JPG, PNG (Max 10 MB each)</span>
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-[12px] font-medium text-[#5b6b75]">
              {shots.length} screenshot{shots.length === 1 ? '' : 's'} added
            </p>
            <div className="flex flex-wrap gap-3">
              {shots.map((shot) => (
                <div key={shot.id} className="relative w-[92px] shrink-0">
                  <div className="overflow-hidden rounded-lg border border-[#d3dee1] bg-white">
                    {shot.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={shot.url} alt="" className="h-[68px] w-full object-contain p-1" />
                    ) : (
                      <div className="flex h-[68px] items-center justify-center bg-[#f4f8f8]">
                        <ClipboardPaste className="h-5 w-5 text-[#8a9aa3]" />
                      </div>
                    )}
                  </div>
                  <p className="mt-1 truncate text-[10px] font-medium text-[#163447]">{shot.file.name}</p>
                  <p className="text-[10px] text-[#7b8b94]">{formatFileBytes(shot.file.size)}</p>
                  <button
                    type="button"
                    disabled={disabled || processing}
                    aria-label={`Remove ${shot.file.name}`}
                    onClick={() => onRemove(shot.id)}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#163447] text-white shadow-sm hover:bg-[#2b3c46]"
                  >
                    <X className="h-3 w-3" strokeWidth={2.5} />
                  </button>
                </div>
              ))}
              {remaining > 0 ? (
                <button
                  type="button"
                  disabled={disabled || processing}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-[92px] w-[92px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[#c9d7db] text-[#7b8b94] transition-colors hover:border-primary/40 hover:bg-primary/[0.03] hover:text-primary"
                >
                  <Plus className="h-5 w-5" />
                  <span className="text-[10px] font-medium">Add more</span>
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {shots.length ? (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={disabled || processing || !shots.length}
            onClick={onAnalyze}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Extracting…
              </>
            ) : (
              <>
                Extract details
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        id={inputId}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        className="hidden"
        disabled={disabled || processing || remaining <= 0}
        onChange={(event) => {
          onAdd(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
    </div>
  );
}

function UploadInlineContent({
  disabled,
  processing,
  files,
  onAdd,
  onRemove,
  onAnalyze,
}: {
  disabled?: boolean;
  processing?: boolean;
  files: StagedFile[];
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  onAnalyze: () => void;
}) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    if (disabled || processing) return;
    onAdd(Array.from(event.dataTransfer.files ?? []));
  };

  return (
    <div id="renew-upload-inline" className="mt-3 space-y-3">
      <div
        className={cn(
          'rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors',
          dragOver ? 'border-primary bg-primary/[0.04]' : 'border-[#c9d7db] bg-white/70',
          processing && 'pointer-events-none opacity-70',
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false);
        }}
        onDrop={handleDrop}
      >
        <button
          type="button"
          disabled={disabled || processing}
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full flex-col items-center gap-2"
        >
          <CloudUpload className="h-9 w-9 text-primary" strokeWidth={1.5} />
          <span className="text-sm font-semibold text-primary">Drag and drop files here or browse</span>
          <span className="text-[12px] text-[#7b8b94]">
            Upload compliance sheet, medication profile, or renewal request
          </span>
          <span className="text-[11px] text-[#9aa8b0]">PDF, JPG, PNG (Max 10 MB each)</span>
        </button>
      </div>

      {files.length ? (
        <ul className="space-y-2">
          {files.map((entry) => {
            const isPdf = entry.file.type === 'application/pdf' || entry.file.name.toLowerCase().endsWith('.pdf');
            return (
              <li
                key={entry.id}
                className="flex items-center gap-3 rounded-xl border border-[#d3dee1] bg-white px-3 py-2.5"
              >
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                    isPdf ? 'bg-red-50 text-red-600' : 'bg-primary/10 text-primary',
                  )}
                >
                  <FileText className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[#163447]">{entry.file.name}</span>
                  <span className="text-[12px] text-[#7b8b94]">{formatFileBytes(entry.file.size)}</span>
                </span>
                <button
                  type="button"
                  disabled={disabled || processing}
                  aria-label={`Remove ${entry.file.name}`}
                  onClick={() => onRemove(entry.id)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#8a9aa3] hover:bg-[#f4f8f8] hover:text-[#163447]"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {files.length ? (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={disabled || processing || !files.length}
            onClick={onAnalyze}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Extracting…
              </>
            ) : (
              <>
                Extract details
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        id={inputId}
        type="file"
        accept={UPLOAD_ACCEPT}
        multiple
        className="hidden"
        disabled={disabled || processing}
        onChange={(event) => {
          onAdd(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
    </div>
  );
}

function CaptureControl({
  action,
  mode,
  compact,
  disabled,
  processing,
  pastedShots,
  uploadedFiles,
  onActivate,
  onClose,
  addedItems,
  highlightId,
  onDrugSelect,
  onAddPaste,
  onRemovePaste,
  onAnalyzePaste,
  onAddUpload,
  onRemoveUpload,
  onAnalyzeUpload,
}: {
  action: (typeof ACTIONS)[number];
  mode: CaptureMode;
  compact: boolean;
  disabled?: boolean;
  processing?: boolean;
  pastedShots: StagedFile[];
  uploadedFiles: StagedFile[];
  onActivate: () => void;
  onClose: () => void;
  addedItems: RenewMedication[];
  highlightId?: string | null;
  onDrugSelect: (drug: DrugSearchResult) => void;
  onAddPaste: (files: File[]) => void;
  onRemovePaste: (id: string) => void;
  onAnalyzePaste: () => void;
  onAddUpload: (files: File[]) => void;
  onRemoveUpload: (id: string) => void;
  onAnalyzeUpload: () => void;
}) {
  const Icon = action.icon;
  const active = mode === action.id;
  const controlId = `renew-capture-${action.id}`;

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape' && active) {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col rounded-xl border bg-white transition-[border-color,box-shadow,background-color,opacity] duration-150 ease-out',
        active
          ? 'order-first border-primary/50 bg-primary/[0.035] md:order-none'
          : 'h-full border-[#d9e3e6] hover:border-primary/35 hover:bg-primary/[0.015]',
        compact && !active && 'self-stretch',
      )}
    >
      <div
        className={cn(
          'flex w-full flex-1 items-start gap-2.5',
          active ? 'px-4 pb-0 pt-3.5' : 'px-4 py-3.5',
          compact && !active && 'flex-col items-center justify-center px-2.5 py-3.5 text-center',
        )}
      >
        <button
          type="button"
          id={controlId}
          disabled={disabled && !active}
          aria-expanded={active}
          aria-controls={
            active
              ? action.id === 'search'
                ? 'renew-search-inline'
                : action.id === 'screenshot'
                  ? 'renew-paste-inline'
                  : 'renew-upload-inline'
              : undefined
          }
          onClick={onActivate}
          onKeyDown={handleKeyDown}
          className={cn(
            'flex min-h-[3.25rem] min-w-0 flex-1 items-start gap-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-offset-2',
            compact && !active && 'min-h-0 flex-col items-center justify-center text-center',
          )}
        >
          <span
            className={cn(
              'flex shrink-0 items-center justify-center rounded-lg',
              compact && !active ? 'h-9 w-9' : 'mt-0.5 h-9 w-9',
              active ? 'bg-primary text-white' : 'bg-primary/10 text-primary',
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <span className={cn('min-w-0 flex-1', compact && !active && 'w-full')}>
            <span className="block text-sm font-semibold leading-5 text-[#163447]">{action.title}</span>
            {!compact || active ? (
              <span className="mt-0.5 line-clamp-2 block min-h-[2.25rem] text-[12px] leading-snug text-[#7b8b94]">
                {action.helper}
              </span>
            ) : null}
          </span>
        </button>
        {active ? (
          <button
            type="button"
            aria-label={`Close ${action.title.toLowerCase()}`}
            onClick={onClose}
            className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#8a9aa3] hover:bg-white hover:text-[#163447]"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {active && action.id === 'search' ? (
        <div className="px-4 pb-4">
          <SearchInlineContent
            disabled={disabled}
            addedItems={addedItems}
            highlightId={highlightId}
            onSelect={onDrugSelect}
          />
        </div>
      ) : null}

      {active && action.id === 'screenshot' ? (
        <div className="px-4 pb-4">
          <PasteInlineContent
            disabled={disabled}
            processing={processing && mode === 'screenshot'}
            shots={pastedShots}
            onAdd={onAddPaste}
            onRemove={onRemovePaste}
            onAnalyze={onAnalyzePaste}
          />
        </div>
      ) : null}

      {active && action.id === 'upload' ? (
        <div className="px-4 pb-4">
          <UploadInlineContent
            disabled={disabled}
            processing={processing && mode === 'upload'}
            files={uploadedFiles}
            onAdd={onAddUpload}
            onRemove={onRemoveUpload}
            onAnalyze={onAnalyzeUpload}
          />
        </div>
      ) : null}
    </div>
  );
}

export function MedicationCaptureRow({
  mode,
  onModeChange,
  disabled,
  processing,
  addedItems = [],
  highlightId,
  onDrugSelect,
  onAnalyzeScreenshots,
  onAnalyzeUpload,
  heading = 'Add medications to renew',
  subheading = 'Choose one way to add medications.',
  actionOverrides,
}: {
  mode: CaptureMode;
  onModeChange: (mode: CaptureMode) => void;
  disabled?: boolean;
  processing?: boolean;
  addedItems?: RenewMedication[];
  highlightId?: string | null;
  onDrugSelect: (drug: DrugSearchResult) => void;
  onAnalyzeScreenshots: (files: File[]) => void;
  onAnalyzeUpload: (files: File[]) => void;
  heading?: string;
  subheading?: string;
  actionOverrides?: Partial<Record<CaptureAction, { title?: string; helper?: string }>>;
}) {
  const [pastedShots, setPastedShots] = useState<StagedFile[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<StagedFile[]>([]);
  const [discardPrompt, setDiscardPrompt] = useState<{
    open: boolean;
    next: CaptureMode;
  }>({ open: false, next: 'none' });
  const shotsRef = useRef(pastedShots);
  shotsRef.current = pastedShots;

  useEffect(() => {
    return () => {
      for (const shot of shotsRef.current) {
        if (shot.url) URL.revokeObjectURL(shot.url);
      }
    };
  }, []);

  const hasUnsavedPaste = pastedShots.length > 0;
  const hasUnsavedUpload = uploadedFiles.length > 0;

  const hasUnsavedForMode = (target: CaptureMode) => {
    if (target === 'screenshot') return hasUnsavedPaste;
    if (target === 'upload') return hasUnsavedUpload;
    return false;
  };

  const leavingWouldLoseWork = (from: CaptureMode) => hasUnsavedForMode(from);

  const clearModeDrafts = (target: CaptureMode) => {
    if (target === 'screenshot') {
      setPastedShots((prev) => {
        for (const shot of prev) {
          if (shot.url) URL.revokeObjectURL(shot.url);
        }
        return [];
      });
    }
    if (target === 'upload') setUploadedFiles([]);
  };

  const applyModeChange = (next: CaptureMode) => {
    if (mode !== 'none' && mode !== next && hasUnsavedForMode(mode)) {
      clearModeDrafts(mode);
    }
    onModeChange(next);
  };

  const requestMode = (next: CaptureMode) => {
    if (disabled && next !== mode) return;

    if (mode === next) {
      if (mode !== 'none' && leavingWouldLoseWork(mode)) {
        setDiscardPrompt({ open: true, next: 'none' });
        return;
      }
      applyModeChange('none');
      return;
    }

    if (mode !== 'none' && leavingWouldLoseWork(mode)) {
      setDiscardPrompt({ open: true, next });
      return;
    }

    applyModeChange(next);
  };

  const addPasteFiles = useCallback((incoming: File[]) => {
    if (!incoming.length || disabled || processing) return;
    const prev = shotsRef.current;
    const remaining = MAX_SCREENSHOTS - prev.length;
    if (remaining <= 0) {
      toast.error(`You can attach up to ${MAX_SCREENSHOTS} screenshots.`);
      return;
    }

    const accepted: StagedFile[] = [];
    let skippedType = false;
    let skippedSize = false;

    for (const file of incoming) {
      if (accepted.length >= remaining) break;
      if (!isImageFile(file)) {
        skippedType = true;
        continue;
      }
      if (file.size > MAX_BYTES) {
        skippedSize = true;
        continue;
      }
      accepted.push({ id: newId(), file, url: URL.createObjectURL(file) });
    }

    if (skippedType) toast.error('Use a PNG or JPG screenshot.');
    if (skippedSize) toast.error('Each screenshot must be 10 MB or smaller.');
    if (!accepted.length) return;

    setPastedShots((current) => [...current, ...accepted].slice(0, MAX_SCREENSHOTS));
  }, [disabled, processing]);

  const removePaste = (id: string) => {
    setPastedShots((prev) => {
      const removed = prev.find((shot) => shot.id === id);
      if (removed?.url) URL.revokeObjectURL(removed.url);
      return prev.filter((shot) => shot.id !== id);
    });
  };

  const addUploadFiles = useCallback((incoming: File[]) => {
    if (!incoming.length || disabled || processing) return;
    const accepted: StagedFile[] = [];
    let skippedType = false;
    let skippedSize = false;

    for (const file of incoming) {
      if (!isUploadFile(file)) {
        skippedType = true;
        continue;
      }
      if (file.size > MAX_BYTES) {
        skippedSize = true;
        continue;
      }
      accepted.push({ id: newId(), file });
    }

    if (skippedType) toast.error('This file type is not supported. Upload a PDF, PNG, or JPG.');
    if (skippedSize) toast.error('Each file must be 10 MB or smaller.');
    if (!accepted.length) return;

    setUploadedFiles((current) => {
      const byName = new Map(current.map((entry) => [entry.file.name, entry]));
      for (const entry of accepted) byName.set(entry.file.name, entry);
      return [...byName.values()];
    });
  }, [disabled, processing]);

  const handleAnalyzePaste = () => {
    if (!pastedShots.length || processing) return;
    onAnalyzeScreenshots(pastedShots.map((shot) => shot.file));
  };

  const handleAnalyzeUpload = () => {
    if (!uploadedFiles.length || processing) return;
    onAnalyzeUpload(uploadedFiles.map((entry) => entry.file));
  };

  useEffect(() => {
    if (mode === 'none') {
      setPastedShots((prev) => {
        for (const shot of prev) {
          if (shot.url) URL.revokeObjectURL(shot.url);
        }
        return [];
      });
      setUploadedFiles([]);
    }
  }, [mode]);

  const compact = mode !== 'none';

  const actions = useMemo(() => {
    if (!actionOverrides) return ACTIONS;
    return ACTIONS.map((a) => ({
      ...a,
      title: actionOverrides[a.id]?.title ?? a.title,
      helper: actionOverrides[a.id]?.helper ?? a.helper,
    }));
  }, [actionOverrides]);

  return (
    <div>
      <h2 className="text-base font-semibold text-[#163447]">{heading}</h2>
      <p className="mt-0.5 text-sm text-[#5b6b75]">{subheading}</p>

      <div className={cn('mt-3', captureGridClass(mode))}>
        {actions.map((action) => (
          <CaptureControl
            key={action.id}
            action={action}
            mode={mode}
            compact={compact}
            disabled={disabled}
            processing={processing}
            pastedShots={pastedShots}
            uploadedFiles={uploadedFiles}
            onActivate={() => requestMode(action.id)}
            onClose={() => requestMode('none')}
            addedItems={addedItems}
            highlightId={highlightId}
            onDrugSelect={onDrugSelect}
            onAddPaste={addPasteFiles}
            onRemovePaste={removePaste}
            onAnalyzePaste={handleAnalyzePaste}
            onAddUpload={addUploadFiles}
            onRemoveUpload={(id) => setUploadedFiles((prev) => prev.filter((f) => f.id !== id))}
            onAnalyzeUpload={handleAnalyzeUpload}
          />
        ))}
      </div>

      <ConfirmDialog
        open={discardPrompt.open}
        onOpenChange={(open) => setDiscardPrompt((prev) => ({ ...prev, open }))}
        title="Switch capture method?"
        description="You have unconfirmed medication information. Switch methods and discard it?"
        cancelLabel="Stay here"
        confirmLabel="Switch method"
        variant="default"
        onConfirm={() => {
          if (mode !== 'none') clearModeDrafts(mode);
          applyModeChange(discardPrompt.next);
          setDiscardPrompt({ open: false, next: 'none' });
        }}
      />
    </div>
  );
}

/** @deprecated Use MedicationCaptureRow */
export function MedicationCaptureStrip({
  active,
  disabled,
  onSelect,
}: {
  active: CaptureAction | null;
  disabled?: boolean;
  onSelect: (action: CaptureAction) => void;
}) {
  return (
    <MedicationCaptureRow
      mode={active ?? 'none'}
      onModeChange={(next) => {
        if (next === 'none') return;
        onSelect(next);
      }}
      disabled={disabled}
      onDrugSelect={() => {}}
      onAnalyzeScreenshots={() => {}}
      onAnalyzeUpload={() => {}}
    />
  );
}

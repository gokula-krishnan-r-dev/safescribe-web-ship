'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Check,
  FileText,
  Info,
  Lightbulb,
  Loader2,
  Search,
  UserRound,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  adaptMedicationConceptKey,
  emptyAdaptIndicationSelection,
  isAdaptIndicationComplete,
  type AdaptIndicationSelection,
  type AdaptIndicationSelectionSource,
  type AdaptIndicationSuggestion,
  type RenewConditionCatalogItem,
  type RenewIndicationCandidate,
  type RenewMedication,
} from '@safescript/shared';
import {
  useAdaptIndicationResolve,
  useRecordAdaptIndicationCandidate,
  useSearchAdaptIndicationConditions,
  type AdaptIndicationSearchHit,
} from '../hooks';

type IndicationTab = 'search' | 'common' | 'patient' | 'all';

type ResultRow = {
  id: string;
  displayName: string;
  code: string;
  badge?: 'mapped' | 'patient' | 'common';
  source: AdaptIndicationSelectionSource;
};

const TABS: Array<{ id: IndicationTab; label: string }> = [
  { id: 'search', label: 'Search and select' },
  { id: 'common', label: 'Common indications' },
  { id: 'patient', label: "Patient's conditions" },
  { id: 'all', label: 'All indications' },
];

export function AdaptMedicationIndicationPanel({
  consultationId,
  medication,
  value,
  patientConditions = [],
  onChange,
}: {
  consultationId: string;
  medication: RenewMedication;
  value: AdaptIndicationSelection | null | undefined;
  patientConditions?: string[];
  onChange: (next: AdaptIndicationSelection) => void;
}) {
  const searchInputId = useId();
  const unknownId = useId();
  const customIndicationId = useId();
  const [tab, setTab] = useState<IndicationTab>('search');
  const [query, setQuery] = useState('');
  const [searchHits, setSearchHits] = useState<AdaptIndicationSearchHit[]>([]);
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState('');
  const [customExpanded, setCustomExpanded] = useState(false);
  const searchTimer = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const customInputRef = useRef<HTMLTextAreaElement | null>(null);

  const CUSTOM_INDICATION_MAX = 200;

  const resolve = useAdaptIndicationResolve(
    consultationId,
    {
      id: medication.id,
      medicationText: medication.raw?.medicationText ?? null,
      genericName: medication.normalized?.genericName ?? null,
      brandName: medication.normalized?.brandName ?? null,
      medicationConceptId: medication.normalized?.medicationConceptId ?? null,
    },
    true,
  );
  const search = useSearchAdaptIndicationConditions(consultationId);
  const recordCandidate = useRecordAdaptIndicationCandidate(consultationId);

  const conceptKey = useMemo(() => adaptMedicationConceptKey(medication), [medication]);
  const selection = value ?? null;
  const unknownChecked = selection?.status === 'unknown';
  const confirmed = isAdaptIndicationComplete(selection) && selection?.status === 'confirmed';
  const seededForKey = useRef<string | null>(null);
  const customDraftTrimmed = customDraft.trim();
  const canSaveCustom =
    customDraftTrimmed.length >= 2 && customDraftTrimmed.length <= CUSTOM_INDICATION_MAX;

  useEffect(() => {
    seededForKey.current = null;
    setCustomDraft('');
    setCustomExpanded(false);
  }, [medication.id, conceptKey]);

  useEffect(() => {
    if (!selection?.customIndicationText?.trim()) return;
    if (selection.status !== 'confirmed') return;
    setCustomDraft(selection.customIndicationText);
    setCustomExpanded(true);
  }, [selection?.customIndicationText, selection?.status]);

  // Seed candidates / suggestions from resolver without overwriting pharmacist confirmation.
  useEffect(() => {
    if (!resolve.data) return;
    const data = resolve.data;
    const seedKey = `${medication.id}::${conceptKey}::${data.repositoryVersion}`;
    if (seededForKey.current === seedKey) return;

    if (
      selection?.confirmedByPharmacist &&
      selection.medicationConceptKey === conceptKey &&
      (selection.status === 'confirmed' || selection.status === 'unknown')
    ) {
      seededForKey.current = seedKey;
      // Keep confirmation; only refresh candidate cache if empty.
      if (!(selection.candidates?.length) && data.candidates.length) {
        onChange({
          ...selection,
          candidates: data.candidates,
          suggestions: data.suggestions,
          repositoryVersion: data.repositoryVersion,
        });
      }
      return;
    }

    seededForKey.current = seedKey;
    const base = emptyAdaptIndicationSelection(medication);
    onChange({
      ...base,
      ...(selection && selection.medicationConceptKey === conceptKey ? selection : {}),
      medicationId: medication.id,
      medicationConceptKey: conceptKey,
      candidates: data.candidates,
      suggestions: data.suggestions,
      repositoryVersion: data.repositoryVersion,
      status:
        selection?.medicationConceptKey === conceptKey && selection.status !== 'pending'
          ? selection.status
          : 'pending',
      confirmedByPharmacist:
        selection?.medicationConceptKey === conceptKey
          ? Boolean(selection.confirmedByPharmacist)
          : false,
    });
  }, [resolve.data, medication, conceptKey, selection, onChange]);

  const requestSearch = useCallback(
    (q: string) => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
      searchTimer.current = window.setTimeout(() => {
        void search.mutateAsync(q).then((hits) => {
          setSearchHits(hits.filter((row) => row.code !== 'OTHER_CUSTOM'));
        }).catch(() => {
          setSearchHits([]);
        });
      }, 300);
    },
    [search],
  );

  useEffect(() => {
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, []);

  const candidates = selection?.candidates ?? resolve.data?.candidates ?? [];
  const suggestions = selection?.suggestions ?? resolve.data?.suggestions ?? [];
  const approvedMappings = resolve.data?.approvedMappings ?? [];
  const commonIndications =
    resolve.data?.commonIndications?.length
      ? resolve.data.commonIndications
      : candidates.map((c) => ({
          id: c.conditionId,
          code: c.conditionCode,
          displayName: c.displayName,
          category: null,
          description: null,
          defaultEffectivenessQuestion: null,
          commonForRenewal: true,
          displayPriority: c.rank ?? 99,
        }));
  const patientMatches = resolve.data?.patientConditionMatches ?? [];

  const resultRows = useMemo((): ResultRow[] => {
    if (tab === 'common') {
      return commonIndications.map((row) => ({
        id: row.id,
        displayName: row.displayName,
        code: row.code,
        badge: 'common' as const,
        source: 'approved_mapping' as const,
      }));
    }
    if (tab === 'patient') {
      return patientMatches.map((row) => ({
        id: row.id,
        displayName: row.displayName,
        code: row.code,
        badge: candidates.some((c) => c.conditionId === row.id)
          ? ('mapped' as const)
          : ('patient' as const),
        source: 'patient_condition' as const,
      }));
    }
    if (tab === 'all') {
      const source = query.trim() ? searchHits : commonIndications;
      return source.map((row) => {
        const hit = row as AdaptIndicationSearchHit;
        const isSnomed = hit.source === 'snomed';
        return {
          id: row.id,
          displayName: row.displayName,
          code: row.code,
          badge: candidates.some((c) => c.conditionId === row.id)
            ? ('mapped' as const)
            : undefined,
          source: (isSnomed ? 'manual_search' : 'approved_mapping') as AdaptIndicationSelectionSource,
        };
      });
    }

    // Search and select
    if (query.trim()) {
      return searchHits.map((row) => {
        const candidate = candidates.find((c) => c.conditionId === row.id);
        const patient = patientMatches.some((p) => p.id === row.id);
        const isSnomed = row.source === 'snomed';
        return {
          id: row.id,
          displayName: row.displayName,
          code: row.code,
          badge: candidate
            ? ('common' as const)
            : patient
              ? ('patient' as const)
              : undefined,
          source: (candidate
            ? 'approved_mapping'
            : patient
              ? 'patient_condition'
              : isSnomed
                ? 'manual_search'
                : 'manual_search') as AdaptIndicationSelectionSource,
        };
      });
    }

    return candidates.map((c, index) => ({
      id: c.conditionId,
      displayName: c.displayName,
      code: c.conditionCode,
      badge:
        index === 0 && (c.mappingStrength === 'primary' || c.mappingStrength === 'common')
          ? ('common' as const)
          : ('mapped' as const),
      source: 'approved_mapping' as const,
    }));
  }, [tab, commonIndications, patientMatches, query, searchHits, candidates]);

  const selectIndication = useCallback(
    (
      row: { id: string; displayName: string; code: string },
      source: AdaptIndicationSelectionSource,
    ) => {
      const mapping = approvedMappings.find((m) => m.conditionId === row.id);
      const snomedHit = searchHits.find(
        (hit) => hit.id === row.id && hit.source === 'snomed',
      );

      if (snomedHit?.snomedConceptId) {
        void recordCandidate
          .mutateAsync({
            snomedConceptId: snomedHit.snomedConceptId,
            displayName: row.displayName,
            medicationId: medication.id,
          })
          .catch(() => {
            /* non-blocking — selection still saved locally */
          });
      }

      setCustomDraft('');
      setCustomExpanded(false);
      const next: AdaptIndicationSelection = {
        ...(selection ?? emptyAdaptIndicationSelection(medication)),
        medicationId: medication.id,
        medicationConceptKey: conceptKey,
        conditionId: row.id,
        conditionCode: row.code,
        indicationDisplay: row.displayName,
        customIndicationText: null,
        status: 'confirmed',
        selectionSource: source,
        confirmedByPharmacist: true,
        selectedAt: new Date().toISOString(),
        candidates,
        suggestions,
        repositoryVersion:
          selection?.repositoryVersion ?? resolve.data?.repositoryVersion ?? null,
        mappingId: mapping?.mappingId ?? null,
      };
      onChange(next);
    },
    [
      selection,
      medication,
      conceptKey,
      candidates,
      suggestions,
      resolve.data?.repositoryVersion,
      approvedMappings,
      searchHits,
      recordCandidate,
      onChange,
    ],
  );

  const setUnknown = useCallback(
    (checked: boolean) => {
      if (checked) {
        setCustomExpanded(false);
        onChange({
          ...(selection ?? emptyAdaptIndicationSelection(medication)),
          medicationId: medication.id,
          medicationConceptKey: conceptKey,
          conditionId: null,
          conditionCode: null,
          indicationDisplay: null,
          customIndicationText: null,
          status: 'unknown',
          selectionSource: 'unknown',
          confirmedByPharmacist: true,
          selectedAt: new Date().toISOString(),
          candidates,
          suggestions,
        });
        return;
      }
      onChange({
        ...(selection ?? emptyAdaptIndicationSelection(medication)),
        medicationId: medication.id,
        medicationConceptKey: conceptKey,
        status: 'pending',
        selectionSource: 'approved_mapping',
        confirmedByPharmacist: false,
        selectedAt: undefined,
        conditionId: null,
        conditionCode: null,
        indicationDisplay: null,
        customIndicationText: null,
        candidates,
        suggestions,
      });
    },
    [selection, medication, conceptKey, candidates, suggestions, onChange],
  );

  const saveCustomIndication = useCallback(() => {
    const text = customDraft.trim().replace(/\s+/g, ' ');
    if (text.length < 2 || text.length > CUSTOM_INDICATION_MAX) return;

    onChange({
      ...(selection ?? emptyAdaptIndicationSelection(medication)),
      medicationId: medication.id,
      medicationConceptKey: conceptKey,
      conditionId: null,
      conditionCode: null,
      // Keep display + custom in sync so docs/sidebars that read either field stay consistent.
      indicationDisplay: text,
      customIndicationText: text,
      status: 'confirmed',
      selectionSource: 'manual_search',
      confirmedByPharmacist: true,
      selectedAt: new Date().toISOString(),
      candidates,
      suggestions,
      mappingId: null,
      repositoryVersion:
        selection?.repositoryVersion ?? resolve.data?.repositoryVersion ?? null,
    });
    setCustomDraft(text);
    setCustomExpanded(false);
  }, [
    customDraft,
    selection,
    medication,
    conceptKey,
    candidates,
    suggestions,
    resolve.data?.repositoryVersion,
    onChange,
  ]);

  const openCustomIndicationBox = useCallback(() => {
    if (unknownChecked) return;
    setCustomExpanded(true);
    window.setTimeout(() => customInputRef.current?.focus(), 40);
  }, [unknownChecked]);

  const clearSelection = useCallback(() => {
    setCustomDraft('');
    setCustomExpanded(false);
    onChange({
      ...(selection ?? emptyAdaptIndicationSelection(medication)),
      medicationId: medication.id,
      medicationConceptKey: conceptKey,
      conditionId: null,
      conditionCode: null,
      indicationDisplay: null,
      customIndicationText: null,
      status: 'pending',
      selectionSource: 'approved_mapping',
      confirmedByPharmacist: false,
      selectedAt: undefined,
      candidates,
      suggestions,
      mappingId: null,
    });
  }, [selection, medication, conceptKey, candidates, suggestions, onChange]);

  if (confirmed && selection) {
    return (
      <div className="rounded-xl border border-[#d9e4e8] bg-[#f7fbfb] px-4 py-3.5 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[#617184]">
              Indication for this medication
            </p>
            <div className="mt-2 flex items-start gap-2">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0F6F6B] text-white">
                <Check className="h-3 w-3" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-[#102a43]">
                  {selection.indicationDisplay || selection.customIndicationText}
                </p>
                <p className="mt-0.5 text-[12px] text-[#7b8b94]">Selected by pharmacist</p>
                {selection.customIndicationText?.trim() && !selection.conditionId ? (
                  <p className="mt-0.5 text-[12px] text-[#617184]">
                    Manual indication for this adaptation only
                  </p>
                ) : null}
                {selection.selectionSource === 'patient_condition' ||
                selection.selectionSource === 'ai_suggested' ? (
                  <p className="mt-0.5 text-[12px] text-[#617184]">
                    Suggested from patient information
                  </p>
                ) : null}
              </div>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-8 shrink-0 rounded-lg border-[#cfdce1] px-3 text-xs font-semibold text-[#0F6F6B]"
            onClick={clearSelection}
          >
            Change
          </Button>
        </div>
      </div>
    );
  }

  if (unknownChecked && selection) {
    return (
      <div className="space-y-3 rounded-xl border border-[#d9e4e8] bg-white px-4 py-3.5 sm:px-5">
        <IndicationPanelHeader
          onViewConditions={() => setConditionsOpen(true)}
          patientConditionCount={patientConditions.length || patientMatches.length}
        />
        <label
          htmlFor={unknownId}
          className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[#d9e4e8] bg-[#f8fafb] px-3 py-2.5"
        >
          <Checkbox
            id={unknownId}
            checked
            onChange={(event) => setUnknown(event.target.checked)}
            className="mt-0.5"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-[#102a43]">
              Indication not known / not available
            </span>
            <span className="mt-0.5 block text-[12px] text-[#617184]">
              SafeScribe will avoid indication-specific guidance where the indication cannot be
              confirmed.
            </span>
          </span>
        </label>
        <PatientConditionsDialog
          open={conditionsOpen}
          onOpenChange={setConditionsOpen}
          conditions={patientConditions}
          matches={patientMatches}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-[#d9e4e8] bg-white px-4 py-3.5 sm:px-5">
      <IndicationPanelHeader
        onViewConditions={() => setConditionsOpen(true)}
        patientConditionCount={patientConditions.length || patientMatches.length}
      />

      <div
        role="tablist"
        aria-label="Indication sources"
        className="flex flex-wrap gap-1 border-b border-[#edf3f4]"
      >
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-[13px] font-semibold transition-colors',
                active
                  ? 'border-[#0F6F6B] text-[#0F6F6B]'
                  : 'border-transparent text-[#617184] hover:text-[#102a43]',
              )}
              onClick={() => {
                setTab(item.id);
                if (item.id === 'all' || item.id === 'search') {
                  if (!query.trim()) requestSearch('');
                }
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div
        className={cn(
          'grid gap-4',
          tab === 'search' ? 'lg:grid-cols-[1.15fr_0.85fr]' : 'grid-cols-1',
        )}
      >
        <div className="min-w-0 space-y-3">
          {(tab === 'search' || tab === 'all') && (
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a9aa3]"
                aria-hidden
              />
              <Input
                id={searchInputId}
                ref={searchInputRef}
                value={query}
                placeholder="Search indication..."
                className="h-10 rounded-lg border-[#d7e1e5] bg-white pl-9 pr-9 text-sm"
                disabled={unknownChecked}
                onChange={(event) => {
                  const next = event.target.value;
                  setQuery(next);
                  requestSearch(next);
                }}
              />
              {query ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[#8a9aa3] hover:bg-[#f0f4f6] hover:text-[#102a43]"
                  onClick={() => {
                    setQuery('');
                    setSearchHits([]);
                    requestSearch('');
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          )}

          {resolve.isLoading ||
          (resolve.isFetching && !resolve.data?.medicationId) ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-14 animate-pulse rounded-lg border border-[#edf3f4] bg-[#f7fbfb]"
                />
              ))}
            </div>
          ) : resolve.isError ? (
            <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[13px] text-amber-950">
                Indication suggestions are temporarily unavailable. Search indications manually.
              </p>
              <button
                type="button"
                className="shrink-0 text-[12px] font-semibold text-[#0F6F6B] underline-offset-2 hover:underline"
                onClick={() => void resolve.refetch()}
              >
                Retry suggestions
              </button>
            </div>
          ) : resultRows.length === 0 ? (
            <EmptyIndicationState
              tab={tab}
              hasQuery={Boolean(query.trim())}
              onSearchAll={() => {
                setTab('all');
                setQuery('');
                requestSearch('');
                window.setTimeout(() => searchInputRef.current?.focus(), 50);
              }}
            />
          ) : (
            <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-0.5" role="listbox" aria-label="Indication results">
              {resultRows.map((row) => {
                const selected = selection?.conditionId === row.id && !unknownChecked;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={unknownChecked}
                      className={cn(
                        'flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
                        selected
                          ? 'border-[#0F6F6B] bg-[#eef8f7]'
                          : 'border-[#e4ecef] bg-white hover:border-[#b8ced4]',
                        unknownChecked && 'cursor-not-allowed opacity-50',
                      )}
                      onClick={() => selectIndication(row, row.source)}
                    >
                      <FileText
                        className={cn(
                          'mt-0.5 h-4 w-4 shrink-0',
                          selected ? 'text-[#0F6F6B]' : 'text-[#8a9aa3]',
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-[#102a43]">
                            {row.displayName}
                          </span>
                          {row.badge ? <IndicationBadge kind={row.badge} /> : null}
                        </span>
                        <span className="mt-0.5 block text-[12px] text-[#7b8b94]">
                          {formatConditionCode(row.code)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {search.isPending ? (
            <p className="flex items-center gap-1.5 text-[12px] text-[#617184]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Searching indications…
            </p>
          ) : null}
        </div>

        {tab === 'search' ? (
          <SuggestionsPane
            suggestions={suggestions}
            selectedId={unknownChecked ? null : selection?.conditionId ?? null}
            unavailable={Boolean(resolve.data?.suggestionsUnavailable)}
            loading={resolve.isLoading}
            disabled={unknownChecked}
            onSelect={(suggestion) =>
              selectIndication(
                {
                  id: suggestion.conditionId,
                  displayName: suggestion.displayName,
                  code: suggestion.conditionCode,
                },
                suggestion.badge === 'matches_patient' ? 'patient_condition' : 'ai_suggested',
              )
            }
            onEnterAnother={() => {
              setTab('all');
              setQuery('');
              requestSearch('');
              window.setTimeout(() => searchInputRef.current?.focus(), 50);
              openCustomIndicationBox();
            }}
          />
        ) : null}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_1.1fr]">
        <label
          htmlFor={unknownId}
          className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-[#e4ecef] bg-[#f8fafb] px-3 py-2.5 hover:border-[#cfdce1]"
        >
          <Checkbox
            id={unknownId}
            checked={unknownChecked}
            onChange={(event) => setUnknown(event.target.checked)}
            className="mt-0.5"
          />
          <span className="min-w-0">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#102a43]">
              Indication not known / not available
              <span title="SafeScribe will avoid indication-specific guidance where the indication cannot be confirmed.">
                <Info className="h-3.5 w-3.5 text-[#8a9aa3]" aria-hidden />
              </span>
            </span>
            <span className="mt-0.5 block text-[12px] leading-relaxed text-[#617184]">
              Use when the indication cannot be confirmed for this adaptation.
            </span>
          </span>
        </label>

        <ManualIndicationBox
          id={customIndicationId}
          expanded={customExpanded || Boolean(customDraftTrimmed)}
          draft={customDraft}
          maxLength={CUSTOM_INDICATION_MAX}
          disabled={unknownChecked}
          canSave={canSaveCustom}
          inputRef={customInputRef}
          onExpand={openCustomIndicationBox}
          onDraftChange={(next) => {
            setCustomDraft(next);
            if (!customExpanded) setCustomExpanded(true);
          }}
          onSave={saveCustomIndication}
          onCancel={() => {
            setCustomDraft('');
            setCustomExpanded(false);
          }}
        />
      </div>

      <PatientConditionsDialog
        open={conditionsOpen}
        onOpenChange={setConditionsOpen}
        conditions={patientConditions}
        matches={patientMatches}
      />
    </div>
  );
}

function ManualIndicationBox({
  id,
  expanded,
  draft,
  maxLength,
  disabled,
  canSave,
  inputRef,
  onExpand,
  onDraftChange,
  onSave,
  onCancel,
}: {
  id: string;
  expanded: boolean;
  draft: string;
  maxLength: number;
  disabled: boolean;
  canSave: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onExpand: () => void;
  onDraftChange: (next: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  if (!expanded) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onExpand}
        className={cn(
          'flex w-full flex-col items-start justify-center rounded-xl border border-dashed border-[#b8ced4] bg-white px-3.5 py-2.5 text-left transition-colors',
          disabled
            ? 'cursor-not-allowed opacity-50'
            : 'hover:border-[#0F6F6B] hover:bg-[#f7fbfb]',
        )}
      >
        <span className="text-sm font-semibold text-[#0F6F6B]">+ Add indication</span>
        <span className="mt-0.5 text-[12px] leading-relaxed text-[#617184]">
          Type a free-text indication for this adaptation only when it is not in the list.
        </span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-[#0F6F6B]/30 bg-[#f7fbfb] px-3.5 py-3',
        disabled && 'opacity-50',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <label htmlFor={id} className="text-sm font-semibold text-[#102a43]">
            Add indication
          </label>
          <p className="mt-0.5 text-[12px] leading-relaxed text-[#617184]">
            Saved only on this adaptation. Does not add to the approved indications repository.
          </p>
        </div>
      </div>
      <Textarea
        id={id}
        ref={inputRef}
        value={draft}
        disabled={disabled}
        maxLength={maxLength}
        rows={2}
        placeholder="e.g. Hyperlipidemia / dyslipidemia"
        className="mt-2 min-h-[68px] resize-none rounded-lg border-[#d7e1e5] bg-white text-sm"
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && canSave && !disabled) {
            event.preventDefault();
            onSave();
          }
        }}
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] tabular-nums text-[#8a9aa3]">
          {draft.trim().length}/{maxLength}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            className="h-8 px-2.5 text-xs text-[#617184]"
            disabled={disabled}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="h-8 rounded-lg bg-[#0F6F6B] px-3 text-xs font-semibold hover:bg-[#0b5451]"
            disabled={disabled || !canSave}
            onClick={onSave}
          >
            Use this indication
          </Button>
        </div>
      </div>
    </div>
  );
}

function IndicationPanelHeader({
  onViewConditions,
  patientConditionCount,
}: {
  onViewConditions: () => void;
  patientConditionCount: number;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex items-start gap-2.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#eef8f7] text-[#0F6F6B]">
          <FileText className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-[#102a43]">
            Indication for this medication{' '}
            <span className="text-red-500" aria-hidden>
              *
            </span>
          </h3>
          <p className="mt-0.5 text-[13px] leading-relaxed text-[#617184]">
            Select the primary indication for which this medication is being used. This helps
            provide more relevant guidance and safety checks.
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          className="h-8 rounded-lg border-[#cfdce1] px-2.5 text-xs font-semibold text-[#0F6F6B]"
          onClick={onViewConditions}
        >
          <UserRound className="mr-1.5 h-3.5 w-3.5" />
          View patient conditions
          {patientConditionCount > 0 ? (
            <span className="ml-1.5 rounded-full bg-[#eef8f7] px-1.5 py-0.5 text-[10px] font-bold text-[#0F6F6B]">
              {patientConditionCount}
            </span>
          ) : null}
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-[#0f6f73] hover:bg-[#f4fbfa]"
              aria-label="Indication tips"
            >
              <Lightbulb className="h-3.5 w-3.5" />
              Tips
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-4">
            <p className="text-sm font-semibold text-[#102a43]">Selecting an indication</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-[#52677a]">
              <li>Prefer approved mappings for this medication when available.</li>
              <li>Patient conditions that match a mapped indication are highlighted.</li>
              <li>Use search when the indication is not listed under common options.</li>
              <li>
                Use “Add indication” for a free-text indication on this adaptation only — it is not
                added to the approved repository.
              </li>
              <li>Select “not known” only when the indication cannot be confirmed.</li>
            </ul>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

function SuggestionsPane({
  suggestions,
  selectedId,
  unavailable,
  loading,
  disabled,
  onSelect,
  onEnterAnother,
}: {
  suggestions: AdaptIndicationSuggestion[];
  selectedId: string | null;
  unavailable: boolean;
  loading: boolean;
  disabled: boolean;
  onSelect: (suggestion: AdaptIndicationSuggestion) => void;
  onEnterAnother: () => void;
}) {
  return (
    <div className="rounded-xl border border-[#dce8ec] bg-[#f7fbfb] p-3.5">
      <div className="flex items-center gap-1.5">
        <p className="text-[13px] font-semibold text-[#102a43]">
          Suggested based on patient information
        </p>
        <span title="Suggestions are ranked from approved mappings and patient context. The pharmacist always confirms.">
          <Info className="h-3.5 w-3.5 text-[#8a9aa3]" aria-hidden />
        </span>
      </div>

      {loading ? (
        <p className="mt-3 flex items-center gap-1.5 text-[12px] text-[#617184]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Reviewing patient information…
        </p>
      ) : suggestions.length === 0 ? (
        <p className="mt-3 text-[12px] leading-relaxed text-[#617184]">
          {unavailable
            ? 'AI ranking is temporarily unavailable. Use the search results on the left.'
            : 'No strong patient-based suggestions yet. Search or browse common indications.'}
        </p>
      ) : (
        <div className="mt-2.5 space-y-2" role="radiogroup" aria-label="Suggested indications">
          {suggestions.map((suggestion) => {
            const selected = selectedId === suggestion.conditionId;
            return (
              <label
                key={suggestion.conditionId}
                className={cn(
                  'flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors',
                  selected
                    ? 'border-[#0F6F6B] bg-white'
                    : 'border-[#d9e4e8] bg-white/80 hover:border-[#b8ced4]',
                  disabled && 'cursor-not-allowed opacity-50',
                )}
              >
                <input
                  type="radio"
                  name="adapt-indication-suggestion"
                  className="mt-1 accent-[#0F6F6B]"
                  checked={selected}
                  disabled={disabled}
                  onChange={() => onSelect(suggestion)}
                />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-[#102a43]">
                      {suggestion.displayName}
                    </span>
                    {suggestion.badge === 'matches_patient' ? (
                      <span className="rounded-full bg-[#e6f4f3] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#0F6F6B]">
                        Matches patient information
                      </span>
                    ) : (
                      <span className="rounded-full bg-[#e8f1fb] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#2b6cb0]">
                        Suggested
                      </span>
                    )}
                  </span>
                  {suggestion.reason ? (
                    <span className="mt-0.5 block text-[12px] text-[#617184]">
                      {suggestion.reason}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      )}

      <button
        type="button"
        className="mt-3 text-[13px] font-semibold text-[#0F6F6B] hover:underline"
        onClick={onEnterAnother}
        disabled={disabled}
      >
        + Enter another indication
      </button>
    </div>
  );
}

function IndicationBadge({ kind }: { kind: 'mapped' | 'patient' | 'common' }) {
  const label =
    kind === 'common'
      ? 'Common for this medication'
      : kind === 'patient'
        ? 'Patient condition'
        : 'Mapped indication';
  return (
    <span className="rounded-full bg-[#e6f4f3] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#0F6F6B]">
      {label}
    </span>
  );
}

function EmptyIndicationState({
  tab,
  onSearchAll,
  hasQuery,
}: {
  tab: IndicationTab;
  onSearchAll: () => void;
  hasQuery?: boolean;
}) {
  if (tab === 'common' || ((tab === 'search' || tab === 'all') && !hasQuery)) {
    return (
      <div className="rounded-lg border border-dashed border-[#d9e4e8] bg-[#f8fafb] px-3 py-4 text-center">
        <p className="text-[13px] text-[#617184]">
          No approved indications are currently mapped for this medication. Search all indications,
          use “Add indication”, or select “Indication not known / not available.”
        </p>
        <button
          type="button"
          className="mt-2 text-[13px] font-semibold text-[#0F6F6B] hover:underline"
          onClick={onSearchAll}
        >
          Search all indications
        </button>
      </div>
    );
  }
  if (tab === 'patient') {
    return (
      <div className="rounded-lg border border-dashed border-[#d9e4e8] bg-[#f8fafb] px-3 py-4 text-center text-[13px] text-[#617184]">
        No structured patient conditions match the indication library yet. Conditions from patient
        assessment will appear here when available.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-dashed border-[#d9e4e8] bg-[#f8fafb] px-3 py-4 text-center text-[13px] text-[#617184]">
      No indications found. Try a different search term, or use “Add indication” below for this
      adaptation only.
    </div>
  );
}

function PatientConditionsDialog({
  open,
  onOpenChange,
  conditions,
  matches,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conditions: string[];
  matches: RenewConditionCatalogItem[];
}) {
  const labels =
    conditions.length > 0
      ? conditions
      : matches.map((row) => row.displayName);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Patient conditions</DialogTitle>
          <DialogDescription>
            Structured conditions available for indication matching. Edit conditions in Patient
            Assessment when needed.
          </DialogDescription>
        </DialogHeader>
        {labels.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[#d9e4e8] bg-[#f8fafb] px-3 py-4 text-sm text-[#617184]">
            Not yet recorded
          </p>
        ) : (
          <ul className="max-h-64 space-y-1.5 overflow-y-auto">
            {labels.map((label) => (
              <li
                key={label}
                className="rounded-lg border border-[#e4ecef] bg-white px-3 py-2 text-sm text-[#102a43]"
              >
                {label}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function formatConditionCode(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return 'Approved library condition';
  if (/^\d+$/.test(trimmed)) return `SNOMED CT: ${trimmed}`;
  if (trimmed.toUpperCase().startsWith('SNOMED')) return trimmed;
  if (trimmed.includes(':') && /^\d+$/.test(trimmed.split(':').pop() ?? '')) {
    return `SNOMED CT: ${trimmed.split(':').pop()}`;
  }
  return `Code: ${trimmed}`;
}

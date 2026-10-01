'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useDrugSearch } from '@/features/consultations/hooks';
import type { DrugSearchResult } from '@/features/consultations/medication-utils';
import { useDebouncedValue, useSnomedIndicationSearch } from './hooks';
import { ccddDisplayId, formatMappingLevel, type MappingLevel } from './labels';

export type SelectedMedication = {
  conceptId: string;
  displayName: string;
  suggestedLevel?: MappingLevel;
};

export type SelectedIndication = {
  conceptId: string;
  displayName: string;
};

function drugPrimaryLabel(drug: DrugSearchResult): string {
  return drug.label?.trim() || drug.genericName?.trim() || drug.brandName?.trim() || drug.id;
}

function inferLevelFromDrug(drug: DrugSearchResult): MappingLevel {
  const id = drug.id.toLowerCase();
  if (id.includes('-tm-')) return 'therapeutic_moiety';
  if (id.includes('-ntp-')) return 'clinical_drug';
  if (id.includes('-mp-')) return 'product';
  const hay = `${drug.label} ${drug.dosageForm ?? ''} ${drug.strength ?? ''}`.toLowerCase();
  if (drug.brandName && drug.strength) return 'product';
  if (drug.dosageForm || /\d+\s*mg/.test(hay)) return 'clinical_drug';
  return 'ingredient';
}

export function MedicationConceptPicker({
  value,
  onChange,
  disabled,
}: {
  value: SelectedMedication | null;
  onChange: (next: SelectedMedication | null) => void;
  disabled?: boolean;
}) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const debounced = useDebouncedValue(query, 300);
  const containerRef = useRef<HTMLDivElement>(null);

  const minLen = /^\d+$/.test(debounced.trim()) ? 3 : 2;
  const searchEnabled = open && debounced.trim().length >= minLen;
  // Indication mappings prefer reusable CCDD Therapeutic Moiety (substance) concepts.
  // Brand/DIN search still resolves via Infoway; products map up to the same TM when possible.
  const { data: tmResults = [], isFetching: tmFetching } = useDrugSearch(
    debounced,
    searchEnabled,
    'allergy',
    16,
  );
  const { data: productResults = [], isFetching: productFetching } = useDrugSearch(
    debounced,
    searchEnabled,
    'medication',
    12,
  );
  const isFetching = tmFetching || productFetching;
  const results = (() => {
    const seen = new Set<string>();
    const merged: DrugSearchResult[] = [];
    for (const drug of [...tmResults, ...productResults]) {
      if (seen.has(drug.id)) continue;
      seen.add(drug.id);
      merged.push(drug);
    }
    return merged.slice(0, 24);
  })();

  useEffect(() => {
    if (!value) {
      setQuery('');
      return;
    }
    setQuery(value.displayName);
  }, [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={containerRef} className="relative space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-[#7b8b94]">
        Medication (CCDD) *
      </span>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a9aa3]" />
        <Input
          value={query}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(null);
            setOpen(true);
          }}
          placeholder="Search generic, brand or DIN…"
          className="h-10 pl-9"
          autoComplete="off"
          aria-controls={listId}
          aria-expanded={open}
        />
      </div>
      <p className="text-xs text-[#617184]">
        Search any generic or brand name. Prefer Therapeutic Moiety / ingredient concepts so all
        products share one reusable CCDD mapping.
      </p>
      {value ? (
        <p className="text-xs text-[#617184]">
          {formatMappingLevel(value.suggestedLevel)} · CCDD: {ccddDisplayId(value.conceptId)}
        </p>
      ) : null}
      {open && debounced.trim().length >= minLen ? (
        <ul
          id={listId}
          className="absolute z-[60] mt-1 max-h-56 w-full overflow-auto rounded-lg border border-[#e4ecef] bg-white py-1 shadow-lg"
        >
          {isFetching ? (
            <li className="flex items-center gap-2 px-3 py-2 text-sm text-[#617184]">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching CCDD…
            </li>
          ) : null}
          {!isFetching && !results.length ? (
            <li className="px-3 py-2 text-sm text-[#617184]">No medications found.</li>
          ) : null}
          {results.map((drug) => {
            const label = drugPrimaryLabel(drug);
            const level = inferLevelFromDrug(drug);
            const selected = value?.conceptId === drug.id;
            return (
              <li key={drug.id}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-[#f7fbfb]',
                    selected && 'bg-[#eef8f7]',
                  )}
                  onClick={() => {
                    onChange({
                      conceptId: drug.id,
                      displayName: label,
                      suggestedLevel: level,
                    });
                    setQuery(label);
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-[#102a43]">{label}</span>
                    <span className="mt-0.5 block text-xs text-[#7b8b94]">
                      {formatMappingLevel(level)} · CCDD: {ccddDisplayId(drug.id)}
                    </span>
                  </span>
                  {selected ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0F6F6B]" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export function SnomedIndicationPicker({
  value,
  onChange,
  disabled,
}: {
  value: SelectedIndication | null;
  onChange: (next: SelectedIndication | null) => void;
  disabled?: boolean;
}) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const debounced = useDebouncedValue(query, 300);
  const containerRef = useRef<HTMLDivElement>(null);

  const searchEnabled = open && debounced.trim().length >= 2;
  const { data: results = [], isFetching } = useSnomedIndicationSearch(debounced, searchEnabled);

  useEffect(() => {
    if (!value) {
      setQuery('');
      return;
    }
    setQuery(value.displayName);
  }, [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={containerRef} className="relative space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-[#7b8b94]">
        Indication (SNOMED CT) *
      </span>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a9aa3]" />
        <Input
          value={query}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(null);
            setOpen(true);
          }}
          placeholder="Search SNOMED CT (e.g. otitis media)…"
          className="h-10 pl-9"
          autoComplete="off"
          aria-controls={listId}
          aria-expanded={open}
        />
      </div>
      {value ? (
        <p className="text-xs text-[#617184]">SNOMED CT: {value.conceptId}</p>
      ) : null}
      {open && debounced.trim().length >= 2 ? (
        <ul
          id={listId}
          className="absolute z-[60] mt-1 max-h-56 w-full overflow-auto rounded-lg border border-[#e4ecef] bg-white py-1 shadow-lg"
        >
          {isFetching ? (
            <li className="flex items-center gap-2 px-3 py-2 text-sm text-[#617184]">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching SNOMED…
            </li>
          ) : null}
          {!isFetching && !results.length ? (
            <li className="px-3 py-2 text-sm text-[#617184]">No SNOMED concepts found.</li>
          ) : null}
          {results.map((hit) => {
            const selected = value?.conceptId === hit.conceptId;
            return (
              <li key={hit.conceptId}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-[#f7fbfb]',
                    selected && 'bg-[#eef8f7]',
                  )}
                  onClick={() => {
                    onChange({
                      conceptId: hit.conceptId,
                      displayName: hit.displayName,
                    });
                    setQuery(hit.displayName);
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-[#102a43]">{hit.displayName}</span>
                    <span className="mt-0.5 block text-xs text-[#7b8b94]">
                      SNOMED CT: {hit.conceptId}
                    </span>
                  </span>
                  {selected ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0F6F6B]" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useDrugSearch } from './hooks';
import type { DrugSearchResult } from './medication-utils';
import {
  flattenDrugBrandGroups,
  groupDrugSearchByBrand,
} from './drug-search-groups';

const SEARCH_DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

function minQueryLengthFor(query: string) {
  // Numeric DIN lookup should not wait on the name-search 2-character rule,
  // but a single digit would flood the terminology search.
  return /^\d+$/.test(query.trim()) ? 3 : MIN_QUERY_LENGTH;
}

export interface UseDrugSearchInputOptions {
  /** Called when the user picks a result (from the list, or free text via Enter). */
  onSelect: (result: DrugSearchResult) => void;
  /** Allow committing the raw query as a manual entry when there's no match. Default: true. */
  allowFreeText?: boolean;
  /** Clear the query after a selection (multi-select fields). Default: false. */
  clearOnSelect?: boolean;
  /**
   * Keep the typed query and open results after Add, so the pharmacist can
   * pick another match from the same list.
   */
  preserveQueryOnSelect?: boolean;
  /** Initial input value. */
  initialQuery?: string;
  /** Focus the input on mount. */
  autoFocus?: boolean;
  /** Invoked on Backspace when the query is empty (e.g. remove the last chip). */
  onBackspaceWhenEmpty?: () => void;
  /** Allergy search prefers CCDD Therapeutic Moiety (substance) concepts. */
  purpose?: 'medication' | 'allergy';
  /**
   * Refocus the input after picking a result. Chip pickers want this so the
   * pharmacist can add another drug. Single-select dialogs must leave it off
   * or the dropdown reopens over Close / Cancel.
   */
  refocusOnSelect?: boolean;
}

/**
 * Shared behaviour for every drug/medication autocomplete in the app:
 * debounced API search, open/close, keyboard navigation, active-row tracking,
 * outside-click dismissal, and an optional free-text fallback.
 *
 * Both `DrugSearchCombobox` (single-select) and `MedicationSearchField`
 * (multi-select chips) are thin views over this hook, so their behaviour can
 * never drift apart, and any new drug picker gets the same UX for free.
 */
export function useDrugSearchInput({
  onSelect,
  allowFreeText = true,
  clearOnSelect = false,
  preserveQueryOnSelect = false,
  initialQuery = '',
  autoFocus = false,
  onBackspaceWhenEmpty,
  purpose = 'medication',
  refocusOnSelect = true,
}: UseDrugSearchInputOptions) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputAnchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const { data: results = [], isFetching } = useDrugSearch(
    debouncedQuery,
    open && debouncedQuery.length >= minQueryLengthFor(debouncedQuery),
    purpose,
    purpose === 'allergy' ? 12 : 24,
  );

  const groups = useMemo(
    () => groupDrugSearchByBrand(results, debouncedQuery),
    [results, debouncedQuery],
  );
  const options = useMemo(() => flattenDrugBrandGroups(groups), [groups]);

  // Debounce the query that actually hits the API.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const optionKey = options.map((item) => item.id).join('|');
  useEffect(() => {
    setActiveIndex(0);
  }, [optionKey]);

  // Dismiss when clicking outside the input or the portalled list.
  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Element;
      if (containerRef.current?.contains(target)) return;
      if (target.closest?.(`#${CSS.escape(listId)}`)) return;
      if (target.closest?.('[data-drug-search-dropdown]')) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [listId]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const showDropdown = open && debouncedQuery.length >= minQueryLengthFor(debouncedQuery);

  const select = useCallback(
    (item: DrugSearchResult) => {
      onSelect(item);
      if (preserveQueryOnSelect) {
        setOpen(true);
        if (refocusOnSelect) inputRef.current?.focus();
        return;
      }
      if (clearOnSelect) {
        setQuery('');
        setDebouncedQuery('');
      } else {
        setQuery(item.brandName || item.label);
      }
      setOpen(false);
      if (clearOnSelect && refocusOnSelect) {
        inputRef.current?.focus();
      } else {
        inputRef.current?.blur();
      }
    },
    [onSelect, clearOnSelect, preserveQueryOnSelect, refocusOnSelect],
  );

  const commitFreeText = useCallback(() => {
    const text = query.trim();
    if (!text) return;
    select({
      id: `manual-${text.toLowerCase().replace(/\s+/g, '-')}`,
      brandName: text,
      label: text,
      source: 'manual',
    });
  }, [query, select]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
        setActiveIndex((i) => Math.min(i + 1, Math.max(options.length - 1, 0)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (options[activeIndex]) select(options[activeIndex]);
        else if (allowFreeText) commitFreeText();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      } else if (e.key === 'Backspace' && !query && onBackspaceWhenEmpty) {
        onBackspaceWhenEmpty();
      }
    },
    [options, activeIndex, select, allowFreeText, commitFreeText, query, onBackspaceWhenEmpty],
  );

  /** Props to spread onto the <Input> (attach `inputRef` separately as `ref`). */
  const inputProps = {
    value: query,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value);
      setOpen(true);
    },
    onFocus: () => {
      if (query.trim().length >= minQueryLengthFor(query)) setOpen(true);
    },
    onKeyDown: handleKeyDown,
    role: 'combobox' as const,
    'aria-expanded': showDropdown,
    'aria-controls': listId,
    'aria-autocomplete': 'list' as const,
  };

  /** Props to spread onto the shared `DrugSearchDropdown`. */
  const dropdownProps = {
    open: showDropdown,
    anchorRef: inputAnchorRef,
    listId,
    results: options,
    groups,
    isFetching,
    debouncedQuery,
    activeIndex,
    onActiveIndexChange: setActiveIndex,
    onSelect: select,
  };

  return {
    query,
    setQuery,
    debouncedQuery,
    open,
    setOpen,
    showDropdown,
    activeIndex,
    setActiveIndex,
    results: options,
    groups,
    isFetching,
    listId,
    containerRef,
    inputAnchorRef,
    inputRef,
    select,
    inputProps,
    dropdownProps,
  };
}

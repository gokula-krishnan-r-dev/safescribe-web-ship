'use client';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
} from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  ChevronDown,
  Info,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useDrugSearch } from '@/features/consultations/hooks';
import type { DrugSearchResult } from '@/features/consultations/medication-utils';
import {
  enumerateDrugBrandGroups,
  flattenDrugBrandGroups,
  formatDrugStrengthOption,
  groupDrugSearchByBrand,
} from '@/features/consultations/drug-search-groups';
import { FieldLabel } from '@/features/consultations/add-treatment/ui-bits';
import { FREQUENCY_SELECT_OPTIONS } from '@/features/consultations/add-treatment/frequency-options';
import { unitSelectBinding } from '@/features/consultations/add-treatment/form-options';
import { resolveRouteValue, routeSelectOptions } from '@/features/consultations/add-treatment/route-options';
import { cn } from '@/lib/utils';
import {
  deriveReviewStatus,
  isoCalendarDateError,
  isoDateLocal,
  toIsoCalendarDate,
  type RenewMedication,
} from '@safescript/shared';
import { IsoDateField } from '../iso-date-field';
import {
  applyDrugToMedication,
  applyNonDpdIdentity,
  drugDin,
  isVerifiedProduct,
  medicationIdentityMeta,
  medicationIdentityTitle,
  resolveMedicationSigDefaults,
  sourceBadge,
} from './medication-regimen-model';
import {
  applyParsedSigOverride,
  applyProductSigDefaults,
  canonicalDoseUnit,
  formatParsedSigLine,
  parseCurrentDirections,
  parsePositiveDoseInput,
  SIG_DOSE_UNIT_OPTIONS,
  unresolvedSigLabel,
  type ParsedCurrentSig,
  type ParsedSigOverride,
} from './medication-sig-parse';

export type MedicationEditorMode = 'ADD_MANUAL' | 'EDIT_EXISTING';
type IdentityPhase = 'searching' | 'selected' | 'non_dpd';

const SEARCH_DEBOUNCE_MS = 250;
const FIELD = 'h-10 rounded-[10px]';

export function MedicationEditDialog({
  open,
  mode = 'EDIT_EXISTING',
  medication,
  onClose,
  onSave,
  /** When true (Adapt), directions must be entered — "unavailable" is not allowed. */
  requireDirections = false,
  addButtonLabel,
}: {
  open: boolean;
  mode?: MedicationEditorMode;
  medication: RenewMedication | null;
  onClose: () => void;
  onSave: (next: RenewMedication) => void;
  requireDirections?: boolean;
  /** Override primary CTA in ADD_MANUAL mode (e.g. Adapt: "Add prescription"). */
  addButtonLabel?: string;
}) {
  const id = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<RenewMedication | null>(null);
  const [phase, setPhase] = useState<IdentityPhase>('searching');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [sigEditorOpen, setSigEditorOpen] = useState(false);
  const [sigOverride, setSigOverride] = useState<ParsedSigOverride>({});
  const [doseDraft, setDoseDraft] = useState('');
  const [reconfirmDirections, setReconfirmDirections] = useState(false);
  const [nonDpdName, setNonDpdName] = useState('');
  const [nonDpdStrength, setNonDpdStrength] = useState('');
  const [nonDpdForm, setNonDpdForm] = useState('');
  const [nonDpdRoute, setNonDpdRoute] = useState('');

  const isAdd = mode === 'ADD_MANUAL';

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query]);

  const searchEnabled =
    open &&
    phase === 'searching' &&
    debouncedQuery.length >= (/^\d+$/.test(debouncedQuery) ? 3 : 2);
  const { data: results = [], isFetching } = useDrugSearch(debouncedQuery, searchEnabled, 'medication', 24);
  const groups = useMemo(
    () => groupDrugSearchByBrand(results, debouncedQuery),
    [results, debouncedQuery],
  );
  const options = useMemo(() => flattenDrugBrandGroups(groups), [groups]);
  const groupedRows = useMemo(() => enumerateDrugBrandGroups(groups), [groups]);
  const optionKey = options.map((item) => item.id).join('|');

  useEffect(() => {
    setActiveIndex(0);
  }, [optionKey]);

  useEffect(() => {
    if (!open) return;
    if (isAdd) {
      setDraft(null);
      setPhase('searching');
      setQuery('');
      setDebouncedQuery('');
      setDetailsOpen(false);
      setSigEditorOpen(false);
      setSigOverride({});
      setDoseDraft('');
      setReconfirmDirections(false);
      setNonDpdName('');
      setNonDpdStrength('');
      setNonDpdForm('');
      setNonDpdRoute('');
      window.setTimeout(() => searchRef.current?.focus(), 40);
      return;
    }
    if (!medication) return;
    setDraft({
      ...medication,
      normalized: {
        ...medication.normalized,
        lastFillDate:
          toIsoCalendarDate(medication.normalized.lastFillDate) ??
          medication.normalized.lastFillDate ??
          null,
      },
    });
    const unverified = !isVerifiedProduct(medication);
    setPhase(unverified ? 'non_dpd' : 'selected');
    setQuery('');
    setDebouncedQuery('');
    setDetailsOpen(hasPrescriptionDetails(medication));
    setSigEditorOpen(false);
    setSigOverride({});
    setDoseDraft('');
    setReconfirmDirections(false);
    setNonDpdName(medicationIdentityTitle(medication));
    setNonDpdStrength(medication.normalized.strength ?? '');
    setNonDpdForm(medication.normalized.dosageForm ?? '');
    setNonDpdRoute(medication.normalized.route ?? '');
  }, [open, isAdd, medication]);

  const directionsValue = draft?.normalized.directions ?? '';
  const productSig = useMemo(
    () => resolveMedicationSigDefaults(draft),
    [
      draft?.normalized.route,
      draft?.normalized.doseUnit,
      draft?.normalized.dosageForm,
      draft?.clinicalIdentity?.route,
      draft?.clinicalIdentity?.dosageForm,
      draft?.raw.medicationText,
    ],
  );
  const derivedParsed = useMemo(
    () => applyProductSigDefaults(parseCurrentDirections(directionsValue), productSig),
    [directionsValue, productSig],
  );
  const displayParsed = useMemo(
    () => applyParsedSigOverride(derivedParsed, sigOverride),
    [derivedParsed, sigOverride],
  );

  useEffect(() => {
    setSigOverride({});
  }, [directionsValue]);

  useEffect(() => {
    if ('doseQuantity' in sigOverride) return;
    setDoseDraft(derivedParsed.doseQuantity != null ? String(derivedParsed.doseQuantity) : '');
  }, [derivedParsed.doseQuantity, sigOverride]);

  const patchNormalized = (patch: Partial<RenewMedication['normalized']>) => {
    setDraft((prev) => (prev ? { ...prev, normalized: { ...prev.normalized, ...patch } } : prev));
  };

  const applySigPatch = (patch: ParsedSigOverride) => {
    setSigEditorOpen(true);
    setSigOverride((prev) => ({ ...prev, ...patch }));
    const normalizedPatch: Partial<RenewMedication['normalized']> = {};
    if ('doseQuantity' in patch) {
      normalizedPatch.dose = patch.doseQuantity != null ? String(patch.doseQuantity) : null;
    }
    if (patch.doseUnit) normalizedPatch.doseUnit = patch.doseUnit;
    if (patch.route) {
      normalizedPatch.route = resolveRouteValue(patch.route) || titleCase(patch.route);
    }
    if (patch.frequencyDisplay) normalizedPatch.frequency = patch.frequencyDisplay;
    if (patch.prn != null) normalizedPatch.prn = patch.prn;
    if (Object.keys(normalizedPatch).length) patchNormalized(normalizedPatch);
  };

  useEffect(() => {
    const canonical = productSig.route ? resolveRouteValue(productSig.route) : '';
    if (!canonical) return;
    setDraft((prev) => {
      if (!prev) return prev;
      if (prev.normalized.route?.trim()) return prev;
      return { ...prev, normalized: { ...prev.normalized, route: canonical } };
    });
  }, [productSig.route]);

  const selectProduct = (drug: DrugSearchResult) => {
    setDraft((prev) => {
      const next = applyDrugToMedication(prev, drug);
      setReconfirmDirections(Boolean(prev?.normalized.directions) && next.normalized.directions == null);
      return next;
    });
    setPhase('selected');
    setSigEditorOpen(false);
    setSigOverride({});
  };

  const startNonDpd = () => {
    setDraft((prev) =>
      applyNonDpdIdentity(prev, {
        name: query.trim() || nonDpdName || 'Medication',
        strength: nonDpdStrength,
        dosageForm: nonDpdForm,
        route: nonDpdRoute,
      }),
    );
    setNonDpdName((prev) => prev || query.trim());
    setPhase('non_dpd');
    setQuery('');
  };

  const changeMedication = () => {
    setPhase('searching');
    setReconfirmDirections(false);
    window.setTimeout(() => searchRef.current?.focus(), 40);
  };

  const applyNonDpdFields = (patch: {
    name?: string;
    strength?: string;
    dosageForm?: string;
    route?: string;
  }) => {
    const name = patch.name ?? nonDpdName;
    const strength = patch.strength ?? nonDpdStrength;
    const dosageForm = patch.dosageForm ?? nonDpdForm;
    const route = patch.route ?? nonDpdRoute;
    if (patch.name != null) setNonDpdName(patch.name);
    if (patch.strength != null) setNonDpdStrength(patch.strength);
    if (patch.dosageForm != null) setNonDpdForm(patch.dosageForm);
    if (patch.route != null) setNonDpdRoute(patch.route);
    setDraft((prev) => applyNonDpdIdentity(prev, { name, strength, dosageForm, route }));
  };

  const n = draft?.normalized;
  const quantityEntered = Boolean(n?.quantity != null && String(n.quantity) !== '');
  const quantityUnitMissing = quantityEntered && !n?.quantityUnit;
  const directionsOk = requireDirections
    ? Boolean(directionsValue.trim()) && draft?.directionsStatus !== 'UNAVAILABLE'
    : draft?.directionsStatus === 'UNAVAILABLE' || Boolean(directionsValue.trim());
  const identityOk =
    phase === 'non_dpd'
      ? Boolean(nonDpdName.trim())
      : Boolean(draft && (phase === 'selected' || !isAdd));
  const fillDateError = isoCalendarDateError(n?.lastFillDate, { max: isoDateLocal() });
  const canSubmit = Boolean(draft) && identityOk && directionsOk && !quantityUnitMissing && !fillDateError;

  const submit = () => {
    if (!draft || !canSubmit) return;
    const parsedLine = formatParsedSigLine(displayParsed);
    const next: RenewMedication = {
      ...draft,
      pharmacistEdited: true,
      raw: {
        ...draft.raw,
        directionsText: draft.directionsStatus === 'UNAVAILABLE' ? null : directionsValue.trim() || null,
      },
      normalized: {
        ...draft.normalized,
        lastFillDate: toIsoCalendarDate(draft.normalized.lastFillDate),
        directions: draft.directionsStatus === 'UNAVAILABLE' ? null : directionsValue.trim() || null,
        directionsNormalized: draft.directionsStatus === 'UNAVAILABLE' ? null : parsedLine,
        dose:
          displayParsed.doseQuantity != null
            ? String(displayParsed.doseQuantity)
            : draft.normalized.dose,
        doseUnit: displayParsed.doseUnit ?? draft.normalized.doseUnit,
        route: displayParsed.route
          ? resolveRouteValue(displayParsed.route) || titleCase(displayParsed.route)
          : draft.normalized.route,
        frequency: displayParsed.frequencyDisplay ?? draft.normalized.frequency,
        prn: displayParsed.prn ?? false,
      },
      reviewStatus: draft.directionsStatus === 'UNAVAILABLE' || draft.identityVerificationStatus === 'UNVERIFIED'
        ? 'needs_review'
        : 'confirmed',
    };
    next.reviewStatus =
      next.directionsStatus === 'UNAVAILABLE' || next.identityVerificationStatus === 'UNVERIFIED'
        ? 'needs_review'
        : deriveReviewStatus({ ...next, pharmacistEdited: true });
    if (next.directionsStatus !== 'UNAVAILABLE' && next.identityVerificationStatus !== 'UNVERIFIED') {
      next.reviewStatus = 'confirmed';
    }
    onSave(next);
  };

  const showSearch = phase === 'searching';
  const showResults = showSearch && debouncedQuery.length >= (/^\d+$/.test(debouncedQuery) ? 3 : 2);
  const showRegimen = Boolean(draft) && (phase !== 'searching' || !isAdd);
  const routeOptions = useMemo(
    () => routeSelectOptions(n?.route ?? nonDpdRoute ?? undefined),
    [n?.route, nonDpdRoute],
  );

  const title = isAdd ? 'Add medication' : 'Edit medication';
  const subtitle = isAdd
    ? 'Search for a medication to add to the current regimen.'
    : 'Update the medication details for the current regimen.';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        hideCloseButton
        className={cn(
          'flex max-h-[90dvh] w-[min(820px,calc(100vw-24px))] max-w-[min(820px,calc(100vw-24px))]',
          'flex-col gap-0 overflow-visible p-0 pointer-events-auto sm:rounded-2xl',
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#edf3f4] px-6 py-5">
          <div className="min-w-0">
            <DialogTitle className="text-[22px] font-bold tracking-tight text-[#102a43]">
              {title}
            </DialogTitle>
            <DialogDescription className="mt-1 text-[14px] text-[#7b8b99]">
              {subtitle}
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title.toLowerCase()}`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#8a9aa3] transition-colors hover:bg-[#f4f8f8] hover:text-[#102a43]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
          {showSearch ? (
            <div className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a9aa3]" />
                <Input
                  ref={searchRef}
                  value={query}
                  placeholder="Search by brand, generic, or DIN..."
                  className="h-11 rounded-xl border-[#d3dee1] bg-white pl-10 pr-10 text-sm shadow-none placeholder:text-[#8a9aa3] focus-visible:ring-primary/25"
                  role="combobox"
                  aria-expanded={showResults}
                  aria-controls={`${id}-results`}
                  onChange={(e) => {
                    setQuery(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setActiveIndex((i) => Math.min(i + 1, Math.max(options.length - 1, 0)));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setActiveIndex((i) => Math.max(i - 1, 0));
                    } else if (e.key === 'Enter' && options[activeIndex]) {
                      e.preventDefault();
                      selectProduct(options[activeIndex]);
                    }
                  }}
                />
                {query ? (
                  <button
                    type="button"
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[#8a9aa3] hover:bg-[#f4f8f8] hover:text-[#163447]"
                    onClick={() => {
                      setQuery('');
                      searchRef.current?.focus();
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              {showResults ? (
                <div>
                  <p className="mb-2 text-[13px] font-semibold text-[#163447]">Select a medication</p>
                  <div
                    id={`${id}-results`}
                    role="radiogroup"
                    aria-label="Medication search results"
                    className="overflow-hidden rounded-xl border border-[#d3dee1] bg-white"
                  >
                    {isFetching && !options.length ? (
                      <div className="flex items-center gap-2 px-3.5 py-3 text-sm text-[#5b6b75]">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        Searching…
                      </div>
                    ) : null}
                    {!isFetching && !options.length ? (
                      <p className="px-3.5 py-3 text-sm text-[#5b6b75]">
                        No matches for &ldquo;{debouncedQuery}&rdquo;.
                      </p>
                    ) : null}
                    <div className="max-h-[min(380px,46vh)] overflow-y-auto overscroll-contain">
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
                        const selected = draft?.normalized.medicationConceptId === item.id;
                        const active = index === activeIndex;
                        const strength = formatDrugStrengthOption(item);
                        const din = drugDin(item);
                        const badge = sourceBadge(item);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => selectProduct(item)}
                            className={cn(
                              'flex w-full items-center gap-3 border-b border-[#edf3f4] px-3.5 py-2.5 text-left last:border-b-0',
                              selected || active ? 'bg-primary/[0.05]' : 'hover:bg-[#f7fbfb]',
                            )}
                          >
                            <span
                              className={cn(
                                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                                selected
                                  ? 'border-primary bg-primary text-white'
                                  : 'border-[#c5d2d6] bg-white',
                              )}
                              aria-hidden
                            >
                              {selected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-[#163447]">
                                {strength.title}
                              </span>
                              {din ? (
                                <span className="mt-0.5 block text-[12px] text-[#7b8b94]">DIN {din}</span>
                              ) : null}
                            </span>
                            {badge ? (
                              <span className="shrink-0 rounded-md bg-[#e7f3f4] px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-primary">
                                {badge}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <p className="mt-2.5 text-[13px] text-[#5b6b75]">
                    Don&apos;t see the medication?{' '}
                    <button
                      type="button"
                      className="font-semibold text-primary hover:underline"
                      onClick={startNonDpd}
                    >
                      Add as non-DPD product
                    </button>
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {showRegimen && draft ? (
            <div className={cn(showSearch && 'mt-5', 'space-y-4')}>
              {isAdd ? (
                <p className="text-[13px] font-semibold text-[#163447]">Current regimen</p>
              ) : null}

              {phase === 'non_dpd' ? (
                <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                  <p className="text-sm font-semibold text-amber-950">Medication identity not fully verified</p>
                  <p className="text-[12px] text-amber-900">
                    Enter the product details you have. Do not invent a DIN or other identifiers.
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <TextField
                      id={`${id}-np-name`}
                      label="Medication name"
                      required
                      value={nonDpdName}
                      onChange={(v) => applyNonDpdFields({ name: v })}
                    />
                    <TextField
                      id={`${id}-np-strength`}
                      label="Strength"
                      value={nonDpdStrength}
                      placeholder="if known"
                      onChange={(v) => applyNonDpdFields({ strength: v })}
                    />
                    <div>
                      <FieldLabel htmlFor={`${id}-np-form`}>Dosage form</FieldLabel>
                      <SearchableSelect
                        id={`${id}-np-form`}
                        {...unitSelectBinding('form', nonDpdForm)}
                        placeholder="if known"
                        searchPlaceholder="Search tablet, capsule…"
                        emptyMessage="No matching forms"
                        onChange={(v) => applyNonDpdFields({ dosageForm: v })}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor={`${id}-np-route`}>Route</FieldLabel>
                      <SearchableSelect
                        id={`${id}-np-route`}
                        value={resolveRouteValue(nonDpdRoute) || nonDpdRoute}
                        placeholder="if known"
                        searchPlaceholder="Search oral, topical…"
                        emptyMessage="No matching routes"
                        options={routeOptions}
                        onChange={(v) => applyNonDpdFields({ route: v })}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-sm font-semibold text-primary hover:underline"
                    onClick={changeMedication}
                  >
                    Search for matching product
                  </button>
                </div>
              ) : (
                <IdentitySummary
                  title={medicationIdentityTitle(draft)}
                  meta={medicationIdentityMeta(draft)}
                  onChange={changeMedication}
                />
              )}

              <div>
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <label htmlFor={`${id}-directions`} className="text-[13px] font-semibold text-[#163447]">
                    Current directions
                  </label>
                  <span className="text-[12px] font-medium text-red-600">*Required</span>
                </div>
                <Textarea
                  id={`${id}-directions`}
                  value={draft.directionsStatus === 'UNAVAILABLE' ? '' : directionsValue}
                  disabled={draft.directionsStatus === 'UNAVAILABLE'}
                  placeholder="e.g. Take 1 capsule by mouth once daily"
                  rows={3}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) e.stopPropagation();
                  }}
                  onChange={(e) => {
                    const text = e.target.value;
                    const nextParsed = parseCurrentDirections(text);
                    setReconfirmDirections(false);
                    setSigOverride({});
                    setDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            directionsStatus: 'CONFIRMED',
                            normalized: {
                              ...prev.normalized,
                              directions: text,
                              prn: nextParsed.prn ?? false,
                            },
                          }
                        : prev,
                    );
                  }}
                  className="min-h-[88px] resize-y rounded-[10px] border-[#d3dee1] bg-white shadow-none"
                />
                {reconfirmDirections ? (
                  <p className="mt-1.5 text-[12px] text-amber-800">
                    Product identity changed. Please reconfirm the current directions.
                  </p>
                ) : null}
                {draft.directionsStatus === 'UNAVAILABLE' ? (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[12px] font-medium text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Directions not confirmed
                  </p>
                ) : requireDirections ? null : (
                  <button
                    type="button"
                    className="mt-1.5 text-[12px] font-medium text-[#5b6b75] hover:text-primary hover:underline"
                    onClick={() =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              directionsStatus: 'UNAVAILABLE',
                              normalized: { ...prev.normalized, directions: null, directionsNormalized: null },
                            }
                          : prev,
                      )
                    }
                  >
                    Directions not available
                  </button>
                )}

                {draft.directionsStatus !== 'UNAVAILABLE' ? (
                  <ParsedSigBanner
                    parsed={displayParsed}
                    editing={sigEditorOpen || displayParsed.status === 'partial'}
                    doseDraft={doseDraft}
                    onDoseDraftChange={(value) => {
                      setDoseDraft(value);
                      applySigPatch({ doseQuantity: parsePositiveDoseInput(value) });
                    }}
                    onToggleEdit={() => setSigEditorOpen((open) => !open)}
                    onPatch={applySigPatch}
                    routeOptions={routeOptions}
                  />
                ) : null}
              </div>

              <PrescriptionDetailsAccordion
                id={id}
                open={detailsOpen}
                onOpenChange={setDetailsOpen}
                draft={draft}
                quantityUnitMissing={quantityUnitMissing}
                onPatch={patchNormalized}
              />
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-[#edf3f4] bg-white px-6 py-4">
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-[10px] border-[#d3dee1] bg-white px-4 text-[#102a43]"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="h-10 rounded-[10px] px-5"
            disabled={!canSubmit}
            title={
              !canSubmit
                ? submitDisabledReason(
                    identityOk,
                    directionsOk,
                    quantityUnitMissing,
                    fillDateError,
                    requireDirections,
                  )
                : undefined
            }
            onClick={submit}
          >
            {isAdd ? addButtonLabel || 'Add medication' : 'Save changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function IdentitySummary({
  title,
  meta,
  onChange,
}: {
  title: string;
  meta: string;
  onChange: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[#d9e3e6] bg-[#f7fbfb] px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#163447]">{title}</p>
        {meta ? <p className="mt-0.5 text-[12px] text-[#7b8b94]">{meta}</p> : null}
      </div>
      <button
        type="button"
        onClick={onChange}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-primary/30 bg-white px-3 text-sm font-semibold text-primary hover:bg-primary/[0.04]"
      >
        <ArrowLeftRight className="h-3.5 w-3.5" />
        Change medication
      </button>
    </div>
  );
}

function frequencyValuesEqual(optionValue: string, selected: string) {
  return optionValue.trim().toLowerCase() === selected.trim().toLowerCase();
}

function ParsedSigBanner({
  parsed,
  editing,
  doseDraft,
  onDoseDraftChange,
  onToggleEdit,
  onPatch,
  routeOptions,
}: {
  parsed: ParsedCurrentSig;
  editing: boolean;
  doseDraft: string;
  onDoseDraftChange: (value: string) => void;
  onToggleEdit: () => void;
  onPatch: (patch: ParsedSigOverride) => void;
  routeOptions: Array<{ value: string; label: string }>;
}) {
  if (parsed.status === 'empty') return null;
  const line = formatParsedSigLine(parsed);
  const unresolved = parsed.missing[0];
  const confident = parsed.status === 'parsed';
  const unitOptions =
    parsed.doseUnit &&
    !SIG_DOSE_UNIT_OPTIONS.some((option) => frequencyValuesEqual(option.value, parsed.doseUnit ?? ''))
      ? [{ value: parsed.doseUnit, label: parsed.doseUnit }, ...SIG_DOSE_UNIT_OPTIONS]
      : SIG_DOSE_UNIT_OPTIONS;

  return (
    <div className="mt-2 space-y-2">
      {line ? (
        <div
          className={cn(
            'flex items-start gap-2 rounded-lg px-3 py-2 text-[13px]',
            confident ? 'bg-[#e8f6ee] text-[#1d6b45]' : 'bg-[#e8f3fb] text-[#1e4a6e]',
          )}
        >
          {confident ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.5} />
          ) : (
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <p className="min-w-0 flex-1">Parsed as: {line}</p>
          {confident ? (
            <button
              type="button"
              className="shrink-0 text-[13px] font-semibold text-primary hover:underline"
              onClick={onToggleEdit}
            >
              {editing ? 'Done' : 'Edit'}
            </button>
          ) : null}
        </div>
      ) : null}

      {unresolved && !confident ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-amber-950">
            <AlertTriangle className="h-3.5 w-3.5" />
            {unresolvedSigLabel(unresolved)}
          </p>
        </div>
      ) : null}

      {editing || parsed.status === 'partial' ? (
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-[#d9e3e6] bg-white p-3 sm:grid-cols-2">
          <div className="min-w-0">
            <FieldLabel htmlFor="parsed-dose">Dose</FieldLabel>
            <Input
              id="parsed-dose"
              value={doseDraft}
              placeholder="e.g. 1"
              inputMode="decimal"
              autoComplete="off"
              className={FIELD}
              onChange={(e) => onDoseDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault();
              }}
            />
          </div>
          <div className="min-w-0">
            <FieldLabel htmlFor="parsed-unit">Dose unit</FieldLabel>
            <SearchableSelect
              id="parsed-unit"
              value={parsed.doseUnit ?? ''}
              placeholder="Select unit"
              searchPlaceholder="Search puff, tablet, mL…"
              emptyMessage="No matching units"
              options={unitOptions}
              valuesEqual={frequencyValuesEqual}
              onChange={(v) => onPatch({ doseUnit: canonicalDoseUnit(v) || v || undefined })}
            />
          </div>
          <div>
            <FieldLabel htmlFor="parsed-route">Route</FieldLabel>
            <SearchableSelect
              id="parsed-route"
              value={resolveRouteValue(parsed.route) || parsed.route || ''}
              placeholder="Select route"
              searchPlaceholder="Search inhalation, oral, topical…"
              emptyMessage="No matching routes"
              options={routeOptions}
              valuesEqual={(optionValue, selected) =>
                resolveRouteValue(optionValue).toLowerCase() === resolveRouteValue(selected).toLowerCase()
              }
              onChange={(v) => onPatch({ route: resolveRouteValue(v) || v || undefined })}
            />
          </div>
          <div>
            <FieldLabel htmlFor="parsed-freq">Frequency</FieldLabel>
            <SearchableSelect
              id="parsed-freq"
              value={parsed.frequencyDisplay ?? ''}
              placeholder="Select frequency"
              searchPlaceholder="Search frequency…"
              emptyMessage="No matching frequencies"
              options={FREQUENCY_SELECT_OPTIONS.map((o) => ({
                value: o.description,
                label: o.description,
                code: o.code,
              }))}
              valuesEqual={frequencyValuesEqual}
              onChange={(v) => {
                const match = FREQUENCY_SELECT_OPTIONS.find(
                  (option) => option.description.toLowerCase() === v.trim().toLowerCase(),
                );
                onPatch({
                  frequencyDisplay: match?.description || v || undefined,
                  frequencyCode: match?.code,
                });
              }}
            />
          </div>
          <div>
            <FieldLabel htmlFor="parsed-prn">PRN</FieldLabel>
            <div className="flex h-10 items-center gap-2">
              <Switch
                id="parsed-prn"
                checked={Boolean(parsed.prn)}
                onCheckedChange={(checked) => onPatch({ prn: checked })}
              />
              <span className="text-[13px] text-[#5b6b75]">As needed</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PrescriptionDetailsAccordion({
  id,
  open,
  onOpenChange,
  draft,
  quantityUnitMissing,
  onPatch,
}: {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: RenewMedication;
  quantityUnitMissing: boolean;
  onPatch: (patch: Partial<RenewMedication['normalized']>) => void;
}) {
  const n = draft.normalized;
  return (
    <div className="overflow-hidden rounded-xl border border-[#d9e3e6]">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <span>
          <span className="block text-sm font-semibold text-[#163447]">Prescription details (optional)</span>
          {!open ? (
            <span className="mt-0.5 block text-[12px] text-[#7b8b94]">
              Add prescriber, quantity, refills, or last fill date if available.
            </span>
          ) : null}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-[#8a9aa3] transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <div className="space-y-3 border-t border-[#edf3f4] px-4 pb-4 pt-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField
              id={`${id}-prescriber`}
              label="Prescriber"
              value={n.prescriberName ?? ''}
              placeholder="e.g. Dr. Jane Smith"
              onChange={(v) => onPatch({ prescriberName: v || null })}
            />
            <TextField
              id={`${id}-qty`}
              label="Quantity"
              value={n.quantity != null ? String(n.quantity) : ''}
              placeholder="e.g. 30"
              inputMode="decimal"
              onChange={(v) => onPatch({ quantity: v.trim() ? Number(v) || null : null })}
            />
            <div>
              <FieldLabel htmlFor={`${id}-qty-unit`}>
                Quantity unit{quantityUnitMissing ? ' *' : ''}
              </FieldLabel>
              <SearchableSelect
                id={`${id}-qty-unit`}
                {...unitSelectBinding('quantity', n.quantityUnit || '')}
                placeholder="Select unit"
                searchPlaceholder="Search tablet, vial, mL…"
                emptyMessage="No matching units"
                aria-invalid={quantityUnitMissing}
                onChange={(v) => onPatch({ quantityUnit: v || null })}
              />
              {quantityUnitMissing ? (
                <p className="mt-1 text-[12px] text-red-600">Quantity unit is required when quantity is entered.</p>
              ) : null}
            </div>
            <TextField
              id={`${id}-refills`}
              label="Refills remaining"
              value={n.refillsRemaining != null ? String(n.refillsRemaining) : ''}
              placeholder="e.g. 0"
              inputMode="numeric"
              onChange={(v) => onPatch({ refillsRemaining: v.trim() ? Number(v) || null : null })}
            />
            <div className="sm:col-span-2">
              <FieldLabel htmlFor={`${id}-fill`}>Last fill date</FieldLabel>
              <IsoDateField
                id={`${id}-fill`}
                value={n.lastFillDate ?? ''}
                onChange={(next) => onPatch({ lastFillDate: next || null })}
                max={isoDateLocal()}
                className="max-w-sm"
              />
            </div>
          </div>
          <p className="flex items-start gap-2 rounded-lg bg-[#e8f3fb] px-3 py-2.5 text-[12px] leading-5 text-[#1e4a6e]">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            This information is optional and used to support your review. It does not create a new prescription.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  inputMode,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode'];
  required?: boolean;
}) {
  return (
    <div className="min-w-0">
      <FieldLabel htmlFor={id} required={required}>
        {label}
      </FieldLabel>
      <Input
        id={id}
        value={value}
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.preventDefault();
        }}
        className={FIELD}
      />
    </div>
  );
}

function hasPrescriptionDetails(med: RenewMedication) {
  const n = med.normalized;
  return Boolean(
    n.prescriberName ||
      n.quantity != null ||
      n.quantityUnit ||
      n.refillsRemaining != null ||
      n.lastFillDate,
  );
}

function titleCase(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function submitDisabledReason(
  identityOk: boolean,
  directionsOk: boolean,
  quantityUnitMissing: boolean,
  fillDateError: string | null,
  requireDirections = false,
) {
  if (!identityOk) return 'Select a medication first';
  if (!directionsOk) {
    return requireDirections
      ? 'Enter the original directions (SIG) to continue'
      : 'Enter current directions, or mark them unavailable';
  }
  if (quantityUnitMissing) return 'Select a quantity unit';
  if (fillDateError) return fillDateError;
  return 'Complete required fields';
}

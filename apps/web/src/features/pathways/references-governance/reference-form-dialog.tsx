'use client';

import { useEffect, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { MultiSelect } from '@/components/ui/multi-select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CLINICAL_USE_TAG_OPTIONS,
  DOCUMENT_TYPE_LABELS,
  EVIDENCE_DOCUMENT_TYPES,
  EVIDENCE_IMPORT_SECTIONS,
  EVIDENCE_JURISDICTIONS,
  EVIDENCE_REFERENCE_STATUSES,
  REFERENCE_STATUS_LABELS,
  SECTION_FULL_LABELS,
} from '@safescript/shared';
import type { PathwayEvidenceReference } from '../types';
import { parseYearEdition, yearEditionLabel } from './utils';
import { usePathways } from '../hooks';
import { cn } from '@/lib/utils';

const SECTION_OPTIONS = EVIDENCE_IMPORT_SECTIONS.map((value) => ({
  value,
  label: SECTION_FULL_LABELS[value],
}));

const schema = z
  .object({
    citationTitle: z.string().min(2, 'Title is required'),
    organization: z.string().min(1, 'Organization / publisher is required'),
    documentType: z.string().min(1, 'Document type is required'),
    yearEdition: z.string().optional(),
    jurisdiction: z.string().min(1, 'Jurisdiction is required'),
    url: z.string().optional(),
    doi: z.string().optional(),
    pathwayIds: z.array(z.string()),
    suggestedSections: z.array(z.string()),
    clinicalUseTags: z.array(z.string()),
    documentationCandidate: z.enum(['yes', 'no']),
    verificationRequired: z.boolean(),
    status: z.string().min(1),
    notes: z.string().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.pathwayIds.length > 0 && data.suggestedSections.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['suggestedSections'],
        message: 'Select at least one pathway section when linking to a pathway',
      });
    }
  });

type FormData = z.infer<typeof schema>;

export type ReferenceFormSavePayload = {
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
};

const DOCUMENT_TYPE_OPTIONS = EVIDENCE_DOCUMENT_TYPES.map((value) => ({
  value,
  label: DOCUMENT_TYPE_LABELS[value],
}));

const STATUS_OPTIONS = EVIDENCE_REFERENCE_STATUSES.map((value) => ({
  value,
  label: REFERENCE_STATUS_LABELS[value],
}));

const JURISDICTION_OPTIONS = EVIDENCE_JURISDICTIONS.map((value) => ({
  value,
  label: value,
}));

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[12px] leading-snug text-[#6b7c8a]">{children}</p>;
}

function LabelWithInfo({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <Label className="text-[13px] font-medium text-[#1a2b3c]">{children}</Label>
      <Info className="h-3.5 w-3.5 text-[#5b8fa8]" aria-hidden />
    </div>
  );
}

function SectionCard({
  step,
  title,
  helper,
  children,
}: {
  step: number;
  title: string;
  helper: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#e2e8ee] bg-white p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0f6f6b] text-[11px] font-bold text-white">
          {step}
        </span>
        <div className="min-w-0 pt-0.5">
          <h3 className="text-[15px] font-semibold leading-none text-[#10233d]">{title}</h3>
          <p className="mt-1 text-[12.5px] text-[#6b7c8a]">{helper}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function ReferenceFormDialog({
  open,
  onClose,
  editing,
  saving,
  onSave,
  mode = 'pathway',
  currentPathway,
  initialSections,
}: {
  open: boolean;
  onClose: () => void;
  editing: PathwayEvidenceReference | null;
  saving?: boolean;
  onSave: (payload: ReferenceFormSavePayload) => Promise<void>;
  /** Master library allows multi-pathway; pathway mode locks to current pathway. */
  mode?: 'master' | 'pathway';
  currentPathway?: { id: string; name: string } | null;
  /** Pre-selected section checkboxes (e.g. from existing mappings). */
  initialSections?: string[];
}) {
  const pathwaysQuery = usePathways({
    page: 1,
    limit: 200,
    sortBy: 'name',
    sortOrder: 'asc',
  });
  const pathwayOptions = useMemo(() => {
    const rows = pathwaysQuery.data?.items ?? [];
    return rows.map((p) => ({
      value: p.id,
      label: p.name || p.condition || p.id,
    }));
  }, [pathwaysQuery.data?.items]);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      citationTitle: '',
      organization: '',
      documentType: '',
      yearEdition: '',
      jurisdiction: '',
      url: '',
      doi: '',
      pathwayIds: currentPathway?.id ? [currentPathway.id] : [],
      suggestedSections: [],
      clinicalUseTags: [],
      documentationCandidate: 'no',
      verificationRequired: false,
      status: 'needs_review',
      notes: '',
    },
  });

  const notesValue = form.watch('notes') ?? '';
  const suggestedSections = form.watch('suggestedSections');

  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.reset({
        citationTitle: editing.citationTitle,
        organization: editing.organization ?? '',
        documentType: editing.documentType ?? '',
        yearEdition: yearEditionLabel(editing) === '—' ? '' : yearEditionLabel(editing),
        jurisdiction: editing.jurisdiction ?? '',
        url: editing.url ?? '',
        doi: editing.doi ?? '',
        pathwayIds:
          mode === 'master'
            ? (editing.pathwayIds ?? [])
            : currentPathway?.id
              ? [currentPathway.id]
              : [],
        suggestedSections: initialSections ?? editing.suggestedSections ?? [],
        clinicalUseTags: editing.clinicalUseTags ?? [],
        documentationCandidate: editing.documentationCandidate ? 'yes' : 'no',
        verificationRequired: Boolean(editing.verificationRequired),
        status: editing.status ?? 'needs_review',
        notes: editing.notes ?? '',
      });
    } else {
      form.reset({
        citationTitle: '',
        organization: '',
        documentType: '',
        yearEdition: '',
        jurisdiction: '',
        url: '',
        doi: '',
        pathwayIds: currentPathway?.id ? [currentPathway.id] : [],
        suggestedSections: initialSections ?? [],
        clinicalUseTags: [],
        documentationCandidate: 'no',
        verificationRequired: false,
        status: 'needs_review',
        notes: '',
      });
    }
  }, [open, editing, form, currentPathway?.id, initialSections, mode]);

  const submit = form.handleSubmit(async (data) => {
    const { edition, publicationYear } = parseYearEdition(data.yearEdition ?? '');
    await onSave({
      citationTitle: data.citationTitle.trim(),
      organization: data.organization.trim(),
      documentType: data.documentType,
      edition,
      publicationYear,
      jurisdiction: data.jurisdiction.trim(),
      url: data.url?.trim() || undefined,
      doi: data.doi?.trim() || undefined,
      status: data.status,
      clinicalUseTags: data.clinicalUseTags,
      suggestedSections: data.suggestedSections,
      documentationCandidate: data.documentationCandidate === 'yes',
      verificationRequired: data.verificationRequired,
      notes: data.notes?.trim() || null,
      pathwayIds: mode === 'master' ? data.pathwayIds : undefined,
    });
  });

  const toggleSection = (value: string) => {
    const next = suggestedSections.includes(value)
      ? suggestedSections.filter((s) => s !== value)
      : [...suggestedSections, value];
    form.setValue('suggestedSections', next, { shouldValidate: true });
  };

  const pathwayField = (
    <div className="space-y-1.5">
      <Label className="text-[13px] font-medium text-[#1a2b3c]">
        Applicable condition(s) / pathway(s)
      </Label>
      {mode === 'master' ? (
        <>
          <Controller
            control={form.control}
            name="pathwayIds"
            render={({ field }) => (
              <MultiSelect
                options={pathwayOptions}
                value={field.value}
                onChange={field.onChange}
                placeholder="Select condition(s) or pathway(s)"
                searchPlaceholder="Search pathways…"
                maxChips={4}
              />
            )}
          />
          <FieldHint>Choose all that apply. This reference can be used in multiple pathways.</FieldHint>
        </>
      ) : (
        <div className="rounded-lg border border-[#e2e8ee] bg-[#f7fafb] px-3 py-2.5 text-sm text-[#10233d]">
          {currentPathway?.name ?? '—'}
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className={cn(
          'flex w-[min(100vw-1.5rem,80vw)] max-w-[80vw] flex-col gap-0 overflow-hidden p-0',
          'max-h-[min(94vh,920px)] sm:rounded-2xl',
        )}
      >
        <DialogHeader className="shrink-0 space-y-1 px-5 pb-3 pt-5 sm:px-7 sm:pt-6">
          <DialogTitle className="text-[22px] font-bold tracking-tight text-[#10233d]">
            {editing ? 'Edit reference' : 'Add reference'}
          </DialogTitle>
          <p className="max-w-3xl text-[13.5px] leading-relaxed text-[#5b6b76]">
            Add a reference to the SafeScribe evidence library. This reference can be linked to one
            or more clinical pathways.
          </p>
          {editing?.importSource === 'chatgpt' ? (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              AI suggested — review before save
            </p>
          ) : null}
        </DialogHeader>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-2 sm:px-7">
            <SectionCard
              step={1}
              title="Basic information"
              helper="Enter the key details about this reference."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ref-title" className="text-[13px] font-medium text-[#1a2b3c]">
                    Title <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="ref-title"
                    placeholder="Enter the full reference title"
                    className="h-10 border-[#d7e0e6]"
                    {...form.register('citationTitle')}
                  />
                  {form.formState.errors.citationTitle ? (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.citationTitle.message}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ref-org" className="text-[13px] font-medium text-[#1a2b3c]">
                    Organization / publisher <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="ref-org"
                    placeholder="e.g. Canadian Pharmacists Association"
                    className="h-10 border-[#d7e0e6]"
                    {...form.register('organization')}
                  />
                  {form.formState.errors.organization ? (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.organization.message}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ref-type" className="text-[13px] font-medium text-[#1a2b3c]">
                    Document type <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    id="ref-type"
                    options={DOCUMENT_TYPE_OPTIONS}
                    placeholder="Select document type"
                    className="h-10 border-[#d7e0e6]"
                    {...form.register('documentType')}
                  />
                  {form.formState.errors.documentType ? (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.documentType.message}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ref-year" className="text-[13px] font-medium text-[#1a2b3c]">
                    Year / edition
                  </Label>
                  <Input
                    id="ref-year"
                    placeholder="e.g. 2024 or Current edition"
                    className="h-10 border-[#d7e0e6]"
                    {...form.register('yearEdition')}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                  <Label htmlFor="ref-jurisdiction" className="text-[13px] font-medium text-[#1a2b3c]">
                    Jurisdiction <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    id="ref-jurisdiction"
                    options={JURISDICTION_OPTIONS}
                    placeholder="Select jurisdiction"
                    className="h-10 border-[#d7e0e6]"
                    {...form.register('jurisdiction')}
                  />
                  {form.formState.errors.jurisdiction ? (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.jurisdiction.message}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ref-url" className="text-[13px] font-medium text-[#1a2b3c]">
                    URL
                  </Label>
                  <Input
                    id="ref-url"
                    type="url"
                    placeholder="https://"
                    className="h-10 border-[#d7e0e6]"
                    {...form.register('url')}
                  />
                  <FieldHint>Add the official URL if available (optional).</FieldHint>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ref-doi" className="text-[13px] font-medium text-[#1a2b3c]">
                    DOI
                  </Label>
                  <Input
                    id="ref-doi"
                    placeholder="e.g. 10.xxxx/xxxxx"
                    className="h-10 border-[#d7e0e6]"
                    {...form.register('doi')}
                  />
                  <FieldHint>Add the DOI if available (optional).</FieldHint>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              step={2}
              title="Pathway mapping & clinical use"
              helper="Indicate where this reference may be used in SafeScribe."
            >
              <div className="grid gap-5 lg:grid-cols-2">
                {pathwayField}

                <div className="space-y-2">
                  <LabelWithInfo>
                    Supports pathway section(s) <span className="text-destructive">*</span>
                  </LabelWithInfo>
                  <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
                    {SECTION_OPTIONS.map((opt) => {
                      const checked = suggestedSections.includes(opt.value);
                      return (
                        <label
                          key={opt.value}
                          className="flex cursor-pointer items-center gap-2 text-[13px] text-[#1a2b3c]"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-[#c5d0d6] text-[#0f6f6b] focus:ring-[#0f6f6b]"
                            checked={checked}
                            onChange={() => toggleSection(opt.value)}
                          />
                          {opt.label}
                        </label>
                      );
                    })}
                  </div>
                  {form.formState.errors.suggestedSections ? (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.suggestedSections.message}
                    </p>
                  ) : (
                    <FieldHint>Select all sections that this reference may support.</FieldHint>
                  )}
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-1.5">
                  <LabelWithInfo>Clinical use tags (for Adapt and other modules)</LabelWithInfo>
                  <Controller
                    control={form.control}
                    name="clinicalUseTags"
                    render={({ field }) => (
                      <MultiSelect
                        options={CLINICAL_USE_TAG_OPTIONS}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Select clinical use tags"
                        searchPlaceholder="Search tags…"
                        maxChips={5}
                      />
                    )}
                  />
                  <FieldHint>
                    Add relevant tags (e.g. dose, renal, therapeutic substitution).
                  </FieldHint>
                </div>

                <div className="space-y-2">
                  <LabelWithInfo>Documentation reference candidate</LabelWithInfo>
                  <div className="flex flex-wrap gap-5 pt-1">
                    {(['yes', 'no'] as const).map((value) => (
                      <label
                        key={value}
                        className="flex cursor-pointer items-center gap-2 text-[13.5px] text-[#1a2b3c]"
                      >
                        <input
                          type="radio"
                          value={value}
                          className="h-4 w-4 border-[#c5d0d6] text-[#0f6f6b] focus:ring-[#0f6f6b]"
                          {...form.register('documentationCandidate')}
                        />
                        {value === 'yes' ? 'Yes' : 'No'}
                      </label>
                    ))}
                  </div>
                  <FieldHint>
                    Could this be the primary documentation reference for a pathway?
                  </FieldHint>
                  <label className="mt-2 flex cursor-pointer items-start gap-2 text-[12.5px] text-[#5b6b76]">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-3.5 w-3.5 rounded border-[#c5d0d6] text-[#0f6f6b]"
                      {...form.register('verificationRequired')}
                    />
                    <span>Bibliographic verification required</span>
                  </label>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              step={3}
              title="Status and notes"
              helper="Set the review status and add any additional notes."
            >
              <div className="grid gap-4 lg:grid-cols-[minmax(180px,28%)_1fr]">
                <div className="space-y-1.5">
                  <Label htmlFor="ref-status" className="text-[13px] font-medium text-[#1a2b3c]">
                    Status <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    id="ref-status"
                    options={STATUS_OPTIONS}
                    className="h-10 border-[#d7e0e6]"
                    {...form.register('status')}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="ref-notes" className="text-[13px] font-medium text-[#1a2b3c]">
                      Notes (optional)
                    </Label>
                    <span className="text-[11px] tabular-nums text-[#8a97a3]">
                      {notesValue.length}/500
                    </span>
                  </div>
                  <Textarea
                    id="ref-notes"
                    rows={3}
                    maxLength={500}
                    placeholder="Add any notes about this reference (e.g. relevance, context, retrieval date)."
                    className="min-h-[88px] resize-y border-[#d7e0e6]"
                    {...form.register('notes')}
                  />
                </div>
              </div>
            </SectionCard>
          </div>

          <DialogFooter className="shrink-0 flex-row items-center justify-between gap-3 px-5 py-4 sm:px-7 sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="h-10 border-[#d7e0e6] px-5 text-[#10233d]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="h-10 bg-[#0f6f6b] px-5 text-white hover:bg-[#0c5e5b]"
            >
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Save reference
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

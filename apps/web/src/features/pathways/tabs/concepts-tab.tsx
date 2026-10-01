'use client';

import { useMemo, useState } from 'react';
import { toast } from '@/lib/notify';
import {
  Loader2,
  RefreshCw,
  Trash2,
  Check,
  ArrowRight,
  Sparkles,
  ListFilter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ClinicalConcept, ClinicalConceptCategory, ClinicalPathway } from '../types';
import {
  useCurateConcepts,
  useDeleteConcept,
  useRegenerateFromConcepts,
  useUpdateConcept,
} from '../hooks';
import { ImportFromChatGptButton } from '../import-from-chatgpt-button';
import { cn } from '@/lib/utils';

/** Production shortlist size for pharmacist pathway authoring. */
const MAX_CONCEPTS = 20;

const CATEGORY_ORDER: ClinicalConceptCategory[] = [
  'RED_FLAG',
  'ELIGIBILITY',
  'DIFFERENTIAL',
  'DIAGNOSIS',
  'SYMPTOM',
  'HISTORY',
  'TREATMENT',
  'COUNSELLING',
  'FOLLOW_UP',
  'LAB',
  'PHYSICAL_EXAM',
  'OTHER',
];

function formatCategory(cat: string) {
  return cat
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function ConceptsTab({
  pathway,
  canEdit,
}: {
  pathway: ClinicalPathway;
  canEdit: boolean;
}) {
  const concepts = pathway.concepts ?? [];
  const updateMutation = useUpdateConcept(pathway.id);
  const deleteMutation = useDeleteConcept(pathway.id);
  const curateMutation = useCurateConcepts(pathway.id);
  const regenMutation = useRegenerateFromConcepts(pathway.id);
  const [filter, setFilter] = useState<ClinicalConceptCategory | 'ALL'>('ALL');

  const questionCount = pathway._count?.questions ?? pathway.questions?.length ?? 0;
  const needsFirstGenerate =
    concepts.length > 0 &&
    (pathway.pipelineStage === 'CONCEPTS_READY' || questionCount === 0);

  const approvedCount = concepts.filter((c) => c.approved).length;
  const needsCurate = concepts.length > MAX_CONCEPTS;

  const grouped = useMemo(() => {
    const filtered =
      filter === 'ALL' ? concepts : concepts.filter((c) => c.category === filter);
    const map = new Map<ClinicalConceptCategory, ClinicalConcept[]>();
    for (const c of filtered) {
      const list = map.get(c.category) ?? [];
      list.push(c);
      map.set(c.category, list);
    }
    return CATEGORY_ORDER.filter((cat) => map.has(cat)).map((cat) => ({
      category: cat,
      items: map.get(cat)!,
    }));
  }, [concepts, filter]);

  const handleGenerate = async () => {
    try {
      await regenMutation.mutateAsync({});
      toast.success(
        needsFirstGenerate
          ? 'Generating pathway from your clinical concepts…'
          : 'Regenerating pathway from stored concepts…',
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not generate pathway');
    }
  };

  const handleCurate = async () => {
    try {
      const result = await curateMutation.mutateAsync();
      toast.success(
        `Kept ${result.kept} most important concepts`,
        result.removed > 0
          ? { description: `Removed ${result.removed} lower-priority items.` }
          : undefined,
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not curate concepts');
    }
  };

  if (!concepts.length) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-16 text-center">
        <div>
          <p className="text-sm font-medium">No clinical concepts yet</p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            Concepts appear after you confirm document roles, or import a focused shortlist
            (max {MAX_CONCEPTS}) from ChatGPT.
          </p>
        </div>
        {canEdit && (
          <ImportFromChatGptButton pathway={pathway} target="concepts" canEdit={canEdit} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canEdit && needsCurate && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-300/60 bg-amber-50/80 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-amber-700/40 dark:bg-amber-950/25">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
              Too many concepts ({concepts.length})
            </p>
            <p className="max-w-xl text-xs text-amber-900/80 dark:text-amber-200/80">
              Pathways work best with a focused shortlist of up to {MAX_CONCEPTS} important
              concepts (red flags, eligibility, key treatments). Curate now to keep the highest
              priority items and remove the rest.
            </p>
          </div>
          <Button
            size="default"
            variant="outline"
            className="shrink-0 gap-2 border-amber-400/60 bg-white shadow-sm dark:bg-background"
            disabled={curateMutation.isPending}
            onClick={handleCurate}
          >
            {curateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ListFilter className="h-4 w-4" />
            )}
            Keep top {MAX_CONCEPTS}
          </Button>
        </div>
      )}

      {canEdit && needsFirstGenerate && (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold">Ready to generate the pathway</p>
            <p className="max-w-xl text-xs text-muted-foreground">
              {approvedCount}/{concepts.length} concepts approved. This creates assessment questions,
              red flags, differentials, treatments, and counselling from these concepts — without
              re-reading PDFs.
            </p>
          </div>
          <Button
            size="default"
            className="shrink-0 gap-2 shadow-sm"
            disabled={regenMutation.isPending || needsCurate}
            onClick={handleGenerate}
            title={needsCurate ? `Curate to ${MAX_CONCEPTS} concepts first` : undefined}
          >
            {regenMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate pathway
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">Clinical concepts</h3>
          <p className="text-xs text-muted-foreground">
            {concepts.length} of max {MAX_CONCEPTS} · {approvedCount} approved
            {!needsFirstGenerate && ' · regenerate anytime without re-parsing documents'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ImportFromChatGptButton pathway={pathway} target="concepts" canEdit={canEdit} />
          <select
            className="h-9 rounded-md border bg-background px-2 text-xs"
            value={filter}
            onChange={(e) => setFilter(e.target.value as ClinicalConceptCategory | 'ALL')}
          >
            <option value="ALL">All categories</option>
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {formatCategory(c)}
              </option>
            ))}
          </select>
          {canEdit && !needsFirstGenerate && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={regenMutation.isPending || needsCurate}
              onClick={handleGenerate}
              title={needsCurate ? `Curate to ${MAX_CONCEPTS} concepts first` : undefined}
            >
              {regenMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Regenerate pathway
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-5">
        {grouped.map(({ category, items }) => (
          <section key={category}>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {formatCategory(category)} · {items.length}
            </h4>
            <div className="space-y-2">
              {items.map((concept) => (
                <div
                  key={concept.id}
                  className={cn(
                    'rounded-lg border bg-card p-3 shadow-sm',
                    concept.approved && 'border-emerald-200',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm font-medium">{concept.label}</p>
                        {concept.importance && (
                          <Badge variant="outline" className="text-[10px]">
                            {concept.importance}
                          </Badge>
                        )}
                        {concept.approved && (
                          <Badge className="bg-emerald-600 text-[10px]">Approved</Badge>
                        )}
                      </div>
                      {concept.description && (
                        <p className="text-xs text-muted-foreground">{concept.description}</p>
                      )}
                      {concept.aliases?.length > 1 && (
                        <p className="text-[11px] text-muted-foreground">
                          Also known as:{' '}
                          {concept.aliases.filter((a) => a !== concept.label).join(', ')}
                        </p>
                      )}
                      {concept.sources?.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {concept.sources.map((s) => (
                            <Badge
                              key={s.id}
                              variant="secondary"
                              className="text-[10px] font-normal"
                            >
                              ✓ {s.document?.fileName ?? 'Source'}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    {canEdit && (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title="Approve"
                          disabled={updateMutation.isPending || concept.approved}
                          onClick={async () => {
                            try {
                              await updateMutation.mutateAsync({
                                conceptId: concept.id,
                                approved: true,
                              });
                            } catch (err: unknown) {
                              toast.error(err instanceof Error ? err.message : 'Update failed');
                            }
                          }}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive"
                          title="Delete"
                          disabled={deleteMutation.isPending}
                          onClick={async () => {
                            try {
                              await deleteMutation.mutateAsync(concept.id);
                              toast.success('Concept removed');
                            } catch (err: unknown) {
                              toast.error(err instanceof Error ? err.message : 'Delete failed');
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {canEdit && needsFirstGenerate && (
        <div className="sticky bottom-4 z-10 flex justify-end">
          <Button
            size="lg"
            className="gap-2 shadow-lg"
            disabled={regenMutation.isPending || needsCurate}
            onClick={handleGenerate}
            title={needsCurate ? `Curate to ${MAX_CONCEPTS} concepts first` : undefined}
          >
            {regenMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate pathway
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

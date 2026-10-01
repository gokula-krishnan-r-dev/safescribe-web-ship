'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, Search, Sparkles } from 'lucide-react';
import { toast } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  PATHWAY_ROUTING_LIMITS,
  normalizePathwayRouting,
  normalizeRoutingDescription,
} from '@safescript/shared';
import type { ClinicalPathway } from './types';
import { canEditPathway } from './pathway-utils';
import { useGenerateRoutingSuggestions, useUpdatePathway } from './hooks';
import { TagInput } from './tag-input';

interface Props {
  pathway: ClinicalPathway;
}

export function PathwayMatchingCard({ pathway }: Props) {
  const editable = canEditPathway(pathway.status);
  const updatePathway = useUpdatePathway(pathway.id);
  const generate = useGenerateRoutingSuggestions(pathway.id);

  const [aliases, setAliases] = useState(pathway.routingAliases ?? []);
  const [presentingComplaints, setPresentingComplaints] = useState(
    pathway.routingPresentingComplaints ?? [],
  );
  const [contextTerms, setContextTerms] = useState(pathway.routingContextTerms ?? []);
  const [description, setDescription] = useState(pathway.routingDescription ?? '');
  const [suggestedKeys, setSuggestedKeys] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setAliases(pathway.routingAliases ?? []);
    setPresentingComplaints(pathway.routingPresentingComplaints ?? []);
    setContextTerms(pathway.routingContextTerms ?? []);
    setDescription(pathway.routingDescription ?? '');
    setSuggestedKeys(new Set());
    setDirty(false);
  }, [pathway]);

  const markDirty = () => setDirty(true);

  const wordCount = useMemo(
    () => description.trim().split(/\s+/).filter(Boolean).length,
    [description],
  );

  const onSave = async () => {
    const normalized = normalizePathwayRouting({
      aliases,
      presentingComplaints,
      contextTerms,
      description,
    });
    try {
      await updatePathway.mutateAsync({
        routingAliases: normalized.aliases,
        routingPresentingComplaints: normalized.presentingComplaints,
        routingContextTerms: normalized.contextTerms,
        routingDescription: normalized.description || null,
      });
      setSuggestedKeys(new Set());
      setDirty(false);
      toast.success('Pathway matching terms saved.');
    } catch {
      toast.error('Could not save pathway matching terms. Please try again.');
    }
  };

  const onGenerate = async () => {
    try {
      const result = await generate.mutateAsync();
      setAliases(result.aliases);
      setPresentingComplaints(result.presentingComplaints);
      setContextTerms(result.contextTerms);
      setDescription(result.description);
      setSuggestedKeys(new Set(result.suggestedKeys ?? []));
      setDirty(true);
      toast.success('Suggested terms ready — review and save when ready.');
    } catch {
      toast.error(
        'Pathway suggestions are temporarily unavailable. Add matching terms manually.',
      );
    }
  };

  return (
    <Card className="shadow-none">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-muted/20 px-5 py-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <Search className="mt-0.5 h-4 w-4 text-primary shrink-0" aria-hidden />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Pathway Matching</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Terms SafeScribe uses to recognize when this pathway may be relevant.
            </p>
          </div>
        </div>
        {editable && (
          <div className="flex items-center gap-2 shrink-0">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={generate.isPending || updatePathway.isPending}
                    onClick={onGenerate}
                  >
                    {generate.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    Generate Suggested Terms
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Generate draft matching terms from this pathway&apos;s approved clinical
                  content. Review before saving.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={!dirty || updatePathway.isPending}
              onClick={onSave}
            >
              {updatePathway.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save
            </Button>
          </div>
        )}
      </div>

      <fieldset disabled={!editable} className="space-y-5 p-5 disabled:opacity-70">
        <div className="space-y-1.5">
          <Label>Alternative Names / Aliases</Label>
          <p className="text-[11px] text-muted-foreground">
            Other names, abbreviations or synonyms for this pathway.
          </p>
          <TagInput
            value={aliases}
            onChange={(next: string[]) => {
              setAliases(next);
              markDirty();
            }}
            maxItems={PATHWAY_ROUTING_LIMITS.aliasMax}
            suggestedKeys={suggestedKeys}
            placeholder="e.g. MSK pain, sprain"
            aria-label="Alternative names and aliases"
            disabled={!editable}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Common Presenting Complaints</Label>
          <p className="text-[11px] text-muted-foreground">
            Words or phrases a pharmacist or patient may use before the condition is confirmed.
          </p>
          <TagInput
            value={presentingComplaints}
            onChange={(next: string[]) => {
              setPresentingComplaints(next);
              markDirty();
            }}
            maxItems={PATHWAY_ROUTING_LIMITS.presentingComplaintMax}
            suggestedKeys={suggestedKeys}
            placeholder="e.g. shoulder pain, pain after lifting"
            aria-label="Common presenting complaints"
            disabled={!editable}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Body / Context Terms</Label>
          <p className="text-[11px] text-muted-foreground">
            Relevant body areas, exposures or context that may help identify this pathway.
          </p>
          <TagInput
            value={contextTerms}
            onChange={(next: string[]) => {
              setContextTerms(next);
              markDirty();
            }}
            maxItems={PATHWAY_ROUTING_LIMITS.contextTermMax}
            suggestedKeys={suggestedKeys}
            placeholder="e.g. shoulder, knee, ankle"
            aria-label="Body or context terms"
            disabled={!editable}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-end justify-between gap-2">
            <div>
              <Label htmlFor="routingDescription">Routing Description</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Briefly describe the types of presentations that should make this pathway
                relevant.
              </p>
            </div>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {wordCount} words · {description.length}/{PATHWAY_ROUTING_LIMITS.descriptionMaxLength}
            </span>
          </div>
          <Textarea
            id="routingDescription"
            rows={3}
            value={description}
            disabled={!editable}
            maxLength={PATHWAY_ROUTING_LIMITS.descriptionMaxLength}
            placeholder="e.g. Acute uncomplicated pain or injury involving muscles, joints, or soft tissues…"
            onChange={(e) => {
              setDescription(normalizeRoutingDescription(e.target.value));
              markDirty();
            }}
            className={
              suggestedKeys.has('__description__')
                ? 'border-amber-300/80 bg-amber-50/40'
                : undefined
            }
          />
        </div>

        {suggestedKeys.size > 0 && (
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200/80 rounded-lg px-3 py-2">
            Amber-highlighted terms were suggested. Review, edit, then Save — nothing
            publishes until you save and follow the normal pathway publish workflow.
          </p>
        )}
      </fieldset>
    </Card>
  );
}

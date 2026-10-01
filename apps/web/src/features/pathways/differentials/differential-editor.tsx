'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { DifferentialDiagnosis } from '../types';

const schema = z.object({
  condition: z.string().min(2, 'Please enter the condition name'),
  likelihood: z.enum(['COMMON', 'LESS_COMMON', 'RARE']),
  question: z.string().optional(),
  suggestedPathway: z.string().optional(),
  whyItMatters: z.string().optional(),
  keySymptoms: z.string().optional(),
  distinguishingFeatures: z.string().optional(),
  recommendedAction: z.string().optional(),
  required: z.boolean(),
});

export type DifferentialFormData = z.infer<typeof schema>;

export function DifferentialEditor({
  open,
  onClose,
  item,
  onSave,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  item: DifferentialDiagnosis | null;
  onSave: (data: DifferentialFormData) => void;
  saving: boolean;
}) {
  const form = useForm<DifferentialFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      condition: '',
      likelihood: 'COMMON',
      question: '',
      suggestedPathway: '',
      whyItMatters: '',
      keySymptoms: '',
      distinguishingFeatures: '',
      recommendedAction: '',
      required: true,
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      condition: item?.condition ?? '',
      likelihood: item?.likelihood ?? 'COMMON',
      question: item?.question ?? '',
      suggestedPathway: item?.suggestedPathway ?? '',
      whyItMatters: item?.whyItMatters ?? '',
      keySymptoms: item?.keySymptoms ?? '',
      distinguishingFeatures: item?.distinguishingFeatures ?? '',
      recommendedAction: item?.recommendedAction ?? '',
      required: item?.required !== false,
    });
  }, [open, item, form]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{item ? 'Edit Differential Condition' : 'Add Differential Condition'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSave)} className="space-y-4 pt-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ddx-title">Title</Label>
              <Input
                id="ddx-title"
                placeholder="e.g. Aphthous ulcer (Canker sore)"
                {...form.register('condition')}
              />
              {form.formState.errors.condition && (
                <p className="text-xs text-destructive">{form.formState.errors.condition.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ddx-likelihood">Frequency level</Label>
              <select
                id="ddx-likelihood"
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                {...form.register('likelihood')}
              >
                <option value="COMMON">Common</option>
                <option value="LESS_COMMON">Less common</option>
                <option value="RARE">Rare</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ddx-question">Screening question</Label>
            <Textarea
              id="ddx-question"
              rows={2}
              placeholder="Is the sore located inside the mouth rather than on the outer lip border, without preceding blisters?"
              {...form.register('question')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ddx-result">If yes → suggested pathway/result</Label>
            <Input
              id="ddx-result"
              placeholder="e.g. Canker Sore (Aphthous Stomatitis)"
              {...form.register('suggestedPathway')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ddx-why">Why this matters</Label>
            <Textarea
              id="ddx-why"
              rows={3}
              placeholder="1–2 sentence clinical rationale shown in Why?"
              {...form.register('whyItMatters')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ddx-symptoms">Key symptoms</Label>
            <Textarea
              id="ddx-symptoms"
              rows={2}
              placeholder="Typical signs and symptoms of this condition"
              {...form.register('keySymptoms')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ddx-distinguish">How to distinguish</Label>
            <Textarea
              id="ddx-distinguish"
              rows={2}
              placeholder="How this is different from the main condition"
              {...form.register('distinguishingFeatures')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ddx-next">Suggested next step</Label>
            <Textarea
              id="ddx-next"
              rows={2}
              placeholder="What the pharmacist should do if this condition is likely"
              {...form.register('recommendedAction')}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/80 px-3 py-2.5">
            <div>
              <Label htmlFor="ddx-required" className="text-sm font-medium">
                Required in screening
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Include this condition in the pharmacist screening order
              </p>
            </div>
            <Switch
              id="ddx-required"
              checked={form.watch('required')}
              onCheckedChange={(checked) => form.setValue('required', checked)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

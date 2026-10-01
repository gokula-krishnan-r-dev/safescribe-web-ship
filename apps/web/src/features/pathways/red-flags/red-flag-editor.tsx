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
import type { RedFlag } from '../types';
import { RED_FLAG_ACTIONS } from '../pathway-constants';
import { redFlagQuestionText } from './utils';

const schema = z.object({
  title: z.string().min(2, 'Please enter a title'),
  severity: z.enum(['WARNING', 'CRITICAL', 'EMERGENCY']),
  question: z.string().min(8, 'Enter the Yes/No question the pharmacist will ask'),
  action: z.enum([
    'IMMEDIATE_REFERRAL',
    'SAME_DAY_PHYSICIAN',
    'EMERGENCY',
    'PATHWAY_EXCLUDED',
    'PHARMACIST_DISCRETION',
  ]),
  required: z.boolean(),
  whyItMatters: z.string().optional(),
  actionNote: z.string().optional(),
});

export type RedFlagFormData = z.infer<typeof schema>;

export function RedFlagEditor({
  open,
  onClose,
  flag,
  onSave,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  flag: RedFlag | null;
  onSave: (data: RedFlagFormData) => void;
  saving: boolean;
}) {
  const form = useForm<RedFlagFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      severity: 'CRITICAL',
      question: '',
      action: 'IMMEDIATE_REFERRAL',
      required: true,
      whyItMatters: '',
      actionNote: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    const known = RED_FLAG_ACTIONS.some((a) => a.value === flag?.action);
    form.reset({
      title: flag?.title ?? '',
      severity: flag?.severity ?? 'CRITICAL',
      question: redFlagQuestionText(flag ?? { question: '', description: '' }),
      action: (known ? flag?.action : 'IMMEDIATE_REFERRAL') as RedFlagFormData['action'],
      required: flag?.required !== false,
      whyItMatters: flag?.whyItMatters ?? '',
      actionNote: flag?.actionNote ?? '',
    });
  }, [open, flag, form]);

  const showEmergency = flag?.severity === 'EMERGENCY';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{flag ? 'Edit Red Flag' : 'Add Red Flag'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSave)} className="space-y-4 pt-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rf-title">Title</Label>
              <Input id="rf-title" placeholder="e.g. Ocular involvement" {...form.register('title')} />
              {form.formState.errors.title && (
                <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rf-severity">Severity level</Label>
              <select
                id="rf-severity"
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                {...form.register('severity')}
              >
                <option value="WARNING">Warning</option>
                <option value="CRITICAL">Critical</option>
                {showEmergency ? <option value="EMERGENCY">Emergency</option> : null}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rf-question">Question</Label>
            <Textarea
              id="rf-question"
              rows={3}
              placeholder="Does the patient have…?"
              {...form.register('question')}
            />
            {form.formState.errors.question && (
              <p className="text-xs text-destructive">{form.formState.errors.question.message}</p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="rf-action">Recommended action</Label>
              <select
                id="rf-action"
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                {...form.register('action')}
              >
                {RED_FLAG_ACTIONS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-border/80 px-3 py-2">
              <Switch
                id="rf-required"
                checked={form.watch('required')}
                onCheckedChange={(checked) => form.setValue('required', checked)}
              />
              <div>
                <Label htmlFor="rf-required" className="text-sm font-medium">
                  Required
                </Label>
                <p className="text-[11px] text-muted-foreground">Must be answered before continuing</p>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rf-why">Why this matters</Label>
            <Textarea
              id="rf-why"
              rows={3}
              placeholder="1–2 sentence clinical rationale shown in Why?"
              {...form.register('whyItMatters')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rf-note">Action note</Label>
            <Input
              id="rf-note"
              placeholder="Short instruction shown with the recommended action"
              {...form.register('actionNote')}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {flag ? 'Save' : 'Add Red Flag'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

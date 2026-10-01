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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { REVIEWED_AREAS, REVIEWED_AREA_LABELS } from '@safescript/shared';
import type { PathwayReviewer } from '../types';
import { cn } from '@/lib/utils';

const schema = z
  .object({
    reviewerType: z.enum(['internal', 'external']),
    name: z.string().min(1, 'Name is required'),
    credentials: z.string().min(1, 'Credentials are required'),
    role: z.string().min(1, 'Role is required'),
    organization: z.string().optional(),
    reviewDate: z.string().min(1, 'Review date is required'),
    reviewedAreas: z.array(z.string()).min(1, 'Select at least one area'),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.reviewerType === 'external' && !data.organization?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Organization is required for external reviewers',
        path: ['organization'],
      });
    }
  });

type FormData = z.infer<typeof schema>;

function toDateInput(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export function ReviewerFormDialog({
  open,
  onClose,
  editing,
  saving,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  editing: PathwayReviewer | null;
  saving?: boolean;
  onSave: (payload: {
    reviewerType: string;
    name: string;
    credentials: string;
    role: string;
    organization?: string;
    reviewDate: string;
    reviewedAreas: string[];
    notes?: string;
  }) => Promise<void>;
}) {
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      reviewerType: 'internal',
      name: '',
      credentials: '',
      role: '',
      organization: '',
      reviewDate: '',
      reviewedAreas: [],
      notes: '',
    },
  });

  const reviewerType = form.watch('reviewerType');
  const reviewedAreas = form.watch('reviewedAreas');

  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.reset({
        reviewerType: editing.reviewerType === 'external' ? 'external' : 'internal',
        name: editing.name,
        credentials: editing.credentials,
        role: editing.role,
        organization: editing.organization ?? '',
        reviewDate: toDateInput(editing.reviewDate),
        reviewedAreas: editing.reviewedAreas ?? [],
        notes: editing.notes ?? '',
      });
    } else {
      form.reset({
        reviewerType: 'internal',
        name: '',
        credentials: '',
        role: '',
        organization: '',
        reviewDate: new Date().toISOString().slice(0, 10),
        reviewedAreas: [],
        notes: '',
      });
    }
  }, [open, editing, form]);

  const toggleArea = (area: string) => {
    const next = reviewedAreas.includes(area)
      ? reviewedAreas.filter((a) => a !== area)
      : [...reviewedAreas, area];
    form.setValue('reviewedAreas', next, { shouldValidate: true });
  };

  const submit = form.handleSubmit(async (data) => {
    await onSave({
      reviewerType: data.reviewerType,
      name: data.name.trim(),
      credentials: data.credentials.trim(),
      role: data.role.trim(),
      organization: data.organization?.trim() || undefined,
      reviewDate: data.reviewDate,
      reviewedAreas: data.reviewedAreas,
      notes: data.notes?.trim() || undefined,
    });
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit reviewer' : 'Add reviewer'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
            {(['internal', 'external'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => form.setValue('reviewerType', type)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                  reviewerType === type
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {type === 'internal' ? 'Internal reviewer' : 'External peer reviewer'}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rev-name">Name *</Label>
              <Input id="rev-name" {...form.register('name')} />
              {form.formState.errors.name ? (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rev-cred">Credentials *</Label>
              <Input id="rev-cred" placeholder="PharmD, MD…" {...form.register('credentials')} />
              {form.formState.errors.credentials ? (
                <p className="text-xs text-destructive">{form.formState.errors.credentials.message}</p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rev-role">Role *</Label>
              <Input
                id="rev-role"
                placeholder={reviewerType === 'external' ? 'External reviewer' : 'Clinical reviewer'}
                {...form.register('role')}
              />
              {form.formState.errors.role ? (
                <p className="text-xs text-destructive">{form.formState.errors.role.message}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rev-date">Review date *</Label>
              <Input id="rev-date" type="date" {...form.register('reviewDate')} />
              {form.formState.errors.reviewDate ? (
                <p className="text-xs text-destructive">{form.formState.errors.reviewDate.message}</p>
              ) : null}
            </div>
          </div>

          {reviewerType === 'external' ? (
            <div className="space-y-1.5">
              <Label htmlFor="rev-org">Organization *</Label>
              <Input id="rev-org" {...form.register('organization')} />
              {form.formState.errors.organization ? (
                <p className="text-xs text-destructive">{form.formState.errors.organization.message}</p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Reviewed areas *</Label>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {REVIEWED_AREAS.map((area) => (
                <label
                  key={area}
                  className="flex items-center gap-2 rounded-lg border border-border/70 px-2.5 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-border accent-primary"
                    checked={reviewedAreas.includes(area)}
                    onChange={() => toggleArea(area)}
                  />
                  {REVIEWED_AREA_LABELS[area]}
                </label>
              ))}
            </div>
            {form.formState.errors.reviewedAreas ? (
              <p className="text-xs text-destructive">{form.formState.errors.reviewedAreas.message}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rev-notes">Notes</Label>
            <Textarea id="rev-notes" rows={3} {...form.register('notes')} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save reviewer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

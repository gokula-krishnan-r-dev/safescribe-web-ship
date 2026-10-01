'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect } from 'react';
import { toast } from '@/lib/notify';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useUpdateQuestion } from './hooks';
import type { ClinicalQuestion, ClinicalSection } from './types';
import { parseVisibilityRule } from '@safescript/shared';

const schema = z.object({
  question: z.string().min(5),
  type: z.enum(['TEXT', 'TEXTAREA', 'YES_NO', 'DATE', 'NUMBER', 'SELECT', 'MULTI_SELECT', 'SCALE']),
  required: z.boolean(),
  description: z.string().optional(),
  helpText: z.string().optional(),
  displayOrder: z.coerce.number().int().min(0).optional(),
  conditionalLabel: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const QUESTION_TYPES = [
  { value: 'YES_NO', label: 'Yes / No' },
  { value: 'TEXT', label: 'Short Text' },
  { value: 'TEXTAREA', label: 'Long Text' },
  { value: 'DATE', label: 'Date' },
  { value: 'NUMBER', label: 'Number' },
  { value: 'SELECT', label: 'Pick one option' },
  { value: 'MULTI_SELECT', label: 'Pick many options' },
  { value: 'SCALE', label: 'Scale (1 to 10)' },
] as const;

export function EditQuestionModal({
  open,
  onClose,
  pathwayId,
  question,
}: {
  open: boolean;
  onClose: () => void;
  pathwayId: string;
  question: ClinicalQuestion;
  sections?: ClinicalSection[];
}) {
  const updateQuestion = useUpdateQuestion(pathwayId);
  const existingRule = parseVisibilityRule(question.visibilityRule);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      question: question.question,
      type: question.type,
      required: question.required,
      description: question.description ?? '',
      helpText: question.helpText ?? '',
      displayOrder: question.displayOrder,
      conditionalLabel: existingRule?.label ?? '',
    },
  });

  useEffect(() => {
    const rule = parseVisibilityRule(question.visibilityRule);
    form.reset({
      question: question.question,
      type: question.type,
      required: question.required,
      description: question.description ?? '',
      helpText: question.helpText ?? '',
      displayOrder: question.displayOrder,
      conditionalLabel: rule?.label ?? '',
    });
  }, [question, form]);

  const handleSubmit = async (data: FormData) => {
    const label = data.conditionalLabel?.trim();
    try {
      await updateQuestion.mutateAsync({
        questionId: question.id,
        data: {
          question: data.question,
          type: data.type,
          required: data.required,
          description: data.description || undefined,
          helpText: data.helpText || undefined,
          displayOrder: data.displayOrder,
          visibilityRule: label
            ? { sourceField: existingRule?.sourceField || 'condition', operator: existingRule?.operator || 'eq', value: existingRule?.value ?? true, label }
            : null,
        },
      });
      toast.success('Question updated. Changes need review before approval.');
      onClose();
    } catch {
      toast.error('Could not update question. Please try again.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Edit Presentation Review question</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Question</Label>
            <Textarea rows={2} {...form.register('question')} />
            {form.formState.errors.question && (
              <p className="text-xs text-destructive">{form.formState.errors.question.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Question Type</Label>
            <select
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              {...form.register('type')}
            >
              {QUESTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">Yes / No is the default for Presentation Review.</p>
          </div>

          <div className="space-y-1.5">
            <Label>Why it matters</Label>
            <Input {...form.register('description')} />
          </div>

          <div className="space-y-1.5">
            <Label>Pharmacist tip</Label>
            <Input {...form.register('helpText')} />
          </div>

          <div className="space-y-1.5">
            <Label>Conditional display (optional)</Label>
            <Input
              placeholder="e.g. Shown only if prior cold sore history is documented."
              {...form.register('conditionalLabel')}
            />
            <p className="text-[11px] text-muted-foreground">
              Hidden questions are excluded from completion. Prefer conditions instead of a Not applicable answer.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Display order</Label>
              <Input type="number" min={0} {...form.register('displayOrder')} />
            </div>
            <div className="flex items-center gap-2 pt-7">
              <input type="checkbox" id="edit-required" className="rounded" {...form.register('required')} />
              <Label htmlFor="edit-required" className="font-normal cursor-pointer">Required when visible</Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={updateQuestion.isPending}>
              {updateQuestion.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

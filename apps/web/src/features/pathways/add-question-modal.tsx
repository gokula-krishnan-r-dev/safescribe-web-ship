'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { useCreateQuestion } from './hooks';
import type { ClinicalSection } from './types';
import { ASSESSMENT_SECTIONS } from './pathway-constants';

const schema = z.object({
  question: z.string().min(5, 'Question should be at least 5 characters'),
  type: z.enum(['TEXT', 'TEXTAREA', 'YES_NO', 'DATE', 'NUMBER', 'SELECT', 'MULTI_SELECT', 'SCALE']),
  required: z.boolean(),
  sectionName: z.enum(['diagnosisConfirmation', 'additionalAssessment', 'treatmentEligibility']),
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

export function AddQuestionModal({
  open,
  onClose,
  pathwayId,
  sections,
  preferredSectionName,
}: {
  open: boolean;
  onClose: () => void;
  pathwayId: string;
  sections: ClinicalSection[];
  preferredSectionName?: string;
}) {
  const createQuestion = useCreateQuestion(pathwayId);
  const sectionChoices = ASSESSMENT_SECTIONS.filter((s) =>
    sections.some((sec) => sec.name === s.name),
  );

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      question: '',
      type: 'YES_NO',
      required: true,
      sectionName: 'diagnosisConfirmation',
      description: '',
      helpText: '',
      displayOrder: 0,
      conditionalLabel: '',
    },
  });

  useEffect(() => {
    if (open) {
      const hint =
        preferredSectionName && sectionChoices.some((s) => s.name === preferredSectionName)
          ? preferredSectionName
          : sectionChoices[0]?.name ?? 'diagnosisConfirmation';
      form.reset({
        question: '',
        type: 'YES_NO',
        required: true,
        sectionName: hint as FormData['sectionName'],
        description: '',
        helpText: '',
        displayOrder: 0,
        conditionalLabel: '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when dialog opens
  }, [open, preferredSectionName]);

  const handleSubmit = async (data: FormData) => {
    try {
      await createQuestion.mutateAsync({
        question: data.question,
        type: data.type,
        required: data.required,
        sectionName: 'diagnosisConfirmation',
        description: data.description || undefined,
        helpText: data.helpText || undefined,
        displayOrder: data.displayOrder,
        visibilityRule: data.conditionalLabel?.trim()
          ? {
              sourceField: 'condition',
              operator: 'eq',
              value: true,
              label: data.conditionalLabel.trim(),
            }
          : undefined,
      });
      toast.success('Question added.');
      form.reset();
      onClose();
    } catch {
      toast.error('Could not add question. Please try again.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Add Presentation Review question</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Question</Label>
            <Textarea
              placeholder="e.g. Did you notice tingling before the blister appeared?"
              rows={2}
              {...form.register('question')}
            />
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
          </div>

          <div className="space-y-1.5">
            <Label>Why it matters</Label>
            <Input
              placeholder="Clinical rationale for this question"
              {...form.register('description')}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Pharmacist tip</Label>
            <Input
              placeholder="How to ask or interpret this question"
              {...form.register('helpText')}
            />
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
              <input
                type="checkbox"
                id="required"
                className="rounded"
                {...form.register('required')}
              />
              <Label htmlFor="required" className="font-normal cursor-pointer">
                Required
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={createQuestion.isPending}>
              {createQuestion.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Question
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

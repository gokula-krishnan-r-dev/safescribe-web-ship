'use client';

import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MultiSelect } from '@/components/ui/multi-select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useCreatePathway } from './hooks';
import { FlaskConical, Loader2 } from 'lucide-react';

const PROVINCE_OPTIONS = [
  { value: 'AB', label: 'Alberta' },
  { value: 'BC', label: 'British Columbia' },
  { value: 'MB', label: 'Manitoba' },
  { value: 'NB', label: 'New Brunswick' },
  { value: 'NL', label: 'Newfoundland and Labrador' },
  { value: 'NS', label: 'Nova Scotia' },
  { value: 'NT', label: 'Northwest Territories' },
  { value: 'NU', label: 'Nunavut' },
  { value: 'ON', label: 'Ontario' },
  { value: 'PE', label: 'Prince Edward Island' },
  { value: 'QC', label: 'Quebec' },
  { value: 'SK', label: 'Saskatchewan' },
  { value: 'YT', label: 'Yukon' },
] as const;

const CATEGORY_OPTIONS = [
  { value: 'Minor Ailment', label: 'Minor Ailment' },
  { value: 'Chronic Disease', label: 'Chronic Disease' },
  { value: 'Preventive Care', label: 'Preventive Care' },
  { value: 'Respiratory', label: 'Respiratory' },
  { value: 'Dermatology', label: 'Dermatology' },
  { value: 'Gastrointestinal', label: 'Gastrointestinal' },
  { value: 'Musculoskeletal', label: 'Musculoskeletal' },
  { value: 'Infectious Disease', label: 'Infectious Disease' },
  { value: 'Mental Health', label: 'Mental Health' },
  { value: 'Other', label: 'Other' },
] as const;

const schema = z.object({
  name: z.string().min(2, 'Please enter a name with at least 2 characters'),
  condition: z.string().min(2, 'Please enter the medical condition'),
  provinces: z.array(z.string()).min(1, 'Please select at least one province'),
  categories: z.array(z.string()).min(1, 'Please select at least one category'),
  description: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export function CreatePathwayModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const createMutation = useCreatePathway();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      condition: '',
      provinces: [],
      categories: [],
      description: '',
      notes: '',
    },
  });

  const handleSubmit = async (data: FormData) => {
    try {
      const provinceLabels = data.provinces.map(
        (code) => PROVINCE_OPTIONS.find((p) => p.value === code)?.label ?? code,
      );
      const pathway = await createMutation.mutateAsync({
        name: data.name,
        condition: data.condition,
        province: provinceLabels.join(', '),
        provinceAvailability: data.provinces.join(','),
        category: data.categories.join(', '),
        description: data.description,
        notes: data.notes,
      });
      toast.success('Pathway created. Now upload a clinical guide to get started.');
      form.reset();
      onClose();
      router.push(`/super-admin/pathways/${pathway.id}`);
    } catch {
      toast.error('Could not create pathway. Please try again.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="overflow-visible sm:max-w-[560px]">
        <DialogHeader>
          <div className="mb-1 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <FlaskConical className="h-4.5 w-4.5 text-primary" />
            </div>
            <DialogTitle>New Clinical Pathway</DialogTitle>
          </div>
          <DialogDescription>
            Create a pathway, then upload the clinical guide (PDF). SafeScribe will read it and
            prepare questions, rules, and treatments for you to review.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="name">Pathway Name</Label>
              <Input
                id="name"
                placeholder="e.g. Cold Sore — Alberta"
                {...form.register('name')}
              />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="condition">Medical Condition</Label>
              <Input
                id="condition"
                placeholder="e.g. Herpes Labialis (Cold Sore)"
                {...form.register('condition')}
              />
              {form.formState.errors.condition && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.condition.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="provinces">Province</Label>
              <Controller
                control={form.control}
                name="provinces"
                render={({ field }) => (
                  <MultiSelect
                    id="provinces"
                    options={[...PROVINCE_OPTIONS]}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Select provinces"
                    searchPlaceholder="Search provinces…"
                    aria-invalid={!!form.formState.errors.provinces}
                  />
                )}
              />
              {form.formState.errors.provinces && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.provinces.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="categories">Category</Label>
              <Controller
                control={form.control}
                name="categories"
                render={({ field }) => (
                  <MultiSelect
                    id="categories"
                    options={[...CATEGORY_OPTIONS]}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Select categories"
                    searchPlaceholder="Search categories…"
                    aria-invalid={!!form.formState.errors.categories}
                  />
                )}
              />
              {form.formState.errors.categories && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.categories.message}
                </p>
              )}
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="Short note about this pathway…"
                rows={2}
                {...form.register('description')}
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Pathway
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

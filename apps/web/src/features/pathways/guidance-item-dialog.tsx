'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  GUIDANCE_OUTPUT_SECTIONS,
  GUIDANCE_PRIORITY_LABELS,
  GUIDANCE_SECTION_META,
  GUIDANCE_TYPE_LABELS,
  isTypeCompatible,
  resolveGuidancePriority,
  resolveGuidanceSection,
  resolveGuidanceType,
  typesForOutputSection,
  type GuidanceOutputSection,
  type GuidancePriority,
  type GuidanceType,
} from '@safescript/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ClinicalCounselling } from './types';

export interface GuidanceFormValue {
  point: string;
  detail: string;
  descriptor: string;
  outputSection: GuidanceOutputSection | '';
  guidanceType: GuidanceType | '';
  priority: GuidancePriority;
  approved: boolean;
  itemVersion?: number;
}

const EMPTY: GuidanceFormValue = {
  point: '',
  detail: '',
  descriptor: '',
  outputSection: '',
  guidanceType: '',
  priority: 'alternative',
  approved: true,
};

export function counsellingToForm(item: ClinicalCounselling): GuidanceFormValue {
  const section = resolveGuidanceSection(item.outputSection, item.category);
  return {
    point: item.point,
    detail: item.detail ?? '',
    descriptor: item.descriptor ?? '',
    outputSection: section,
    guidanceType: resolveGuidanceType(item.guidanceType, section, item.category),
    priority: resolveGuidancePriority(item.priority),
    approved: item.approved,
    itemVersion: item.itemVersion,
  };
}

export function GuidanceItemDialog({
  open,
  canEdit,
  presetSection,
  item,
  saving,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  presetSection?: GuidanceOutputSection | null;
  item: ClinicalCounselling | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (value: GuidanceFormValue) => Promise<void>;
}) {
  const [form, setForm] = useState<GuidanceFormValue>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    if (item) {
      setForm(counsellingToForm(item));
    } else {
      setForm({
        ...EMPTY,
        outputSection: presetSection ?? '',
        guidanceType: presetSection
          ? GUIDANCE_SECTION_META[presetSection].defaultType
          : '',
      });
    }
    setErrors({});
  }, [open, item, presetSection]);

  const typeOptions = useMemo(() => {
    if (!form.outputSection) return [];
    return typesForOutputSection(form.outputSection).map((value) => ({
      value,
      label: GUIDANCE_TYPE_LABELS[value],
    }));
  }, [form.outputSection]);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (form.point.trim().length < 3) next.point = 'Title must be at least 3 characters.';
    if (form.detail.trim().length < 10) {
      next.detail = 'Patient wording must be at least 10 characters.';
    }
    if (!form.outputSection) next.outputSection = 'Choose an output section.';
    if (!form.guidanceType) next.guidanceType = 'Choose a guidance type.';
    if (
      form.outputSection &&
      form.guidanceType &&
      !isTypeCompatible(form.outputSection, form.guidanceType)
    ) {
      next.guidanceType = 'This type does not belong to the selected section.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{item ? 'Edit guidance' : 'Add guidance'}</DialogTitle>
        <DialogDescription>
          Approved wording is the clinical source. Pharmacist cards personalize it per visit.
        </DialogDescription>
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canEdit || !validate()) return;
            void onSave(form);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="guidance-title">Title</Label>
            <Input
              id="guidance-title"
              value={form.point}
              maxLength={160}
              disabled={!canEdit}
              aria-invalid={Boolean(errors.point)}
              onChange={(e) => setForm((f) => ({ ...f, point: e.target.value }))}
            />
            {errors.point ? <p className="text-xs text-destructive">{errors.point}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guidance-descriptor">Parenthetical descriptor (optional)</Label>
            <Input
              id="guidance-descriptor"
              value={form.descriptor}
              maxLength={160}
              disabled={!canEdit}
              onChange={(e) => setForm((f) => ({ ...f, descriptor: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guidance-detail">Patient wording</Label>
            <Textarea
              id="guidance-detail"
              value={form.detail}
              minLength={10}
              maxLength={1000}
              rows={4}
              disabled={!canEdit}
              aria-invalid={Boolean(errors.detail)}
              onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))}
            />
            {errors.detail ? <p className="text-xs text-destructive">{errors.detail}</p> : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="guidance-section">Output section</Label>
              <Select
                id="guidance-section"
                required
                disabled={!canEdit}
                value={form.outputSection}
                aria-invalid={Boolean(errors.outputSection)}
                onChange={(e) => {
                  const section = e.target.value as GuidanceOutputSection | '';
                  setForm((f) => ({
                    ...f,
                    outputSection: section,
                    guidanceType:
                      section && f.guidanceType && isTypeCompatible(section, f.guidanceType)
                        ? f.guidanceType
                        : section
                          ? GUIDANCE_SECTION_META[section].defaultType
                          : '',
                  }));
                }}
                placeholder="Select section"
                options={GUIDANCE_OUTPUT_SECTIONS.map((value) => ({
                  value,
                  label: GUIDANCE_SECTION_META[value].title,
                }))}
              />
              {errors.outputSection ? (
                <p className="text-xs text-destructive">{errors.outputSection}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guidance-type">Guidance type</Label>
              <Select
                id="guidance-type"
                required
                disabled={!canEdit || !form.outputSection}
                value={form.guidanceType}
                aria-invalid={Boolean(errors.guidanceType)}
                onChange={(e) =>
                  setForm((f) => ({ ...f, guidanceType: e.target.value as GuidanceType }))
                }
                placeholder="Select type"
                options={typeOptions}
              />
              {errors.guidanceType ? (
                <p className="text-xs text-destructive">{errors.guidanceType}</p>
              ) : null}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="guidance-priority">Priority</Label>
              <Select
                id="guidance-priority"
                disabled={!canEdit}
                value={form.priority}
                onChange={(e) =>
                  setForm((f) => ({ ...f, priority: e.target.value as GuidancePriority }))
                }
                options={Object.entries(GUIDANCE_PRIORITY_LABELS).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guidance-status">Status</Label>
              <Select
                id="guidance-status"
                disabled={!canEdit}
                value={form.approved ? 'approved' : 'draft'}
                onChange={(e) =>
                  setForm((f) => ({ ...f, approved: e.target.value === 'approved' }))
                }
                options={[
                  { value: 'approved', label: 'Approved' },
                  { value: 'draft', label: 'Draft' },
                ]}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {canEdit ? (
              <Button type="submit" disabled={saving}>
                {item ? 'Save changes' : 'Add guidance'}
              </Button>
            ) : null}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useState } from 'react';
import { toast } from '@/lib/notify';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { useCreateSafetyRule } from './hooks';
import type { CreateSafetyRuleInput } from './types';

const EMPTY_LAB_DETAIL = {
  drugIngredient: '',
  observationKey: '',
  observationDisplay: '',
  comparator: 'LT',
  thresholdLow: undefined as number | undefined,
  thresholdHigh: undefined as number | undefined,
  expectedUnit: '',
  maxAgeDays: 365,
  missingLabAction: 'REQUIRE_REVIEW',
};

export function SafetyRuleEditorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateSafetyRule();
  const [form, setForm] = useState<CreateSafetyRuleInput>({
    code: '',
    ruleType: 'ALLERGY_DIRECT',
    jurisdiction: 'ALL',
    summary: '',
    detail: '',
    clinicalSeverity: 'HIGH',
    recommendedAction: 'Review before proceeding',
    overrideAllowed: true,
    overrideReasonRequired: true,
    participants: [
      { participantKey: 'allergen', selectorType: 'EXACT_INGREDIENT', conceptText: '' },
      { participantKey: 'trigger_substance', selectorType: 'EXACT_INGREDIENT', conceptText: '' },
    ],
    labDetail: { ...EMPTY_LAB_DETAIL },
  });

  const isLabRule = form.ruleType === 'LAB_THRESHOLD';

  const setParticipant = (key: string, field: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      participants: prev.participants.map((p) =>
        p.participantKey === key ? { ...p, [field]: value } : p,
      ),
    }));
  };

  const setLabField = (field: string, value: string | number) => {
    setForm((prev) => ({
      ...prev,
      labDetail: { ...(prev.labDetail ?? EMPTY_LAB_DETAIL), [field]: value },
    }));
  };

  const handleSubmit = async () => {
    if (!form.code.trim() || !form.summary.trim() || !form.detail.trim()) {
      toast.error('Code, summary, and detail are required.');
      return;
    }
    if (isLabRule && !form.labDetail?.drugIngredient?.trim()) {
      toast.error('Drug ingredient is required for lab rules.');
      return;
    }
    if (isLabRule && !form.labDetail?.observationKey?.trim()) {
      toast.error('Observation key is required for lab rules.');
      return;
    }
    try {
      const payload: CreateSafetyRuleInput = isLabRule
        ? { ...form, participants: [], labDetail: form.labDetail }
        : { ...form, labDetail: undefined };
      await create.mutateAsync(payload);
      toast.success('Rule created as draft.');
      onOpenChange(false);
    } catch {
      toast.error('Could not create rule.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Safety Rule</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Rule code</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="ALLERGY-AMOX-001" />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={form.ruleType}
                onChange={(e) => setForm({ ...form, ruleType: e.target.value as CreateSafetyRuleInput['ruleType'] })}
                options={[
                  { value: 'ALLERGY_DIRECT', label: 'Allergy Direct' },
                  { value: 'CROSS_REACTIVITY', label: 'Cross Reactivity' },
                  { value: 'LAB_THRESHOLD', label: 'Lab Threshold' },
                ]}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Alert summary</Label>
            <Input value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Alert detail</Label>
            <Textarea value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} rows={3} placeholder="Use {lab_value} for lab rules" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Severity</Label>
              <Select
                value={form.clinicalSeverity}
                onChange={(e) => setForm({ ...form, clinicalSeverity: e.target.value as CreateSafetyRuleInput['clinicalSeverity'] })}
                options={[
                  { value: 'INFO', label: 'INFO' },
                  { value: 'LOW', label: 'LOW' },
                  { value: 'MODERATE', label: 'MODERATE' },
                  { value: 'HIGH', label: 'HIGH' },
                  { value: 'CRITICAL', label: 'CRITICAL' },
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Jurisdiction</Label>
              <Input value={form.jurisdiction} onChange={(e) => setForm({ ...form, jurisdiction: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Recommended action</Label>
            <Input value={form.recommendedAction} onChange={(e) => setForm({ ...form, recommendedAction: e.target.value })} />
          </div>

          {isLabRule ? (
            <div className="rounded-lg border p-3 space-y-3">
              <p className="text-sm font-medium">Lab threshold</p>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Drug ingredient e.g. metformin"
                  value={form.labDetail?.drugIngredient ?? ''}
                  onChange={(e) => setLabField('drugIngredient', e.target.value)}
                />
                <Input
                  placeholder="Observation key e.g. egfr"
                  value={form.labDetail?.observationKey ?? ''}
                  onChange={(e) => setLabField('observationKey', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Select
                  value={form.labDetail?.comparator ?? 'LT'}
                  onChange={(e) => setLabField('comparator', e.target.value)}
                  options={[
                    { value: 'LT', label: 'Less than' },
                    { value: 'LTE', label: 'Less or equal' },
                    { value: 'GT', label: 'Greater than' },
                    { value: 'GTE', label: 'Greater or equal' },
                    { value: 'EQ', label: 'Equal' },
                    { value: 'BETWEEN', label: 'Between' },
                  ]}
                />
                <Input
                  type="number"
                  placeholder="Threshold low"
                  value={form.labDetail?.thresholdLow ?? ''}
                  onChange={(e) => setLabField('thresholdLow', Number(e.target.value))}
                />
                <Input
                  type="number"
                  placeholder="Threshold high"
                  value={form.labDetail?.thresholdHigh ?? ''}
                  onChange={(e) => setLabField('thresholdHigh', Number(e.target.value))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Expected unit e.g. mL/min"
                  value={form.labDetail?.expectedUnit ?? ''}
                  onChange={(e) => setLabField('expectedUnit', e.target.value)}
                />
                <Input
                  type="number"
                  placeholder="Max age (days)"
                  value={form.labDetail?.maxAgeDays ?? 365}
                  onChange={(e) => setLabField('maxAgeDays', Number(e.target.value))}
                />
              </div>
              <Select
                value={form.labDetail?.missingLabAction ?? 'REQUIRE_REVIEW'}
                onChange={(e) => setLabField('missingLabAction', e.target.value)}
                options={[
                  { value: 'REQUIRE_REVIEW', label: 'Require review if missing' },
                  { value: 'SKIP_RULE', label: 'Skip rule if missing' },
                ]}
              />
            </div>
          ) : (
            <>
              <div className="rounded-lg border p-3 space-y-3">
                <p className="text-sm font-medium">Allergen participant</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Substance e.g. amoxicillin"
                    value={form.participants.find((p) => p.participantKey === 'allergen')?.conceptText ?? ''}
                    onChange={(e) => setParticipant('allergen', 'conceptText', e.target.value)}
                  />
                  <Select
                    value={form.participants.find((p) => p.participantKey === 'allergen')?.selectorType ?? 'EXACT_INGREDIENT'}
                    onChange={(e) => setParticipant('allergen', 'selectorType', e.target.value)}
                    options={[
                      { value: 'EXACT_INGREDIENT', label: 'Exact ingredient' },
                      { value: 'HAS_INGREDIENT', label: 'Has ingredient' },
                      { value: 'MEMBER_OF_CLASS', label: 'Member of class' },
                      { value: 'STRUCTURAL_RELATIONSHIP', label: 'Structural' },
                    ]}
                  />
                </div>
              </div>
              <div className="rounded-lg border p-3 space-y-3">
                <p className="text-sm font-medium">Trigger participant</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Trigger substance"
                    value={form.participants.find((p) => p.participantKey === 'trigger_substance')?.conceptText ?? ''}
                    onChange={(e) => setParticipant('trigger_substance', 'conceptText', e.target.value)}
                  />
                  <Select
                    value={form.participants.find((p) => p.participantKey === 'trigger_substance')?.selectorType ?? 'EXACT_INGREDIENT'}
                    onChange={(e) => setParticipant('trigger_substance', 'selectorType', e.target.value)}
                    options={[
                      { value: 'EXACT_INGREDIENT', label: 'Exact ingredient' },
                      { value: 'HAS_INGREDIENT', label: 'Has ingredient' },
                      { value: 'MEMBER_OF_CLASS', label: 'Member of class' },
                      { value: 'STRUCTURAL_RELATIONSHIP', label: 'Structural' },
                    ]}
                  />
                </div>
              </div>
            </>
          )}

          <Button className="w-full" onClick={() => void handleSubmit()} disabled={create.isPending}>
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Create Draft Rule
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

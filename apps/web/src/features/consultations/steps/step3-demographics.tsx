'use client';
import { useState } from 'react';
import { User, Sparkles, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/notify';
import type { Consultation, Demographics } from '../types';
import { useSaveStep } from '../hooks';

interface Props { consultation: Consultation; onNext: () => void; onBack: () => void; }

function DemographicField({
  label, value, onChange, placeholder, type = 'text', required, aiConfidence, multiline,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; required?: boolean;
  aiConfidence?: number; multiline?: boolean;
}) {
  const isAiFilled = Boolean(value && aiConfidence);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label} {required && <span className="text-destructive">*</span>}
        </label>
        {isAiFilled && aiConfidence && (
          <Badge
            variant="secondary"
            className={cn(
              'h-4 px-1.5 text-[10px]',
              aiConfidence >= 90 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : aiConfidence >= 75 ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-amber-50 text-amber-700 border-amber-200',
            )}
          >
            <Sparkles className="h-2.5 w-2.5 mr-0.5" />
            Suggested {aiConfidence}%
          </Badge>
        )}
      </div>
      {multiline ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className={cn('resize-none text-sm', isAiFilled && 'border-primary/30 bg-primary/5')}
        />
      ) : (
        <Input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn('text-sm h-9', isAiFilled && 'border-primary/30 bg-primary/5')}
        />
      )}
    </div>
  );
}

const EMPTY: Demographics = {
  age: '', sex: '', height: '', weight: '', pregnancyStatus: '',
  allergies: '', currentMedications: '', medicalConditions: '',
  surgicalHistory: '', familyHistory: '', smokingStatus: '', alcoholUse: '',
  drugUse: '', labValues: '',
};

export function Step3Demographics({ consultation, onNext, onBack }: Props) {
  const entities = consultation.aiEntities;
  const aiDemo = entities?.demographics;

  const [demo, setDemo] = useState<Demographics>({
    age: String(aiDemo?.age ?? consultation.demographics?.age ?? ''),
    sex: aiDemo?.sex ?? consultation.demographics?.sex ?? '',
    height: consultation.demographics?.height ?? '',
    weight: consultation.demographics?.weight ?? '',
    pregnancyStatus: consultation.demographics?.pregnancyStatus ?? '',
    allergies: entities?.allergies?.map((a) => a.allergen).join(', ') ?? consultation.demographics?.allergies ?? '',
    currentMedications: entities?.medications?.map((m) => m.name).join(', ') ?? consultation.demographics?.currentMedications ?? '',
    medicalConditions: entities?.conditions?.map((c) => c.condition).join(', ') ?? consultation.demographics?.medicalConditions ?? '',
    surgicalHistory: consultation.demographics?.surgicalHistory ?? '',
    familyHistory: consultation.demographics?.familyHistory ?? '',
    smokingStatus: aiDemo?.smokingStatus ?? consultation.demographics?.smokingStatus ?? '',
    alcoholUse: aiDemo?.alcoholUse ?? consultation.demographics?.alcoholUse ?? '',
    drugUse: consultation.demographics?.drugUse ?? '',
    labValues: entities?.labValues?.map((l) => `${l.test}: ${l.value}${l.unit ? ` ${l.unit}` : ''}`).join('\n') ?? consultation.demographics?.labValues ?? '',
  });

  const set = (k: keyof Demographics) => (v: string) =>
    setDemo((d) => ({
      ...d,
      [k]: v,
      ...(k === 'sex' && v !== 'Female' ? { pregnancyStatus: '' } : {}),
    }));
  const isFemale = demo.sex === 'Female';
  const saveStep = useSaveStep(consultation.id);

  const handleNext = async () => {
    if (!demo.age || !demo.sex) {
      toast.error('Age and sex are required');
      return;
    }
    await saveStep.mutateAsync({
      stepIndex: 2,
      currentStep: 'DEMOGRAPHICS',
      data: demo as unknown as Record<string, unknown>,
    });
    onNext();
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="bg-muted/30 border-b border-border/60 px-5 py-3 flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <div>
            <h3 className="font-semibold text-sm">Patient Demographics</h3>
            <p className="text-xs text-muted-foreground">Review and complete patient details. Fields marked * are required. Pre-filled fields are highlighted.</p>
          </div>
        </div>

        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DemographicField label="Age" value={demo.age ?? ''} onChange={set('age')} placeholder="e.g. 45" type="number" required aiConfidence={aiDemo?.age ? 85 : undefined} />
          <DemographicField label="Sex" value={demo.sex ?? ''} onChange={set('sex')} placeholder="Male / Female / Other" required aiConfidence={aiDemo?.sex ? 85 : undefined} />
          <DemographicField label="Height" value={demo.height ?? ''} onChange={set('height')} placeholder="e.g. 175 cm" />
          <DemographicField label="Weight" value={demo.weight ?? ''} onChange={set('weight')} placeholder="e.g. 72 kg" />
          {isFemale && (
            <DemographicField
              label="Pregnancy Status"
              value={demo.pregnancyStatus ?? ''}
              onChange={set('pregnancyStatus')}
              placeholder="N/A / Pregnant / Breastfeeding"
              required
            />
          )}
          <DemographicField label="Smoking Status" value={demo.smokingStatus ?? ''} onChange={set('smokingStatus')} placeholder="Non-smoker / Ex-smoker / Current" aiConfidence={aiDemo?.smokingStatus ? 80 : undefined} />
          <DemographicField label="Alcohol Use" value={demo.alcoholUse ?? ''} onChange={set('alcoholUse')} placeholder="None / Occasional / Regular" aiConfidence={aiDemo?.alcoholUse ? 75 : undefined} />
          <DemographicField label="Drug Use" value={demo.drugUse ?? ''} onChange={set('drugUse')} placeholder="None / specify…" />
        </div>

        <div className="p-5 pt-0 grid grid-cols-1 gap-4">
          <DemographicField label="Allergies" value={demo.allergies ?? ''} onChange={set('allergies')} placeholder="Type allergy, e.g. Penicillin — anaphylaxis" required multiline aiConfidence={entities?.allergies?.length ? 90 : undefined} />
          <DemographicField label="Current Medications" value={demo.currentMedications ?? ''} onChange={set('currentMedications')} placeholder="Type medication, e.g. Metformin 500mg BD" required multiline aiConfidence={entities?.medications?.length ? 88 : undefined} />
          <DemographicField label="Current Medical Conditions" value={demo.medicalConditions ?? ''} onChange={set('medicalConditions')} placeholder="Search or type a condition…" required multiline aiConfidence={entities?.conditions?.length ? 85 : undefined} />
          <DemographicField label="Surgical History" value={demo.surgicalHistory ?? ''} onChange={set('surgicalHistory')} placeholder="e.g. Appendectomy 2019" multiline />
          <DemographicField label="Family History" value={demo.familyHistory ?? ''} onChange={set('familyHistory')} placeholder="e.g. Hypertension (father), Diabetes (mother)" multiline />
          <DemographicField label="Relevant Lab Values" value={demo.labValues ?? ''} onChange={set('labValues')} placeholder="e.g. HbA1c: 7.2%, eGFR: 65 mL/min" required multiline aiConfidence={entities?.labValues?.length ? 82 : undefined} />
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground">← Back</Button>
        <Button onClick={handleNext} disabled={saveStep.isPending} className="gap-2 min-w-36">
          {saveStep.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
          Continue
        </Button>
      </div>
    </div>
  );
}

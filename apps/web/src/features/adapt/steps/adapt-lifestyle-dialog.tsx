'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ClinicalSelect } from '@/features/consultations/clinical-ui';
import type { AdaptLifestyle } from '@safescript/shared';

const LIFESTYLE_SMOKING = ['Never', 'Former', 'Current'];
const LIFESTYLE_ALCOHOL = ['None', 'Occasional', 'Weekly', 'Daily'];
const LIFESTYLE_SUBSTANCE = [
  { value: 'None', label: 'None' },
  { value: 'Cannabis', label: 'Cannabis' },
  { value: 'Recreational', label: 'Recreational' },
  { value: 'Other', label: 'Other' },
];

interface AdaptLifestyleDialogProps {
  open: boolean;
  initialLifestyle?: AdaptLifestyle;
  onOpenChange: (open: boolean) => void;
  onSave: (lifestyle: AdaptLifestyle) => void;
}

export function AdaptLifestyleDialog({
  open,
  initialLifestyle,
  onOpenChange,
  onSave,
}: AdaptLifestyleDialogProps) {
  const [smokingStatus, setSmokingStatus] = useState('');
  const [alcoholUse, setAlcoholUse] = useState('');
  const [drugUse, setDrugUse] = useState('');

  useEffect(() => {
    if (open) {
      setSmokingStatus(initialLifestyle?.smokingStatus ?? '');
      setAlcoholUse(initialLifestyle?.alcoholUse ?? '');
      setDrugUse(initialLifestyle?.drugUse ?? '');
    }
  }, [open, initialLifestyle]);

  const handleSave = () => {
    onSave({
      smokingStatus,
      alcoholUse,
      drugUse,
      assessed: Boolean(smokingStatus || alcoholUse || drugUse),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-[#102a43]">Lifestyle Assessment</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Document patient smoking, alcohol, and other substance use relevant to medication adaptation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3">
          <ClinicalSelect
            label="Smoking status"
            value={smokingStatus}
            options={LIFESTYLE_SMOKING}
            onChange={setSmokingStatus}
            placeholder="Select smoking status…"
            size="comfortable"
          />

          <ClinicalSelect
            label="Alcohol use"
            value={alcoholUse}
            options={LIFESTYLE_ALCOHOL}
            onChange={setAlcoholUse}
            placeholder="Select alcohol use…"
            size="comfortable"
          />

          <ClinicalSelect
            label="Substance use"
            value={drugUse}
            options={LIFESTYLE_SUBSTANCE}
            onChange={setDrugUse}
            placeholder="Select substance use…"
            size="comfortable"
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border-[#d9e4e8]"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-[#0F6F6B] text-white hover:bg-[#0c5956]"
          >
            Save lifestyle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

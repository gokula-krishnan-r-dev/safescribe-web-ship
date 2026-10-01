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
import { Textarea } from '@/components/ui/textarea';

interface AdaptAdditionalHistoryDialogProps {
  open: boolean;
  initialHistory?: string;
  onOpenChange: (open: boolean) => void;
  onSave: (history: string) => void;
}

export function AdaptAdditionalHistoryDialog({
  open,
  initialHistory = '',
  onOpenChange,
  onSave,
}: AdaptAdditionalHistoryDialogProps) {
  const [history, setHistory] = useState(initialHistory);

  useEffect(() => {
    if (open) {
      setHistory(initialHistory);
    }
  }, [open, initialHistory]);

  const handleSave = () => {
    onSave(history.trim());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-[#102a43]">Additional History</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Document relevant surgical, family, or other clinical history factors.
          </DialogDescription>
        </DialogHeader>

        <div className="py-3">
          <label className="text-xs font-semibold text-[#102a43] mb-1.5 block">
            Surgical and family history
          </label>
          <Textarea
            value={history}
            onChange={(e) => setHistory(e.target.value)}
            placeholder="e.g. Cholecystectomy 2021; Family history of Type 2 Diabetes…"
            rows={4}
            className="rounded-lg border-[#d9e4e8] text-sm focus-visible:ring-[#0F6F6B]/20"
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
            Save history
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

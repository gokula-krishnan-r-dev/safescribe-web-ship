'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { DrugSearchCombobox } from './drug-search-combobox';
import type { DrugSearchResult } from './medication-utils';
import { inferProductForm } from '@/features/pathways/product-use-mapping';

export function ChangeProductDialog({
  open,
  onOpenChange,
  currentLabel,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentLabel: string;
  onSelect: (drug: DrugSearchResult) => void;
}) {
  const [pending, setPending] = useState<DrugSearchResult | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setPending(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg gap-4 rounded-2xl p-6">
        <div>
          <DialogTitle className="text-[18px] font-bold text-[#1e3a5f]">
            Change medication product
          </DialogTitle>
          <DialogDescription className="mt-1 text-[13px] text-muted-foreground">
            Search by brand, generic name, strength, or dosage form
          </DialogDescription>
        </div>
        {currentLabel ? (
          <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-[13px]">
            <span className="mr-2 rounded-full bg-[#e8f6f4] px-2 py-0.5 text-[11px] font-semibold text-[#0f766e]">
              Current
            </span>
            {currentLabel}
          </p>
        ) : null}
        <DrugSearchCombobox
          placeholder="Search by brand, generic name, strength, or dosage form"
          onSelect={(drug) => setPending(drug)}
        />
        {pending ? (
          <div className="rounded-xl border border-[#d8e0e3] px-3.5 py-3">
            <p className="text-[14px] font-bold uppercase text-[#1e3a5f]">
              {pending.brandName || pending.label}
            </p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {[
                pending.genericName,
                pending.strength,
                inferProductForm(pending.dosageForm, pending.label),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {!inferProductForm(pending.dosageForm, pending.label) ? (
              <p className="mt-1 text-[12px] text-amber-800">Details incomplete</p>
            ) : null}
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!pending}
            onClick={() => {
              if (!pending) return;
              onSelect(pending);
              setPending(null);
              onOpenChange(false);
            }}
          >
            Use selected product
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

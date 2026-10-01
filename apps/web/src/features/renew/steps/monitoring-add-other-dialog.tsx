'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ClinicalPrimaryButton } from '@/features/consultations/clinical-ui';
import { cn } from '@/lib/utils';

export function MonitoringAddOtherDialog({
  open,
  options,
  saving,
  onClose,
  onConfirm,
}: {
  open: boolean;
  options: Array<{ inputCode: string; label: string; unit?: string | null }>;
  saving?: boolean;
  onClose: () => void;
  onConfirm: (inputCode: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(null);
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options.slice(0, 12);
    return options
      .filter(
        (row) =>
          row.label.toLowerCase().includes(needle) || row.inputCode.toLowerCase().includes(needle),
      )
      .slice(0, 12);
  }, [options, query]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="flex max-h-[min(640px,calc(100dvh-1.5rem))] max-w-[440px] flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogHeader className="shrink-0 space-y-1 border-b border-[#edf1f3] px-6 py-5 pr-12 text-left">
          <DialogTitle className="text-[17px] font-semibold text-[#163447]">Add custom monitoring item</DialogTitle>
          <DialogDescription className="text-sm text-[#5b6b75]">
            Search a governed monitoring item, e.g. TSH, B12, liver enzymes.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8aa0aa]" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search monitoring item..."
              className="h-10 rounded-[10px] border-[#C5D0D4] pl-9"
              autoFocus
            />
          </div>
          <ul className="mt-3 space-y-1">
            {filtered.length ? (
              filtered.map((row) => {
                const active = selected === row.inputCode;
                return (
                  <li key={row.inputCode}>
                    <button
                      type="button"
                      className={cn(
                        'flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left',
                        active ? 'border-[#0F6F6B] bg-[#0F6F6B]/5' : 'border-transparent hover:bg-[#f6f9fa]',
                      )}
                      onClick={() => setSelected(row.inputCode)}
                    >
                      <span className="text-sm font-medium text-[#163447]">{row.label}</span>
                      {row.unit ? <span className="text-[11px] text-[#7a8b94]">{row.unit}</span> : null}
                    </button>
                  </li>
                );
              })
            ) : (
              <li className="px-1 py-6 text-center text-sm text-[#7a8b94]">No matching governed item.</li>
            )}
          </ul>
        </div>
        <div className="flex justify-end gap-2 border-t border-[#edf1f3] px-6 py-4">
          <Button type="button" variant="outline" className="h-10 px-4" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <ClinicalPrimaryButton
            onClick={() => selected && onConfirm(selected)}
            disabled={!selected || saving}
            loading={saving}
            loadingLabel="Adding…"
          >
            Add result
          </ClinicalPrimaryButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

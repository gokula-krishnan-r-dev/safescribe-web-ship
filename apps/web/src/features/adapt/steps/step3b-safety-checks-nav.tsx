'use client';

import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ClinicalCheckItem } from '@safescript/shared';

function checkTone(check: ClinicalCheckItem): 'success' | 'warning' | 'danger' {
  if (check.severity === 'block' || check.tone === 'danger') return 'danger';
  if (check.severity === 'review' || check.tone === 'warning') return 'warning';
  return 'success';
}

function statusLabel(check: ClinicalCheckItem): string {
  if (check.statusLabel?.trim()) return check.statusLabel.trim();
  if (check.severity === 'block') return 'Cannot proceed';
  if (check.severity === 'review') return 'Review required';
  if (check.severity === 'info') return 'Monitoring';
  return 'Appropriate';
}

export function Step3BSafetyChecksNav({
  checks,
  selectedCheckId,
  onSelect,
  unresolvedIds,
}: {
  checks: ClinicalCheckItem[];
  selectedCheckId: string;
  onSelect: (id: string) => void;
  unresolvedIds: Set<string>;
}) {
  return (
    <section className="rounded-xl border border-[#e2eaed] bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[#102a43]">All safety checks</h3>
        <span className="text-[11px] font-medium text-[#829ab1]">{checks.length}</span>
      </div>
      <ul className="space-y-1">
        {checks.map((check) => {
          const tone = checkTone(check);
          const selected = check.id === selectedCheckId;
          const unresolved = unresolvedIds.has(check.id);
          return (
            <li key={check.id}>
              <button
                type="button"
                onClick={() => onSelect(check.id)}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                  selected ? 'bg-[#F3FAF9] ring-1 ring-[#b2dfdb]' : 'hover:bg-[#f8fafb]',
                )}
              >
                <span className="mt-0.5 shrink-0">
                  {tone === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
                  ) : (
                    <AlertTriangle
                      className={cn(
                        'h-4 w-4',
                        tone === 'danger' ? 'text-rose-600' : 'text-amber-600',
                      )}
                      aria-hidden
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold leading-snug text-[#102a43]">
                    {check.title}
                  </span>
                  <span
                    className={cn(
                      'mt-0.5 block text-[11px] font-medium',
                      tone === 'success' && 'text-emerald-700',
                      tone === 'warning' && 'text-amber-700',
                      tone === 'danger' && 'text-rose-700',
                    )}
                  >
                    {unresolved ? 'Action needed' : statusLabel(check)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, FileUp, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  extractRenalDosingFromMarkdown,
  formatRenalRangeLabel,
  formatRenalRuleSummary,
  splitConfiguration,
  validateRenalDosingRules,
  type RenalDosingBasis,
  type RenalDosingRule,
} from '@safescript/shared';

export interface RenalConfigurationValue {
  renalAdjustmentReason: string;
  renalDosingBasis: RenalDosingBasis;
  renalDosingRules: RenalDosingRule[];
}

interface Props {
  value: RenalConfigurationValue;
  error?: string;
  disabled?: boolean;
  onChange: (next: Partial<RenalConfigurationValue>) => void;
}

export function RenalConfigurationPanel({ value, error, disabled, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const bullets = useMemo(
    () => splitConfiguration(value.renalAdjustmentReason),
    [value.renalAdjustmentReason],
  );
  const rules = value.renalDosingRules ?? [];
  const ruleIssues = useMemo(() => validateRenalDosingRules(rules), [rules]);
  const basis = value.renalDosingBasis === 'eGFR' ? 'eGFR' : 'CrCl';

  const applyImport = () => {
    const extracted = extractRenalDosingFromMarkdown(importText);
    if (extracted.parseError) {
      setImportError(extracted.parseError);
      return;
    }
    if (!extracted.renalAdjustment && !extracted.renalAdjustmentReason && !extracted.renalDosingRules.length) {
      setImportError('No renal fields found. Paste a treatment markdown block that includes Renal adjustment.');
      return;
    }
    if (extracted.renalAdjustment === 'No') {
      setImportError('This markdown sets Renal adjustment to No. Use the Yes/No toggle instead.');
      return;
    }
    const nextRules = extracted.renalDosingRules;
    const issues = validateRenalDosingRules(nextRules);
    if (issues.length) {
      setImportError(issues[0]?.message ?? 'Invalid structured renal dosing rules');
      return;
    }
    onChange({
      renalAdjustmentReason: extracted.renalAdjustmentReason,
      renalDosingBasis: extracted.renalDosingBasis === 'eGFR' ? 'eGFR' : 'CrCl',
      renalDosingRules: nextRules,
    });
    setImportError(null);
    setImportOpen(false);
    setImportText('');
    setEditing(false);
    if (nextRules.length) setDetailsOpen(false);
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-[13px] font-semibold text-[#111827]">Renal dosing basis</p>
        <select
          className={cn(
            'flex h-11 w-full max-w-[220px] appearance-none rounded-[10px] border border-[#C5D0D4] bg-white px-3 text-[14px]',
            'outline-none focus:border-primary focus:ring-2 focus:ring-primary/15',
          )}
          value={value.renalDosingBasis === 'NONE' ? 'CrCl' : value.renalDosingBasis}
          disabled={disabled}
          onChange={(event) =>
            onChange({ renalDosingBasis: event.target.value as 'CrCl' | 'eGFR' })
          }
        >
          <option value="CrCl">CrCl</option>
          <option value="eGFR">eGFR</option>
        </select>
      </div>

      <div className="rounded-xl border border-[#ACD8D5] bg-[#F4F7F8] p-3.5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#66727D]">
          Renal configuration
        </p>
        {editing || !bullets.length ? (
          <Textarea
            rows={4}
            disabled={disabled}
            className="resize-none rounded-[10px] border-[#C5D0D4] bg-white text-[14px] shadow-none"
            placeholder="CrCl ≥50 mL/min: standard regimen; CrCl 30 to <50 mL/min: adjusted regimen; …"
            value={value.renalAdjustmentReason}
            onChange={(event) => onChange({ renalAdjustmentReason: event.target.value })}
          />
        ) : (
          <ul className="space-y-1.5 text-[13.5px] leading-snug text-[#1F2937]">
            {bullets.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#4B5563]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}

        {importOpen ? (
          <div className="mt-3 space-y-2 rounded-lg border border-[#D5E2E6] bg-white p-3">
            <p className="text-[12px] font-semibold text-[#111827]">
              Paste ChatGPT / markdown treatment block
            </p>
            <Textarea
              rows={7}
              className="resize-none rounded-[10px] border-[#C5D0D4] font-mono text-[12px] shadow-none"
              placeholder="Renal adjustment: Yes&#10;Renal reason: …&#10;Renal dosing basis: CrCl&#10;Renal dosing rules: [{…}]"
              value={importText}
              onChange={(event) => {
                setImportText(event.target.value);
                setImportError(null);
              }}
            />
            {importError ? <p className="text-xs text-destructive">{importError}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setImportOpen(false);
                  setImportError(null);
                }}
              >
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={applyImport} disabled={!importText.trim()}>
                Import
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              className="h-8 rounded-lg border-[#C5D0D4] bg-white text-[12px] font-semibold"
              onClick={() => setImportOpen(true)}
            >
              <FileUp className="mr-1.5 h-3.5 w-3.5" />
              Import from MD
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              className="h-8 rounded-lg border-[#C5D0D4] bg-white text-[12px] font-semibold"
              onClick={() => setEditing((v) => !v)}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              {editing ? 'Done' : 'Edit'}
            </Button>
          </div>
        )}
        {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      </div>

      {rules.length > 0 ? (
        <div className="rounded-xl border border-[#D5E2E6] bg-white px-3.5 py-3">
          <button
            type="button"
            className="flex w-full items-center gap-2 text-left"
            onClick={() => setDetailsOpen((v) => !v)}
          >
            <Check className="h-4 w-4 text-[#15803D]" />
            <span className="flex-1 text-[13px] font-medium text-[#15803D]">
              {rules.length} structured renal dosing {rules.length === 1 ? 'rule' : 'rules'} imported
            </span>
            <span className="text-[12px] font-semibold text-[#66727D]">View details</span>
            <ChevronDown
              className={cn('h-4 w-4 text-[#66727D] transition-transform', detailsOpen && 'rotate-180')}
            />
          </button>
          {detailsOpen ? (
            <div className="mt-3 space-y-3 border-t border-[#E8EEF0] pt-3">
              {rules.map((rule, index) => (
                <div key={`${rule.doseAmount}-${index}`}>
                  <p className="text-[13px] font-semibold text-[#111827]">
                    {formatRenalRangeLabel(rule, basis)}
                  </p>
                  <p className="text-[13px] text-[#4B5563]">{formatRenalRuleSummary(rule)}</p>
                </div>
              ))}
            </div>
          ) : null}
          {ruleIssues.length ? (
            <p className="mt-2 text-xs text-destructive">{ruleIssues[0]?.message}</p>
          ) : null}
        </div>
      ) : (
        <p className="text-[12px] text-[#66727D]">
          No structured renal dosing rules yet. Import from markdown to enable pharmacist “Use adjusted
          regimen”, or leave empty when only a caution applies.
        </p>
      )}
    </div>
  );
}

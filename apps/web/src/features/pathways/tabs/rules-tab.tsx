'use client';

import { useState } from 'react';
import { toast } from '@/lib/notify';
import { Trash2, ShieldAlert, ShieldX, ShieldCheck, Info, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useDeleteRule, useUpdateRule } from '../hooks';
import type { ClinicalPathway, ClinicalRule, RuleSeverity } from '../types';
import { cn } from '@/lib/utils';
import { PathwayReadOnlyBanner } from '../pathway-edit-lock';
import { ImportFromChatGptButton } from '../import-from-chatgpt-button';

const SEVERITY_CONFIG: Record<RuleSeverity, { label: string; className: string; icon: React.ComponentType<{ className?: string }> }> = {
  INFO: { label: 'Information', className: 'bg-blue-50 text-blue-700 border-blue-200', icon: Info },
  WARNING: { label: 'Warning', className: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: ShieldAlert },
  CRITICAL: { label: 'Critical', className: 'bg-red-50 text-red-700 border-red-200', icon: ShieldX },
  STOP: { label: 'Stop', className: 'bg-red-100 text-red-900 border-red-300', icon: ShieldX },
};

const ACTION_LABELS: Record<string, string> = {
  URGENT_REFERRAL: 'Refer Urgently',
  STOP_PRESCRIBING: 'Stop Prescribing',
  SHOW_WARNING: 'Show Warning',
  REQUIRE_DOCUMENTATION: 'Document in Notes',
  ADJUST_DOSE: 'Adjust Dose',
  CONTRAINDICATED: 'Not Suitable',
};

export function RulesTab({
  pathway,
  canEdit,
}: {
  pathway: ClinicalPathway;
  canEdit: boolean;
}) {
  const [deleteTarget, setDeleteTarget] = useState<ClinicalRule | null>(null);
  const deleteRule = useDeleteRule(pathway.id);
  const updateRule = useUpdateRule(pathway.id);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteRule.mutateAsync(deleteTarget.id);
      toast.success('Rule removed.');
      setDeleteTarget(null);
    } catch {
      toast.error('Could not remove rule. Please try again.');
    }
  };

  const handleApprove = async (rule: ClinicalRule) => {
    try {
      await updateRule.mutateAsync({ ruleId: rule.id, data: { approved: true } });
      toast.success('Rule approved.');
    } catch {
      toast.error('Could not approve rule. Please try again.');
    }
  };

  const grouped = pathway.rules?.reduce<Record<RuleSeverity, ClinicalRule[]>>(
    (acc, rule) => {
      acc[rule.severity] = [...(acc[rule.severity] ?? []), rule];
      return acc;
    },
    {} as Record<RuleSeverity, ClinicalRule[]>,
  ) ?? {};

  return (
    <div className="space-y-4">
      <PathwayReadOnlyBanner canEdit={canEdit} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Clinical Rules</h2>
          <p className="text-sm text-muted-foreground">
            Decision logic for diagnosis confirmation, treatment branching, and referrals.
            Developer-facing — not shown to pharmacists during consultations.
            {' '}{pathway.rules?.filter((r) => r.approved).length ?? 0}/{pathway.rules?.length ?? 0} approved
          </p>
        </div>
        <ImportFromChatGptButton pathway={pathway} target="rules" canEdit={canEdit} />
      </div>

      {(!pathway.rules || pathway.rules.length === 0) ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-16">
          <ShieldAlert className="mb-4 h-10 w-10 text-muted-foreground/40" />
          <p className="text-base font-medium text-muted-foreground">No clinical rules yet</p>
          <p className="mt-1 text-sm text-muted-foreground/70">
            Import from ChatGPT or generate from your clinical guide
          </p>
          <div className="mt-4">
            <ImportFromChatGptButton pathway={pathway} target="rules" canEdit={canEdit} />
          </div>
        </div>
      ) : (
        (['STOP', 'CRITICAL', 'WARNING', 'INFO'] as RuleSeverity[]).map((severity) => {
          const rules = grouped[severity] ?? [];
          if (!rules.length) return null;
          const conf = SEVERITY_CONFIG[severity];
          return (
            <Card key={severity} className="overflow-hidden shadow-none">
              <div className={cn('flex items-center gap-2.5 border-b border-border/60 px-5 py-3', conf.className.replace('border-', 'border-b-'))}>
                <conf.icon className="h-4 w-4" />
                <h3 className="text-sm font-semibold">{conf.label} Rules</h3>
                <span className="ml-auto rounded-full bg-white/50 px-2 py-0.5 text-xs font-medium">{rules.length}</span>
              </div>
              <div className="divide-y divide-border/50">
                {rules.map((rule) => (
                  <div key={rule.id} className="group flex items-start gap-4 px-5 py-4">
                    <div className={cn('mt-0.5 rounded-lg p-1.5', conf.className)}>
                      <conf.icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 space-y-1 min-w-0">
                      <p className="text-sm font-semibold">{ACTION_LABELS[rule.action] ?? rule.action}</p>
                      <p className="text-sm text-muted-foreground">{rule.message}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono">
                          IF {rule.condition} {rule.operator} "{rule.value}"
                        </span>
                        {rule.isAiGenerated && <span className="text-violet-600">Auto-generated</span>}
                        {rule.approved && <span className="flex items-center gap-0.5 text-green-600"><ShieldCheck className="h-3 w-3" /> Approved</span>}
                      </div>
                      {rule.details && (
                        <p className="text-xs text-muted-foreground/70 italic">{rule.details}</p>
                      )}
                    </div>
                    {canEdit && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        {!rule.approved && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-green-600" onClick={() => handleApprove(rule)}>
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleteTarget(rule)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          );
        })
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Remove this rule?"
        description="Remove this clinical rule? This cannot be undone."
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleteRule.isPending}
      />
    </div>
  );
}

'use client';

import { Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from '@/lib/notify';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApproveSafetyRule, useSafetyRule } from './hooks';
import { cn } from '@/lib/utils';

export function SafetyRuleDetailDialog({
  ruleId,
  onClose,
}: {
  ruleId: string | null;
  onClose: () => void;
}) {
  const { data: rule, isLoading } = useSafetyRule(ruleId);
  const latest = rule?.versions?.[0];
  const approve = useApproveSafetyRule(rule?.id ?? '', latest?.id ?? '');

  const handleApprove = async () => {
    if (!rule || !latest) return;
    try {
      await approve.mutateAsync();
      toast.success('Rule approved.');
    } catch {
      toast.error('Could not approve rule.');
    }
  };

  return (
    <Dialog open={Boolean(ruleId)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule?.code ?? 'Rule details'}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : rule && latest ? (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{rule.ruleType}</Badge>
              <Badge>{latest.status}</Badge>
              <Badge variant="secondary">{latest.clinicalSeverity}</Badge>
            </div>
            <div>
              <p className="font-medium">{latest.summary}</p>
              <p className="text-muted-foreground mt-1">{latest.detail}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase">Recommended action</p>
              <p>{latest.recommendedAction}</p>
            </div>
            {latest.ddiDetail && (
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase">Drug interaction</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <span>{latest.ddiDetail.drugA} + {latest.ddiDetail.drugB}</span>
                  <span>Severity: {latest.ddiDetail.interactionSeverity}</span>
                  <span>Action: {latest.ddiDetail.actionRequired}</span>
                </div>
              </div>
            )}
            {latest.pregnancyDetail && (
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase">Pregnancy rule</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <span>Drug: {latest.pregnancyDetail.drugName}</span>
                  <span>Category: {latest.pregnancyDetail.pregnancyCategory}</span>
                  <span>Trimester: {latest.pregnancyDetail.trimester}</span>
                  <span>Action: {latest.pregnancyDetail.actionRequired}</span>
                </div>
              </div>
            )}
            {latest.lactationDetail && (
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase">Lactation rule</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <span>Drug: {latest.lactationDetail.drugName}</span>
                  <span>Risk: {latest.lactationDetail.lactationRisk}</span>
                  <span>Severity: {latest.lactationDetail.bandSeverity}</span>
                  <span>Action: {latest.lactationDetail.actionRequired}</span>
                  {latest.lactationDetail.clinicalNote ? (
                    <span className="col-span-2">Note: {latest.lactationDetail.clinicalNote}</span>
                  ) : null}
                </div>
              </div>
            )}
            {latest.renalDetail && (
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase">Renal eGFR band</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <span>Drug: {latest.renalDetail.drugName}</span>
                  <span>eGFR: {latest.renalDetail.egfrMin}–{latest.renalDetail.egfrMax}</span>
                  <span>Severity: {latest.renalDetail.bandSeverity}</span>
                  <span>Action: {latest.renalDetail.actionRequired}</span>
                  {latest.renalDetail.clinicalNote ? (
                    <span className="col-span-2">Note: {latest.renalDetail.clinicalNote}</span>
                  ) : null}
                </div>
              </div>
            )}
            {latest.labDetail && (
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase">Lab threshold</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <span>Drug: {latest.labDetail.drugIngredient}</span>
                  <span>Observation: {latest.labDetail.observationDisplay ?? latest.labDetail.observationKey}</span>
                  <span>
                    Comparator: {latest.labDetail.comparator}{' '}
                    {latest.labDetail.thresholdLow}
                    {latest.labDetail.thresholdHigh != null ? ` – ${latest.labDetail.thresholdHigh}` : ''}
                    {latest.labDetail.expectedUnit ? ` ${latest.labDetail.expectedUnit}` : ''}
                  </span>
                  <span>Max age: {latest.labDetail.maxAgeDays} days</span>
                  <span>Missing lab: {latest.labDetail.missingLabAction}</span>
                </div>
              </div>
            )}
            {latest.participants && latest.participants.length > 0 && (
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase">Participants</p>
                {latest.participants.map((p) => (
                  <div key={p.id} className="flex justify-between text-xs">
                    <span className="font-mono">{p.participantKey}</span>
                    <span>{p.selectorType}: {p.conceptText}</span>
                  </div>
                ))}
              </div>
            )}
            {latest.status === 'DRAFT' && (
              <Button onClick={() => void handleApprove()} disabled={approve.isPending} className="w-full">
                {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Approve for Publication
              </Button>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { Scale, AlertTriangle, RotateCcw, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/notify';
import type { Consultation } from '../types';
import { useAssessEligibility } from '../hooks';
import {
  StepCard,
  StepFooter,
  StepLoadingState,
  VerdictBanner,
  CriterionRow,
  AiConfidenceBadge,
} from '../consultation-ui';

interface Props {
  consultation: Consultation;
  onNext: () => void;
  onBack: () => void;
}

export function Step6Eligibility({ consultation, onNext, onBack }: Props) {
  const assess = useAssessEligibility(consultation.id);
  const [data, setData] = useState(consultation.eligibility);
  const [failed, setFailed] = useState(false);

  const runAssess = () => {
    setFailed(false);
    assess
      .mutateAsync()
      .then((res) => setData(res as typeof data))
      .catch(() => {
        setFailed(true);
        toast.error('Eligibility check could not run — please check your connection');
      });
  };

  useEffect(() => {
    if (!data) runAssess();
  }, []); // eslint-disable-line

  const eligible = data?.eligible ?? null;
  const criteria = data?.criteria ?? [];
  const metCount = criteria.filter((c) => c.met).length;
  const failedCriteria = criteria.filter((c) => !c.met);
  const passedCriteria = criteria.filter((c) => c.met);

  return (
    <div className="space-y-4">
      <StepCard
        title="Eligibility Check"
        icon={Scale}
        headerRight={
          data?.confidence ? (
            <AiConfidenceBadge confidence={data.confidence} />
          ) : assess.isPending ? null : undefined
        }
      >
        {assess.isPending && (
          <StepLoadingState
            title="Checking eligibility…"
            subtitle="Reviewing age, allergies, interactions, and pathway rules"
          />
        )}

        {!assess.isPending && failed && (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
            <AlertTriangle className="h-8 w-8 text-warning" />
            <p className="font-medium text-foreground">Check unavailable</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Drafting could not be reached. Please retry or assess eligibility yourself.
            </p>
            <Button variant="outline" size="sm" onClick={runAssess} className="gap-2 mt-1">
              <RotateCcw className="h-3.5 w-3.5" /> Retry
            </Button>
          </div>
        )}

        {!assess.isPending && !failed && data && (
          <div className="space-y-4">
            <VerdictBanner
              passed={Boolean(eligible)}
              title={eligible ? 'Eligible' : 'Not eligible'}
              summary={data.summary}
            />

            {criteria.length > 0 && (
              <div className="space-y-3">
                {/* Summary chips */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Assessment criteria
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                    <CheckCircle className="h-3 w-3" />
                    {metCount} met
                  </span>
                  {failedCriteria.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                      <XCircle className="h-3 w-3" />
                      {failedCriteria.length} not met
                    </span>
                  )}
                </div>

                {/* Failed criteria first — clinician attention */}
                {failedCriteria.length > 0 && (
                  <div className="space-y-2">
                    {failedCriteria.map((c, i) => (
                      <CriterionRow
                        key={`fail-${i}`}
                        met={false}
                        criterion={c.criterion}
                        explanation={c.explanation}
                        source={c.source}
                      />
                    ))}
                  </div>
                )}

                {passedCriteria.length > 0 && (
                  <div
                    className={cn(
                      'space-y-2',
                      failedCriteria.length > 0 && 'pt-1 border-t border-border/50',
                    )}
                  >
                    {passedCriteria.map((c, i) => (
                      <CriterionRow
                        key={`pass-${i}`}
                        met
                        criterion={c.criterion}
                        explanation={c.explanation}
                        source={c.source}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {(data.conditions?.length ?? 0) > 0 && (
              <div className="rounded-lg border border-warning/30 bg-warning-muted/40 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-warning mb-1.5">
                  Conditions to keep in mind
                </p>
                <ul className="space-y-1">
                  {(data.conditions ?? []).map((c, i) => (
                    <li key={i} className="text-sm text-foreground/90">
                      • {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </StepCard>

      <StepFooter onBack={onBack} onNext={onNext} nextLabel="Continue to Treatment Plan" />
    </div>
  );
}

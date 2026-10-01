'use client';

import { useEffect, useState } from 'react';
import { Gauge, Loader2 } from 'lucide-react';
import { toast } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { getErrorMessage } from '@/lib/errors';
import {
  DEFAULT_PRESCRIBE_DAILY_INCLUDED,
  PHARMACY_TIMEZONES,
  SAFESCRIBE_MODULES,
} from '@safescript/shared';
import { usePharmacyEntitlements, useUpdatePharmacyEntitlements } from './hooks';
import { PrescribeUsageMeter } from './prescribe-usage-meter';

export function PharmacyEntitlementPanel({ tenantId }: { tenantId: string }) {
  const { data, isLoading, isError, refetch } = usePharmacyEntitlements(tenantId);
  const save = useUpdatePharmacyEntitlements(tenantId);
  const prescribe = data?.entitlements.find((e) => e.module === SAFESCRIBE_MODULES.PRESCRIBE);

  const [timezone, setTimezone] = useState('America/Edmonton');
  const [limit, setLimit] = useState(String(DEFAULT_PRESCRIBE_DAILY_INCLUDED));
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!data) return;
    setTimezone(data.timezone);
    if (prescribe) {
      setLimit(String(prescribe.included ?? DEFAULT_PRESCRIBE_DAILY_INCLUDED));
      setActive(prescribe.active);
    }
  }, [data, prescribe]);

  const handleSave = async () => {
    const included = Number(limit);
    if (!Number.isFinite(included) || included < 0) {
      toast.error('Enter a daily limit of 0 or more');
      return;
    }
    try {
      await save.mutateAsync({
        timezone,
        items: [
          {
            module: SAFESCRIBE_MODULES.PRESCRIBE,
            includedQuantity: Math.floor(included),
            period: 'daily',
            active,
          },
        ],
      });
      toast.success('Prescribe allowance updated');
    } catch (err) {
      toast.error('Could not save allowance', { description: getErrorMessage(err) });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-muted-foreground">Could not load this pharmacy’s allowance.</p>
        <Button type="button" variant="outline" className="mt-3" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-2">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Gauge className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-foreground">Prescribe allowance</h3>
          <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
            Shared across pharmacists at this pharmacy. A consultation counts once when the clinical
            assessment starts — not when someone only opens SafeScribe or starts a blank intake.
          </p>
        </div>
      </div>

      {prescribe ? <PrescribeUsageMeter snapshot={prescribe} /> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pharmacy-tz">Pharmacy time zone</Label>
          <Select
            id="pharmacy-tz"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            options={PHARMACY_TIMEZONES.map((z) => ({ value: z.value, label: z.label }))}
          />
          <p className="text-xs text-muted-foreground">Daily limits reset at local midnight.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="prescribe-limit">Daily Prescribe assessments</Label>
          <Input
            id="prescribe-limit"
            inputMode="numeric"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className="h-10"
          />
          <p className="text-xs text-muted-foreground">Complimentary PhIX default is 10 per day.</p>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">Prescribe module active</p>
          <p className="text-xs text-muted-foreground">Turn off to hide Prescribe for this pharmacy.</p>
        </div>
        <Switch checked={active} onCheckedChange={setActive} />
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={() => void handleSave()} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save allowance'}
        </Button>
      </div>
    </div>
  );
}

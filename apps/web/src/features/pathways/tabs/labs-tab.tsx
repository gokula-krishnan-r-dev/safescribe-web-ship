'use client';

import { FlaskConical } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { ClinicalPathway } from '../types';

/** Future-proof module — visible when Overview.requiresLabResults ≠ NEVER */
export function LabsTab({ pathway }: { pathway: ClinicalPathway }) {
  return (
    <Card className="shadow-none">
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-4 rounded-xl bg-cyan-50 p-3 text-cyan-700">
          <FlaskConical className="h-8 w-8" />
        </div>
        <h2 className="text-base font-semibold">Labs</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Laboratory result requirements for <span className="font-medium text-foreground">{pathway.condition}</span>.
          This module is enabled because Overview sets Lab Results to{' '}
          <span className="font-medium text-foreground">{pathway.requiresLabResults?.toLowerCase()}</span>.
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          Coming soon — define required labs (A1C, eGFR, lipids, CBC) and reference ranges per pathway.
        </p>
      </div>
    </Card>
  );
}

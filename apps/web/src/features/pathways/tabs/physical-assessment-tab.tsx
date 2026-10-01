'use client';

import { HandHeart } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { ClinicalPathway } from '../types';

/** Future-proof module — visible when Overview.requiresPhysicalExam ≠ NEVER */
export function PhysicalAssessmentTab({ pathway }: { pathway: ClinicalPathway }) {
  return (
    <Card className="shadow-none">
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-4 rounded-xl bg-teal-50 p-3 text-teal-700">
          <HandHeart className="h-8 w-8" />
        </div>
        <h2 className="text-base font-semibold">Physical Assessment</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Physical exam findings for <span className="font-medium text-foreground">{pathway.condition}</span>.
          This module is enabled because Overview sets Physical Examination to{' '}
          <span className="font-medium text-foreground">{pathway.requiresPhysicalExam?.toLowerCase()}</span>.
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          Coming soon — capture otoscopy, lesion photos, vitals, and exam checklists per pathway.
        </p>
      </div>
    </Card>
  );
}

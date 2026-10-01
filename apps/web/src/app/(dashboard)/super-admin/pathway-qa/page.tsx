'use client';

import { Suspense } from 'react';
import { PathwayQaPage } from '@/features/pathway-qa/pathway-qa-page';

export default function SuperAdminPathwayQaRoute() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
          Loading pathway test lab…
        </div>
      }
    >
      <PathwayQaPage />
    </Suspense>
  );
}

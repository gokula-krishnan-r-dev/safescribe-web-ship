import { Suspense } from 'react';
import { SafetyEnginePage } from '@/features/safety-engine/safety-engine-page';

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
          Loading Safety Alert…
        </div>
      }
    >
      <SafetyEnginePage />
    </Suspense>
  );
}

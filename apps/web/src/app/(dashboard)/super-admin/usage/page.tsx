import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { PharmacyUsageWorkspace } from '@/features/entitlements/pharmacy-usage-workspace';

function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

export default function SuperAdminPharmacyUsagePage() {
  return (
    <Suspense fallback={<Loading />}>
      <PharmacyUsageWorkspace />
    </Suspense>
  );
}

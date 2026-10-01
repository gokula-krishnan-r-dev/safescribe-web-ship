'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ClinicalWorkspaceLanding } from '@/features/consultations/clinical-workspace-landing';
import { consultationsBasePath } from '@/features/consultations/consultations-base-path';
import { isAdaptModuleEnabled } from '@/lib/adapt-enabled';
import { useAuthStore } from '@/features/auth/auth-store';

export function AdaptLanding({ basePath }: { basePath: string }) {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);

  useEffect(() => {
    if (!isAdaptModuleEnabled()) {
      router.replace(consultationsBasePath(role));
    }
  }, [router, role]);

  if (!isAdaptModuleEnabled()) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Adapt is not available in this environment.
      </div>
    );
  }

  return <ClinicalWorkspaceLanding basePath={basePath} module="adapt" />;
}

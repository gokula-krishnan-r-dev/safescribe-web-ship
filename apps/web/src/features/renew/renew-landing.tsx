'use client';

import { ClinicalWorkspaceLanding } from '@/features/consultations/clinical-workspace-landing';

export function RenewLanding({ basePath }: { basePath: string }) {
  return <ClinicalWorkspaceLanding basePath={basePath} module="renew" />;
}

'use client';

import { ClinicalWorkspaceLanding } from '@/features/consultations/clinical-workspace-landing';

/** Pharmacy admin home → new Prescribe workspace (do not resume last active). */
export default function AdminHomePage() {
  return (
    <ClinicalWorkspaceLanding basePath="/admin/consultations" module="prescribe" />
  );
}

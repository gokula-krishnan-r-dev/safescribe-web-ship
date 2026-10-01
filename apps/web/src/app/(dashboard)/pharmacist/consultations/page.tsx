'use client';

import { ClinicalWorkspaceLanding } from '@/features/consultations/clinical-workspace-landing';

/** Always land on a new Prescribe consultation — never resume last active. */
export default function PharmacistConsultationsPage() {
  return <ClinicalWorkspaceLanding basePath="/pharmacist/consultations" module="prescribe" />;
}

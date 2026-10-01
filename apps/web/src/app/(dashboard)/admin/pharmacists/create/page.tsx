'use client';

import { UserFormPage } from '@/features/users/user-form-page';
import { PHARMACIST_CONFIG } from '@/features/users/config';

export default function CreatePharmacistPage() {
  return <UserFormPage config={PHARMACIST_CONFIG} mode="create" />;
}

'use client';

import { UserFormPage } from '@/features/users/user-form-page';
import { PHARMACIST_ADMIN_CONFIG } from '@/features/users/config';

export default function CreatePharmacistAdminPage() {
  return <UserFormPage config={PHARMACIST_ADMIN_CONFIG} mode="create" />;
}

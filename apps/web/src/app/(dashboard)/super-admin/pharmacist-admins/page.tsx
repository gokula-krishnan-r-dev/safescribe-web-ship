'use client';

import { UsersListPage } from '@/features/users/users-list-page';
import { PHARMACIST_ADMIN_CONFIG } from '@/features/users/config';

export default function PharmacistAdminsPage() {
  return <UsersListPage config={PHARMACIST_ADMIN_CONFIG} />;
}

'use client';

import { use } from 'react';
import { UserDetailPage } from '@/features/users/user-detail-page';
import { PHARMACIST_ADMIN_CONFIG } from '@/features/users/config';

export default function PharmacistAdminDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <UserDetailPage config={PHARMACIST_ADMIN_CONFIG} userId={id} />;
}

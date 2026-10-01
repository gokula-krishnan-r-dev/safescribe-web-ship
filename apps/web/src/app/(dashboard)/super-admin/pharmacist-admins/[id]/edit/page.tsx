'use client';

import { use } from 'react';
import { useUser } from '@/features/users/hooks';
import { UserFormPage } from '@/features/users/user-form-page';
import { PHARMACIST_ADMIN_CONFIG } from '@/features/users/config';
import { PageSkeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/shared/states';

export default function EditPharmacistAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: user, isLoading, isError, refetch } = useUser(id);

  if (isLoading) return <PageSkeleton />;
  if (isError || !user) return <ErrorState onRetry={() => refetch()} />;

  return (
    <UserFormPage
      config={PHARMACIST_ADMIN_CONFIG}
      mode="edit"
      userId={id}
      defaultValues={{
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status as 'ACTIVE' | 'SUSPENDED' | 'PENDING',
        tenantId: user.tenantId ?? undefined,
        pharmacyAssignmentMode: 'existing',
      }}
    />
  );
}

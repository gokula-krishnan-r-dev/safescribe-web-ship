import { Suspense } from 'react';
import { AdminManagementPage } from '@/features/admin-management/admin-management-page';
import { Loader2 } from 'lucide-react';

function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

export default function ManagementPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AdminManagementPage />
    </Suspense>
  );
}

import { PageSkeleton } from '@/components/ui/skeleton';

export default function DashboardLoading() {
  return (
    <div className="p-8">
      <PageSkeleton />
    </div>
  );
}

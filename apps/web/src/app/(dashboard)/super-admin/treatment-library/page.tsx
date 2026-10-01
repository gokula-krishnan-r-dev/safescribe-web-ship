import { Suspense } from 'react';
import { TreatmentLibraryListPage } from '@/features/treatment-library/treatment-library-list-page';

export default function TreatmentLibraryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
          Loading Treatment Library…
        </div>
      }
    >
      <TreatmentLibraryListPage />
    </Suspense>
  );
}

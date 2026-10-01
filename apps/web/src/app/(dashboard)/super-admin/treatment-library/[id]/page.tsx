import { TreatmentLibraryEditorPage } from '@/features/treatment-library/treatment-library-editor-page';

export default async function LibraryTreatmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TreatmentLibraryEditorPage itemId={id} />;
}

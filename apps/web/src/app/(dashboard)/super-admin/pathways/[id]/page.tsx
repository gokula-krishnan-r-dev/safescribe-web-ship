import { PathwayDetailPage } from '@/features/pathways/pathway-detail-page';

export default async function PathwayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PathwayDetailPage id={id} />;
}

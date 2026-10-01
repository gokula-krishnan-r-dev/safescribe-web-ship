import { ConsultationWizard } from '@/features/consultations/consultation-wizard';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminConsultationWizardPage({ params }: Props) {
  const { id } = await params;
  return <ConsultationWizard consultationId={id} backHref="/admin/consultations" />;
}

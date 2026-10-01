import { AdaptConsultationWizard } from '@/features/adapt/adapt-wizard';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PharmacistAdaptWizardPage({ params }: Props) {
  const { id } = await params;
  return <AdaptConsultationWizard consultationId={id} backHref="/pharmacist/adapt" />;
}

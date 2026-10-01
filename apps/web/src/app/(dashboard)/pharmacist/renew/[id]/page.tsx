import { RenewConsultationWizard } from '@/features/renew/renew-wizard';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PharmacistRenewWizardPage({ params }: Props) {
  const { id } = await params;
  return <RenewConsultationWizard consultationId={id} backHref="/pharmacist/renew" />;
}

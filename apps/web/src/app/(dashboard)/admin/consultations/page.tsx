import { ConsultationList } from '@/features/consultations/consultation-list';

export default function AdminConsultationsPage() {
  return (
    <ConsultationList
      role="admin"
      basePath="/admin/consultations"
    />
  );
}

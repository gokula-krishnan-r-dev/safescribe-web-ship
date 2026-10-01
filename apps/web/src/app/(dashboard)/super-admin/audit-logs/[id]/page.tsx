'use client';

import { use } from 'react';
import { AuditLogDetailPage } from '@/features/audit/audit-log-detail-page';

export default function AuditLogDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AuditLogDetailPage id={id} />;
}

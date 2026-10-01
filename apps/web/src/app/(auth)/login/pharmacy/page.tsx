import { redirect } from 'next/navigation';
import { SUPER_ADMIN_ACCESS_PATH } from '@safescript/shared';

/** Legacy Pharmacy Management admin login → exclusive Super Admin access path. */
export default function LegacyPharmacyAdminLoginRedirect() {
  redirect(SUPER_ADMIN_ACCESS_PATH);
}

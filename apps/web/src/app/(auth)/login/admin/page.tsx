import { redirect } from 'next/navigation';
import { SUPER_ADMIN_ACCESS_PATH } from '@safescript/shared';

/** Legacy Platform Admin chooser — Super Admin signs in only at /auth/admin/access. */
export default function LegacyAdminLoginRedirect() {
  redirect(SUPER_ADMIN_ACCESS_PATH);
}

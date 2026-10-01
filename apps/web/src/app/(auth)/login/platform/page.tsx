import { redirect } from 'next/navigation';
import { SUPER_ADMIN_ACCESS_PATH } from '@safescript/shared';

/** Legacy Clinical Platform admin login → exclusive Super Admin access path. */
export default function LegacyPlatformAdminLoginRedirect() {
  redirect(SUPER_ADMIN_ACCESS_PATH);
}

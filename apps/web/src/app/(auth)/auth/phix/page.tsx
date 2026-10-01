import { redirect } from 'next/navigation';

/** PhIX uses the same email/password form as SafeScribe — no separate SSO page. */
export default function PhixAuthPage() {
  redirect('/login');
}

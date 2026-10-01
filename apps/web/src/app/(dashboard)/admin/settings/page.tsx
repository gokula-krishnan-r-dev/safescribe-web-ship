import { AdminSettingsNav } from '@/features/settings/admin-settings-nav';
import { AppearanceSettingsPage } from '@/features/settings/appearance-settings-page';
import { PharmacistSignatureSettings } from '@/features/settings/pharmacist-signature-settings';

export default function AdminSettingsPage() {
  return (
    <div className="space-y-10">
      <AdminSettingsNav />
      <AppearanceSettingsPage basePath="/admin" />
      <div className="mx-auto max-w-3xl">
        <PharmacistSignatureSettings />
      </div>
    </div>
  );
}

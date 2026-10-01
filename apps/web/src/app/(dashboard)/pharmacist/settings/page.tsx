import { AppearanceSettingsPage } from '@/features/settings/appearance-settings-page';
import { DocumentDownloadSettings } from '@/features/settings/document-download-settings';
import { PharmacistSignatureSettings } from '@/features/settings/pharmacist-signature-settings';

export default function PharmacistSettingsPage() {
  return (
    <>
      {/* <AppearanceSettingsPage basePath="/pharmacist" /> */}
      <div className="mx-auto max-w-3xl space-y-6 pb-8">
        <PharmacistSignatureSettings />
        {/* <DocumentDownloadSettings /> */}
      </div>
    </>
  );
}

'use client';

import { BrandingImageCard } from './branding-image-card';
import { useAuthStore } from '@/features/auth/auth-store';

export function PharmacistSignatureSettings() {
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const hasSignature = useAuthStore((s) => s.user?.hasSignature);

  return (
    <BrandingImageCard
      kind="signature"
      title="Professional signature"
      description="Upload your signature once. SafeScribe places it on Step 6 documents for consultations you complete — including the prescription."
      filePath="/branding/signature/file"
      uploadPath="/branding/signature"
      hasImage={hasSignature}
      onChanged={() => void fetchMe()}
    />
  );
}

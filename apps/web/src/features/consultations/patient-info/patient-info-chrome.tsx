import { AlertTriangle } from 'lucide-react';
import { PATIENT_INFO_COPY } from './patient-info-copy';

const PROVINCE_LABEL: Record<string, string> = {
  AB: 'Alberta',
  BC: 'British Columbia',
  MB: 'Manitoba',
  SK: 'Saskatchewan',
  ON: 'Ontario',
};

export function PatientInformationHeader({
  pathwayName,
  province,
  version,
}: {
  pathwayName?: string;
  province?: string | null;
  version?: string | number | null;
}) {
  const provinceLabel = province
    ? PROVINCE_LABEL[province.toUpperCase()] || province
    : null;
  const versionLabel = version
    ? String(version).toLowerCase().startsWith('v')
      ? String(version)
      : `v${version}`
    : null;

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {pathwayName ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="inline-flex items-center rounded-full border border-[#d7e8e6] bg-[#f3fbfa] px-2.5 py-1 font-medium text-[#0f6f6b]">
              {pathwayName}
              {provinceLabel ? <span className="ml-1 font-normal text-[#5b7c78]">· {provinceLabel}</span> : null}
            </span>
            {versionLabel ? (
              <span className="rounded-full bg-[#eef3f5] px-2 py-1 text-[12px] font-medium text-[#6b7c8a]">
                {versionLabel}
              </span>
            ) : null}
          </div>
        ) : null}
        <h1 className="text-[32px] font-bold leading-tight tracking-tight text-[#10233d]">
          {PATIENT_INFO_COPY.title}
        </h1>
        <p className="mt-1.5 text-[15px] text-[#5b6b76]">{PATIENT_INFO_COPY.subtitle}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5 pt-1">
        <p className="text-[13px] font-medium text-[#6b7c8a]">Step 3 of 4</p>
        <div className="flex items-center gap-1.5" aria-hidden>
          <span className="h-1.5 w-8 rounded-full bg-[#0f6f6b]" />
          <span className="h-1.5 w-8 rounded-full bg-[#0f6f6b]" />
          <span className="h-1.5 w-8 rounded-full bg-[#0f6f6b]" />
          <span className="h-1.5 w-8 rounded-full bg-[#d7e2e6]" />
        </div>
      </div>
    </div>
  );
}

export function PatientInformationRequiredBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      className="flex items-start gap-3 rounded-[14px] border border-[#f3d19a] bg-[#fff8eb] px-4 py-3.5"
      role="status"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#fff1d6] text-[#ea580c]">
        <AlertTriangle className="h-4 w-4" aria-hidden />
      </span>
      <div>
        <p className="text-[15px] font-semibold text-[#c2410c]">{PATIENT_INFO_COPY.requiredTitle}</p>
        <p className="mt-0.5 text-[13.5px] text-[#9a3412]">{PATIENT_INFO_COPY.requiredBody}</p>
      </div>
    </div>
  );
}

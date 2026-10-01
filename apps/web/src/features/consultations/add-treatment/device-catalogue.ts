import type { DeviceCatalogueItem } from './types';

/** Local, versioned device index. Terminology metadata is stored, never shown. */
export const DEVICE_CATALOGUE: DeviceCatalogueItem[] = [
  {
    code: 'vhc-adult',
    display: 'VALVED HOLDING CHAMBER — ADULT',
    deviceType: 'Inhaler spacer',
    sizeSpecification: 'Adult',
    sourceMetadata: { system: 'CCDD_DEVICE_NTP', version: '2026-08' },
  },
  {
    code: 'vhc-child',
    display: 'VALVED HOLDING CHAMBER — CHILD',
    deviceType: 'Inhaler spacer',
    sizeSpecification: 'Child',
    sourceMetadata: { system: 'CCDD_DEVICE_NTP', version: '2026-08' },
  },
  {
    code: 'vhc-mask-paed',
    display: 'SPACER WITH MASK — PAEDIATRIC',
    deviceType: 'Inhaler spacer',
    sizeSpecification: 'Paediatric',
    sourceMetadata: { system: 'CCDD_DEVICE_NTP', version: '2026-08' },
  },
  {
    code: 'peak-flow',
    display: 'PEAK FLOW METER',
    deviceType: 'Respiratory monitor',
    sourceMetadata: { system: 'CCDD_DEVICE_NTP', version: '2026-08' },
  },
  {
    code: 'nebulizer',
    display: 'NEBULIZER COMPRESSOR',
    deviceType: 'Aerosol delivery',
    sourceMetadata: { system: 'CCDD_DEVICE_NTP', version: '2026-08' },
  },
  {
    code: 'glucose-meter',
    display: 'BLOOD GLUCOSE METER',
    deviceType: 'Diabetes device',
    sourceMetadata: { system: 'CCDD_DEVICE_NTP', version: '2026-08' },
  },
  {
    code: 'lancets',
    display: 'LANCETS — STANDARD',
    deviceType: 'Diabetes supply',
    sourceMetadata: { system: 'CCDD_DEVICE_NTP', version: '2026-08' },
  },
  {
    code: 'test-strips',
    display: 'BLOOD GLUCOSE TEST STRIPS',
    deviceType: 'Diabetes supply',
    sourceMetadata: { system: 'CCDD_DEVICE_NTP', version: '2026-08' },
  },
  {
    code: 'spacer-adult-mask',
    display: 'VALVED HOLDING CHAMBER WITH MASK — ADULT',
    deviceType: 'Inhaler spacer',
    sizeSpecification: 'Adult',
    sourceMetadata: { system: 'CCDD_DEVICE_NTP', version: '2026-08' },
  },
  {
    code: 'ns-spray-device',
    display: 'NASAL SPRAY ACTUATOR',
    deviceType: 'Nasal device',
    sourceMetadata: { system: 'CCDD_DEVICE_NTP', version: '2026-08' },
  },
];

export function searchDevices(query: string, limit = 20): DeviceCatalogueItem[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return DEVICE_CATALOGUE.filter((item) => {
    const hay = `${item.display} ${item.deviceType} ${item.sizeSpecification ?? ''}`.toLowerCase();
    return hay.includes(q);
  }).slice(0, limit);
}

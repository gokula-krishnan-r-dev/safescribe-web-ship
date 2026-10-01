import { normalizeObservationKey } from './lab-value.util';
import type { NormalizedLabObservation } from './lab-value.util';

export type RenalBandSeverity = 'BLOCK' | 'CAUTION' | 'SAFE';

const BAND_SEVERITY_RANK: Record<RenalBandSeverity, number> = {
  BLOCK: 3,
  CAUTION: 2,
  SAFE: 1,
};

export function extractEgfrValue(labs: NormalizedLabObservation[]): number | null {
  const egfr = labs.find((l) => l.key === 'egfr' || l.key === 'gfr');
  return egfr?.value ?? null;
}

export function extractCrClValue(labs: NormalizedLabObservation[]): number | null {
  const crcl = labs.find((l) => l.key === 'crcl' || l.key === 'creatinineclearance');
  return crcl?.value ?? null;
}

/** Prefer verified CrCl when present; otherwise eGFR. Never relabel eGFR as CrCl. */
export function extractRenalMeasure(labs: NormalizedLabObservation[]): {
  egfr: number | null;
  crcl: number | null;
  measure: number | null;
  usedCrCl: boolean;
} {
  const egfr = extractEgfrValue(labs);
  const crcl = extractCrClValue(labs);
  if (crcl != null) {
    return { egfr, crcl, measure: crcl, usedCrCl: true };
  }
  return { egfr, crcl, measure: egfr, usedCrCl: false };
}

export function egfrInBand(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

export function mapRenalBandSeverity(severity?: string): RenalBandSeverity {
  const v = (severity ?? 'block').trim().toLowerCase();
  switch (v) {
    case 'caution':
    case 'review':
      return 'CAUTION';
    case 'safe':
    case 'ok':
    case 'none':
      return 'SAFE';
    default:
      return 'BLOCK';
  }
}

export function mapRenalBandToClinical(severity: RenalBandSeverity): 'CRITICAL' | 'MODERATE' | 'INFO' {
  switch (severity) {
    case 'BLOCK':
      return 'CRITICAL';
    case 'CAUTION':
      return 'MODERATE';
    default:
      return 'INFO';
  }
}

export function shouldEmitRenalBandFinding(
  bandSeverity: RenalBandSeverity,
  actionRequired: string,
): boolean {
  if (bandSeverity === 'SAFE') return false;
  const action = actionRequired.toUpperCase();
  if (action === 'NONE' || action === 'INFO_ONLY') return false;
  return true;
}

export function pickMostSevereRenalBand<T extends { bandSeverity: string }>(bands: T[]): T {
  return [...bands].sort(
    (a, b) =>
      (BAND_SEVERITY_RANK[b.bandSeverity as RenalBandSeverity] ?? 0) -
      (BAND_SEVERITY_RANK[a.bandSeverity as RenalBandSeverity] ?? 0),
  )[0];
}

export function formatEgfrBandDetail(
  template: string,
  egfr: number,
  min: number,
  max: number,
): string {
  return template
    .replace(/\{egfr\}/g, String(egfr))
    .replace(/\{egfr_min\}/g, String(min))
    .replace(/\{egfr_max\}/g, String(max));
}

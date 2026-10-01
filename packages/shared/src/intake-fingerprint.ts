/**
 * Stable fingerprint of consultation intake (transcript + concern + photos).
 * Used to detect when Step 1 changed after downstream assessment was already filled,
 * so AI-derived demographics / findings can be refreshed.
 */
export function computeIntakeFingerprint(input: {
  chiefComplaint?: string | null;
  transcript?: string | null;
  attachmentIds?: string[] | null;
}): string {
  const concern = (input.chiefComplaint ?? '').trim().replace(/\s+/g, ' ');
  const notes = (input.transcript ?? '').trim().replace(/\s+/g, ' ');
  const photos = (input.attachmentIds ?? [])
    .map((id) => id.trim())
    .filter(Boolean)
    .sort()
    .join(',');
  return `${concern}\n${notes}\n${photos}`;
}

export type ConsultationIntakeAnalysisMeta = {
  intakeFingerprint?: string;
  analyzedAt?: string;
  /** True until Step 3 re-prefills AI findings after intake changed */
  downstreamRefreshRequired?: boolean;
  intakeInvalidatedAt?: string | null;
};

export function readIntakeAnalysisMeta(
  aiAnalysis: unknown,
): ConsultationIntakeAnalysisMeta {
  if (!aiAnalysis || typeof aiAnalysis !== 'object' || Array.isArray(aiAnalysis)) {
    return {};
  }
  const raw = aiAnalysis as Record<string, unknown>;
  return {
    intakeFingerprint:
      typeof raw.intakeFingerprint === 'string' ? raw.intakeFingerprint : undefined,
    analyzedAt: typeof raw.analyzedAt === 'string' ? raw.analyzedAt : undefined,
    downstreamRefreshRequired: raw.downstreamRefreshRequired === true,
    intakeInvalidatedAt:
      typeof raw.intakeInvalidatedAt === 'string' ? raw.intakeInvalidatedAt : null,
  };
}

/** True when current intake no longer matches the last successful analysis. */
export function isIntakeAnalysisStale(input: {
  aiAnalysis: unknown;
  chiefComplaint?: string | null;
  transcript?: string | null;
  attachmentIds?: string[] | null;
}): boolean {
  const meta = readIntakeAnalysisMeta(input.aiAnalysis);
  const current = computeIntakeFingerprint({
    chiefComplaint: input.chiefComplaint,
    transcript: input.transcript,
    attachmentIds: input.attachmentIds,
  });
  if (!meta.intakeFingerprint) {
    // Never analyzed with fingerprinting — treat non-empty intake as needing analysis
    // only when downstream refresh was explicitly requested.
    return meta.downstreamRefreshRequired === true;
  }
  return meta.intakeFingerprint !== current || meta.downstreamRefreshRequired === true;
}

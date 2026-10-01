import {
  counsellingPayloadMeta,
  emptyPatientContext,
  isUsablePatientGuidanceText,
  mergeApprovedCounselling,
  selectFollowupsForCounselling,
  selectPathwayGuidanceForCounselling,
  toSelectedTreatmentPayload,
  ageYearsFromDemographics,
  type CounsellingLlmPayload,
  type PatientContextPayload,
} from '@safescript/shared';

type Demo = Record<string, unknown>;

function splitList(raw: unknown, max = 6): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((x) => String(x ?? '').trim())
      .filter((s) => s.length > 1 && !/^(nkda|none|n\/a|no known)/i.test(s))
      .slice(0, max);
  }
  const text = String(raw ?? '').trim();
  if (!text || /^(nkda|none|n\/a|no known)/i.test(text)) return [];
  return text
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 80)
    .slice(0, max);
}

function ageYears(demo: Demo): number | null {
  return ageYearsFromDemographics({
    age: demo.age as string | number | undefined,
    ageUnit: demo.ageUnit as string | undefined,
    dateOfBirth: demo.dateOfBirth as string | undefined,
    dateOfBirthUnavailable: demo.dateOfBirthUnavailable === true,
  });
}

function buildPatientContext(input: {
  assessment: string;
  demographics?: unknown;
  redFlags?: unknown;
  confirmedFollowUp?: string[];
}): PatientContextPayload {
  const demo = (input.demographics ?? {}) as Demo;
  const flags = (input.redFlags ?? {}) as Record<string, unknown>;
  const redFlagNotes: string[] = [];
  if (flags.hasRedFlags === true && typeof flags.notes === 'string' && flags.notes.trim()) {
    redFlagNotes.push(flags.notes.trim());
  }
  if (Array.isArray(flags.confirmed)) {
    for (const row of flags.confirmed) {
      const text = String(
        (row as { label?: string; action?: string })?.label ??
          (row as { action?: string })?.action ??
          '',
      ).trim();
      if (text) redFlagNotes.push(text);
    }
  }

  const confirmedFollowUp: string[] = [];
  if (flags.referralSelected === true) {
    confirmedFollowUp.push(
      String(flags.referralNotes || flags.notes || '').trim() ||
        'Further medical assessment was selected for this visit.',
    );
  }
  for (const extra of input.confirmedFollowUp ?? []) {
    if (extra.trim()) confirmedFollowUp.push(extra.trim());
  }

  const ctx = emptyPatientContext();
  ctx.confirmed_assessment = input.assessment.trim();
  ctx.age_years = ageYears(demo);
  ctx.relevant_allergies = splitList(demo.allergies);
  ctx.relevant_conditions = splitList(demo.medicalConditions);
  ctx.relevant_medications = splitList(
    Array.isArray(demo.medicationEntries)
      ? (demo.medicationEntries as Array<{ name?: string }>)
          .map((m) => m.name)
          .filter(Boolean)
      : demo.currentMedications,
  );
  ctx.relevant_labs = splitList(demo.labValues, 4);
  ctx.confirmed_red_flags = redFlagNotes.slice(0, 6);
  ctx.confirmed_follow_up = confirmedFollowUp.slice(0, 8);
  return ctx;
}

export function buildCounsellingLlmPayload(input: {
  assessment: string;
  demographics?: unknown;
  redFlags?: unknown;
  selectedTreatments: unknown[];
  conditionRows: Array<{
    category?: string | null;
    point?: string | null;
    detail?: string | null;
    approved?: boolean;
    outputSection?: string | null;
  }>;
  followups?: Array<{
    timeframe?: string | null;
    condition?: string | null;
    action?: string | null;
    urgency?: string | null;
    approved?: boolean | null;
  }>;
  treatmentCounselling?: Array<{ category?: string | null; text?: string | null }>;
}): CounsellingLlmPayload {
  const selected_treatments = input.selectedTreatments
    .map((row, i) =>
      row && typeof row === 'object'
        ? toSelectedTreatmentPayload(row as Record<string, unknown>, i)
        : null,
    )
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
    .slice(0, 8);

  const treatmentRows = [
    ...(input.treatmentCounselling ?? []),
    ...selected_treatments.flatMap((t, i) => {
      const src = input.selectedTreatments[i] as Record<string, unknown> | undefined;
      const rows: Array<{ category: string; text: string }> = [];
      const notes = String(src?.counsellingNotes ?? '').trim();
      if (notes) rows.push({ category: 'medication_use', text: notes });
      const fu = String(src?.followUpAdvice ?? '').trim();
      if (isUsablePatientGuidanceText(fu)) rows.push({ category: 'follow_up', text: fu });
      const category = String(src?.category ?? '').toUpperCase();
      if (category === 'NON_DRUG') {
        const tip = String(src?.instructions ?? src?.directions ?? t.display_name).trim();
        if (tip) rows.push({ category: 'self_care', text: tip });
      }
      const warnings = Array.isArray(src?.warnings) ? src.warnings : [];
      for (const warning of warnings.slice(0, 3)) {
        const text = String(warning ?? '').trim();
        if (text) rows.push({ category: 'precaution', text });
      }
      const monitoring = String(src?.monitoring ?? '').trim();
      if (isUsablePatientGuidanceText(monitoring)) {
        rows.push({ category: 'follow_up', text: monitoring });
      }
      return rows;
    }),
  ];

  const conditionRows = selectPathwayGuidanceForCounselling(input.conditionRows);

  const approved_counselling = mergeApprovedCounselling({
    conditionRows,
    treatmentRows,
    followups: selectFollowupsForCounselling(input.followups ?? []),
  });

  return {
    patient_context: buildPatientContext({
      assessment: input.assessment,
      demographics: input.demographics,
      redFlags: input.redFlags,
    }),
    selected_treatments,
    approved_counselling,
  };
}

export { counsellingPayloadMeta };

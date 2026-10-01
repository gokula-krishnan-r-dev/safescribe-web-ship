import {
  ageCaptureModeFromDemographics,
  calendarDateInTimeZone,
  committedOptionalDob,
  confirmedAgeUnitToLegacy,
  demographicsAgeFromDob,
  formatConfirmedAge,
  parseIsoDateLocal,
  patientSnapshotVersion,
  recordedAgeFromDemographics,
  stripUncommittedPatientDob,
  unresolvedOptionalDobMessage,
  validateOptionalDob,
  type ConfirmedAge,
  type DemographicsAgeFields,
  type OptionalDobValidationResult,
} from '@safescript/shared';

export { patientSnapshotVersion };

export function demographicsAgeFields(raw: unknown): DemographicsAgeFields {
  const demo = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    age: demo.age as string | number | undefined,
    ageUnit: typeof demo.ageUnit === 'string' ? demo.ageUnit : undefined,
    dateOfBirth: typeof demo.dateOfBirth === 'string' ? demo.dateOfBirth : undefined,
    dateOfBirthUnavailable:
      demo.dateOfBirthUnavailable === true || demo.dateOfBirthUnavailable === 'true',
    originalManualAge:
      demo.originalManualAge && typeof demo.originalManualAge === 'object'
        ? (demo.originalManualAge as { value?: number; unit?: string })
        : undefined,
  };
}

export function consultationDateOnly(
  createdAt: Date | string,
  timeZone?: string | null,
): string {
  return calendarDateInTimeZone(createdAt, timeZone);
}

export function evaluateStoredOptionalDob(input: {
  dob: string;
  demographics: unknown;
  consultationDate: string;
}): OptionalDobValidationResult & { recordedAge?: ConfirmedAge | null } {
  const demo = demographicsAgeFields(input.demographics);
  const recordedAge = recordedAgeFromDemographics(demo, input.consultationDate);
  if (!recordedAge) {
    return {
      status: 'INVALID',
      dob: input.dob,
      errorCode: 'RECORDED_AGE_MISSING',
      message: 'Recorded age at intake is missing.',
    };
  }
  return {
    ...validateOptionalDob({
      dob: input.dob,
      recordedAge,
      consultationDate: input.consultationDate,
    }),
    recordedAge,
  };
}

export function revertDocumentationDob(
  demographics: Record<string, unknown>,
): Record<string, unknown> {
  const original = demographics.originalManualAge as
    | { value?: number; unit?: string }
    | undefined;
  const next: Record<string, unknown> = { ...demographics, dateOfBirthUnavailable: true };
  delete next.dateOfBirth;
  if (original && original.value != null) {
    next.age = String(original.value);
    next.ageUnit =
      typeof original.unit === 'string' && original.unit.length <= 4
        ? confirmedAgeUnitToLegacy(
            original.unit === 'DAY' ||
              original.unit === 'WEEK' ||
              original.unit === 'MONTH' ||
              original.unit === 'YEAR'
              ? original.unit
              : 'YEAR',
          )
        : demographics.ageUnit;
  }
  return next;
}

export function applyMatchingDob(
  demographics: Record<string, unknown>,
  dob: string,
  recordedAge: ConfirmedAge,
): Record<string, unknown> {
  const original = demographics.originalManualAge;
  return {
    ...demographics,
    dateOfBirth: dob,
    dateOfBirthUnavailable: false,
    age: String(recordedAge.value),
    ageUnit: confirmedAgeUnitToLegacy(recordedAge.unit),
    originalManualAge:
      original && typeof original === 'object'
        ? original
        : { value: recordedAge.value, unit: recordedAge.unit },
  };
}

export function applyAuthoritativeDob(
  demographics: Record<string, unknown>,
  dob: string,
  previousAge: ConfirmedAge,
  consultationDate: string,
): Record<string, unknown> {
  const asOf = parseIsoDateLocal(consultationDate);
  const derived = asOf ? demographicsAgeFromDob(dob, asOf) : null;
  return {
    ...demographics,
    dateOfBirth: dob,
    dateOfBirthUnavailable: false,
    age: derived?.age ?? String(previousAge.value),
    ageUnit: derived?.ageUnit ?? confirmedAgeUnitToLegacy(previousAge.unit),
    originalManualAge: demographics.originalManualAge ?? {
      value: previousAge.value,
      unit: previousAge.unit,
    },
    ageSourceChangedAt: new Date().toISOString(),
  };
}

export function withDocumentationDob(
  documentation: unknown,
  dob: string | null,
): Record<string, unknown> {
  const docs =
    documentation && typeof documentation === 'object' && !Array.isArray(documentation)
      ? { ...(documentation as Record<string, unknown>) }
      : {};
  const patientInfo =
    docs.patientInfo && typeof docs.patientInfo === 'object' && !Array.isArray(docs.patientInfo)
      ? { ...(docs.patientInfo as Record<string, unknown>) }
      : {};
  if (dob) patientInfo.dateOfBirth = dob;
  else delete patientInfo.dateOfBirth;
  docs.patientInfo = patientInfo;
  return docs;
}

export function markDocumentsStale(documentation: unknown): Record<string, unknown> {
  const docs =
    documentation && typeof documentation === 'object' && !Array.isArray(documentation)
      ? { ...(documentation as Record<string, unknown>) }
      : {};
  const revision = typeof docs.revision === 'number' ? docs.revision + 1 : 1;
  const reviews = {
    ...((docs.documentReviews as Record<string, unknown> | undefined) ?? {}),
  };
  for (const [key, value] of Object.entries(reviews)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    reviews[key] = {
      ...(value as Record<string, unknown>),
      status: 'SOURCE_CHANGED',
    };
  }
  return {
    ...docs,
    revision,
    documentStatus: 'STALE',
    documentsStaleReason: 'AGE_UPDATED',
    documentReviews: reviews,
  };
}

export function markTreatmentPlanStale(treatmentPlan: unknown): unknown {
  if (!treatmentPlan || typeof treatmentPlan !== 'object' || Array.isArray(treatmentPlan)) {
    return treatmentPlan;
  }
  const plan = treatmentPlan as Record<string, unknown>;
  if (plan.confirmStatus !== 'CONFIRMED' && plan.confirmStatus !== 'STALE') {
    return treatmentPlan;
  }
  return { ...plan, confirmStatus: 'STALE' };
}

export function sanitizeDocumentationDob(
  documentation: Record<string, unknown>,
  demographics: unknown,
  consultationDate: string,
): Record<string, unknown> {
  return stripUncommittedPatientDob(
    documentation,
    demographicsAgeFields(demographics),
    consultationDate,
  );
}

export function unresolvedDocumentationDob(
  documentation: unknown,
  demographics: unknown,
  consultationDate: string,
): string | null {
  if (!documentation || typeof documentation !== 'object' || Array.isArray(documentation)) {
    return null;
  }
  return unresolvedOptionalDobMessage(
    documentation as Record<string, unknown>,
    demographicsAgeFields(demographics),
    consultationDate,
  );
}

export function committedDobOrEmpty(
  draftDob: string | null | undefined,
  demographics: unknown,
  consultationDate: string,
): string {
  return committedOptionalDob({
    draftDob,
    demographics: demographicsAgeFields(demographics),
    consultationDate,
  });
}

export function isManualAgeIntake(demographics: unknown): boolean {
  return ageCaptureModeFromDemographics(demographicsAgeFields(demographics)) === 'MANUAL_AGE';
}

export function recordedAgeLabel(age: Pick<ConfirmedAge, 'value' | 'unit'>): string {
  return formatConfirmedAge(age);
}

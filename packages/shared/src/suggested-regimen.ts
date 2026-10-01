/**
 * One structured suggested-regimen source of truth for the pharmacist
 * Treatment Options card. Collapsed summary and expanded Suggested regimen
 * are always rendered from the same object.
 *
 * Product strength is never treated as the administered dose.
 */

import {
  formatAdministrationQuantity,
  formatDoseNumber,
  formatMassLabel,
  isInstructionalAdministration,
  parseAdministrationQuantity,
  parseMassAmount,
  parseProductStrength,
  multiplyStrengthByQuantity,
  type AdministeredDoseStatus,
  type AdministrationQuantity,
} from './administered-dose';

export const REGIMEN_SUMMARY_FORMATTER_VERSION = 2;

export type RegimenTiming =
  | { type: 'EVENT'; eventCode: string; eventLabel: string }
  | {
      type: 'TIMES_PER_PERIOD';
      frequency: number;
      period: number;
      periodUnit: 'HOUR' | 'DAY' | 'WEEK' | 'MONTH';
    }
  | {
      type: 'FIXED_INTERVAL';
      intervalValue: number;
      intervalMaximum?: number | null;
      intervalUnit: 'HOUR' | 'DAY' | 'WEEK';
    }
  | { type: 'ONCE'; label: 'once' | 'now' }
  | { type: 'CUSTOM'; reviewedLabel: string };

export type RegimenSummaryIssue = {
  code:
    | 'MISSING_QUANTITY'
    | 'MISSING_TIMING'
    | 'INCOMPATIBLE_UNITS'
    | 'WEIGHT_BASED_UNRESOLVED'
    | 'INCOMPLETE_SCHEDULE'
    | 'MISSING_ROUTE';
  message: string;
};

export type StructuredSuggestedRegimen = {
  doseMinimum: number | null;
  doseMaximum: number | null;
  doseUnitCode: string | null;
  doseUnitLabel: string | null;
  administrationQuantityMinimum: number | null;
  administrationQuantityMaximum: number | null;
  administrationUnitCode: string | null;
  administrationUnitLabel: string | null;
  instructionalText: string | null;
  productStrengthValue: number | null;
  productStrengthUnit: string | null;
  administeredDoseMinimum: number | null;
  administeredDoseMaximum: number | null;
  administeredDoseUnit: string | null;
  administeredDoseStatus: AdministeredDoseStatus;
  additionalSchedulesCount: number;
  timing: RegimenTiming | null;
  prn: boolean;
  repeatAllowed: boolean;
  minimumRepeatIntervalValue: number | null;
  minimumRepeatIntervalUnit: 'MINUTE' | 'HOUR' | 'DAY' | null;
  maximumDoseValue: number | null;
  maximumDoseUnitCode: string | null;
  maximumDoseUnitLabel: string | null;
  maximumDosePeriodValue: number | null;
  maximumDosePeriodUnit: 'HOUR' | 'DAY' | null;
  durationQualifier: 'EXACT' | 'UP_TO' | 'AT_LEAST' | 'NONE';
  durationValue: number | null;
  durationUnit: 'DAY' | 'WEEK' | 'MONTH' | null;
  routeCode: string | null;
  routeLabel: string | null;
  administrationAction: string | null;
  schemaVersion: number;
};

export type RenderedRegimenPresentation = {
  summaryPrimary: string;
  summarySecondary: string | null;
  expandedText: string;
};

export type SuggestedRegimenStatus = 'READY' | 'REVIEW_REQUIRED';

export type SuggestedRegimenBundle = {
  structured: StructuredSuggestedRegimen;
  presentation: RenderedRegimenPresentation;
  fingerprint: string;
  status: SuggestedRegimenStatus;
  issues: RegimenSummaryIssue[];
  formatterVersion: number;
};

export type SuggestedRegimenLineSource = {
  doseFrom?: string | null;
  doseTo?: string | null;
  form?: string | null;
  frequency?: string | null;
  prn?: boolean | null;
  durationValue?: string | null;
  durationUnit?: 'DAY' | 'WEEK' | 'MONTH' | null;
};

export type SuggestedRegimenSource = {
  dose?: string | null;
  doseAmount?: string | null;
  doseUnit?: string | null;
  strength?: string | null;
  frequency?: string | null;
  duration?: string | null;
  route?: string | null;
  maxDose?: string | null;
  instructions?: string | null;
  patientDirections?: string | null;
  prn?: boolean | null;
  recommendationLevel?: string | null;
  clinicalNotes?: string | null;
  clinicalIndication?: string | null;
  eligibility?: string | null;
  followUpAdvice?: string | null;
  monitoring?: string | null;
  monitoringReason?: string | null;
  productForm?: string | null;
  regimenLines?: SuggestedRegimenLineSource[] | null;
};

const EMPTY_REGIMEN: StructuredSuggestedRegimen = {
  doseMinimum: null,
  doseMaximum: null,
  doseUnitCode: null,
  doseUnitLabel: null,
  administrationQuantityMinimum: null,
  administrationQuantityMaximum: null,
  administrationUnitCode: null,
  administrationUnitLabel: null,
  instructionalText: null,
  productStrengthValue: null,
  productStrengthUnit: null,
  administeredDoseMinimum: null,
  administeredDoseMaximum: null,
  administeredDoseUnit: null,
  administeredDoseStatus: 'NOT_APPLICABLE',
  additionalSchedulesCount: 0,
  timing: null,
  prn: false,
  repeatAllowed: false,
  minimumRepeatIntervalValue: null,
  minimumRepeatIntervalUnit: null,
  maximumDoseValue: null,
  maximumDoseUnitCode: null,
  maximumDoseUnitLabel: null,
  maximumDosePeriodValue: null,
  maximumDosePeriodUnit: null,
  durationQualifier: 'NONE',
  durationValue: null,
  durationUnit: null,
  routeCode: null,
  routeLabel: null,
  administrationAction: null,
  schemaVersion: REGIMEN_SUMMARY_FORMATTER_VERSION,
};

const FALLBACK_FREQUENCY = /^(once daily|qd|daily|once a day)$/i;
const YES_NO = /^(yes|no|true|false|y|n)$/i;

function compact(text: string | null | undefined): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function formatNumber(value: number): string {
  return formatDoseNumber(value);
}

function parseMassDose(raw: string | null | undefined): { value: number; unit: string } | null {
  return parseMassAmount(raw);
}

function sourceProse(source: SuggestedRegimenSource): string {
  return compact(
    [source.instructions, source.maxDose].filter(Boolean).join('. '),
  );
}

function parseEventTiming(
  frequency: string,
  prose: string,
): Extract<RegimenTiming, { type: 'EVENT' }> | null {
  const haystack = `${frequency} ${prose}`.toLowerCase();
  if (/migraine\s+onset/.test(haystack)) {
    return { type: 'EVENT', eventCode: 'MIGRAINE_ONSET', eventLabel: 'at migraine onset' };
  }
  if (
    /at_onset|at symptom onset|at the first sign|at onset|first_sign/.test(haystack)
  ) {
    const firstSign = /first sign/.test(haystack);
    return {
      type: 'EVENT',
      eventCode: firstSign ? 'FIRST_SIGN' : 'SYMPTOM_ONSET',
      eventLabel: firstSign
        ? 'at the first sign of symptoms'
        : 'at symptom onset',
    };
  }
  return null;
}

function parseIntervalTiming(frequency: string): Extract<RegimenTiming, { type: 'FIXED_INTERVAL' }> | null {
  const text = compact(frequency);
  const range =
    text.match(
      /(?:every|q)\s*(\d+(?:\.\d+)?)\s*(?:to|[–-])\s*(\d+(?:\.\d+)?)\s*(hours?|hrs?|h)\b/i,
    ) || text.match(/^Q(\d+)\s*-\s*(\d+)H\b/i);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0) {
      return null;
    }
    return {
      type: 'FIXED_INTERVAL',
      intervalValue: min,
      intervalMaximum: max === min ? null : max,
      intervalUnit: 'HOUR',
    };
  }
  const single =
    text.match(/(?:every|q)\s*(\d+(?:\.\d+)?)\s*(hours?|hrs?|h)\b/i) ||
    text.match(/^Q(\d+)H\b/i);
  if (!single) return null;
  const value = Number(single[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return { type: 'FIXED_INTERVAL', intervalValue: value, intervalUnit: 'HOUR' };
}

function parseTimesPerPeriod(frequency: string): Extract<RegimenTiming, { type: 'TIMES_PER_PERIOD' }> | null {
  const t = compact(frequency).toLowerCase();
  if (/twice daily|two times daily|\bbid\b/.test(t)) {
    return { type: 'TIMES_PER_PERIOD', frequency: 2, period: 1, periodUnit: 'DAY' };
  }
  if (/three times daily|\btid\b/.test(t)) {
    return { type: 'TIMES_PER_PERIOD', frequency: 3, period: 1, periodUnit: 'DAY' };
  }
  if (/four times daily|\bqid\b/.test(t)) {
    return { type: 'TIMES_PER_PERIOD', frequency: 4, period: 1, periodUnit: 'DAY' };
  }
  if (/once a week|once weekly|1x\/week|once every week/.test(t)) {
    return { type: 'TIMES_PER_PERIOD', frequency: 1, period: 1, periodUnit: 'WEEK' };
  }
  if (/twice\/week|twice weekly|2x\/week/.test(t)) {
    return { type: 'TIMES_PER_PERIOD', frequency: 2, period: 1, periodUnit: 'WEEK' };
  }
  if (FALLBACK_FREQUENCY.test(t) || /\bqd\b/.test(t) || /once daily/.test(t)) {
    return { type: 'TIMES_PER_PERIOD', frequency: 1, period: 1, periodUnit: 'DAY' };
  }
  return null;
}

function parseOnceOnly(frequency: string): Extract<RegimenTiming, { type: 'ONCE' }> | null {
  const text = compact(frequency);
  if (!text) return null;
  const code = text.split(/\s*-\s*/)[0]?.trim().toUpperCase() ?? '';
  if (code === 'STAT') return { type: 'ONCE', label: 'now' };
  if (code === 'ONCE') return { type: 'ONCE', label: 'once' };
  const body = text
    .replace(/^[A-Z0-9/_-]+\s*-\s*/, '')
    .trim()
    .toLowerCase();
  const whole = text.toLowerCase();
  if (FALLBACK_FREQUENCY.test(whole) || FALLBACK_FREQUENCY.test(body) || /once daily|once a day/.test(whole)) {
    return null;
  }
  if (
    /^(one time only|once only|single dose|stat|now)$/.test(body) ||
    /^(one time only|once only|single dose|once)$/.test(whole)
  ) {
    return { type: 'ONCE', label: whole === 'stat' || body === 'stat' || body === 'now' ? 'now' : 'once' };
  }
  return null;
}

function parseCustomTiming(frequency: string): Extract<RegimenTiming, { type: 'CUSTOM' }> | null {
  const label = compact(frequency)
    .replace(/^[A-Z0-9/_-]+\s*-\s*/, '')
    .replace(/\b(QD|BID|TID|QID|QHS|PRN)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!label) return null;
  if (FALLBACK_FREQUENCY.test(label)) return null;
  return { type: 'CUSTOM', reviewedLabel: label.replace(/^./, (c) => c.toLowerCase()) };
}

function parseRepeat(prose: string): {
  value: number;
  unit: 'MINUTE' | 'HOUR' | 'DAY';
} | null {
  const match = prose.match(
    /repeat(?:ed)?(?:\s+the\s+dose)?(?:\s+after)?(?:\s+at\s+least)?\s+(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?|days?)/i,
  );
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unitRaw = match[2].toLowerCase();
  const unit: 'MINUTE' | 'HOUR' | 'DAY' = unitRaw.startsWith('min')
    ? 'MINUTE'
    : unitRaw.startsWith('day')
      ? 'DAY'
      : 'HOUR';
  return { value, unit };
}

function parseMaximum(source: SuggestedRegimenSource, prose: string): {
  value: number;
  unit: string;
  periodValue: number;
  periodUnit: 'HOUR' | 'DAY';
} | null {
  const fromProse = prose.match(
    /maximum(?:\s+of)?\s+(\d+(?:\.\d+)?)\s*(mcg|µg|mg|g|mL|ml|tablets?)(?:\s+in\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|days?))?/i,
  );
  if (fromProse) {
    const value = Number(fromProse[1]);
    if (!Number.isFinite(value)) return null;
    const unit = fromProse[2].toLowerCase() === 'ml' ? 'mL' : fromProse[2];
    const periodValue = fromProse[3] ? Number(fromProse[3]) : 24;
    const periodUnit: 'HOUR' | 'DAY' = /day/i.test(fromProse[4] ?? 'hours')
      ? 'DAY'
      : 'HOUR';
    return { value, unit: unit === 'µg' ? 'mcg' : unit, periodValue, periodUnit };
  }
  const fromField = parseMassDose(source.maxDose);
  if (!fromField) return null;
  const period = compact(source.maxDose).match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|days?)/i);
  return {
    value: fromField.value,
    unit: fromField.unit,
    periodValue: period ? Number(period[1]) : 24,
    periodUnit: period && /day/i.test(period[2]) ? 'DAY' : 'HOUR',
  };
}

function parseDuration(raw: string | null | undefined): {
  qualifier: StructuredSuggestedRegimen['durationQualifier'];
  value: number;
  unit: 'DAY' | 'WEEK' | 'MONTH';
} | null {
  const text = compact(raw);
  if (!text) return null;
  const match = text.match(/^(up to|at least)?\s*(\d+(?:\.\d+)?)\s*(days?|weeks?|months?|d|w|mo)\b/i);
  if (!match) return null;
  const value = Number(match[2]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unitRaw = match[3].toLowerCase();
  const unit: 'DAY' | 'WEEK' | 'MONTH' = unitRaw.startsWith('w')
    ? 'WEEK'
    : unitRaw.startsWith('mo')
      ? 'MONTH'
      : 'DAY';
  const qualifier: StructuredSuggestedRegimen['durationQualifier'] = /up to/i.test(
    match[1] ?? '',
  )
    ? 'UP_TO'
    : /at least/i.test(match[1] ?? '')
      ? 'AT_LEAST'
      : 'EXACT';
  return { qualifier, value, unit };
}

function lineDuration(line: SuggestedRegimenLineSource | undefined): string | null {
  if (!line?.durationValue || !line.durationUnit) return null;
  const unit =
    line.durationUnit === 'WEEK' ? 'weeks' : line.durationUnit === 'MONTH' ? 'months' : 'days';
  return `${line.durationValue} ${unit}`;
}

function resolveAdministration(source: SuggestedRegimenSource): {
  quantity: AdministrationQuantity | null;
  instructionalText: string | null;
  explicitMass: { value: number; unit: string } | null;
  administered: ReturnType<typeof multiplyStrengthByQuantity>;
  strength: ReturnType<typeof parseProductStrength>;
} {
  const line = source.regimenLines?.[0];
  const instructionalCandidate = compact(
    line?.doseFrom || source.doseAmount || source.dose,
  );
  const instructionalText = isInstructionalAdministration(instructionalCandidate)
    ? instructionalCandidate
    : null;

  let quantity =
    parseAdministrationQuantity(
      line?.doseTo ? `${line.doseFrom}–${line.doseTo}` : line?.doseFrom,
      line?.form,
    ) ||
    parseAdministrationQuantity(source.doseAmount, source.doseUnit) ||
    parseAdministrationQuantity(source.dose, source.doseUnit || source.productForm);

  if (quantity && line?.doseTo && quantity.maximum == null) {
    const maximum = Number(compact(line.doseTo));
    if (Number.isFinite(maximum) && maximum > 0) quantity = { ...quantity, maximum };
  }

  const strength = parseProductStrength(source.strength);
  const massFromAmount = parseMassAmount(
    source.doseAmount && source.doseUnit
      ? `${source.doseAmount} ${source.doseUnit}`
      : source.doseAmount,
  );
  const explicitMass = quantity ? null : massFromAmount || parseMassAmount(source.dose);

  const emptyAdministered = {
    value: null as number | null,
    minimum: null as number | null,
    maximum: null as number | null,
    unit: null as string | null,
    status: 'NOT_APPLICABLE' as const,
  };

  if (instructionalText) {
    return {
      quantity: null,
      instructionalText,
      explicitMass: null,
      administered: { ...emptyAdministered, status: 'NOT_APPLICABLE' },
      strength,
    };
  }

  if (quantity && strength) {
    return {
      quantity,
      instructionalText: null,
      explicitMass: null,
      administered: multiplyStrengthByQuantity(strength, quantity),
      strength,
    };
  }

  if (quantity) {
    return {
      quantity,
      instructionalText: null,
      explicitMass: null,
      administered: { ...emptyAdministered, status: 'NOT_CALCULABLE' },
      strength,
    };
  }

  if (explicitMass) {
    return {
      quantity: null,
      instructionalText: null,
      explicitMass,
      administered: {
        value: explicitMass.value,
        minimum: explicitMass.value,
        maximum: null,
        unit: explicitMass.unit,
        status: 'NOT_APPLICABLE',
      },
      strength,
    };
  }

  return {
    quantity: null,
    instructionalText: null,
    explicitMass: null,
    administered: emptyAdministered,
    strength,
  };
}

function isWeightBasedUnresolved(source: SuggestedRegimenSource, hasAbsoluteDose: boolean): boolean {
  const haystack = `${source.dose ?? ''} ${source.doseAmount ?? ''} ${source.doseUnit ?? ''} ${source.instructions ?? ''}`;
  if (!/mg\s*\/\s*kg|mcg\s*\/\s*kg/i.test(haystack)) return false;
  return !hasAbsoluteDose;
}

function resolveTiming(
  source: SuggestedRegimenSource,
  prose: string,
): RegimenTiming | null {
  const frequency = compact(source.regimenLines?.[0]?.frequency || source.frequency);
  const event = parseEventTiming(frequency, prose);
  if (event) return event;
  const once = parseOnceOnly(frequency);
  if (once) return once;
  const interval = parseIntervalTiming(frequency) || parseIntervalTiming(prose);
  if (interval) return interval;
  if (FALLBACK_FREQUENCY.test(frequency) && /onset|repeat after|maximum /i.test(prose)) {
    return parseEventTiming('', prose);
  }
  const times = parseTimesPerPeriod(frequency);
  if (times) {
    if (FALLBACK_FREQUENCY.test(frequency) && !prose) return times;
    if (!FALLBACK_FREQUENCY.test(frequency)) return times;
    if (FALLBACK_FREQUENCY.test(frequency) && prose && !/onset|repeat after|maximum /i.test(prose)) {
      return times;
    }
  }
  return parseCustomTiming(frequency);
}

function resolveRoute(source: SuggestedRegimenSource): { code: string | null; label: string | null } {
  const label = compact(source.route);
  if (!label) return { code: null, label: null };
  const code = label.toUpperCase().replace(/\s+/g, '_');
  return { code, label };
}

function administrationActionFor(route: string | null, form: string | null): string | null {
  const hay = `${route ?? ''} ${form ?? ''}`.toLowerCase();
  if (/inhal/.test(hay) || /\bpuff/.test(hay)) return 'INHALE';
  if (/ophthalmic|otic|eye|ear|\bdrop/.test(hay)) return 'INSTILL';
  if (/inject|intramuscular|subcutaneous|intravenous|intradermal/.test(hay)) return 'INJECT';
  if (/topical|external|skin|cream|ointment|gel|foam/.test(hay)) return 'APPLY';
  if (/nasal|nostril|spray/.test(hay)) return 'SPRAY';
  if (/rectal|vaginal|insert/.test(hay)) return 'INSERT';
  if (/oral|mouth|po\b/.test(hay)) return 'TAKE';
  return null;
}

export function buildStructuredSuggestedRegimen(
  source: SuggestedRegimenSource,
): StructuredSuggestedRegimen {
  const prose = sourceProse(source);
  const administration = resolveAdministration(source);
  const timing = resolveTiming(source, prose);
  const repeat = parseRepeat(prose);
  const maximum = parseMaximum(source, prose);
  const durationRaw = lineDuration(source.regimenLines?.[0]) || source.duration;
  const duration =
    timing?.type === 'EVENT' || timing?.type === 'ONCE'
      ? null
      : parseDuration(durationRaw);
  const line = source.regimenLines?.[0];
  const prn =
    Boolean(source.prn || line?.prn) ||
    /\b(as needed|prn)\b/i.test(`${source.frequency ?? ''} ${line?.frequency ?? ''} ${prose}`);
  const route = resolveRoute(source);
  const extraLines = Math.max((source.regimenLines?.length ?? 0) - 1, 0);

  const qty = administration.quantity;
  const administered = administration.administered;
  const displayMass =
    administered.status === 'CALCULATED'
      ? { min: administered.minimum, max: administered.maximum, unit: administered.unit }
      : administration.explicitMass
        ? {
            min: administration.explicitMass.value,
            max: null,
            unit: administration.explicitMass.unit,
          }
        : { min: null, max: null, unit: null };

  return {
    ...EMPTY_REGIMEN,
    doseMinimum: displayMass.min,
    doseMaximum: displayMass.max,
    doseUnitCode: displayMass.unit,
    doseUnitLabel: displayMass.unit,
    administrationQuantityMinimum: qty?.minimum ?? null,
    administrationQuantityMaximum: qty?.maximum ?? null,
    administrationUnitCode: qty?.unitCode ?? null,
    administrationUnitLabel: qty?.unitLabel ?? null,
    instructionalText: administration.instructionalText,
    productStrengthValue: administration.strength?.value ?? null,
    productStrengthUnit: administration.strength?.unit ?? null,
    administeredDoseMinimum: administered.minimum,
    administeredDoseMaximum: administered.maximum,
    administeredDoseUnit: administered.unit,
    administeredDoseStatus: administered.status,
    additionalSchedulesCount: extraLines,
    timing,
    prn: timing?.type === 'EVENT' ? true : prn,
    repeatAllowed: Boolean(repeat),
    minimumRepeatIntervalValue: repeat?.value ?? null,
    minimumRepeatIntervalUnit: repeat?.unit ?? null,
    maximumDoseValue: maximum?.value ?? null,
    maximumDoseUnitCode: maximum?.unit ?? null,
    maximumDoseUnitLabel: maximum?.unit ?? null,
    maximumDosePeriodValue: maximum?.periodValue ?? null,
    maximumDosePeriodUnit: maximum?.periodUnit ?? null,
    durationQualifier: duration?.qualifier ?? 'NONE',
    durationValue: duration?.value ?? null,
    durationUnit: duration?.unit ?? null,
    routeCode: route.code,
    routeLabel: route.label,
    administrationAction: administrationActionFor(route.label, qty?.unitLabel ?? source.productForm ?? null),
    schemaVersion: REGIMEN_SUMMARY_FORMATTER_VERSION,
  };
}

function renderDose(regimen: StructuredSuggestedRegimen): string {
  if (regimen.doseMinimum == null || !regimen.doseUnitLabel) return '';
  if (regimen.doseMaximum != null && regimen.doseMaximum !== regimen.doseMinimum) {
    return `${formatNumber(regimen.doseMinimum)}–${formatNumber(regimen.doseMaximum)} ${regimen.doseUnitLabel}`;
  }
  return `${formatMassLabel(regimen.doseMinimum, regimen.doseUnitLabel)}`;
}

function renderTiming(timing: RegimenTiming | null): string {
  if (!timing) return '';
  if (timing.type === 'EVENT') return timing.eventLabel;
  if (timing.type === 'ONCE') return timing.label;
  if (timing.type === 'FIXED_INTERVAL') {
    const unitName = (count: number) =>
      count === 1
        ? timing.intervalUnit.toLowerCase()
        : `${timing.intervalUnit.toLowerCase()}s`;
    if (timing.intervalMaximum && timing.intervalMaximum !== timing.intervalValue) {
      return `every ${formatNumber(timing.intervalValue)}–${formatNumber(timing.intervalMaximum)} ${unitName(timing.intervalMaximum)}`;
    }
    return `every ${formatNumber(timing.intervalValue)} ${unitName(timing.intervalValue)}`;
  }
  if (timing.type === 'TIMES_PER_PERIOD') {
    if (timing.periodUnit === 'DAY' && timing.period === 1) {
      if (timing.frequency === 1) return 'once daily';
      if (timing.frequency === 2) return 'twice daily';
      if (timing.frequency === 3) return 'three times daily';
      if (timing.frequency === 4) return 'four times daily';
    }
    if (timing.periodUnit === 'WEEK' && timing.period === 1) {
      if (timing.frequency === 1) return 'once weekly';
      if (timing.frequency === 2) return 'twice weekly';
    }
    return `${timing.frequency} times per ${timing.periodUnit.toLowerCase()}`;
  }
  return timing.reviewedLabel;
}

const ROUTE_PHRASE: Record<string, string> = {
  oral: 'by mouth',
  po: 'by mouth',
  'by mouth': 'by mouth',
  topical: 'topically',
  'apply externally': 'externally',
  inhalation: 'by inhalation',
  inhaled: 'by inhalation',
  intranasal: 'intranasally',
  nasal: 'nasally',
  ophthalmic: 'into the eye',
  intraocular: 'into the eye',
  otic: 'into the ear',
  rectal: 'rectally',
  vaginal: 'vaginally',
  intramuscular: 'intramuscularly',
  subcutaneous: 'subcutaneously',
  intravenous: 'intravenously',
  intradermal: 'intradermally',
  injection: 'by injection',
  transdermal: 'to the skin',
  sublingual: 'under the tongue',
  buccal: 'between the cheek and gum',
};

function renderRoutePhrase(
  routeLabel: string | null,
  timingType?: RegimenTiming['type'],
  action?: string | null,
): string {
  if (!routeLabel || timingType === 'EVENT') return '';
  if (action === 'INJECT' || action === 'INHALE') return '';
  const key = compact(routeLabel).toLowerCase();
  if (ROUTE_PHRASE[key]) return ROUTE_PHRASE[key];
  return `via ${key}`;
}

function renderAdministrationHead(regimen: StructuredSuggestedRegimen): string {
  if (regimen.instructionalText) return regimen.instructionalText.replace(/\.$/, '');

  if (regimen.administrationQuantityMinimum != null && regimen.administrationUnitLabel) {
    const quantity = formatAdministrationQuantity({
      minimum: regimen.administrationQuantityMinimum,
      maximum: regimen.administrationQuantityMaximum,
      unitCode: regimen.administrationUnitCode || 'TABLET',
      unitLabel: regimen.administrationUnitLabel,
    });
    const ranged =
      regimen.administrationQuantityMaximum != null &&
      regimen.administrationQuantityMaximum !== regimen.administrationQuantityMinimum;
    const mass = regimen.administeredDoseMinimum;
    const massUnit = regimen.administeredDoseUnit;
    const showMass =
      !ranged &&
      regimen.administeredDoseStatus === 'CALCULATED' &&
      mass != null &&
      Boolean(massUnit);
    if (showMass && mass != null && massUnit) {
      return `${quantity} (${formatMassLabel(mass, massUnit)})`;
    }
    return quantity;
  }

  return renderDose(regimen);
}

function compactVerb(regimen: StructuredSuggestedRegimen): string {
  if (regimen.instructionalText) return '';
  const action = regimen.administrationAction;
  if (action === 'INSTILL') return 'Instill';
  if (action === 'INHALE') return 'Inhale';
  if (action === 'INJECT') return 'Inject';
  if (action === 'INSERT') return 'Insert';
  return '';
}

const COMPACT_PRIMARY_LIMIT = 88;

function renderStageLine(line: SuggestedRegimenLineSource, route: string | null): string {
  const quantity =
    parseAdministrationQuantity(
      line.doseTo ? `${line.doseFrom}–${line.doseTo}` : line.doseFrom,
      line.form,
    );
  const instructional = isInstructionalAdministration(line.doseFrom)
    ? compact(line.doseFrom)
    : '';
  const head =
    instructional ||
    (quantity ? formatAdministrationQuantity(quantity) : compact(line.doseFrom));
  const timing = renderTiming(
    parseOnceOnly(line.frequency ?? '') ||
      parseIntervalTiming(line.frequency ?? '') ||
      parseTimesPerPeriod(line.frequency ?? '') ||
      parseCustomTiming(line.frequency ?? ''),
  );
  const duration = parseDuration(lineDuration(line) ?? '');
  const durationText = duration
    ? duration.qualifier === 'UP_TO'
      ? `up to ${duration.value} ${duration.unit.toLowerCase()}s`.replace(/1 days/, '1 day')
      : `${duration.value} ${duration.unit.toLowerCase()}${duration.value === 1 ? '' : 's'}`
    : '';
  const prn = line.prn ? 'as needed' : '';
  const routePhrase = renderRoutePhrase(route, undefined);
  return [compactVerb({ ...EMPTY_REGIMEN, administrationAction: administrationActionFor(route, quantity?.unitLabel ?? null) }), head, routePhrase, timing, prn, durationText ? `for ${durationText}` : '']
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function renderCompactRegimenPrimary(regimen: StructuredSuggestedRegimen): string {
  const timingLabel = renderTiming(regimen.timing);
  const head = renderAdministrationHead(regimen);
  const verb = compactVerb(regimen);
  const route = renderRoutePhrase(
    regimen.routeLabel,
    regimen.timing?.type,
    regimen.administrationAction,
  );
  const prn =
    regimen.prn &&
    regimen.timing?.type !== 'EVENT' &&
    !regimen.repeatAllowed &&
    timingLabel !== 'as needed'
      ? 'as needed'
      : '';
  const chunks: string[] = [];
  const lead = [verb, head, route, timingLabel, prn].filter(Boolean).join(' ');
  if (lead) chunks.push(lead);

  if (
    regimen.repeatAllowed &&
    regimen.minimumRepeatIntervalValue &&
    regimen.minimumRepeatIntervalUnit
  ) {
    chunks.push(
      `May repeat after at least ${renderInterval(
        regimen.minimumRepeatIntervalValue,
        regimen.minimumRepeatIntervalUnit,
      )}`,
    );
  }

  return chunks.filter(Boolean).join(' · ');
}

function renderInterval(
  value: number,
  unit: 'MINUTE' | 'HOUR' | 'DAY',
): string {
  const label = value === 1 ? unit.toLowerCase() : `${unit.toLowerCase()}s`;
  return `${formatNumber(value)} ${label}`;
}

function renderDuration(regimen: StructuredSuggestedRegimen): string | null {
  if (
    regimen.durationQualifier === 'NONE' ||
    regimen.durationValue == null ||
    !regimen.durationUnit
  ) {
    return null;
  }
  const unit =
    regimen.durationValue === 1
      ? regimen.durationUnit.toLowerCase()
      : `${regimen.durationUnit.toLowerCase()}s`;
  const amount = `${formatNumber(regimen.durationValue)} ${unit}`;
  if (regimen.durationQualifier === 'UP_TO') return `up to ${amount}`;
  if (regimen.durationQualifier === 'AT_LEAST') return `at least ${amount}`;
  return amount;
}

export function renderCompactRegimenSecondary(
  regimen: StructuredSuggestedRegimen,
): string | null {
  if (
    regimen.maximumDoseValue != null &&
    regimen.maximumDoseUnitLabel &&
    regimen.maximumDosePeriodValue != null &&
    regimen.maximumDosePeriodUnit
  ) {
    return `Maximum ${formatNumber(regimen.maximumDoseValue)} ${
      regimen.maximumDoseUnitLabel
    } in ${renderInterval(
      regimen.maximumDosePeriodValue,
      regimen.maximumDosePeriodUnit,
    )}`;
  }
  const duration = renderDuration(regimen);
  return duration ? duration.replace(/^u/, 'U') : null;
}

export function renderExpandedSuggestedRegimen(
  regimen: StructuredSuggestedRegimen,
): string {
  const sentences: string[] = [];
  const head = [
    compactVerb(regimen),
    renderAdministrationHead(regimen),
    renderRoutePhrase(regimen.routeLabel, regimen.timing?.type, regimen.administrationAction),
    renderTiming(regimen.timing),
    regimen.prn &&
    regimen.timing?.type !== 'EVENT' &&
    !regimen.repeatAllowed &&
    renderTiming(regimen.timing) !== 'as needed'
      ? 'as needed'
      : '',
  ]
    .filter(Boolean)
    .join(' ');
  if (head) {
    const duration = renderDuration(regimen);
    sentences.push(`${head}${duration ? ` for ${duration}` : ''}.`);
  }
  if (
    regimen.repeatAllowed &&
    regimen.minimumRepeatIntervalValue &&
    regimen.minimumRepeatIntervalUnit
  ) {
    sentences.push(
      `If needed, the dose may be repeated after at least ${renderInterval(
        regimen.minimumRepeatIntervalValue,
        regimen.minimumRepeatIntervalUnit,
      )}.`,
    );
  }
  const maximum = renderCompactRegimenSecondary(regimen);
  if (maximum && /^Maximum /i.test(maximum)) {
    sentences.push(`${maximum}.`);
  }
  return sentences.join(' ').replace(/\s+/g, ' ').trim();
}

function omitRedundantSummarySecondary(
  primary: string,
  secondary: string | null,
): string | null {
  if (!secondary) return null;
  if (/^Maximum /i.test(secondary) || /^See details/i.test(secondary)) return secondary;
  const needle = secondary.replace(/^up to\s+/i, '').trim();
  if (!needle) return secondary;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`\\b${escaped}\\b`, 'i').test(primary)) return null;
  if (/\bthen\b/i.test(primary) && /\bfor\s+\d+/i.test(primary)) return null;
  return secondary;
}

export function renderRegimenPresentation(
  regimen: StructuredSuggestedRegimen,
): RenderedRegimenPresentation {
  const summaryPrimary = renderCompactRegimenPrimary(regimen);
  return {
    summaryPrimary,
    summarySecondary: omitRedundantSummarySecondary(
      summaryPrimary,
      renderCompactRegimenSecondary(regimen),
    ),
    expandedText: renderExpandedSuggestedRegimen(regimen),
  };
}

export function createRegimenFingerprint(regimen: StructuredSuggestedRegimen): string {
  return JSON.stringify(regimen);
}

function collectIssues(
  source: SuggestedRegimenSource,
  structured: StructuredSuggestedRegimen,
): RegimenSummaryIssue[] {
  const issues: RegimenSummaryIssue[] = [];
  const hasAbsolute =
    structured.administrationQuantityMinimum != null ||
    structured.doseMinimum != null ||
    Boolean(structured.instructionalText);
  if (isWeightBasedUnresolved(source, hasAbsolute && structured.doseMinimum != null)) {
    issues.push({
      code: 'WEIGHT_BASED_UNRESOLVED',
      message: 'Weight-based regimen requires review',
    });
  }
  if (!structured.instructionalText && structured.administrationQuantityMinimum == null && structured.doseMinimum == null) {
    issues.push({
      code: 'MISSING_QUANTITY',
      message: 'Dose quantity is missing',
    });
  }
  if (!structured.timing) {
    issues.push({
      code: 'MISSING_TIMING',
      message: 'Dosing schedule is incomplete',
    });
  }
  return issues;
}

function renderMultiStagePresentation(
  source: SuggestedRegimenSource,
  fallback: RenderedRegimenPresentation,
): RenderedRegimenPresentation {
  const lines = source.regimenLines ?? [];
  if (lines.length < 2) return fallback;
  const stages = lines.map((line) => renderStageLine(line, source.route ?? null));
  const joined = stages.filter(Boolean).join(', then ');
  if (!joined) return fallback;
  if (joined.length > COMPACT_PRIMARY_LIMIT) {
    return {
      summaryPrimary:
        lines.length === 2 ? 'Two-stage dosing schedule' : 'Multi-stage dosing schedule',
      summarySecondary: 'See details for the complete regimen',
      expandedText: `${joined}.`,
    };
  }
  return {
    summaryPrimary: joined,
    summarySecondary: omitRedundantSummarySecondary(joined, fallback.summarySecondary),
    expandedText: `${joined}.`,
  };
}

export function buildSuggestedRegimenBundle(
  source: SuggestedRegimenSource,
): SuggestedRegimenBundle {
  const structured = buildStructuredSuggestedRegimen(source);
  const issues = collectIssues(source, structured);
  const presentation = renderMultiStagePresentation(
    source,
    renderRegimenPresentation(structured),
  );
  const hasAdministration = Boolean(
    structured.instructionalText ||
      structured.administrationQuantityMinimum != null ||
      structured.doseMinimum != null,
  );
  const weightBlocked = issues.some((issue) => issue.code === 'WEIGHT_BASED_UNRESOLVED');
  const status: SuggestedRegimenStatus =
    hasAdministration && structured.timing && !weightBlocked ? 'READY' : 'REVIEW_REQUIRED';
  const reviewMessage =
    issues.find((issue) => issue.code === 'WEIGHT_BASED_UNRESOLVED')?.message ||
    'Regimen requires review';
  return {
    structured,
    presentation: {
      summaryPrimary: status === 'READY' ? presentation.summaryPrimary : '',
      summarySecondary: status === 'READY' ? presentation.summarySecondary : null,
      expandedText: status === 'READY' ? presentation.expandedText : reviewMessage,
    },
    fingerprint: createRegimenFingerprint(structured),
    status,
    issues,
    formatterVersion: REGIMEN_SUMMARY_FORMATTER_VERSION,
  };
}

const LEVEL_SENTENCE: Record<string, string> = {
  FIRST_LINE: 'First-line pathway option for this presentation.',
  SECOND_LINE: 'Second-line pathway option for this presentation.',
  ALTERNATIVE: 'Alternative pathway option when clinically appropriate.',
  ADJUNCTIVE: 'Add-on pathway option for this presentation.',
  SUPPORTIVE_CARE: 'Supportive pathway option for this presentation.',
  SPECIALIST: 'Specialist-pathway option for pharmacist review.',
};

export function formatWhyRecommended(source: SuggestedRegimenSource): string {
  const notes = pharmacistFacingCopy(source.clinicalNotes);
  if (notes && notes.length > 12) return notes;
  const level = compact(source.recommendationLevel).toUpperCase();
  return LEVEL_SENTENCE[level] || 'Pathway option for pharmacist review.';
}

export function formatEligibility(source: SuggestedRegimenSource): string {
  return (
    pharmacistFacingCopy(source.eligibility) ||
    pharmacistFacingCopy(source.clinicalIndication)
  );
}

export function formatMonitoringAndFollowUp(source: SuggestedRegimenSource): string {
  for (const raw of [source.followUpAdvice, source.monitoringReason, source.monitoring]) {
    const text = pharmacistFacingCopy(raw);
    if (text) return text;
  }
  return '';
}

/** Hide Excel workbooks, rule-file names, and Yes/No flags from pharmacist UI. */
export function pharmacistFacingCopy(text: string | null | undefined): string {
  const value = compact(text);
  if (!value) return '';
  if (YES_NO.test(value)) return '';
  if (isInternalDataSourceText(value)) return '';
  return value;
}

export function isInternalDataSourceText(text: string): boolean {
  return (
    /\.xlsx\b|\.xls\b/i.test(text) ||
    /baseline fallback/i.test(text) ||
    /\b(renal-rules|allergy-cross-reactivity-rules|lab-threshold-rules|drug-interactions|drug-disease-rules|pregnancy-rules|lactation-rules)\b/i.test(
      text,
    )
  );
}

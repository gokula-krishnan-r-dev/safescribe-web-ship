import type { DurationUnit, RegimenLineDraft } from './types';
import { frequencyDirectionPhrase } from './frequency-options';
import { resolveRouteValue } from './route-options';

const ROUTE_PHRASE: Record<string, { verb: string; where: string }> = {
  Oral: { verb: 'Take', where: 'by mouth' },
  'Mouth/Throat': { verb: 'Use', where: 'in the mouth or throat' },
  Buccal: { verb: 'Take', where: 'between the cheek and gum' },
  Topical: { verb: 'Apply', where: 'topically' },
  'Apply Externally': { verb: 'Apply', where: 'externally' },
  Wound: { verb: 'Apply', where: 'to the wound' },
  'Soaked Dressing': { verb: 'Apply', where: 'as a soaked dressing' },
  Inhalation: { verb: 'Inhale', where: 'by inhalation' },
  Inhaled: { verb: 'Inhale', where: 'by inhalation' },
  Sublingual: { verb: 'Take', where: 'under the tongue' },
  Translingual: { verb: 'Use', where: 'on the tongue' },
  Intranasal: { verb: 'Use', where: 'intranasally' },
  Nasal: { verb: 'Use', where: 'nasally' },
  'Nasal Prongs': { verb: 'Use', where: 'via nasal prongs' },
  Ophthalmic: { verb: 'Instill', where: 'into the eye' },
  Intraocular: { verb: 'Instill', where: 'into the eye' },
  Otic: { verb: 'Instill', where: 'into the ear' },
  Rectal: { verb: 'Insert', where: 'rectally' },
  Vaginal: { verb: 'Insert', where: 'vaginally' },
  Intramuscular: { verb: 'Inject', where: 'intramuscularly' },
  Subcutaneous: { verb: 'Inject', where: 'subcutaneously' },
  Intravenous: { verb: 'Inject', where: 'intravenously' },
  Intradermal: { verb: 'Inject', where: 'intradermally' },
  Injection: { verb: 'Inject', where: 'by injection' },
  Transdermal: { verb: 'Apply', where: 'to the skin' },
  Dental: { verb: 'Use', where: 'dentally' },
  Nasogastric: { verb: 'Give', where: 'via nasogastric tube' },
  'Gastrostomy Tube': { verb: 'Give', where: 'via gastrostomy tube' },
};

function routeDirection(route: string): { verb: string; where: string } {
  const resolved = resolveRouteValue(route) || route;
  return (
    ROUTE_PHRASE[resolved] ??
    ROUTE_PHRASE[route] ?? {
      verb: 'Use',
      where: resolved ? `via ${resolved.toLowerCase()}` : '',
    }
  );
}

const UNIT_LABEL: Record<DurationUnit, { one: string; many: string }> = {
  DAY: { one: 'day', many: 'days' },
  WEEK: { one: 'week', many: 'weeks' },
  MONTH: { one: 'month', many: 'months' },
};

function formNoun(form: string, plural: boolean): string {
  const raw = form.trim();
  if (!raw) return plural ? 'units' : 'unit';
  if (/^mL$/i.test(raw) || /^mg$/i.test(raw) || /^mcg$/i.test(raw) || /^g$/i.test(raw)) {
    return raw;
  }
  const key = raw.toLowerCase().replace(/\(e?s\)/gi, '').replace(/\s+/g, ' ').trim();
  const irregular: Record<string, { one: string; many: string }> = {
    puffs: { one: 'puff', many: 'puffs' },
    puff: { one: 'puff', many: 'puffs' },
    disks: { one: 'disk', many: 'disks' },
    units: { one: 'unit', many: 'units' },
    'international units': { one: 'international unit', many: 'international units' },
    suppositories: { one: 'suppository', many: 'suppositories' },
    suppository: { one: 'suppository', many: 'suppositories' },
  };
  const mapped = irregular[key];
  if (mapped) return plural ? mapped.many : mapped.one;
  const stripped = raw.replace(/\(e?s\)/gi, '');
  if (plural) {
    if (/s$/i.test(stripped) && !/ss$/i.test(stripped)) return stripped.toLowerCase();
    if (/ch$|sh$|x$|z$/i.test(stripped)) return `${stripped.toLowerCase()}es`;
    if (/y$/i.test(stripped) && !/[aeiou]y$/i.test(stripped)) {
      return `${stripped.slice(0, -1).toLowerCase()}ies`;
    }
    return `${stripped.toLowerCase()}s`;
  }
  return stripped.toLowerCase();
}

function isPositiveDoseNumber(value: string): boolean {
  const n = Number(value.trim());
  return value.trim() !== '' && Number.isFinite(n) && n > 0;
}

function isPluralDose(from: string, to: string | null): boolean {
  const b = to?.trim() ?? '';
  if (b && isPositiveDoseNumber(b)) return true;
  const n = Number(from);
  return !Number.isFinite(n) || n !== 1;
}

function dosePhrase(from: string, to: string | null): string {
  const a = from.trim();
  const b = to?.trim() ?? '';
  const fromOk = isPositiveDoseNumber(a);
  const toOk = Boolean(b) && isPositiveDoseNumber(b);
  if (fromOk && toOk) return `${a} to ${b}`;
  if (fromOk) return a;
  return '1';
}

function isInstructionalDose(from: string): boolean {
  const value = from.trim();
  if (!value) return false;
  if (/^\d/.test(value)) return false;
  return /[a-zA-Z]/.test(value);
}

function durationPhrase(value: string | null, unit: DurationUnit | null): string {
  const v = value?.trim();
  if (!v || !unit) return '';
  const n = Number(v);
  const labels = UNIT_LABEL[unit];
  const word = n === 1 ? labels.one : labels.many;
  return `for ${v} ${word}`;
}

function linePhrase(line: RegimenLineDraft, route: string, capitalize: boolean): string {
  const mapped = routeDirection(route);
  if (isInstructionalDose(line.doseFrom)) {
    let instruction = line.doseFrom.trim().replace(/\.$/, '');
    if (
      /topical/i.test(route) &&
      /^apply\b/i.test(instruction) &&
      !/affected area/i.test(instruction)
    ) {
      instruction = `${instruction} to the affected area`;
    }
    if (capitalize) {
      instruction = instruction.charAt(0).toUpperCase() + instruction.slice(1);
    }
    const freq = frequencyDirectionPhrase(line.frequency).toLowerCase();
    const parts = [instruction];
    if (mapped.where && !instruction.toLowerCase().includes(mapped.where)) {
      parts.push(mapped.where);
    }
    if (freq) parts.push(freq);
    if (line.prn) parts.push('as needed');
    const duration = durationPhrase(line.durationValue, line.durationUnit);
    if (duration) parts.push(duration);
    return parts.filter(Boolean).join(' ');
  }
  const dose = dosePhrase(line.doseFrom, line.doseTo);
  const noun = formNoun(line.form, isPluralDose(line.doseFrom, line.doseTo));
  const freq = frequencyDirectionPhrase(line.frequency).toLowerCase();
  const parts = [
    capitalize ? mapped.verb : mapped.verb.toLowerCase(),
    dose,
    noun,
  ];
  if (mapped.where) parts.push(mapped.where);
  if (freq) parts.push(freq);
  if (line.prn) parts.push('as needed');
  const duration = durationPhrase(line.durationValue, line.durationUnit);
  if (duration) parts.push(duration);
  return parts.filter(Boolean).join(' ');
}

export function composePatientDirections(
  lines: RegimenLineDraft[],
  route: string,
): string {
  const usable = lines.filter((l) => l.doseFrom.trim() || l.form.trim());
  if (!usable.length) return '';
  const first = linePhrase(usable[0], route, true);
  const rest = usable.slice(1).map((l) => linePhrase(l, route, false));
  const sentence = rest.length ? `${first}, then ${rest.join(', then ')}` : first;
  return sentence.endsWith('.') ? sentence : `${sentence}.`;
}

export function composeDeviceDirections(input: {
  useSchedule?: string;
  durationDisplay?: string;
  deviceType?: string;
}): string {
  const schedule = input.useSchedule?.trim();
  const duration = input.durationDisplay?.trim();
  const type = input.deviceType?.trim().toLowerCase();
  const inhalerSpacer =
    type?.includes('inhaler') ||
    type?.includes('spacer') ||
    schedule?.toLowerCase() === 'with each inhaler dose';

  if (schedule?.toLowerCase() === 'with each inhaler dose') {
    return "Use with each dose of the prescribed inhaler. Follow the manufacturer's cleaning instructions.";
  }

  const parts: string[] = [];
  if (schedule) {
    parts.push(
      schedule.toLowerCase().startsWith('use')
        ? schedule.replace(/^\w/, (c) => c.toUpperCase())
        : `Use ${schedule.toLowerCase()}`,
    );
  } else if (type) {
    parts.push(`Use the ${type} as directed`);
  } else {
    parts.push('Use as directed');
  }
  if (duration && duration.toLowerCase() !== 'ongoing') {
    parts.push(`for ${duration.toLowerCase()}`);
  }
  if (inhalerSpacer) {
    const text = parts.join('. ');
    const withCleaning = text.endsWith('.') ? text : `${text}.`;
    return `${withCleaning} Follow the manufacturer's cleaning instructions.`;
  }
  const joined = parts.join(' ');
  return joined.endsWith('.') ? joined : `${joined}.`;
}

export function doseRangeInvalid(from: string, to: string | null): string | null {
  if (to == null) return null;
  const a = Number(from);
  const b = Number(to);
  if (!from.trim() || !to.trim()) return 'Enter both ends of the dose range.';
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) {
    return 'Dose range values must be positive numbers.';
  }
  if (b < a) return 'Maximum dose must be equal to or greater than minimum dose.';
  return null;
}

/**
 * Structured PCP follow-up plan. The LLM must not write Follow-up prose;
 * the backend renders one continuity-of-care sentence from confirmed fields.
 */

export interface PcpFollowUpPlan {
  responsible_party: string | null;
  timeframe: string | null;
  primary_monitoring_target: string | null;
  clinically_important_additional_parameter: string | null;
  expected_outcome: string | null;
  action_if_not_met: string | null;
  responsibility_override_confirmed: boolean;
  pharmacist_confirmed?: boolean;
  shared_responsibilities?: {
    pharmacist?: string | null;
    pcp?: string | null;
  } | null;
}

export interface PcpFollowUpSource {
  consultationMode?: string | null;
  counsellingNotes?: unknown;
  referralCompleted?: boolean;
  referralReason?: string | null;
  explicitPlan?: Partial<PcpFollowUpPlan> | null;
}

const COUNSELLING_LEAKAGE =
  /early initiation|start treatment as soon|as soon as possible after|most recurrent episodes heal|most outbreaks heal|outbreaks? heal|heal (?:in|within)|natural history|usual healing|self-?care|side[- ]effect|how to (?:use|take|apply)|when to start treatment|disease education|medication administration|avoid kissing|wash hands|sharing (?:drinks|utensils|personal items)/i;

const NATURAL_HISTORY_DURATION =
  /\bheal(?:s|ing|ed)?\b|\bwithout treatment\b|\bnatural history\b|\busual (?:course|healing|duration)\b|\boutbreaks?\b|\bepisode(?:s)? (?:heal|last|resolve)/i;

const EXPLICIT_FOLLOW_UP =
  /\bfollow[- ]?up\b|\breassess\b|\breturn (?:in|within|after)\b|\breview in\b|\bcheck (?:back|in)\b/;

const INCOMPLETE_FRAGMENT =
  /^(when treating the current episode|n\/?a|none|null|undefined|-|—)\.?$/i;

const PLACEHOLDER = /^(add a short patient-facing point|n\/?a|none|null|undefined|-|—)$/i;

function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/[®™©]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function clean(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function ensurePeriod(text: string): string {
  const t = clean(text);
  if (!t) return '';
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

export function isPharmacistPrescribingEncounter(
  consultationMode?: string | null,
): boolean {
  const mode = String(consultationMode ?? '').trim();
  return mode !== 'DOCUMENTATION_REFERRAL';
}

export function emptyPcpFollowUpPlan(): PcpFollowUpPlan {
  return {
    responsible_party: null,
    timeframe: null,
    primary_monitoring_target: null,
    clinically_important_additional_parameter: null,
    expected_outcome: null,
    action_if_not_met: null,
    responsibility_override_confirmed: false,
    pharmacist_confirmed: false,
    shared_responsibilities: null,
  };
}

export function isCounsellingLeakageFragment(text: string): boolean {
  const t = clean(text);
  if (!t || PLACEHOLDER.test(t) || INCOMPLETE_FRAGMENT.test(t)) return true;
  return COUNSELLING_LEAKAGE.test(t);
}

export function pcpFollowUpPlanIsComplete(plan: PcpFollowUpPlan | null | undefined): boolean {
  if (!plan) return false;
  return Boolean(
    clean(plan.responsible_party) &&
      clean(plan.timeframe) &&
      clean(plan.primary_monitoring_target),
  );
}

export function pcpFollowUpPlanHasContent(plan: PcpFollowUpPlan | null | undefined): boolean {
  if (!plan) return false;
  return Boolean(
    clean(plan.timeframe) ||
      clean(plan.primary_monitoring_target) ||
      clean(plan.action_if_not_met) ||
      clean(plan.expected_outcome) ||
      clean(plan.clinically_important_additional_parameter),
  );
}

const TIMEFRAME_RE =
  /\b(?:in|at|within|after|by)\s+(\d+)\s*(-)?\s*(day|days|week|weeks|hour|hours)\b/i;
const BARE_INTERVAL_RE = /\b(\d+)\s*(-)?\s*(day|days|week|weeks)\b/i;
const SEVEN_DAY_RE = /\bseven[-\s]?day\b/i;

export function normalizePcpTimeframe(raw: string): string | null {
  const t = clean(raw);
  if (!t || isCounsellingLeakageFragment(t)) return null;
  if (SEVEN_DAY_RE.test(t) && !TIMEFRAME_RE.test(t) && !BARE_INTERVAL_RE.test(t)) {
    return 'in 7 days';
  }
  const tagged = t.match(TIMEFRAME_RE);
  if (tagged) {
    const n = tagged[1];
    const unit = tagged[3].toLowerCase();
    const prep = /^within\b/i.test(tagged[0]) ? 'within' : 'in';
    return `${prep} ${n} ${unit}`;
  }
  const bare = t.match(BARE_INTERVAL_RE);
  if (bare) {
    const n = bare[1];
    const unit = bare[3].toLowerCase();
    return `in ${n} ${unit}`;
  }
  return null;
}

/** Sentence form: "in 7 days", never "7 days" / "in in 7 days" / "at 7 days". */
export function formatPcpTimeframeForSentence(raw: string): string {
  const collapsed = clean(raw).replace(/^(in\s+)+/i, 'in ');
  if (/^within\s+/i.test(collapsed)) return collapsed;
  const normalized = normalizePcpTimeframe(collapsed);
  if (normalized) {
    return normalized.replace(/^(at|after|by)\s+/i, 'in ');
  }
  return collapsed ? `in ${collapsed.replace(/^(in|at|after|by)\s+/i, '')}` : '';
}

function isExplicitFollowUpInstruction(text: string): boolean {
  return EXPLICIT_FOLLOW_UP.test(clean(text));
}

/** Follow-up WHEN comes from monitoring instructions, never from healing/illness duration. */
function extractFollowUpTimeframe(text: string): string | null {
  const t = clean(text);
  if (!t) return null;
  if (NATURAL_HISTORY_DURATION.test(t) && !isExplicitFollowUpInstruction(t)) {
    return null;
  }
  return normalizePcpTimeframe(t);
}

function extractMonitoringTarget(text: string): string | null {
  const t = clean(text);
  if (!t) return null;
  if (isCounsellingLeakageFragment(t) && !isExplicitFollowUpInstruction(t)) return null;
  const toAssess = t.match(/\b(?:to\s+)?assess(?:ment)?\s+(?:of\s+)?([^.;]+)/i);
  if (toAssess) {
    const target = clean(toAssess[1])
      .replace(/\.$/, '')
      .replace(/\s+and\s+treatment tolerability.*$/i, '')
      .replace(/\s*\/\s*resolution/i, ' or resolution')
      .trim();
    if (target) return target;
  }
  if (/lesion improvement\s*(?:\/|or)\s*resolution/i.test(t)) {
    return 'lesion improvement or resolution';
  }
  if (/lesion improvement/i.test(t)) return 'lesion improvement';
  if (/persistent symptoms/i.test(t)) return 'persistent symptoms';
  if (/symptom(?:s)?(?:\s+improvement|\s+resolution| improvement or resolution)/i.test(t)) {
    return 'symptom improvement or resolution';
  }
  if (/clinical improvement/i.test(t)) return 'clinical improvement';
  if (/\bimprov/i.test(t) && /symptom/i.test(t)) return 'symptom improvement';
  return null;
}

function extractSafetyParameter(text: string): string | null {
  const t = clean(text);
  if (!t) return null;
  if (isCounsellingLeakageFragment(t) && !isExplicitFollowUpInstruction(t)) return null;
  if (/treatment tolerab/i.test(t) || /\btolerability\b/i.test(t)) {
    return 'treatment tolerability';
  }
  if (/adverse|side[- ]effect|safety|toxicity/i.test(t) && /assess|monitor|review/i.test(t)) {
    return clean(t).replace(/\.$/, '');
  }
  return null;
}

function extractExpectedOutcome(text: string): string | null {
  const t = clean(text);
  if (!t) return null;
  if (isCounsellingLeakageFragment(t) && !isExplicitFollowUpInstruction(t)) return null;
  if (!/\bexpected\b|\bsignificant improvement\b/i.test(t)) return null;
  if (/significant improvement/i.test(t)) return 'significant improvement';
  return null;
}

function extractActionIfNotMet(text: string): string | null {
  const t = clean(text);
  if (!t) return null;
  if (isCounsellingLeakageFragment(t) && !isExplicitFollowUpInstruction(t)) return null;
  if (/refer(?:ral)?\b/i.test(t) && /not (?:resolv|improv)|persist|worsen/i.test(t)) {
    return 'referral advised if symptoms are not resolving';
  }
  if (/seek (?:reassessment|care|assessment|medical)/i.test(t) && /worsen|not improv|do not improve|persist/i.test(t)) {
    return t.replace(/\.$/, '');
  }
  if (/if (?:symptoms? )?(?:are )?not resolv/i.test(t)) {
    return 'referral advised if symptoms are not resolving';
  }
  return null;
}

function explicitResponsibleParty(plan: Partial<PcpFollowUpPlan> | null | undefined): {
  party: string | null;
  override: boolean;
} {
  const party = clean(plan?.responsible_party);
  const override = plan?.responsibility_override_confirmed === true && Boolean(party);
  if (override) return { party, override: true };
  return { party: party || null, override: false };
}

function counsellingFollowUpTexts(notes: unknown): string[] {
  const n = (notes ?? {}) as {
    counselling_status?: string;
    followups?: Array<{
      timeframe?: string | null;
      condition?: string | null;
      action?: string | null;
    }>;
    plan?: {
      status?: string;
      followups?: Array<{
        timeframe?: string | null;
        condition?: string | null;
        action?: string | null;
      }>;
      sections?: Array<{
        section_key?: string;
        items?: Array<{ text?: string }>;
      }>;
    };
    confirmed_counselling?: Array<{
      section_key?: string;
      bullets?: string[];
      items?: Array<{ text?: string }>;
    }>;
    sections?: Array<{
      category?: string;
      section_key?: string;
      bullets?: string[];
      points?: Array<{ point?: string }>;
    }>;
  };

  const confirmed =
    n.plan?.status === 'REVIEWED' || n.counselling_status === 'confirmed';
  if (!confirmed) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw?: string | null) => {
    const t = clean(raw);
    if (!t || PLACEHOLDER.test(t) || INCOMPLETE_FRAGMENT.test(t)) return;
    // Keep explicit monitoring instructions even when the same bullet also
    // mentions healing/self-care language that would otherwise be leakage.
    if (isCounsellingLeakageFragment(t) && !isExplicitFollowUpInstruction(t)) return;
    const key = fold(t);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };

  for (const row of n.followups ?? n.plan?.followups ?? []) {
    push([row.action, row.condition, row.timeframe].filter(Boolean).join(' '));
    push(row.timeframe);
    push(row.condition);
    push(row.action);
  }

  const confirmedRow = n.confirmed_counselling?.find((s) => s.section_key === 'FOLLOW_UP');
  for (const b of confirmedRow?.bullets ?? []) push(b);
  for (const item of confirmedRow?.items ?? []) {
    push(item.text);
    push((item as { point?: string }).point);
  }

  const planSection = n.plan?.sections?.find((s) => s.section_key === 'FOLLOW_UP');
  for (const item of planSection?.items ?? []) {
    push(item.text);
    push((item as { point?: string }).point);
  }

  for (const section of n.sections ?? []) {
    if (section.section_key === 'FOLLOW_UP' || /follow|seek|when to/i.test(section.category ?? '')) {
      for (const b of section.bullets ?? []) push(b);
      for (const p of section.points ?? []) push(p.point);
    }
  }

  return out;
}

function applyFragmentToPlan(plan: PcpFollowUpPlan, text: string): void {
  if (!plan.timeframe) {
    const tf = extractFollowUpTimeframe(text);
    if (tf) plan.timeframe = tf;
  }
  if (!plan.primary_monitoring_target) {
    const target = extractMonitoringTarget(text);
    if (target) plan.primary_monitoring_target = target;
  }
  if (!plan.clinically_important_additional_parameter) {
    const safety = extractSafetyParameter(text);
    if (safety) plan.clinically_important_additional_parameter = safety;
  }
  if (!plan.expected_outcome) {
    const outcome = extractExpectedOutcome(text);
    if (outcome) plan.expected_outcome = outcome;
  }
  if (!plan.action_if_not_met) {
    const action = extractActionIfNotMet(text);
    if (action) plan.action_if_not_met = action;
  }
}

export function mergePcpFollowUpPlan(
  base: PcpFollowUpPlan,
  extra?: Partial<PcpFollowUpPlan> | null,
): PcpFollowUpPlan {
  if (!extra) return base;
  const next: PcpFollowUpPlan = { ...base };
  for (const key of [
    'responsible_party',
    'timeframe',
    'primary_monitoring_target',
    'clinically_important_additional_parameter',
    'expected_outcome',
    'action_if_not_met',
  ] as const) {
    const value = clean(extra[key]);
    if (value) next[key] = value;
  }
  if (extra.responsibility_override_confirmed === true) {
    next.responsibility_override_confirmed = true;
  }
  if (extra.pharmacist_confirmed === true) {
    next.pharmacist_confirmed = true;
  }
  if (extra.shared_responsibilities) {
    next.shared_responsibilities = extra.shared_responsibilities;
  }
  return next;
}

export function buildPcpFollowUpPlan(source: PcpFollowUpSource): PcpFollowUpPlan {
  let plan = emptyPcpFollowUpPlan();
  const explicit = explicitResponsibleParty(source.explicitPlan);
  plan = mergePcpFollowUpPlan(plan, source.explicitPlan ?? null);

  const fragments = counsellingFollowUpTexts(source.counsellingNotes);
  const followUpFirst = [
    ...fragments.filter(isExplicitFollowUpInstruction),
    ...fragments.filter((text) => !isExplicitFollowUpInstruction(text)),
  ];
  for (const text of followUpFirst) {
    applyFragmentToPlan(plan, text);
  }

  if (
    !plan.primary_monitoring_target &&
    plan.expected_outcome &&
    /improv/i.test(plan.expected_outcome)
  ) {
    plan.primary_monitoring_target = /symptom/i.test(plan.expected_outcome)
      ? 'symptom improvement'
      : 'clinical improvement';
  }

  const prescribing = isPharmacistPrescribingEncounter(source.consultationMode);
  if (explicit.override && explicit.party) {
    plan.responsible_party = explicit.party;
    plan.responsibility_override_confirmed = true;
  } else if (prescribing && pcpFollowUpPlanHasContent(plan)) {
    plan.responsible_party = plan.responsible_party || 'Pharmacist';
    plan.responsibility_override_confirmed = false;
  }

  if (
    plan.expected_outcome &&
    plan.primary_monitoring_target &&
    fold(plan.expected_outcome).includes(fold(plan.primary_monitoring_target).slice(0, 12))
  ) {
    // Avoid repeating "improvement" in both target and expected outcome.
    plan.expected_outcome = null;
  }

  plan.pharmacist_confirmed = pcpFollowUpPlanIsComplete(plan);
  return plan;
}

function normalizeResponsiblePartyPhrase(party: string): string {
  const t = clean(party);
  if (/^pharmacist$/i.test(t)) return 'Pharmacist';
  if (/primary care|pcp|family (?:doctor|physician)|physician/i.test(t)) {
    return 'Primary care provider';
  }
  if (/^shared$/i.test(t)) return 'Shared';
  return t;
}

function normalizeActionPhrase(action: string): string {
  const t = clean(action).replace(/\.$/, '');
  if (/refer/i.test(t) && /not resolv|not improv/i.test(t)) {
    return 'referral advised if symptoms are not resolving';
  }
  return t;
}

export function renderPcpFollowUpSection(
  plan: PcpFollowUpPlan | null | undefined,
  opts?: { referralCompleted?: boolean; referralReason?: string | null },
): string {
  if (pcpFollowUpPlanIsComplete(plan) && plan && plan.pharmacist_confirmed !== false) {
    const party = normalizeResponsiblePartyPhrase(plan.responsible_party || 'Pharmacist');
    const timeframe = formatPcpTimeframeForSentence(plan.timeframe || '');
    const target = clean(plan.primary_monitoring_target);
    const extra = clean(plan.clinically_important_additional_parameter);
    const action = plan.action_if_not_met
      ? normalizeActionPhrase(plan.action_if_not_met)
      : '';

    let sentence = `${party} follow-up planned ${timeframe} to assess ${target}`;
    if (extra && fold(extra) !== fold(target)) {
      sentence += ` and ${extra}`;
    }
    if (action) sentence += `; ${action}`;
    return ensurePeriod(sentence);
  }

  if (opts?.referralCompleted) {
    const reason = clean(opts.referralReason);
    if (reason && !/red-flag criteria were reviewed/i.test(reason)) {
      return ensurePeriod(reason);
    }
    return 'Referral for further medical assessment was completed.';
  }

  return '';
}

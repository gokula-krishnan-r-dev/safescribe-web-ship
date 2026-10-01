import { escapeHtml, toEditorHtml } from './tiptap-text';
import { inlineMarkdownToHtml, isTreatmentLine } from './clinical-markdown';
import {
  HANDOUT_LANGUAGE_OPTIONS,
  PATIENT_HANDOUT_SECTION_KEYS,
  assessmentSentence,
  carePlanTitle,
  handoutLanguageOption,
  handoutSectionLabel,
  isRtlHandoutLanguage,
  normalizeHandoutLanguage,
  questionsContactLine,
  type HandoutLanguageOption,
  type PatientHandoutSectionKey,
} from '@safescript/shared';

export {
  HANDOUT_LANGUAGE_OPTIONS,
  PATIENT_HANDOUT_SECTION_KEYS,
  assessmentSentence,
  carePlanTitle,
  handoutLanguageOption,
  handoutSectionLabel,
  isRtlHandoutLanguage,
  normalizeHandoutLanguage,
  questionsContactLine,
};
export type { HandoutLanguageOption, PatientHandoutSectionKey };

const DOCUMENT_HTML_KEY = 'documentHtml';

/**
 * Canonical Patient Care Summary / Patient Handout format.
 *
 * One schema drives Notion, PDF, fax, print, and copy.
 * Spec: SafeScribe Patient Handout Revised Developer Instructions v2.0
 * Visual: `{Condition} — Your Care Plan` Word sample.
 */

export interface PopulatedHandoutSection {
  key: PatientHandoutSectionKey;
  label: string;
  value: string;
}

const LEGACY_LABEL_ALIASES: Record<string, PatientHandoutSectionKey> = {
  'your care plan': 'assessment',
  'what we assessed': 'assessment',
  'what it means': 'assessment',
  'reason for visit': 'assessment',
  'how to use your medicine': 'treatment',
  'your treatment': 'treatment',
  'treatment provided': 'treatment',
  'how to take it': 'treatment',
  'medication instructions': 'treatment',
  'self-care & non-drug measures': 'selfCare',
  'what you can do': 'selfCare',
  'things you can do': 'selfCare',
  'home care': 'selfCare',
  'self-care': 'selfCare',
  'side effects and precautions': 'seekCare',
  'things to watch for': 'seekCare',
  'when to get help': 'seekCare',
  'seek medical care if': 'seekCare',
  'emergency warning signs': 'seekCare',
  'next steps': 'followUp',
  'questions / pharmacy contact': 'questionsContact',
  'pharmacy contact': 'questionsContact',
  questions: 'questionsContact',
};

export function editableHandoutFields(language?: string | null): Array<{
  key: PatientHandoutSectionKey;
  label: string;
}> {
  return PATIENT_HANDOUT_SECTION_KEYS.map((key) => ({
    key,
    label: handoutSectionLabel(key, language),
  }));
}

export function resolveHandoutTitle(fields: Record<string, string>): string {
  const canonical = upgradePatientHandoutFields(fields);
  const stored = canonical.documentTitle?.trim();
  if (stored) return stored;
  return carePlanTitle(canonical.diagnosis, canonical.handoutLanguage);
}

export function listPopulatedHandoutSections(
  fields: Record<string, string>,
): PopulatedHandoutSection[] {
  const canonical = upgradePatientHandoutFields(fields);
  const language = canonical.handoutLanguage;
  const out: PopulatedHandoutSection[] = [];
  for (const key of PATIENT_HANDOUT_SECTION_KEYS) {
    const value = canonical[key]?.trim();
    if (!value) continue;
    out.push({
      key,
      label: handoutSectionLabel(key, language),
      value,
    });
  }
  return out;
}

/** Plain text used for copy, fax-adjacent clipboard, and snapshot tests. */
export function buildPatientHandoutPlainText(fields: Record<string, string>): string {
  const title = resolveHandoutTitle(fields);
  const lines: string[] = [title, ''];
  for (const section of listPopulatedHandoutSections(fields)) {
    lines.push(section.label);
    const items = section.value
      .split(/\n+/)
      .map((l) => l.replace(/^[•\-\u2022*]\s*/, '').trim())
      .filter(Boolean);
    if (section.key !== 'questionsContact' && (section.key === 'treatment' || items.length > 1)) {
      for (const item of items) lines.push(`• ${item}`);
    } else {
      lines.push(section.value);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

export function fieldsToHandoutNotionHtml(fields: Record<string, string>): string {
  const title = resolveHandoutTitle(fields);
  const parts: string[] = [`<h1>${escapeHtml(title)}</h1>`];
  for (const section of listPopulatedHandoutSections(fields)) {
    parts.push(
      `<h2 data-field="${escapeHtml(section.key)}">${escapeHtml(section.label)}</h2>`,
      section.key === 'questionsContact'
        ? toEditorHtml(section.value)
        : toHandoutSectionHtml(
            section.value,
            section.key === 'treatment' ||
              section.key === 'expectedResponse' ||
              section.key === 'selfCare' ||
              section.key === 'seekCare' ||
              section.key === 'followUp',
          ),
    );
  }
  return parts.join('');
}

/** Insert confirmed counselling cards into a saved draft that omitted them. */
export function ensureHandoutHtmlHasCounsellingCards(
  html: string,
  fields: Record<string, string>,
): string {
  const populated = listPopulatedHandoutSections(fields);
  const missing = populated.filter((section) => {
    if (section.key === 'assessment' || section.key === 'questionsContact') {
      return false;
    }
    return (
      !html.includes(`data-field="${section.key}"`) &&
      !html.includes(`data-field='${section.key}'`)
    );
  });
  if (!missing.length) return html;
  const extra = missing
    .map(
      (section) =>
        `<h2 data-field="${escapeHtml(section.key)}">${escapeHtml(section.label)}</h2>${toHandoutSectionHtml(
          section.value,
          true,
        )}`,
    )
    .join('');
  const questionsRe = /<h2[^>]*data-field=["']questionsContact["'][^>]*>/i;
  if (questionsRe.test(html)) {
    return html.replace(questionsRe, `${extra}$&`);
  }
  return `${html}${extra}`;
}

export function ensureHandoutHtmlHasPharmacyContact(
  html: string,
  questionsContact: string,
  language?: string | null,
): string {
  const value = questionsContact.trim();
  if (!html.trim() || !value) return html;
  const body = toEditorHtml(value);
  const heading = `<h2 data-field="questionsContact">${escapeHtml(
    handoutSectionLabel('questionsContact', language),
  )}</h2>`;
  const headingRe = /<h2[^>]*data-field=["']questionsContact["'][^>]*>[\s\S]*?<\/h2>/i;
  if (headingRe.test(html)) {
    return html.replace(
      /(<h2[^>]*data-field=["']questionsContact["'][^>]*>[\s\S]*?<\/h2>)([\s\S]*?)(?=<h2\b|$)/i,
      `${heading}${body}`,
    );
  }
  return `${html}${heading}${body}`;
}

export function toHandoutSectionHtml(value: string, asList = false): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '<p></p>';

  const lines = raw
    .split(/\n+/)
    .map((line) => line.replace(/^(?:[•\u2022]|\-(?!-)|\*(?!\*))\s+/, '').trim())
    .filter(Boolean);

  const looksLikeList =
    asList ||
    (lines.length > 1 &&
      (raw.includes('•') ||
        raw.includes('\n') ||
        lines.every((l) => l.length < 140)));

  if (looksLikeList && lines.length >= 1) {
    const intro =
      !asList && lines[0].endsWith(':') && lines.length > 2 && !isTreatmentLine(lines[0])
        ? lines[0]
        : null;
    const items = intro ? lines.slice(1) : lines;
    const introHtml = intro ? `<p>${inlineMarkdownToHtml(intro)}</p>` : '';
    const ordered =
      items.length >= 2 &&
      (items.every(isTreatmentLine) || items.every((item) => /^\d+[.)]\s+/.test(item)));
    const tag = ordered ? 'ol' : 'ul';
    return `${introHtml}<${tag}>${items
      .map((item) => `<li><p>${inlineMarkdownToHtml(item.replace(/^\d+[.)]\s+/, ''))}</p></li>`)
      .join('')}</${tag}>`;
  }

  return toEditorHtml(raw);
}

export function handoutLabelToKey(label: string): PatientHandoutSectionKey | undefined {
  const normalized = label.replace(/\s+/g, ' ').trim().toLowerCase();
  if (LEGACY_LABEL_ALIASES[normalized]) return LEGACY_LABEL_ALIASES[normalized];
  for (const option of HANDOUT_LANGUAGE_OPTIONS) {
    for (const key of PATIENT_HANDOUT_SECTION_KEYS) {
      if (handoutSectionLabel(key, option.value).replace(/\s+/g, ' ').trim().toLowerCase() === normalized) {
        return key;
      }
    }
  }
  return undefined;
}

const CANONICAL_HANDOUT_META_KEYS = [
  'documentTitle',
  'handoutLanguage',
  'handoutStatus',
  'diagnosis',
  'handoutSourceHash',
  'translationProvider',
  'translationModel',
  'translationValidationStatus',
  'translationRequiresReview',
  'translationFallback',
  'translationMessage',
  'translationStale',
  'requestedHandoutLanguage',
  DOCUMENT_HTML_KEY,
] as const;

/** Map legacy / AI keys into the canonical Word-sample schema. */
export function upgradePatientHandoutFields(
  d: Record<string, string>,
): Record<string, string> {
  if (!Object.keys(d).length) return d;

  const assessment =
    firstText(d.assessment, d.carePlan, d.whatWeAssessed, d.whatItMeans, d.reasonForVisit) ??
    '';
  const treatmentCore =
    firstText(d.treatment, d.treatmentProvided) ?? '';
  const howTo = firstText(d.howToUse, d.howToTake, d.medicationInstructions) ?? '';
  const treatment = mergeUniqueBlocks(treatmentCore, howTo);

  const expectedResponse = firstText(d.expectedResponse, d.whatToExpect) ?? '';
  const selfCare = firstText(d.selfCare, d.whatYouCanDo, d.homeCareAdvice) ?? '';
  const seekCare =
    firstText(
      d.seekCare,
      d.whenToGetHelp,
      d.whenToVisitDoctor,
      d.emergencyWarningSigns,
      d.precautions,
      d.thingsToWatchFor,
    ) ?? '';
  const followUp = firstText(d.followUp, d.followUpInstructions) ?? '';
  const questionsContactRaw =
    firstText(d.questionsContact, d.pharmacyContact) ?? '';
  const questionsContact = /please contact your pharmacy/i.test(questionsContactRaw)
    ? ''
    : questionsContactRaw;

  const next: Record<string, string> = {
    ...d,
    assessment,
    treatment,
    expectedResponse,
    selfCare,
    seekCare,
    followUp,
    questionsContact,
    documentTitle: d.documentTitle?.trim() || '',
    handoutLanguage: normalizeHandoutLanguage(d.handoutLanguage),
  };

  if (!next.documentTitle) {
    next.documentTitle = carePlanTitle(d.diagnosis, next.handoutLanguage);
  }

  return next;
}

/**
 * Prefer pharmacist-edited Notion HTML when present.
 * Keep AI assessment/counselling when present and valid; always use
 * deterministic treatment lines from the confirmed payload.
 * Confirmed counselling cards fill in if the saved draft omitted them.
 */
export function mergePatientHandoutFields(
  existing: Record<string, string> | undefined,
  generated: Record<string, string>,
): Record<string, string> {
  const upgraded = upgradePatientHandoutFields(existing ?? {});
  const counsellingKeys = [
    'expectedResponse',
    'selfCare',
    'seekCare',
    'followUp',
  ] as const;
  const fillCounselling = (base: Record<string, string>) => {
    const next = { ...base };
    for (const key of counsellingKeys) {
      if (!next[key]?.trim() && generated[key]?.trim()) next[key] = generated[key];
    }
    if (!next.assessment?.trim() && generated.assessment?.trim()) {
      next.assessment = generated.assessment;
    }
    return next;
  };

  if (upgraded[DOCUMENT_HTML_KEY]?.trim()) {
    const next = fillCounselling({
      ...generated,
      ...pickCanonicalHandout(upgraded),
      treatment: generated.treatment || upgraded.treatment,
      questionsContact: generated.questionsContact || upgraded.questionsContact,
      [DOCUMENT_HTML_KEY]: upgraded[DOCUMENT_HTML_KEY],
    });
    next[DOCUMENT_HTML_KEY] = ensureHandoutHtmlHasPharmacyContact(
      ensureHandoutHtmlHasCounsellingCards(next[DOCUMENT_HTML_KEY], next),
      next.questionsContact ?? generated.questionsContact ?? '',
      next.handoutLanguage,
    );
    return next;
  }
  const ai = pickCanonicalHandout(upgraded);
  const hasAiBody = Boolean(
    ai.assessment?.trim() ||
      ai.expectedResponse?.trim() ||
      ai.selfCare?.trim() ||
      ai.seekCare?.trim() ||
      ai.followUp?.trim(),
  );
  if (hasAiBody) {
    return fillCounselling({
      ...generated,
      ...ai,
      documentTitle: generated.documentTitle || ai.documentTitle,
      treatment: generated.treatment || ai.treatment,
      questionsContact: generated.questionsContact || ai.questionsContact,
      handoutLanguage:
        upgraded.handoutLanguage?.trim() || generated.handoutLanguage || 'en',
      handoutStatus: generated.handoutStatus || ai.handoutStatus,
    });
  }
  return {
    ...generated,
    handoutLanguage:
      upgraded.handoutLanguage?.trim() || generated.handoutLanguage || 'en',
  };
}

export function pickCanonicalHandout(fields: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of PATIENT_HANDOUT_SECTION_KEYS) {
    out[key] = fields[key] ?? '';
  }
  for (const key of CANONICAL_HANDOUT_META_KEYS) {
    if (fields[key]) out[key] = fields[key];
  }
  return out;
}

function firstText(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const v = value?.trim();
    if (v) return v;
  }
  return undefined;
}

function mergeUniqueBlocks(primary: string, extra: string): string {
  if (!primary) return extra;
  if (!extra) return primary;
  const haystack = primary.toLowerCase();
  const extras = extra
    .split(/\n+/)
    .map((l) => l.replace(/^[•\-\u2022*]\s*/, '').trim())
    .filter((l) => l && !haystack.includes(l.toLowerCase()));
  if (!extras.length) return primary;
  return `${primary}\n${extras.join('\n')}`;
}

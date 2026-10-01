import {
  consultationDateYmd,
  DAP_CONSENT_SENTENCE,
  DAP_CONSENT_SENTENCE_VARIANTS,
  ensureDapOpeningConsent,
  formatClinicalReferenceConsultedDate,
  formatClinicalReferences,
  parseConsultationClinicalReferences,
  stripClinicalPathwayChromeLine,
  stripClinicalReferencesProse,
  scrubTechnicalIdsFromProse,
  type ConsultationClinicalReferences,
} from '@safescript/shared';
import { escapeHtml, fieldToPlainText, toEditorHtml } from './tiptap-text';

const DOCUMENT_HTML_KEY = 'documentHtml';

export const DAP_NOTE_TITLE = 'Pharmacist Consultation Note';

/** Visible DAP body sections — omitted when empty. */
export const DAP_SECTION_KEYS = ['data', 'assessment', 'plan'] as const;

export type DapSectionKey = (typeof DAP_SECTION_KEYS)[number];

export const DAP_SECTION_LABELS: Record<DapSectionKey, string> = {
  data: 'D — Data',
  assessment: 'A — Assessment',
  plan: 'P — Plan',
};

const LEGACY_LABEL_ALIASES: Record<string, DapSectionKey> = {
  'd — data': 'data',
  'd- data': 'data',
  'd: data': 'data',
  data: 'data',
  'reason for care and findings': 'data',
  'patient & encounter header': 'data',
  'subjective findings': 'data',
  'objective findings': 'data',
  'consultation information': 'data',
  'a — assessment': 'assessment',
  'a- assessment': 'assessment',
  'a: assessment': 'assessment',
  'assessment and rationale': 'assessment',
  'clinical decision': 'assessment',
  'working clinical impression': 'assessment',
  'p — plan': 'plan',
  'p- plan': 'plan',
  'p: plan': 'plan',
  'care provided, counselling, and follow-up': 'plan',
  'treatment plan': 'plan',
  medications: 'plan',
  'counseling notes': 'plan',
  'follow-up plan': 'plan',
  'referral instructions': 'plan',
};

export interface PopulatedDapSection {
  key: DapSectionKey;
  label: string;
  value: string;
}

export function dapLabelToKey(label: string): DapSectionKey | undefined {
  const normalized = label.replace(/\s+/g, ' ').trim().toLowerCase().replace(/:$/, '');
  if (LEGACY_LABEL_ALIASES[normalized]) return LEGACY_LABEL_ALIASES[normalized];
  for (const key of DAP_SECTION_KEYS) {
    if (DAP_SECTION_LABELS[key].toLowerCase() === normalized) return key;
  }
  return undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function consentParagraphHtml(): string {
  return `<p>${escapeHtml(DAP_CONSENT_SENTENCE)}</p>`;
}

const FOLLOW_UP_PLANNED_RE =
  /((?:Pharmacist|Primary care provider|Physician|The pharmacist|PCP)\s+follow-up planned\b)/i;

/** Keep the follow-up sentence as its own paragraph so the note can breathe. */
export function ensureDapFollowUpParagraphBreak(text: string): string {
  const source = String(text ?? '');
  if (!FOLLOW_UP_PLANNED_RE.test(source)) return source;
  return source.replace(
    /([^\n])[ \t]*(?:\n[ \t]*)?((?:Pharmacist|Primary care provider|Physician|The pharmacist|PCP)\s+follow-up planned\b)/gi,
    '$1\n\n$2',
  );
}

/** Split a jammed follow-up line out of a counselling paragraph in stored HTML. */
export function ensureDapNoteSpacingHtml(html: string): string {
  const source = String(html ?? '');
  if (!source.trim()) return source;
  return source.replace(
    /(<p\b(?![^>]*data-field)[^>]*>)([\s\S]*?)<br\s*\/?>\s*((?:Pharmacist|Primary care provider|Physician|The pharmacist|PCP)\s+follow-up planned\b[\s\S]*?)(<\/p>)/gi,
    (_full, open: string, before: string, follow: string, close: string) => {
      const head = before.replace(/(?:<br\s*\/?>|\s)+$/gi, '').trim();
      if (!head) return `${open}${follow.trim()}${close}`;
      return `${open}${head}${close}${open}${follow.trim()}${close}`;
    },
  );
}

function stripConsentCopyFromHtml(html: string): string {
  let out = html;
  for (const sentence of DAP_CONSENT_SENTENCE_VARIANTS) {
    const escaped = escapeRegExp(sentence);
    out = out.replace(new RegExp(`<p[^>]*>\\s*${escaped}\\s*</p>`, 'gi'), '');
    out = out.replace(new RegExp(escaped + '\\s*', 'gi'), '');
  }
  return out;
}

/**
 * Permanent first paragraph of D — Data on the pharmacist consultation note.
 * Idempotent across stored HTML, print, PDF, fax, and Kroll copy.
 */
export function ensureDapConsentHtml(html: string): string {
  const source = html.trim();
  if (!source) return consentParagraphHtml();

  const headingRe = /(<h2[^>]*data-field=["']data["'][^>]*>[\s\S]*?<\/h2>)/i;
  const headingMatch = source.match(headingRe);
  if (headingMatch && headingMatch.index != null) {
    const heading = headingMatch[1];
    const start = headingMatch.index + heading.length;
    const rest = source.slice(start);
    const nextHeading = rest.search(/<h2\b/i);
    const dataHtml = nextHeading >= 0 ? rest.slice(0, nextHeading) : rest;
    const after = nextHeading >= 0 ? rest.slice(nextHeading) : '';
    return `${source.slice(0, start)}${consentParagraphHtml()}${stripConsentCopyFromHtml(dataHtml)}${after}`;
  }

  const cleaned = stripConsentCopyFromHtml(source);
  const h1 = cleaned.match(/<h1\b[\s\S]*?<\/h1>/i);
  if (h1 && h1.index != null) {
    const end = h1.index + h1[0].length;
    return `${cleaned.slice(0, end)}${consentParagraphHtml()}${cleaned.slice(end)}`;
  }
  return `${consentParagraphHtml()}${cleaned}`;
}

export function listPopulatedDapSections(
  fields: Record<string, string>,
): PopulatedDapSection[] {
  const canonical = upgradeDapNoteFields(fields);
  const out: PopulatedDapSection[] = [];
  for (const key of DAP_SECTION_KEYS) {
    const value = canonical[key]?.trim();
    if (!value) continue;
    out.push({ key, label: DAP_SECTION_LABELS[key], value });
  }
  return out;
}

export function fieldsToDapNotionHtml(fields: Record<string, string>): string {
  const d = upgradeDapNoteFields(fields);
  const title = d.documentTitle?.trim() || DAP_NOTE_TITLE;
  const parts: string[] = [
    `<h1 data-field="documentTitle">${escapeHtml(title)}</h1>`,
  ];

  for (const section of listPopulatedDapSections(d)) {
    parts.push(
      `<h2 data-field="${escapeHtml(section.key)}">${escapeHtml(section.label)}</h2>`,
      toEditorHtml(section.value),
    );
  }

  const refs = stripClinicalPathwayChromeLine(d.clinicalReferences ?? '');
  if (refs) {
    parts.push(dapChromeParagraph('clinicalReferences', refs));
  }

  const attestation = d.attestationBlock?.trim();
  if (attestation) {
    parts.push(dapChromeParagraph('attestationBlock', attestation));
  }

  return ensureDapNoteSpacingHtml(ensureDapConsentHtml(parts.join('')));
}

export function buildDapNotePlainText(fields: Record<string, string>): string {
  const d = upgradeDapNoteFields(fields);
  const lines: string[] = [d.documentTitle?.trim() || DAP_NOTE_TITLE, ''];
  for (const section of listPopulatedDapSections(d)) {
    lines.push(section.label);
    lines.push(section.value);
    lines.push('');
  }
  const refs = stripClinicalPathwayChromeLine(d.clinicalReferences ?? '');
  if (refs) {
    lines.push(refs);
  }
  const attestation = d.attestationBlock?.trim();
  if (attestation) {
    lines.push('', attestation);
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export const DAP_CHROME_FIELD_KEYS = ['clinicalReferences', 'attestationBlock'] as const;

export function dapChromeFieldKeys(): string[] {
  return [...DAP_CHROME_FIELD_KEYS];
}

const CLINICAL_REFERENCES_HTML_RE =
  /<p[^>]*data-field=["']clinicalReferences["'][^>]*>[\s\S]*?<\/p>/gi;

export function upsertClinicalReferencesHtml(
  html: string,
  sentence: string | null,
): string {
  const withoutField = html.replace(CLINICAL_REFERENCES_HTML_RE, '');
  const without = stripClinicalReferencesProse(withoutField).trim();
  if (!sentence) return without;
  return `${without}\n${dapChromeParagraph('clinicalReferences', sentence)}`;
}

export function applyDapClinicalReferencesSentence(
  fields: Record<string, string>,
  sentence: string | null,
): Record<string, string> {
  const next: Record<string, string> = { ...fields };
  for (const key of DAP_SECTION_KEYS) {
    if (next[key]) next[key] = stripClinicalReferencesProse(next[key]);
  }
  const chrome = stripClinicalPathwayChromeLine(sentence?.trim() || '');
  if (chrome) next.clinicalReferences = chrome;
  else delete next.clinicalReferences;

  if (next[DOCUMENT_HTML_KEY]?.trim()) {
    next[DOCUMENT_HTML_KEY] = upsertClinicalReferencesHtml(
      next[DOCUMENT_HTML_KEY],
      chrome || null,
    );
    if (next.attestationBlock?.trim()) {
      next[DOCUMENT_HTML_KEY] = upsertDapAttestationHtml(
        next[DOCUMENT_HTML_KEY],
        next.attestationBlock,
      );
    }
  }
  return next;
}

export function applyClinicalReferencesToDapFields(
  fields: Record<string, string>,
  refs: ConsultationClinicalReferences | null | undefined,
): Record<string, string> {
  return applyDapClinicalReferencesSentence(
    fields,
    formatClinicalReferences(refs?.selections, refs?.consultedOn ?? ''),
  );
}

export interface DapAttestationSource {
  createdAt?: string | Date | null;
  pharmacist?: { firstName?: string | null; lastName?: string | null } | null;
  tenant?: { name?: string | null } | null;
}

export function formatDapEncounterDateTime(input: Date | string | null | undefined): string {
  const date = input instanceof Date ? input : input ? new Date(input) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const dateLabel = formatClinicalReferenceConsultedDate(consultationDateYmd(date));
  const timeLabel = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).format(date);
  return `${dateLabel}, ${timeLabel}`;
}

export function formatDapAttestation(source: DapAttestationSource): string {
  const lines: string[] = [];
  const pharmacistName = [source.pharmacist?.firstName, source.pharmacist?.lastName]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(' ');
  if (pharmacistName) lines.push(`Pharmacist: ${pharmacistName}, RPh`);
  const pharmacy = source.tenant?.name?.trim();
  if (pharmacy) lines.push(`Pharmacy: ${pharmacy}`);
  const when = formatDapEncounterDateTime(source.createdAt);
  if (when) lines.push(`Date/time: ${when}`);
  return lines.join('\n');
}

const ATTESTATION_HTML_RE =
  /<p[^>]*data-field=["']attestationBlock["'][^>]*>[\s\S]*?<\/p>/gi;

function dapChromeParagraph(key: string, value: string): string {
  const inner = escapeHtml(value).replace(/\n/g, '<br>');
  return `<p data-field="${escapeHtml(key)}">${inner}</p>`;
}

export function upsertDapAttestationHtml(html: string, block: string | null): string {
  const without = html.replace(ATTESTATION_HTML_RE, '').trim();
  if (!block?.trim()) return without;
  return `${without}\n${dapChromeParagraph('attestationBlock', block.trim())}`;
}

export function applyDapAttestationToFields(
  fields: Record<string, string>,
  source: DapAttestationSource,
): Record<string, string> {
  const next: Record<string, string> = { ...upgradeDapNoteFields(fields) };
  const block = formatDapAttestation(source);
  if (block) next.attestationBlock = block;
  else delete next.attestationBlock;

  if (next[DOCUMENT_HTML_KEY]?.trim()) {
    next[DOCUMENT_HTML_KEY] = ensureDapConsentHtml(
      upsertDapAttestationHtml(next[DOCUMENT_HTML_KEY], block || null),
    );
  }
  return next;
}

export function clinicalReferencesFromDocumentation(
  documentation: unknown,
): ConsultationClinicalReferences | null {
  if (!documentation || typeof documentation !== 'object') return null;
  return parseConsultationClinicalReferences(
    (documentation as { clinicalReferences?: unknown }).clinicalReferences,
  );
}

export function dapHtmlLooksLegacy(html: string): boolean {
  return /data-field="(headerBlock|narrativeFindings|narrativeAssessment|narrativePlan|subjectiveFindings|objectiveFindings|patientInformation|consultationInformation|clinicalDecision|counselingNotes)"/i.test(
    html,
  ) || /<h2[^>]*>\s*(Patient Information|Consultation Summary|Subjective|Objective|Working clinical impression|Medication prescribed|Counselling provided|Patient &amp; encounter header|Reason for care)/i.test(
    html,
  );
}

/** Map legacy / AI keys into the canonical D / A / P schema. */
export function upgradeDapNoteFields(
  d: Record<string, string>,
): Record<string, string> {
  if (!Object.keys(d).length) return d;

  const alreadyCanonical = Boolean(d.data?.trim());

  const rawData = alreadyCanonical
    ? d.data ?? ''
    : firstText(
        d.data,
        d.narrativeFindings,
        joinBlocks(d.subjectiveFindings, d.objectiveFindings, d.consultationInformation),
      ) ?? '';

  const data = ensureDapOpeningConsent(
    stripClinicalReferencesProse(scrubTechnicalIdsFromProse(rawData)),
  );

  const assessment = alreadyCanonical
    ? d.assessment ?? ''
    : firstText(
        d.assessment,
        d.narrativeAssessment,
        d.clinicalDecision,
      ) ?? '';

  const plan = alreadyCanonical
    ? d.plan ?? ''
    : firstText(
        d.plan,
        d.narrativePlan,
        joinBlocks(
          d.medications,
          d.treatmentPlan,
          d.counselingNotes,
          d.followUpPlan,
          d.referralInstructions,
        ),
      ) ?? '';

  const clinicalReferences = stripClinicalPathwayChromeLine(d.clinicalReferences ?? '');

  return {
    ...d,
    documentTitle: d.documentTitle?.trim() || DAP_NOTE_TITLE,
    data,
    assessment: stripClinicalReferencesProse(scrubTechnicalIdsFromProse(assessment)),
    plan: ensureDapFollowUpParagraphBreak(
      stripClinicalReferencesProse(scrubTechnicalIdsFromProse(plan)),
    ),
    // Keep legacy keys populated so older PDF layouts still have content.
    narrativeFindings: scrubTechnicalIdsFromProse(d.narrativeFindings?.trim() || data),
    narrativeAssessment: scrubTechnicalIdsFromProse(
      d.narrativeAssessment?.trim() || assessment,
    ),
    narrativePlan: scrubTechnicalIdsFromProse(d.narrativePlan?.trim() || plan),
    body: scrubTechnicalIdsFromProse(
      [data, assessment, plan].filter((p) => p.trim()).join('\n\n'),
    ),
    clinicalReferences,
    ...(d[DOCUMENT_HTML_KEY]
      ? { [DOCUMENT_HTML_KEY]: ensureDapNoteSpacingHtml(
          ensureDapConsentHtml(scrubTechnicalIdsFromProse(d[DOCUMENT_HTML_KEY])),
        ) }
      : {}),
  };
}

export function mergeDapNoteFields(
  existing: Record<string, string> | undefined,
  generated: Record<string, string>,
): Record<string, string> {
  const upgraded = upgradeDapNoteFields(existing ?? {});
  const storedHtml = upgraded[DOCUMENT_HTML_KEY]?.trim();
  if (storedHtml && !dapHtmlLooksLegacy(storedHtml)) {
    return {
      ...generated,
      ...pickCanonicalDap(upgraded),
      [DOCUMENT_HTML_KEY]: storedHtml,
    };
  }
  const ai = pickCanonicalDap(upgraded);
  const hasAiBody = Boolean(
    ai.data?.trim() || ai.assessment?.trim() || ai.plan?.trim(),
  );
  if (hasAiBody) {
    return {
      ...generated,
      ...ai,
      documentTitle: ai.documentTitle || generated.documentTitle || DAP_NOTE_TITLE,
    };
  }
  return generated;
}

export function pickCanonicalDap(fields: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of [
    ...DAP_SECTION_KEYS,
    'documentTitle',
    'clinicalReferences',
    'attestationBlock',
    DOCUMENT_HTML_KEY,
    'narrativeFindings',
    'narrativeAssessment',
    'narrativePlan',
    'body',
  ] as const) {
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

function joinBlocks(...values: Array<string | undefined>): string {
  return values
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v))
    .join('\n\n');
}

export function dapFieldPlainFromNode(html: string): string {
  return fieldToPlainText(html);
}

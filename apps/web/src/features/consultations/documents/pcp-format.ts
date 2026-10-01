import { escapeHtml, fieldToPlainText, toEditorHtml } from './tiptap-text';
import {
  PCP_CLOSING_SENTENCE as SHARED_PCP_CLOSING,
  PCP_LETTER_TITLE as SHARED_PCP_TITLE,
  PCP_DEFAULT_SALUTATION,
} from '@safescript/shared';
import {
  pcpIdentityFromPatientInfo,
  pcpPatientInformationPlainText,
  renderPcpPatientInformationHtml,
  upsertPcpPatientInformationHtml,
} from './pcp-patient-information';

const DOCUMENT_HTML_KEY = 'documentHtml';

export const PCP_LETTER_TITLE = SHARED_PCP_TITLE;

export const PCP_CLOSING_SENTENCE = SHARED_PCP_CLOSING;

/** Headed body sections — omitted when empty. */
export const PCP_LETTER_SECTION_KEYS = [
  'assessment',
  'treatment',
  'followUp',
] as const;

export type PcpLetterSectionKey = (typeof PCP_LETTER_SECTION_KEYS)[number];

/** Letter chrome rendered without H2 labels. */
export const PCP_LETTER_CHROME_KEYS = [
  'headerBlock',
  'salutation',
  'openingSentence',
  'closingSentence',
  'signatureBlock',
  'patientName',
  'patientDob',
  'patientPhn',
] as const;

export type PcpLetterChromeKey = (typeof PCP_LETTER_CHROME_KEYS)[number];

export const PCP_SECTION_LABELS: Record<PcpLetterSectionKey, string> = {
  assessment: 'Assessment',
  treatment: 'Treatment',
  followUp: 'Follow-up',
};

const LEGACY_LABEL_ALIASES: Record<string, string> = {
  'assessment summary': 'assessment',
  'encounter and assessment summary': 'assessment',
  'clinical impression': 'assessment',
  'prescribing / care decision': 'treatment',
  'prescribing decision': 'treatment',
  'treatment provided': 'treatment',
  rationale: 'treatment',
  'patient instructions': 'followUp',
  'monitoring and follow-up': 'followUp',
  'follow-up required': 'followUp',
  'provider action': 'closingSentence',
  'pharmacist signature': 'signatureBlock',
  'purpose and action': 'openingSentence',
  'header (recipient, patient, dates)': 'headerBlock',
};

export interface PopulatedPcpSection {
  key: PcpLetterSectionKey;
  label: string;
  value: string;
}

export function pcpSalutation(recipientName?: string | null): string {
  const raw = recipientName?.trim();
  if (!raw) return PCP_DEFAULT_SALUTATION;
  if (/^dear\b/i.test(raw)) return /[,:]$/.test(raw) ? raw : `${raw},`;
  const cleaned = raw.replace(/^dr\.?\s+/i, '').replace(/,$/, '');
  return `Dear Dr. ${cleaned},`;
}

export function pcpLabelToKey(label: string): string | undefined {
  const normalized = label.replace(/\s+/g, ' ').trim().toLowerCase().replace(/:$/, '');
  if (LEGACY_LABEL_ALIASES[normalized]) return LEGACY_LABEL_ALIASES[normalized];
  for (const key of PCP_LETTER_SECTION_KEYS) {
    if (PCP_SECTION_LABELS[key].toLowerCase() === normalized) return key;
  }
  if (normalized === 'kind regards' || normalized === 'signature') return 'signatureBlock';
  return undefined;
}

export function listPopulatedPcpSections(
  fields: Record<string, string>,
): PopulatedPcpSection[] {
  const canonical = upgradePcpCommunicationFields(fields);
  const out: PopulatedPcpSection[] = [];
  for (const key of PCP_LETTER_SECTION_KEYS) {
    const value = canonical[key]?.trim();
    if (!value) continue;
    out.push({ key, label: PCP_SECTION_LABELS[key], value });
  }
  return out;
}

export function fieldsToPcpNotionHtml(fields: Record<string, string>): string {
  const d = upgradePcpCommunicationFields(fields);
  const title = d.documentTitle?.trim() || PCP_LETTER_TITLE;
  const parts: string[] = [
    `<h1 data-field="documentTitle">${escapeHtml(title)}</h1>`,
  ];

  const header = d.headerBlock?.trim();
  if (header) parts.push(chromeParagraph('headerBlock', header));

  const patientHtml = renderPcpPatientInformationHtml(pcpIdentityFromPatientInfo(undefined, d));
  if (patientHtml) parts.push(patientHtml);

  const salutation = d.salutation?.trim() || pcpSalutation(d.recipientName);
  parts.push(chromeParagraph('salutation', salutation));

  const opening = d.openingSentence?.trim();
  if (opening) parts.push(chromeParagraph('openingSentence', opening));

  for (const section of listPopulatedPcpSections(d)) {
    parts.push(
      `<h2 data-field="${escapeHtml(section.key)}">${escapeHtml(section.label)}:</h2>`,
    );
    if (section.key === 'treatment') {
      const lines = section.value
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (lines.length) {
        parts.push(
          `<p data-pcp-card="treatment">${lines.map((line) => escapeHtml(line)).join('<br>')}</p>`,
        );
      }
    } else if (section.key === 'followUp') {
      parts.push(
        `<p data-pcp-card="followUp">${escapeHtml(section.value).replace(/\n/g, '<br>')}</p>`,
      );
    } else {
      parts.push(toEditorHtml(section.value));
    }
  }

  parts.push(
    chromeParagraph(
      'closingSentence',
      d.closingSentence?.trim() || PCP_CLOSING_SENTENCE,
    ),
  );

  const signature = d.signatureBlock?.trim();
  if (signature) parts.push(chromeParagraph('signatureBlock', signature));

  return parts.join('');
}

export function buildPcpCommunicationPlainText(fields: Record<string, string>): string {
  const d = upgradePcpCommunicationFields(fields);
  const lines: string[] = [
    d.documentTitle?.trim() || PCP_LETTER_TITLE,
    '',
  ];
  if (d.headerBlock?.trim()) {
    lines.push(d.headerBlock.trim(), '');
  }
  const patientText = pcpPatientInformationPlainText(pcpIdentityFromPatientInfo(undefined, d));
  if (patientText) {
    lines.push(patientText, '');
  }
  lines.push(d.salutation?.trim() || pcpSalutation(d.recipientName), '');
  if (d.openingSentence?.trim()) {
    lines.push(d.openingSentence.trim(), '');
  }
  for (const section of listPopulatedPcpSections(d)) {
    lines.push(`${section.label}:`);
    lines.push(section.value);
    lines.push('');
  }
  lines.push(d.closingSentence?.trim() || PCP_CLOSING_SENTENCE, '');
  if (d.signatureBlock?.trim()) {
    lines.push(d.signatureBlock.trim());
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function pcpHtmlLooksLegacy(html: string): boolean {
  if (
    /data-field="(purposeBanner|prescribingBlock|assessmentSummary|providerAction|monitoringFollowUp|patientInstructions)"/i.test(
      html,
    )
  ) {
    return true;
  }
  return /<h2[^>]*>\s*(Purpose and action|Prescribing\s*\/\s*care decision|Clinical impression|Provider action|Monitoring and follow-up|Patient instructions|Encounter and assessment summary)/i.test(
    html,
  );
}

export function patchHtmlDataField(
  html: string,
  key: string,
  plainValue: string,
): string {
  if (typeof document === 'undefined' || !html.trim()) return html;
  const root = document.createElement('div');
  root.innerHTML = html;
  const target = root.querySelector(`[data-field="${cssEscape(key)}"]`);
  if (!target) return html;
  const lines = plainValue.split('\n');
  target.textContent = '';
  lines.forEach((line, i) => {
    if (i > 0) target.appendChild(document.createElement('br'));
    target.appendChild(document.createTextNode(line));
  });
  return root.innerHTML;
}

/** Map legacy / AI keys into the canonical letter schema. */
export function upgradePcpCommunicationFields(
  d: Record<string, string>,
): Record<string, string> {
  if (!Object.keys(d).length) return d;

  const alreadyCanonical =
    looksLikeOpening(d.openingSentence) ||
    (Boolean(d.salutation?.trim()) &&
      Boolean(d.headerBlock?.trim()) &&
      (/^re:/i.test(d.headerBlock) || /^date:/i.test(d.headerBlock)) &&
      !looksLikeLegacyHeader(d.headerBlock));

  const assessment = alreadyCanonical
    ? d.assessment ?? ''
    : firstText(
        d.assessment,
        d.assessmentSummary,
        d.clinicalFindings,
        d.patientDetails,
      ) ?? '';

  const treatmentCore = alreadyCanonical
    ? d.treatment ?? ''
    : firstText(d.treatment, d.prescribingBlock, d.medicationsPrescribed) ?? '';
  const rationale = alreadyCanonical ? '' : (d.rationale?.trim() ?? '');
  const treatment = mergeUniqueBlocks(treatmentCore, stripLabelPrefix(rationale, 'rationale'));

  const followUp = alreadyCanonical
    ? d.followUp ?? ''
    : firstText(
        d.followUp,
        d.monitoringFollowUp,
        d.followUpRequired,
        d.patientInstructions,
      ) ?? '';

  const closingRaw =
    firstText(d.closingSentence, d.closing, d.providerAction) ?? '';
  const closingSentence = isFixedClosing(closingRaw)
    ? PCP_CLOSING_SENTENCE
    : looksLikeOldProviderAction(closingRaw)
      ? PCP_CLOSING_SENTENCE
      : closingRaw || PCP_CLOSING_SENTENCE;

  const headerBlock =
    firstText(d.headerBlock) && !looksLikeLegacyHeader(d.headerBlock)
      ? d.headerBlock
      : rebuildHeaderFromLegacy(d);

  const openingSentence =
    (firstText(d.openingSentence) && looksLikeOpening(d.openingSentence)
      ? d.openingSentence.trim()
      : undefined) ??
    (looksLikeOpening(d.consultationSummary) ? d.consultationSummary.trim() : '') ??
    '';

  const next: Record<string, string> = {
    ...d,
    documentTitle: d.documentTitle?.trim() || PCP_LETTER_TITLE,
    headerBlock: headerBlock ?? '',
    salutation: d.salutation?.trim() || pcpSalutation(d.recipientName),
    openingSentence,
    assessment,
    treatment,
    followUp,
    closingSentence,
    signatureBlock:
      firstText(d.signatureBlock, d.pharmacistDetails)?.replace(
        /^kind regards,?\s*/i,
        'Kind regards,\n',
      ) ?? '',
  };

  if (next.signatureBlock && !/^kind regards/i.test(next.signatureBlock)) {
    next.signatureBlock = `Kind regards,\n${next.signatureBlock}`;
  }

  return next;
}

export function mergePcpCommunicationFields(
  existing: Record<string, string> | undefined,
  generated: Record<string, string>,
): Record<string, string> {
  const upgraded = upgradePcpCommunicationFields(existing ?? {});
  const storedHtml = upgraded[DOCUMENT_HTML_KEY]?.trim();
  const merged: Record<string, string> = {
    ...generated,
    ...pickCanonicalPcp(upgraded),
    treatment: generated.treatment || upgraded.treatment || '',
    followUp: generated.followUp || upgraded.followUp || '',
    headerBlock: generated.headerBlock || upgraded.headerBlock || '',
    closingSentence: generated.closingSentence || PCP_CLOSING_SENTENCE,
    signatureBlock: generated.signatureBlock || upgraded.signatureBlock || '',
  };
  if (generated.patientName) merged.patientName = generated.patientName;
  if (generated.patientDob) merged.patientDob = generated.patientDob;
  if (generated.patientPhn) merged.patientPhn = generated.patientPhn;
  if (generated.pcpFollowUpIncomplete) {
    merged.pcpFollowUpIncomplete = generated.pcpFollowUpIncomplete;
  }
  if (generated.pcpFollowUpRequired) {
    merged.pcpFollowUpRequired = generated.pcpFollowUpRequired;
  }
  if (storedHtml && !pcpHtmlLooksLegacy(storedHtml)) {
    merged[DOCUMENT_HTML_KEY] = ensurePcpHtmlHasBackendSections(storedHtml, merged);
    return merged;
  }
  delete merged[DOCUMENT_HTML_KEY];
  return merged;
}

export function pickCanonicalPcp(fields: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of [
    ...PCP_LETTER_CHROME_KEYS,
    ...PCP_LETTER_SECTION_KEYS,
    'documentTitle',
    'recipientName',
    'patientPhnNotAvailable',
    DOCUMENT_HTML_KEY,
  ] as const) {
    if (fields[key]) out[key] = fields[key];
  }
  return out;
}

function chromeParagraph(key: string, value: string): string {
  const inner = escapeHtml(value).replace(/\n/g, '<br>');
  return `<p data-field="${escapeHtml(key)}">${inner}</p>`;
}

export function ensurePcpHtmlSignature(html: string, signature: string): string {
  if (!html.trim() || !signature.trim()) return html;
  const patched = patchHtmlDataField(html, 'signatureBlock', signature);
  if (/data-field=["']signatureBlock["']/i.test(html)) return patched;
  return `${html}${chromeParagraph('signatureBlock', signature)}`;
}

/**
 * Backend-owned Treatment / Follow-up must appear even when stored HTML was
 * built from empty LLM `treatment` / `followUp` fields. Closing and signature
 * must never remain inside the Treatment card.
 */
export function ensurePcpHtmlHasBackendSections(
  html: string,
  fields: Record<string, string>,
): string {
  const treatmentOwnsFooter =
    /data-(?:field|pcp-card)=["']treatment["'][\s\S]{0,1200}?(continuity of care|Kind regards)/i.test(
      html,
    );
  const missingFollowUp =
    Boolean(fields.followUp?.trim()) && !/data-field=["']followUp["']/i.test(html);
  if (treatmentOwnsFooter || missingFollowUp) {
    return upsertPcpPatientInformationHtml(
      fieldsToPcpNotionHtml(fields),
      pcpIdentityFromPatientInfo(undefined, fields),
    );
  }

  let next = html;
  const treatment = fields.treatment?.trim();
  if (treatment && !/data-field=["']treatment["']/i.test(next)) {
    const treatmentHtml = [
      `<h2 data-field="treatment">Treatment:</h2>`,
      `<p data-pcp-card="treatment">${escapeHtml(treatment).replace(/\n/g, '<br>')}</p>`,
    ].join('');
    next = insertBeforePcpClosing(next, treatmentHtml);
  }

  const followUp = fields.followUp?.trim();
  if (followUp && !/data-field=["']followUp["']/i.test(next)) {
    const followUpHtml = [
      `<h2 data-field="followUp">Follow-up:</h2>`,
      `<p data-pcp-card="followUp">${escapeHtml(followUp).replace(/\n/g, '<br>')}</p>`,
    ].join('');
    next = insertBeforePcpClosing(next, followUpHtml);
  }

  return upsertPcpPatientInformationHtml(
    next,
    pcpIdentityFromPatientInfo(undefined, fields),
  );
}

function insertBeforePcpClosing(html: string, extra: string): string {
  const closingRe = /<p[^>]*data-field=["']closingSentence["'][^>]*>/i;
  if (closingRe.test(html)) {
    return html.replace(closingRe, `${extra}$&`);
  }
  const signatureRe = /<p[^>]*data-field=["']signatureBlock["'][^>]*>/i;
  if (signatureRe.test(html)) {
    return html.replace(signatureRe, `${extra}$&`);
  }
  return `${html}${extra}`;
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
  if (primary.toLowerCase().includes(extra.toLowerCase())) return primary;
  return `${primary} ${extra}`.replace(/\s+/g, ' ').trim();
}

function stripLabelPrefix(text: string, label: string): string {
  const re = new RegExp(`^${label}\\s*:\\s*`, 'i');
  return text.replace(re, '').trim();
}

function isFixedClosing(text: string): boolean {
  return /this update is provided for your information and continuity of care/i.test(
    text,
  );
}

function looksLikeOldProviderAction(text: string): boolean {
  return /provider action|no response is requested|please continue care/i.test(
    text,
  );
}

function looksLikeOpening(text?: string): boolean {
  return Boolean(text && /i am writing to provide a brief update/i.test(text));
}

function looksLikeLegacyHeader(text?: string): boolean {
  return Boolean(
    text &&
      /primary care provider communication|purpose:|safescribe consultation id|action:/i.test(
        text,
      ),
  );
}

function rebuildHeaderFromLegacy(d: Record<string, string>): string {
  const re = d.subject?.trim();
  if (re && /^re:/i.test(re) && !/notification of pharmacist/i.test(re)) {
    return re;
  }
  return '';
}

function cssEscape(value: string): string {
  return value.replace(/"/g, '\\"');
}

/** Used by the HTML parser to read chrome paragraphs. */
export function pcpChromeFieldKeys(): string[] {
  return [...PCP_LETTER_CHROME_KEYS];
}

export function pcpFieldPlainFromNode(html: string): string {
  return fieldToPlainText(html);
}

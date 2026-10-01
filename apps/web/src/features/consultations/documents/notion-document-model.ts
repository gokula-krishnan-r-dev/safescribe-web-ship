import { DOCUMENT_EDITABLE_FIELDS } from './document-fields';
import {
  fieldsToHandoutNotionHtml,
  handoutLabelToKey,
  ensureHandoutHtmlHasCounsellingCards,
  ensureHandoutHtmlHasPharmacyContact,
} from './handout-format';
import {
  fieldsToPcpNotionHtml,
  pcpChromeFieldKeys,
  pcpHtmlLooksLegacy,
  pcpLabelToKey,
  ensurePcpHtmlHasBackendSections,
} from './pcp-format';
import {
  dapChromeFieldKeys,
  dapHtmlLooksLegacy,
  dapLabelToKey,
  ensureDapConsentHtml,
  ensureDapNoteSpacingHtml,
  fieldsToDapNotionHtml,
  upsertClinicalReferencesHtml,
  upsertDapAttestationHtml,
} from './dap-note-format';
import {
  ensurePrescriptionTreatmentGapsHtml,
  upsertPrescriptionPatientHtml,
  upsertPrescriptionRxTitlesHtml,
} from './generators/prescription-generator';
import type { DocumentTypeId } from './types';
import { escapeHtml, fieldToPlainText, looksLikeHtml, toEditorHtml } from './tiptap-text';
import { hydrateMarkdownInHtml } from './clinical-markdown';
import { scrubTechnicalIdsFromProse } from '@safescript/shared';

function prescriptionRxTitles(fields: Record<string, string>): string[] {
  return (fields.rxTitles ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function withPrescriptionOverlays(
  html: string,
  fields: Record<string, string>,
): string {
  const withPatient = upsertPrescriptionPatientHtml(html, fields.patientBlock ?? '');
  const titles = prescriptionRxTitles(fields);
  const withRx = titles.length
    ? upsertPrescriptionRxTitlesHtml(withPatient, titles)
    : withPatient;
  return ensurePrescriptionTreatmentGapsHtml(withRx);
}

export const DOCUMENT_HTML_KEY = 'documentHtml' as const;

/**
 * Build one Notion-style HTML document from structured fields.
 * Section headings carry data-field so we can round-trip edits to PDF fields.
 */
export function fieldsToNotionHtml(
  typeId: DocumentTypeId,
  fields: Record<string, string>,
  documentTitle: string,
): string {
  const stored = fields[DOCUMENT_HTML_KEY]?.trim();
  const storedUsable =
    stored &&
    looksLikeHtml(stored) &&
    /data-field\s*=/.test(stored) &&
    !(typeId === 'prescriber_communication' && pcpHtmlLooksLegacy(stored)) &&
    !(typeId === 'consultation_note' && dapHtmlLooksLegacy(stored));
  if (storedUsable && stored) {
    if (typeId === 'patient_care_summary') {
      return hydrateMarkdownInHtml(
        ensureHandoutHtmlHasPharmacyContact(
          ensureHandoutHtmlHasCounsellingCards(stored, fields),
          fields.questionsContact ?? '',
          fields.handoutLanguage,
        ),
      );
    }
    if (typeId === 'consultation_note') {
      const withRefs = upsertClinicalReferencesHtml(
        scrubTechnicalIdsFromProse(stored),
        fields.clinicalReferences?.trim() || null,
      );
      return hydrateMarkdownInHtml(
        ensureDapNoteSpacingHtml(
          ensureDapConsentHtml(
            upsertDapAttestationHtml(withRefs, fields.attestationBlock?.trim() || null),
          ),
        ),
      );
    }
    if (typeId === 'prescriber_communication') {
      return hydrateMarkdownInHtml(ensurePcpHtmlHasBackendSections(stored, fields));
    }
    if (typeId === 'prescription') {
      return withPrescriptionOverlays(hydrateMarkdownInHtml(stored), fields);
    }
    return hydrateMarkdownInHtml(stored);
  }

  if (typeId === 'patient_care_summary') {
    return hydrateMarkdownInHtml(fieldsToHandoutNotionHtml(fields));
  }
  if (typeId === 'prescriber_communication') {
    return hydrateMarkdownInHtml(fieldsToPcpNotionHtml(fields));
  }
  if (typeId === 'consultation_note') {
    return hydrateMarkdownInHtml(fieldsToDapNotionHtml(fields));
  }

  const schema = DOCUMENT_EDITABLE_FIELDS[typeId];
  const parts: string[] = [`<h1>${escapeHtml(documentTitle)}</h1>`];

  for (const field of schema) {
    const raw = fields[field.key] ?? '';
    if (!raw.trim()) continue;
    parts.push(
      `<h2 data-field="${escapeHtml(field.key)}">${escapeHtml(field.label)}</h2>`,
      toEditorHtml(raw),
    );
  }

  const html = hydrateMarkdownInHtml(parts.join(''));
  if (typeId === 'prescription') return withPrescriptionOverlays(html, fields);
  return html;
}

/**
 * Parse a Notion document HTML back into structured field map + full HTML.
 * Prefers data-field on H2; falls back to label matching.
 */
export function notionHtmlToFields(
  typeId: DocumentTypeId,
  html: string,
): Record<string, string> {
  const schema = DOCUMENT_EDITABLE_FIELDS[typeId];
  const labelToKey = new Map(
    schema.map((f) => [normalizeLabel(f.label), f.key]),
  );
  const out: Record<string, string> = { [DOCUMENT_HTML_KEY]: html };

  for (const field of schema) {
    out[field.key] = '';
  }

  if (typeof document === 'undefined') {
    return out;
  }

  const root = document.createElement('div');
  root.innerHTML = html;

  const sections: Array<{ key: string; nodes: Node[] }> = [];
  let current: { key: string; nodes: Node[] } | null = null;

  root.childNodes.forEach((node) => {
    if (node instanceof HTMLElement) {
      const tag = node.tagName.toLowerCase();
      if (tag === 'h2') {
        const attrKey = node.getAttribute('data-field')?.trim();
        const labelKey =
          labelToKey.get(normalizeLabel(node.textContent ?? '')) ??
          (typeId === 'patient_care_summary'
            ? handoutLabelToKey(node.textContent ?? '')
            : typeId === 'prescriber_communication'
              ? pcpLabelToKey(node.textContent ?? '')
              : typeId === 'consultation_note'
                ? dapLabelToKey(node.textContent ?? '')
                : undefined);
        const key =
          attrKey && schema.some((f) => f.key === attrKey) ? attrKey : labelKey;
        if (key) {
          current = { key, nodes: [] };
          sections.push(current);
          return;
        }
      }
      if (tag === 'h1') {
        const title = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (title) out.documentTitle = title;
        current = null;
        return;
      }
      const chromeKey = node.getAttribute('data-field')?.trim();
      if (
        chromeKey &&
        (schema.some((f) => f.key === chromeKey) ||
          pcpChromeFieldKeys().includes(chromeKey) ||
          dapChromeFieldKeys().includes(chromeKey))
      ) {
        out[chromeKey] = fieldToPlainText(node.outerHTML || node.textContent || '');
        current = null;
        return;
      }
    }
    if (current) current.nodes.push(node);
  });

  for (const field of schema) {
    const section = sections.find((s) => s.key === field.key);
    if (!section) continue;
    const wrap = document.createElement('div');
    section.nodes.forEach((n) => wrap.appendChild(n.cloneNode(true)));
    const inner = wrap.innerHTML.trim();
    out[field.key] = fieldToPlainText(inner || wrap.textContent || '');
  }

  return out;
}

function normalizeLabel(label: string): string {
  return label.replace(/\s+/g, ' ').trim().toLowerCase();
}

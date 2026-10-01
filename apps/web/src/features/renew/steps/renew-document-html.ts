import { escapeHtml, looksLikeHtml } from '@/features/consultations/documents/tiptap-text';
import { ensureDapConsentHtml } from '@/features/consultations/documents/dap-note-format';
import {
  RENEW_PRESCRIBER_NOTIFICATION_TITLE,
  sanitizeProviderNotificationBody,
} from '@safescript/shared';

const SECTION_HEADERS = new Set(
  [
    'D — Data',
    'D - Data',
    'D – Data',
    'D — DATA',
    'A — Assessment',
    'A - Assessment',
    'A – Assessment',
    'A — ASSESSMENT',
    'P — Plan',
    'P - Plan',
    'P – Plan',
    'P — PLAN',
    'Reason for renewal:',
    'Reason for renewal',
    'Current therapy / indications:',
    'Current therapy / indications',
    'Therapy review:',
    'Therapy review',
    'Relevant history / allergies:',
    'Relevant history / allergies',
    'Patient-specific safety screening:',
    'Patient-specific safety screening',
    'Monitoring reviewed:',
    'Monitoring reviewed',
    'Sources:',
    'Sources',
    'Renewal decision:',
    'Renewal decision',
    'Counselling:',
    'Counselling',
    'Monitoring/follow-up:',
    'Monitoring/follow-up',
    'Referral/communication:',
    'Referral/communication',
    'Clinical support / references:',
    'Clinical support / references',
    'Current medications:',
    'Current medications',
    'Safety / monitoring notes:',
    'Safety / monitoring notes',
    'Not renewed:',
    'Not renewed',
    'Medication renewed',
    'Medication renewed:',
    'Medications renewed',
    'Medications renewed:',
    'Rationale',
    'Rationale:',
    'Relevant clinical information',
    'Relevant clinical information:',
    'Monitoring / follow-up',
    'Monitoring / follow-up:',
    'Medications reviewed and not renewed:',
    'Medications reviewed and not renewed',
    'Renewed:',
    'Renewed',
    'Not renewed:',
    'Not renewed',
    'Plan:',
    'Plan',
    'Patient instructions:',
    'Patient instructions',
    'Non-pharmacological recommendations:',
    'Non-pharmacological recommendations',
    'MEDICATION(S)',
    'RATIONALE',
    'RELEVANT ASSESSMENT / FINDINGS',
    'MONITORING / FOLLOW-UP',
    'PATIENT INSTRUCTIONS',
    'REQUESTED FOLLOW-UP / ACTION',
    'WHEN TO CONTACT THE PHARMACY',
    'WHEN TO SEEK URGENT CARE',
    'IMPORTANT REMINDERS',
    'WHAT HAPPENS NEXT',
    'MONITORING AND FOLLOW-UP',
    'MEDICATION REQUIRING FOLLOW-UP',
    'KIDNEY / DIALYSIS FOLLOW-UP',
    'YOUR RENEWED MEDICATIONS',
    'Your renewed medications',
    'Medication requiring follow-up',
    'What happens next',
    'Important instructions',
    'When to contact your pharmacy or healthcare provider',
    'When to get help',
    'Get urgent medical help if',
    'Your renewed medication',
    'Your renewed medications',
    'What happens next',
    'How to take it',
    'Renewal supply',
    'How to take it:',
    'Renewal supply:',
    'How to take it',
    'Renewal',
    'Used for',
    'Renewed for',
    'Take:',
    'Renewed for:',
    'Used for:',
    'Questions?',
  ].map(normalizeHeader),
);

const SKIP_TITLE_LINES = new Set(
  [
    'PRESCRIPTION / RENEWAL SUMMARY',
    'RENEWAL PRESCRIPTION',
    'PHARMACIST PRESCRIPTION',
    'PRESCRIPTION',
    'PHARMACIST RENEWAL PRESCRIPTION',
    'Prescription',
    'Pharmacist Prescription',
    'YOUR MEDICATION RENEWAL',
    'Your Medication Renewal',
    'Patient Care Summary',
    'PHARMACIST PRESCRIBING NOTIFICATION',
    'PHARMACIST RENEWAL NOTIFICATION',
    'PHARMACIST PRESCRIBING / RENEWAL NOTIFICATION',
    'PRESCRIBER NOTIFICATION — PHARMACIST RENEWAL',
    'PRESCRIBER NOTIFICATION - PHARMACIST RENEWAL',
    'Pharmacist Communication to Primary Care Provider',
    'CONSULTATION / DAP NOTE',
    'Pharmacist Consultation Note',
    'Pharmacist Renewal Assessment',
  ].map(normalizeHeader),
);

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function isCompactDapStart(value: string): boolean {
  const first = value
    .replace(/<[^>]+>/g, '\n')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return Boolean(first && /^(?:d\s*[—–-]\s*data)$/i.test(first));
}

function needsProviderNotificationRepair(html: string): boolean {
  const letterField =
    /\b(?:Patient|To|Re|Quantity|Renewal duration|Date prescribed)\s*:/i.test(html);
  return (
    (/(<(ol|ul|li)[\s>])/i.test(html) && letterField) ||
    /\d+\.\s+(?:Patient|To|Re|Quantity|Renewal duration|Date prescribed)\s*:/i.test(html) ||
    /Recipient not specified/i.test(html) ||
    /PHARMACIST PRESCRIBING\s*\/\s*RENEWAL NOTIFICATION/i.test(html)
  );
}

function resolveDocumentHeading(body: string, title: string): string {
  if (/pharmacist renewal notification/i.test(body) || /dear colleague/i.test(body)) {
    return RENEW_PRESCRIBER_NOTIFICATION_TITLE;
  }
  if (/^(prescriber communication|pharmacist communication)\b/i.test(title.trim())) {
    return RENEW_PRESCRIBER_NOTIFICATION_TITLE;
  }
  return title.trim() || 'Document';
}

/**
 * Convert stored renew document text (plain DAP/summary or existing HTML)
 * into a TipTap/Notion page. Already-HTML bodies pass through unless they
 * still have the numbered Patient/To/Re chrome from older drafts.
 */
export function renewDocumentToHtml(body: string, title: string): string {
  const raw = String(body ?? '').trim();
  const heading = resolveDocumentHeading(raw, title);
  if (!raw) return `<h1>${escapeHtml(heading)}</h1><p></p>`;
  if (looksLikeHtml(raw)) {
    if (needsProviderNotificationRepair(raw)) {
      return renewDocumentToHtml(sanitizeProviderNotificationBody(raw), heading);
    }
    if (/<h1[\s>/]/i.test(raw) || isCompactDapStart(raw)) {
      return isCompactDapStart(raw) || /D\s*[—–-]\s*Data/i.test(raw)
        ? ensureDapConsentHtml(raw)
        : raw;
    }
    return `<h1>${escapeHtml(heading)}</h1>${raw}`;
  }

  const lines = raw.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i += 1;
  if (i < lines.length && (SKIP_TITLE_LINES.has(normalizeHeader(lines[i])) || normalizeHeader(lines[i]) === normalizeHeader(heading))) {
    i += 1;
  }
  const parts: string[] = isCompactDapStart(raw) ? [] : [`<h1>${escapeHtml(heading)}</h1>`];

  let listItems: string[] = [];
  const flushList = () => {
    if (!listItems.length) return;
    // Unordered only — ordered lists look like numbered template chrome in TipTap.
    parts.push(`<ul>${listItems.map((li) => `<li>${li}</li>`).join('')}</ul>`);
    listItems = [];
  };

  for (; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      flushList();
      continue;
    }
    if (trimmed === '—' || trimmed === '-') {
      flushList();
      parts.push('<hr>');
      continue;
    }
    if (SECTION_HEADERS.has(normalizeHeader(trimmed))) {
      flushList();
      parts.push(`<h2>${escapeHtml(trimmed.replace(/:$/, ''))}</h2>`);
      continue;
    }
    const bullet = trimmed.match(/^[•\-*]\s+(.+)$/);
    if (bullet) {
      listItems.push(escapeHtml(bullet[1]));
      continue;
    }
    flushList();
    const numbered = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (numbered) {
      const rest = numbered[2].trim();
      if (/^to\s*:/i.test(rest)) continue;
      const labeledNumbered = rest.match(
        /^((?:patient|re|quantity|renewal duration|date prescribed))\s*:\s*(.+)$/i,
      );
      if (labeledNumbered) {
        parts.push(
          `<p><strong>${escapeHtml(labeledNumbered[1])}:</strong> ${escapeHtml(labeledNumbered[2])}</p>`,
        );
        continue;
      }
      parts.push(`<p>${escapeHtml(rest)}</p>`);
      continue;
    }
    const labeled = trimmed.match(/^([^:]{2,48}):\s*(.+)$/);
    if (labeled) {
      if (/^to$/i.test(labeled[1])) continue;
      parts.push(
        `<p><strong>${escapeHtml(labeled[1])}:</strong> ${escapeHtml(labeled[2])}</p>`,
      );
      continue;
    }
    parts.push(`<p>${escapeHtml(trimmed)}</p>`);
  }

  flushList();
  if (parts.length === 1) parts.push('<p></p>');
  const html = parts.join('');
  return isCompactDapStart(raw) ? ensureDapConsentHtml(html) : html;
}

export function renewDocumentPdfFileName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'renew-document'}.pdf`;
}

export function downloadRenewDocumentBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

import { displayDob } from '@safescript/shared';
import { escapeHtml } from './tiptap-text';
import type { PatientDocumentInfo } from './types';

export interface PcpPatientIdentity {
  name: string;
  dateOfBirth: string;
  phn: string;
  phnNotAvailable: boolean;
}

export function pcpIdentityFromPatientInfo(
  info: PatientDocumentInfo | null | undefined,
  fields?: Record<string, string>,
): PcpPatientIdentity {
  const name = (info?.name ?? fields?.patientName ?? '').trim();
  const dateOfBirth = (info?.dateOfBirth ?? fields?.patientDob ?? '').trim();
  const phn = (info?.patientId ?? fields?.patientPhn ?? '').trim();
  const phnNotAvailable =
    info?.phnNotAvailable === true || fields?.patientPhnNotAvailable === 'true';
  return { name, dateOfBirth, phn, phnNotAvailable };
}

export function formatPcpPatientDob(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  return displayDob(value) || value;
}

export function pcpPatientIdentityComplete(identity: PcpPatientIdentity): boolean {
  if (!identity.name.trim() || !identity.dateOfBirth.trim()) return false;
  if (identity.phnNotAvailable) return true;
  return identity.phn.trim().length >= 3;
}

export function renderPcpPatientInformationHtml(identity: PcpPatientIdentity): string {
  const name = identity.name.trim();
  const dob = formatPcpPatientDob(identity.dateOfBirth);
  const phn = identity.phnNotAvailable
    ? 'Not available'
    : identity.phn.trim();
  if (!name && !dob && !phn) return '';
  const cells = [
    name ? `<span><strong>Name:</strong> ${escapeHtml(name)}</span>` : '',
    dob ? `<span><strong>Date of birth:</strong> ${escapeHtml(dob)}</span>` : '',
    phn ? `<span><strong>PHN:</strong> ${escapeHtml(phn)}</span>` : '',
  ].filter(Boolean);
  return [
    `<p class="ss-pcp-patient-title" data-field="patientInformationTitle">PATIENT INFORMATION</p>`,
    `<p class="ss-pcp-patient" data-field="patientInformation">${cells.join('')}</p>`,
  ].join('');
}

export function formatPcpLetterDateDisplay(headerBlock?: string | null): string {
  return (headerBlock ?? '').replace(/^date:\s*/i, '').trim();
}

export function renderPcpLetterDateHtml(headerBlock?: string | null): string {
  const raw = (headerBlock ?? '').trim();
  if (!raw) return '';
  return `<p data-field="headerBlock">${escapeHtml(raw).replace(/\n/g, '<br>')}</p>`;
}

export function pcpPatientInformationPlainText(identity: PcpPatientIdentity): string {
  const name = identity.name.trim();
  const dob = formatPcpPatientDob(identity.dateOfBirth);
  const phn = identity.phnNotAvailable ? 'Not available' : identity.phn.trim();
  if (!name && !dob && !phn) return '';
  const lines = ['PATIENT INFORMATION'];
  if (name) lines.push(`Name: ${name}`);
  if (dob) lines.push(`Date of birth: ${dob}`);
  if (phn) lines.push(`PHN: ${phn}`);
  return lines.join('\n');
}

const PATIENT_BLOCK_RE =
  /<p[^>]*data-field=["']patientInformationTitle["'][^>]*>[\s\S]*?<\/p>\s*<p[^>]*data-field=["']patientInformation["'][^>]*>[\s\S]*?<\/p>/i;

export function stripPcpPatientInformationHtml(html: string): string {
  return html.replace(PATIENT_BLOCK_RE, '').replace(/\n{3,}/g, '\n\n');
}

export function upsertPcpPatientInformationHtml(
  html: string,
  identity: PcpPatientIdentity,
): string {
  const block = renderPcpPatientInformationHtml(identity);
  if (!block) return stripPcpPatientInformationHtml(html);
  if (PATIENT_BLOCK_RE.test(html)) return html.replace(PATIENT_BLOCK_RE, block);
  const titleRe = /<h1[^>]*data-field=["']documentTitle["'][^>]*>[\s\S]*?<\/h1>/i;
  if (titleRe.test(html)) return html.replace(titleRe, `$&${block}`);
  const h1Re = /<h1[^>]*>[\s\S]*?<\/h1>/i;
  if (h1Re.test(html)) return html.replace(h1Re, `$&${block}`);
  return `${block}${html}`;
}

export function pcpEditorBodyHtml(html: string): string {
  const rootless = stripPcpPatientInformationHtml(html);
  return rootless
    .replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, '')
    .replace(/<p[^>]*data-field=["']headerBlock["'][^>]*>[\s\S]*?<\/p>/i, '')
    .trim();
}

export function assemblePcpWorkspaceHtml(opts: {
  title: string;
  identity: PcpPatientIdentity;
  headerBlock: string;
  bodyHtml: string;
}): string {
  const parts = [
    `<h1 data-field="documentTitle">${escapeHtml(opts.title)}</h1>`,
    renderPcpLetterDateHtml(opts.headerBlock),
    renderPcpPatientInformationHtml(opts.identity),
    opts.bodyHtml.trim(),
  ];
  return parts.filter(Boolean).join('');
}

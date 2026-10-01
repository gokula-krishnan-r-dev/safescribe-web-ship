import { CONTACT_SUPPORT_EMAIL } from '@safescript/shared';
import { escapeHtml } from '@/modules/contact/mail.util';

const BRAND = '#008CA4';
const INK = '#06244A';
const MUTED = '#425A78';
const BORDER = '#D7E4EE';
const BG = '#F4F8FB';

export interface AccessRequestEmailContent {
  pharmacyName: string;
  licenceNumber: string;
  contactName: string;
  email: string;
  phone: string | null;
  capturedPublicIp: string;
  sourceLabel: string;
}

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:${BG};font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;color:${INK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${BORDER};border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:${BRAND};padding:16px 24px;color:#ffffff;font-size:16px;font-weight:700;letter-spacing:-0.02em;">
                SafeScribe
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                ${body}
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:12px;color:${MUTED};">This message was sent by SafeScribe.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;width:160px;color:${MUTED};font-size:13px;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:6px 0;color:${INK};font-size:14px;font-weight:600;">${value}</td>
  </tr>`;
}

export function accessRequestTeamNotification(content: AccessRequestEmailContent) {
  const subject = `[SafeScribe] Alberta access request — ${content.pharmacyName}`;
  const text = [
    'New Alberta launch access request',
    '',
    `Pharmacy: ${content.pharmacyName}`,
    `Licence: ${content.licenceNumber}`,
    `Contact: ${content.contactName}`,
    `Email: ${content.email}`,
    `Phone: ${content.phone ?? '—'}`,
    `Captured IP: ${content.capturedPublicIp}`,
    `Source: ${content.sourceLabel}`,
  ].join('\n');

  const html = layout(
    subject,
    `
      <p style="margin:0 0 16px;font-size:16px;font-weight:700;">New launch access request</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${row('Pharmacy', escapeHtml(content.pharmacyName))}
        ${row('Licence', escapeHtml(content.licenceNumber))}
        ${row('Contact', escapeHtml(content.contactName))}
        ${row('Email', escapeHtml(content.email))}
        ${row('Phone', escapeHtml(content.phone ?? '—'))}
        ${row('Captured IP', escapeHtml(content.capturedPublicIp))}
        ${row('Source', escapeHtml(content.sourceLabel))}
      </table>
    `,
  );

  return { subject, text, html };
}

export function accessRequestConfirmation(content: AccessRequestEmailContent) {
  const subject = 'We received your SafeScribe registration';
  const text = [
    `Hi ${content.contactName},`,
    '',
    `Thank you. We'll verify ${content.pharmacyName} and send your SafeScribe access details shortly.`,
    '',
    'Your pharmacy network has been captured securely.',
    '',
    `If you need to add anything, write to ${CONTACT_SUPPORT_EMAIL}.`,
    '',
    '— SafeScribe',
  ].join('\n');

  const html = layout(
    subject,
    `
      <p style="margin:0 0 12px;font-size:16px;font-weight:700;">Registration received</p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:${MUTED};">
        Hi ${escapeHtml(content.contactName)}, thank you. We'll verify
        <strong style="color:${INK};">${escapeHtml(content.pharmacyName)}</strong>
        and send your SafeScribe access details shortly.
      </p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:${MUTED};">
        Your pharmacy network has been captured securely.
      </p>
      <p style="margin:0;font-size:13px;color:${MUTED};">
        Need to add something? Write to
        <a href="mailto:${CONTACT_SUPPORT_EMAIL}" style="color:${BRAND};">${CONTACT_SUPPORT_EMAIL}</a>.
      </p>
    `,
  );

  return { subject, text, html };
}

export function accessRequestInvite(content: {
  contactName: string;
  pharmacyName: string;
  inviteUrl: string;
}) {
  const subject = 'Your SafeScribe access is ready';
  const text = [
    `Hi ${content.contactName},`,
    '',
    `${content.pharmacyName} has been approved for complimentary SafeScribe access.`,
    '',
    'Set your password to sign in:',
    content.inviteUrl,
    '',
    'This link expires in 7 days.',
    '',
    '— SafeScribe',
  ].join('\n');

  const html = layout(
    subject,
    `
      <p style="margin:0 0 12px;font-size:16px;font-weight:700;">SafeScribe access is ready</p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:${MUTED};">
        Hi ${escapeHtml(content.contactName)},
        <strong style="color:${INK};">${escapeHtml(content.pharmacyName)}</strong>
        has been approved for complimentary SafeScribe access.
      </p>
      <p style="margin:0 0 18px;">
        <a href="${escapeHtml(content.inviteUrl)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;">
          Set your password
        </a>
      </p>
      <p style="margin:0;font-size:13px;color:${MUTED};">This link expires in 7 days.</p>
    `,
  );

  return { subject, text, html };
}

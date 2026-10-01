import { CONTACT_SUPPORT_EMAIL } from '@safescript/shared';
import { escapeHtml, htmlParagraphs } from './mail.util';

const BRAND = '#008CA4';
const INK = '#06244A';
const MUTED = '#425A78';
const BORDER = '#D7E4EE';
const BG = '#F4F8FB';

export interface ContactEmailContent {
  fullName: string;
  workEmail: string;
  organization: string;
  topicLabel: string;
  message: string;
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
                Rx Now
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                ${body}
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:12px;color:${MUTED};">This message was sent by Rx Now.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;width:140px;color:${MUTED};font-size:13px;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:6px 0;color:${INK};font-size:14px;font-weight:600;">${value}</td>
  </tr>`;
}

export function contactTeamNotification(content: ContactEmailContent) {
  const subject = `[Rx Now] ${content.topicLabel} — ${content.fullName}`;
  const text = [
    'New Contact Us message',
    '',
    `Name: ${content.fullName}`,
    `Email: ${content.workEmail}`,
    `Organization: ${content.organization}`,
    `Topic: ${content.topicLabel}`,
    '',
    content.message,
  ].join('\n');

  const html = layout(
    subject,
    `
      <p style="margin:0 0 16px;font-size:16px;font-weight:700;">New contact message</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${row('Name', escapeHtml(content.fullName))}
        ${row('Email', escapeHtml(content.workEmail))}
        ${row('Organization', escapeHtml(content.organization))}
        ${row('Topic', escapeHtml(content.topicLabel))}
      </table>
      <p style="margin:18px 0 8px;color:${MUTED};font-size:13px;">Message</p>
      <p style="margin:0;padding:14px 16px;background:${BG};border-radius:8px;font-size:14px;line-height:1.55;color:${INK};">${htmlParagraphs(content.message)}</p>
    `,
  );

  return { subject, text, html };
}

export function contactConfirmation(content: ContactEmailContent) {
  const subject = 'We received your message — Rx Now';
  const text = [
    `Hi ${content.fullName},`,
    '',
    'Thanks for contacting Rx Now. We received your message and typically reply within one business day.',
    '',
    `Topic: ${content.topicLabel}`,
    `Organization: ${content.organization}`,
    '',
    'If you need to add anything, reply to this email or write to ' + CONTACT_SUPPORT_EMAIL + '.',
    '',
    '— Rx Now',
  ].join('\n');

  const html = layout(
    subject,
    `
      <p style="margin:0 0 12px;font-size:16px;font-weight:700;">Message received</p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:${MUTED};">
        Hi ${escapeHtml(content.fullName)}, thanks for contacting Rx Now. We received your
        <strong style="color:${INK};">${escapeHtml(content.topicLabel)}</strong> inquiry
        and typically reply within one business day.
      </p>
      <p style="margin:0;font-size:13px;color:${MUTED};">
        Need to add something? Reply to this email or write to
        <a href="mailto:${CONTACT_SUPPORT_EMAIL}" style="color:${BRAND};">${CONTACT_SUPPORT_EMAIL}</a>.
      </p>
    `,
  );

  return { subject, text, html };
}

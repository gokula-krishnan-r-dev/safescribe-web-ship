import { escapeHtml } from '@/modules/contact/mail.util';

const BRAND = '#008CA4';
const INK = '#06244A';
const MUTED = '#425A78';
const BORDER = '#D7E4EE';
const BG = '#F4F8FB';

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
          <p style="margin:16px 0 0;font-size:12px;color:${MUTED};">If you did not try to sign in, you can ignore this email.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function loginEmail2faContent(input: {
  firstName: string;
  verifyUrl: string;
  expiresInMinutes: number;
}) {
  const subject = 'Verify your SafeScribe sign-in';
  const name = input.firstName.trim() || 'there';
  const text = [
    `Hi ${name},`,
    '',
    'We received a sign-in request for your SafeScribe account.',
    '',
    `Open this secure link to finish signing in:`,
    input.verifyUrl,
    '',
    `This link expires in ${input.expiresInMinutes} minutes and can only be used once.`,
    '',
    'If you did not try to sign in, you can ignore this email.',
  ].join('\n');

  const html = layout(
    subject,
    `
      <p style="margin:0 0 12px;font-size:16px;font-weight:700;">Verify your sign-in</p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:${MUTED};">
        Hi ${escapeHtml(name)}, we received a sign-in request for your SafeScribe account.
        Click the button below to finish signing in.
      </p>
      <p style="margin:0 0 20px;">
        <a href="${escapeHtml(input.verifyUrl)}"
           style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:8px;">
          Verify and continue
        </a>
      </p>
      <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:${MUTED};">
        Or copy this link:<br />
        <span style="word-break:break-all;color:${INK};">${escapeHtml(input.verifyUrl)}</span>
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:${MUTED};">
        This link expires in ${input.expiresInMinutes} minutes and can only be used once.
      </p>
    `,
  );

  return { subject, text, html };
}
